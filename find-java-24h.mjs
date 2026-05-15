/**
 * find-java-24h.mjs
 * Search ALL companies in the registry for Java roles.
 * Rules per CLAUDE.md:
 *   - Default window: 3 days (--today = 24hr, --week = 7 days)
 *   - Level: Junior to Senior only (≤5 yrs) — excludes Principal/Staff/Lead/Architect/Director/VP/Manager/Executive
 *   - Location: US only
 *   - No security clearance
 */
import { companyRegistry } from './dist/scrapers/company-registry.js';
import { searchMultipleCompanies } from './dist/tools/search-multiple-companies.js';

// Load ALL companies from the registry (all 623 — not a hardcoded subset)
const ALL_SLUGS = [...companyRegistry.companies.values()].map(c => c.slug);

// Senior / >5yr experience title patterns — EXCLUDE (per CLAUDE.md)
const OVER_5YR = /\bprincipal\b|\bstaff\b|\blead\b|\barchitect\b|\bdirector\b|\bvp\b|\bhead of\b|\bmanager\b|\bexecutive\b|\bdistinguished\b|\bfellow\b/i;

// Security clearance — EXCLUDE (per CLAUDE.md)
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

// Date window — default 3 days per CLAUDE.md
const DAY_MS = 86_400_000;
const WINDOW_DAYS = process.argv.includes('--today') ? 1
  : process.argv.includes('--week') ? 7
  : 3;
const WINDOW_LABEL = WINDOW_DAYS === 1 ? '24 hours' : `${WINDOW_DAYS} days`;
const API_SINCE = WINDOW_DAYS <= 1 ? 'today' : 'week';

// Batch size to avoid overwhelming the network at once
const BATCH_SIZE = 50;

async function run() {
  console.log(`\nCLAUDE.md rules: Java | last ${WINDOW_LABEL} | Junior–Senior (≤5 yrs) | US | No clearance`);
  console.log(`Registry size: ${ALL_SLUGS.length} companies — searching ALL of them\n`);

  // Split into batches so progress is visible and memory stays manageable
  const batches = [];
  for (let i = 0; i < ALL_SLUGS.length; i += BATCH_SIZE) {
    batches.push(ALL_SLUGS.slice(i, i + BATCH_SIZE));
  }

  let totalRaw = 0;
  let totalFailures = 0;
  const allPerCompany = [];

  for (let b = 0; b < batches.length; b++) {
    process.stderr.write(`  Batch ${b + 1}/${batches.length} (${batches[b].length} companies)…\n`);
    const result = await searchMultipleCompanies({
      companyList: batches[b],
      jobTitle: 'Java',
      postedSince: API_SINCE,
    });
    totalRaw += result.totalJobs;
    totalFailures += result.failures.length;
    allPerCompany.push(...result.perCompany);
  }

  console.log(`Raw total: ${totalRaw} Java jobs across ${ALL_SLUGS.length} companies (API window: ${API_SINCE})`);
  if (totalFailures > 0) console.log(`Failures: ${totalFailures} companies could not be scraped`);

  // Apply CLAUDE.md filters
  const cutoff = Date.now() - WINDOW_DAYS * DAY_MS;
  const jobs = [];
  const seen = new Set();

  for (const company of allPerCompany) {
    if (company.error || !company.jobs.length) continue;
    for (const job of company.jobs) {
      const title = job.title || '';
      if (OVER_5YR.test(title)) continue;          // exclude >5yr roles
      if (CLEARANCE.test(title)) continue;          // exclude clearance
      if (!isUSJob(job.locations)) continue;        // US only
      if (job.postedDate) {                         // precise date window
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
        postedDate: job.postedDate ? new Date(job.postedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'N/A',
        applyUrl: job.applyUrl || '',
      });
    }
  }

  if (jobs.length === 0) {
    console.log(`\nNo Java jobs found in the last ${WINDOW_LABEL} matching CLAUDE.md rules across all ${ALL_SLUGS.length} companies.`);
    console.log('Most ATS systems batch-post weekly. Try: node find-java-24h.mjs --week\n');
    return;
  }

  console.log(`\nFound ${jobs.length} Java jobs (last ${WINDOW_LABEL} | Junior–Senior | US | No clearance):\n`);
  console.log('| # | Title | Company | Location | Posted | Apply |');
  console.log('|---|-------|---------|----------|--------|-------|');
  jobs.forEach((job, i) => {
    const t = job.title.replace(/\|/g, '-');
    const c = job.company.replace(/\|/g, '-');
    const l = job.locations.replace(/\|/g, '/');
    const url = job.applyUrl ? `[Apply](${job.applyUrl})` : 'N/A';
    console.log(`| ${i + 1} | ${t} | ${c} | ${l} | ${job.postedDate} | ${url} |`);
  });

  console.log(`\nTotal: ${jobs.length} matching jobs from ${ALL_SLUGS.length} companies searched.`);
}

run().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
