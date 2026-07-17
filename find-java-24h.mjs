/**
 * find-java-24h.mjs
 * Fast parallel search across ALL registry companies for roles matching Sruthi Veerepalli's resume.
 * Rules per CLAUDE.md:
 *   - Default window: 3 days (--today = 24hr, --week = 7 days)
 *   - Level: Junior to Senior only (≤5 yrs)
 *   - Location: US only
 *   - No security clearance
 *   - Resume-match: ≥60% profile alignment (score ≥ 5 from resume skill keywords in title)
 *
 * Performance model (see orchestrator.ts):
 *   Each company is fetched exactly ONCE — with no keyword — and the FULL job set is
 *   cached. All relevance decisions (target roles, resume score, level, location,
 *   clearance, date window) are then applied CLIENT-SIDE via matchesProfile() & friends.
 *   There is no per-keyword network fan-out: `matchesProfile` already encodes every
 *   target-role stem, so searching term-by-term would only re-fetch the same jobs.
 *   Network fetches = number of companies, bounded by SCRAPE_CONCURRENCY. This keeps
 *   the run time linear and predictable as the registry grows.
 */
import { companyRegistry } from './dist/scrapers/company-registry.js';
import { scrapeMany } from './dist/scrapers/orchestrator.js';
import { OVER_5YR, CLEARANCE, isUSJob, matchesProfile, resumeScore } from './dist/utils/job-filters.js';

// Load all companies, excluding custom/oracle-orc (Puppeteer-based) platforms.
// Custom companies are mostly non-US (Tencent, Baidu, etc.) or have unreliable scrapers
// that crash with OOM when run in bulk. US custom companies (Amazon, Apple) can be added
// back individually if needed.
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

// Concurrency ceiling (constant regardless of company count). Override with SCRAPE_CONCURRENCY.
const CONCURRENCY = Number(process.env.SCRAPE_CONCURRENCY ?? 24);

// Cross-company job boards — results show the real employer as "{Employer} (via {Board})".
const JOB_BOARDS = new Set(['LinkedIn', 'SimplyHired', 'BuiltIn.com', 'RemoteOK', 'Remotive', 'We Work Remotely']);

async function run() {
  console.log(`\nCLAUDE.md rules: Resume-match ≥60% | last ${WINDOW_LABEL} | Junior–Senior | US | No clearance`);
  console.log(`Profile: Java/Full Stack — Spring Boot, Angular, React, AWS, Kafka, Microservices`);
  console.log(`Fetch-once: ${ALL_SLUGS.length} companies | ${CONCURRENCY} concurrent | window=${API_SINCE}\n`);

  const start = Date.now();

  // ONE fetch per company (no jobTitle → full job set, cached). Bounded worker pool.
  const results = await scrapeMany(
    ALL_SLUGS,
    { postedSince: API_SINCE },
    {
      concurrency: CONCURRENCY,
      onProgress: (done, total) => {
        if (done % 25 === 0 || done === total) {
          process.stderr.write(`  ${done}/${total} companies done\n`);
        }
      },
    },
  );

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const grandTotalRaw = results.reduce((s, r) => s + r.jobs.length, 0);
  const failures = results.filter(r => r.error);

  console.log(`\nCompleted in ${elapsed}s`);
  console.log(`Raw total: ${grandTotalRaw} jobs across ${ALL_SLUGS.length} companies (API window: ${API_SINCE})`);
  if (failures.length > 0) console.log(`Failures: ${failures.length} companies unreachable`);

  // Apply CLAUDE.md filters + resume-match scoring, dedup across companies.
  const cutoff = Date.now() - WINDOW_DAYS * DAY_MS;
  const jobs = [];
  const seen = new Set();

  for (const company of results) {
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
        // Job-board results carry the real hiring company in companyName
        company: JOB_BOARDS.has(company.company) && job.companyName && job.companyName !== company.company
          ? `${job.companyName} (via ${company.company})`
          : company.company,
        locations: (job.locations || []).join(' | ') || 'N/A',
        postedDate: job.postedDate
          ? new Date(job.postedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : 'N/A',
        applyUrl: job.applyUrl || '',
        score: resumeScore(title),
      });
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
