/**
 * find-java-24h.mjs
 * Fast parallel search across ALL registry companies for roles matching Sruthi Veerepalli's resume.
 * Rules per CLAUDE.md:
 *   - Default window: 3 days (--today = 24hr, --week = 7 days)
 *   - Level: Junior to Senior only (≤5 yrs)
 *   - Location: US only
 *   - No security clearance
 *   - Resume-match: ≥60% profile alignment (score ≥ 5 from resume skill keywords in title)
 *   - Search terms: Java, Full Stack, Software Engineer — all run in PARALLEL
 *   - Batches: up to BATCH_CONCURRENCY batches run concurrently per term
 */
import { companyRegistry } from './dist/scrapers/company-registry.js';
import { searchMultipleCompanies } from './dist/tools/search-multiple-companies.js';
import { OVER_5YR, CLEARANCE, isUSJob, matchesProfile, resumeScore } from './dist/utils/job-filters.js';

// Load all companies, excluding custom/oracle-orc (Puppeteer-based) platforms.
// Custom companies are mostly non-US (Tencent, Baidu, etc.) or have unreliable scrapers
// that crash with OOM when run in bulk. US custom companies (Amazon, Apple) can be added back
// individually if needed.
const ALL_SLUGS = [...companyRegistry.companies.values()]
  .filter(c => c.platform !== 'custom' && c.platform !== 'oracle-orc')
  .map(c => c.slug);

// Date window — default 3 days per CLAUDE.md
const DAY_MS = 86_400_000;
const WINDOW_DAYS = process.argv.includes('--today') ? 1
  : process.argv.includes('--week') ? 7
  : 3;
const WINDOW_LABEL = WINDOW_DAYS === 1 ? '24 hours' : `${WINDOW_DAYS} days`;
const API_SINCE = WINDOW_DAYS <= 1 ? 'today' : 'week';

// Search terms covering the full profile (run in parallel).
// NOTE: terms are client-side substring filters over each company's full job set
// (the API is queried without a keyword — see orchestrator.ts). So each term must be
// a DISTINCT substring to widen coverage. 'Java Developer' / 'Full Stack Java' are
// omitted because they're already subsumed by 'Java' / 'Full Stack'. Broad stems like
// 'Backend' catch "Backend Engineer", "Backend Developer", "Backend Software Engineer".
const SEARCH_TERMS = [
  'Java',
  'Full Stack',
  'Software Engineer',
  'Software Developer',
  'Backend',
  'Back End',
  'Application Developer',
];

// Tuning knobs
const BATCH_SIZE = 50;           // companies per batch
const BATCH_CONCURRENCY = 3;    // concurrent batches per search term

// Split slugs into batches
function makeBatches(slugs, size) {
  const out = [];
  for (let i = 0; i < slugs.length; i += size) out.push(slugs.slice(i, i + size));
  return out;
}

// Worker pool: run `concurrency` batches concurrently for a single search term
async function searchTermConcurrently(term, batches) {
  const queue = [...batches];
  let totalRaw = 0, totalFailures = 0;
  const allPerCompany = [];
  let done = 0;

  const worker = async () => {
    while (true) {
      const batch = queue.shift();
      if (!batch) return;
      try {
        const result = await searchMultipleCompanies({
          companyList: batch,
          jobTitle: term,
          postedSince: API_SINCE,
        });
        totalRaw += result.totalJobs;
        totalFailures += result.failures.length;
        allPerCompany.push(...result.perCompany);
      } catch (err) {
        process.stderr.write(`  [${term}] batch error: ${err.message}\n`);
      }
      done += batch.length;
      process.stderr.write(`  [${term}] ${done}/${ALL_SLUGS.length} companies done\n`);
    }
  };

  await Promise.all(Array.from({ length: Math.min(BATCH_CONCURRENCY, batches.length) }, worker));
  return { totalRaw, totalFailures, allPerCompany };
}

