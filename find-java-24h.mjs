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

// Load all companies, excluding custom/oracle-orc (Puppeteer-based) platforms.
// Custom companies are mostly non-US (Tencent, Baidu, etc.) or have unreliable scrapers
// that crash with OOM when run in bulk. US custom companies (Amazon, Apple) can be added back
// individually if needed.
const ALL_SLUGS = [...companyRegistry.companies.values()]
  .filter(c => c.platform !== 'custom' && c.platform !== 'oracle-orc')
  .map(c => c.slug);

// Senior / >5yr title patterns — EXCLUDE (per CLAUDE.md)
const OVER_5YR = /\bprincipal\b|\bstaff\b|\blead\b|\barchitect\b|\bdirector\b|\bvp\b|\bhead of\b|\bmanager\b|\bexecutive\b|\bdistinguished\b|\bfellow\b/i;

// Security clearance — EXCLUDE
const CLEARANCE = /security clearance|secret clearance|top secret|ts\/sci|dod clearance|clearance required|us citizen|u\.s\. citizen|citizenship required|must be a citizen|active clearance|public trust/i;

// US location detection
const CA_PROVINCES = new Set(['ON','BC','AB','QC','MB','SK','NS','NB','NL','PE','NT','YT','NU']);
const US_STATES = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']);
const NON_US = /\b(Canada|Ontario|Quebec|British Columbia|Alberta|UK|United Kingdom|Ireland|India|Germany|France|Australia|Singapore|Poland|Netherlands|Mexico|Israel|Japan|Korea|China|Brazil|Spain|Italy|Denmark|Norway|Sweden|Switzerland)\b/i;

function isUSJob(locations) {
  if (!locations || locations.length === 0) return true;
  return locations.some(loc => {
    if (!loc) return true;
    if (NON_US.test(loc)) return false;
    if (/\bUSA\b|\bUnited States\b/i.test(loc)) return true;
    const m = loc.match(/,\s*([A-Z]{2})(?:\s*,|\s*$)/);
    if (m) {
      if (CA_PROVINCES.has(m[1])) return false;
      if (US_STATES.has(m[1])) return true;
    }
    if (/\bRemote\b/i.test(loc) && !NON_US.test(loc)) return true;
    return false;
  });
}

// Resume skill scoring weights — per CLAUDE.md rule #6 (score ≥ 5 = 60% match)
const RESUME_WEIGHTS = [
  { pattern: /\bjava\b/i,        weight: 10 },
  { pattern: /\bspring boot\b/i, weight: 10 },
  { pattern: /\bspring\b/i,             weight: 7 },
  { pattern: /\bmicroservices?\b/i,     weight: 7 },
  { pattern: /\bfull.?stack\b/i,        weight: 7 },
  { pattern: /\bangular\b/i,    weight: 5 },
  { pattern: /\breact\b/i,      weight: 5 },
  { pattern: /\baws\b/i,        weight: 5 },
  { pattern: /\bkafka\b/i,      weight: 5 },
  { pattern: /\bhibernate\b/i,  weight: 5 },
  { pattern: /\bjpa\b/i,        weight: 5 },
  { pattern: /\brest(ful)?\b/i, weight: 5 },
  { pattern: /\bcloud\b/i,      weight: 5 },
  { pattern: /\bdocker\b/i,       weight: 3 },
  { pattern: /\bkubernetes\b/i,   weight: 3 },
  { pattern: /\bci\/cd\b/i,       weight: 3 },
  { pattern: /\bjenkins\b/i,      weight: 3 },
  { pattern: /\bsplunk\b/i,       weight: 3 },
  { pattern: /\bpostgresql\b/i,   weight: 3 },
  { pattern: /\bmongodb\b/i,      weight: 3 },
  { pattern: /\bnode\.?js\b/i,    weight: 3 },
  { pattern: /\btypescript\b/i,   weight: 3 },
  { pattern: /\bj2ee\b/i,         weight: 3 },
  { pattern: /\bjavascript\b/i,   weight: 3 },
];

const TARGET_ROLES = /\b(java|full.?stack|fullstack|software engineer|software developer|backend|back.end|application developer)\b/i;
const EXCLUDE_ROLES = /\b(data scientist|machine learning|ml engineer|devops engineer|qa engineer|test engineer|security engineer|network engineer|database administrator|dba|data engineer|ui developer|ux designer|product manager|scrum master|business analyst|data analyst)\b/i;
const RESUME_MATCH_THRESHOLD = 5;

function resumeScore(title) {
  let score = 0;
  for (const { pattern, weight } of RESUME_WEIGHTS) {
    if (pattern.test(title)) score += weight;
  }
  return score;
}

function matchesProfile(title) {
  if (EXCLUDE_ROLES.test(title)) return false;
  const score = resumeScore(title);
  if (score >= RESUME_MATCH_THRESHOLD) return true;
  if (score === 0 && TARGET_ROLES.test(title)) return true;
  return false;
}

// Date window — default 3 days per CLAUDE.md
const DAY_MS = 86_400_000;
const WINDOW_DAYS = process.argv.includes('--today') ? 1
  : process.argv.includes('--week') ? 7
  : 3;
const WINDOW_LABEL = WINDOW_DAYS === 1 ? '24 hours' : `${WINDOW_DAYS} days`;
const API_SINCE = WINDOW_DAYS <= 1 ? 'today' : 'week';

// Search terms covering the full profile (run in parallel)
const SEARCH_TERMS = ['Java', 'Full Stack', 'Software Engineer'];

// Tuning knobs
const BATCH_SIZE = 50;           // companies per batch
const BATCH_CONCURRENCY = 2;    // concurrent batches per search term (low to avoid OOM)

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

  // Run search terms SEQUENTIALLY so term 2/3 hit the warm cache instead of launching
  // extra Puppeteer instances. Running all 3 in parallel caused OOM (15 concurrent batches).
  const termResults = [];
  for (const term of SEARCH_TERMS) {
    termResults.push(await searchTermConcurrently(term, batches));
  }

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