async function run() {
  const batches = makeBatches(ALL_SLUGS, BATCH_SIZE);
  console.log(`\nCLAUDE.md rules: Resume-match ≥60% | last ${WINDOW_LABEL} | Junior–Senior | US | No clearance`);
  console.log(`Profile: Java/Full Stack — Spring Boot, Angular, React, AWS, Kafka, Microservices`);
  console.log(`Search: [${SEARCH_TERMS.join(', ')}] in parallel | ${ALL_SLUGS.length} companies | ${batches.length} batches × ${BATCH_CONCURRENCY} concurrent\n`);

  const start = Date.now();

  // Run all 3 search terms in PARALLEL. The cache is per-company (not per-term), so once
  // a company is fetched by any term, the other two terms read from cache instantly.
  // No Puppeteer in this path (custom/oracle-orc excluded), so OOM risk is low.
  const termResults = await Promise.all(
    SEARCH_TERMS.map(term => searchTermConcurrently(term, batches))
  );

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const grandTotalRaw = termResults.reduce((s, r) => s + r.totalRaw, 0);
  const grandTotalFailures = termResults.reduce((s, r) => s + r.totalFailures, 0);

  console.log(`\nCompleted in ${elapsed}s`);
  console.log(`Raw total: ${grandTotalRaw} jobs across ${ALL_SLUGS.length} companies (API window: ${API_SINCE})`);
  if (grandTotalFailures > 0) console.log(`Failures: ${grandTotalFailures} company-term pairs`);

  // Apply CLAUDE.md filters + resume-match scoring, dedup across terms
  const cutoff = Date.now() - WINDOW_DAYS * DAY_MS;
  const jobs = [];
  const seen = new Set();

  for (let t = 0; t < SEARCH_TERMS.length; t++) {
    const term = SEARCH_TERMS[t];
    for (const company of termResults[t].allPerCompany) {
      if (company.error || !company.jobs.length) continue;
      for (const job of company.jobs) {
        const title = job.title || '';
        if (OVER_5YR.test(title)) continue;
        if (CLEARANCE.test(title)) continue;
        if (!isUSJob(job.locations)) continue;
        if (!matchesProfile(title)) continue;
        if (job.postedDate) {
          const posted = new Date(job.postedDate).getTime();
          if (!isNaN(posted) && posted < cutoff) continue;
        }
        const key = job.applyUrl || `${company.company}::${title}`;
        if (seen.has(key)) continue;
        seen.add(key);
        jobs.push({
          title,
          company: company.company,
          locations: (job.locations || []).join(' | ') || 'N/A',
          postedDate: job.postedDate
            ? new Date(job.postedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : 'N/A',
          applyUrl: job.applyUrl || '',
          score: resumeScore(title),
          term,
        });
      }
    }
  }

  if (jobs.length === 0) {
    console.log(`\nNo matching jobs found in the last ${WINDOW_LABEL} across all ${ALL_SLUGS.length} companies.`);
    console.log('Try: node find-java-24h.mjs --week\n');
    return;
  }

  jobs.sort((a, b) => b.score - a.score);

  console.log(`\nFound ${jobs.length} jobs (last ${WINDOW_LABEL} | Junior–Senior | US | No clearance | ≥60% resume match):\n`);
  console.log('| # | Title | Company | Location | Posted | Score | Apply |');
  console.log('|---|-------|---------|----------|--------|-------|-------|');
  jobs.forEach((job, i) => {
    const t = job.title.replace(/\|/g, '-');
    const c = job.company.replace(/\|/g, '-');
    const l = job.locations.replace(/\|/g, '/');
    const url = job.applyUrl ? `[Apply](${job.applyUrl})` : 'N/A';
    console.log(`| ${i + 1} | ${t} | ${c} | ${l} | ${job.postedDate} | ${job.score} | ${url} |`);
  });

  console.log(`\nTotal: ${jobs.length} jobs from ${ALL_SLUGS.length} companies in ${elapsed}s`);
  console.log(`Score key: Java=10, Spring Boot=10, Full Stack/Spring/Microservices=7, Angular/React/AWS/Kafka=5`);
}

run().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
