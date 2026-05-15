// Runs two searchMultipleCompanies calls (Java + Full Stack) and ranks results
import { searchMultipleCompanies } from './dist/tools/search-multiple-companies.js';

// Companies verified to return 200 from their career APIs
// JPMorgan, Goldman Sachs, Salesforce skipped (return HTTP 422)
const COMPANIES = [
  // Workday companies — main Java/enterprise employers
  'adobe', 'citi', 'nvidia', 'red-hat', 'rackspace', 'micron-technology',
  'kla-corporation', 't-mobile', 'fis', 'western-union', 'boeing',
  'thomson-reuters', 'lexisnexis', 'capital-one', 'u-s-bancorp',
  'travelers', 'unum-group', 'dxc-technology', 'booz-allen-hamilton',
  'unisys', 'intel', 'qualys', 'alteryx', 'epicor', 'f5-networks',
  'cigna', 's-p-global', 'workday', 'zebra-technologies', 'mri-software',
  'pluralsight', 'leidos', 'elevance-health', 'zillow', 'bank-of-america',
  'td-bank', 'nasdaq',
  // Greenhouse — dev tools, fintech, observability
  'twilio', 'mongodb', 'hubspot', 'zoominfo', 'new-relic', 'pagerduty',
  'sumo-logic', 'okta', 'appian', 'five9', 'nice', 'vonage',
  'stripe', 'affirm', 'chime', 'block', 'gusto', 'justworks',
  'cloudflare', 'tcs', 'databricks', 'fivetran', 'cribl',
  'sas-institute', 'grafana-labs', 'veracode', 'abnormal-security',
  'doximity', 'costar-group', 'flexport', 'bill-com', 'upstart',
  // Lever — enterprise software
  'atlassian', 'veeva-systems', 'sonatype', 'metlife',
  'blue-yonder', 'coupa-software', 'trinet',
  // Ashby — cloud-native, security, data
  'confluent', 'nutanix', 'snyk', 'sentry', 'docker',
  'airbyte', 'lumen-technologies',
];

// NOTE: using 'month' — 'today' returned 2 results, 'week' returned 14.
// JPMorgan / Goldman Sachs / Salesforce skipped (HTTP 422).
const FILTERS = {
  postedSince: 'month',
};

// Clearance / citizenship keywords to exclude
const CLEARANCE_PATTERNS = [
  /security clearance/i, /secret clearance/i, /top secret/i, /ts\/sci/i,
  /dod clearance/i, /clearance required/i, /us citizen/i, /u\.s\. citizen/i,
  /citizenship required/i, /must be a citizen/i, /active clearance/i,
  /public trust/i, /nato clearance/i, /government clearance/i,
];

// Skills relevant to the profile (higher weight = stronger match)
const SKILL_WEIGHTS = [
  { pattern: /\bspring boot\b/i, weight: 10 },
  { pattern: /\bspring\b/i, weight: 7 },
  { pattern: /\bjava\b/i, weight: 8 },
  { pattern: /\baws\b|amazon web services/i, weight: 8 },
  { pattern: /\breact\b/i, weight: 6 },
  { pattern: /\bangular\b/i, weight: 6 },
  { pattern: /\bsplunk\b/i, weight: 9 },
  { pattern: /\bfull.?stack\b/i, weight: 5 },
  { pattern: /\bmicroservices\b/i, weight: 5 },
  { pattern: /\bkubernetes\b|\bk8s\b/i, weight: 4 },
  { pattern: /\bdocker\b/i, weight: 3 },
  { pattern: /\brest.?api\b|restful/i, weight: 4 },
  { pattern: /\bci\/cd\b/i, weight: 3 },
  { pattern: /\bcloud\b/i, weight: 3 },
  { pattern: /\bgit\b/i, weight: 2 },
];

// Level keywords for senior/junior filter
const SENIOR_PATTERNS = /\bsenior\b|\bsr\.\b|\bsr\b|\blead\b|\bprincipal\b|\bstaff\b/i;
const JUNIOR_PATTERNS = /\bjunior\b|\bjr\.\b|\bjr\b|\bentry.?level\b|\bassociate\b|\bentry\b/i;

// US state abbreviations (excludes Canadian provinces like ON, BC, AB, QC, MB, SK, NS, NB, NL, PE, NT, YT, NU)
const CA_PROVINCES = new Set(['ON','BC','AB','QC','MB','SK','NS','NB','NL','PE','NT','YT','NU']);
const US_STATES = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']);
const EXPLICIT_NON_US = /\b(Canada|Ontario|Quebec|British Columbia|Alberta|UK|United Kingdom|Ireland|India|Germany|France|Australia|Singapore|Poland|Netherlands|Mexico|Israel|Japan|Korea|China|Brazil|Spain|Italy|Denmark|Norway|Sweden|Switzerland)\b/i;

function isUSJob(locations) {
  if (!locations || locations.length === 0) return true;
  return locations.some(loc => {
    if (!loc || loc === '') return true;
    if (EXPLICIT_NON_US.test(loc)) return false;
    // Workday format: "USA, CA, City" or "USA Remote" or "USA-CA-City"
    if (/\bUSA\b|\bUnited States\b/i.test(loc)) return true;
    // Greenhouse/Lever: "City, NY" — check state abbrev
    const m = loc.match(/,\s*([A-Z]{2})(?:\s*,|\s*$)/);
    if (m) {
      const abbr = m[1];
      if (CA_PROVINCES.has(abbr)) return false;
      if (US_STATES.has(abbr)) return true;
    }
    // Remote with no explicit country
    if (/\bRemote\b/i.test(loc) && !EXPLICIT_NON_US.test(loc)) return true;
    return false;
  });
}

function isClearanceJob(title) {
  return CLEARANCE_PATTERNS.some(p => p.test(title));
}

function isSeniorOrJunior(title) {
  return SENIOR_PATTERNS.test(title) || JUNIOR_PATTERNS.test(title);
}

function scoreJob(title, company) {
  let score = 0;
  const text = `${title} ${company}`;
  for (const { pattern, weight } of SKILL_WEIGHTS) {
    if (pattern.test(text)) score += weight;
  }
  // Bonus for explicit level match
  if (SENIOR_PATTERNS.test(title)) score += 3;
  if (JUNIOR_PATTERNS.test(title)) score += 1;
  return score;
}

function processResults(rawResults, searchLabel) {
  const jobs = [];
  for (const company of rawResults.perCompany) {
    if (company.error) continue;
    for (const job of company.jobs) {
      const title = job.title || '';
      if (isClearanceJob(title)) continue;
      if (!isSeniorOrJunior(title)) continue;
      if (!isUSJob(job.locations)) continue;
      jobs.push({
        title,
        company: company.company,
        applyUrl: job.applyUrl || '',
        score: scoreJob(title, company.company),
        search: searchLabel,
      });
    }
  }
  return jobs;
}

async function run() {
  console.log('Searching Java roles (today, USA)…');
  const [javaRaw, fsRaw] = await Promise.all([
    searchMultipleCompanies({ companyList: COMPANIES, jobTitle: 'Java', ...FILTERS }),
    searchMultipleCompanies({ companyList: COMPANIES, jobTitle: 'Full Stack', ...FILTERS }),
  ]);

  console.log(`Java search: ${javaRaw.totalJobs} total raw jobs across ${javaRaw.totalCompanies} companies`);
  console.log(`Full Stack search: ${fsRaw.totalJobs} total raw jobs across ${fsRaw.totalCompanies} companies`);


  const javaJobs = processResults(javaRaw, 'Java');
  const fsJobs = processResults(fsRaw, 'Full Stack');

  // Merge, deduplicate by applyUrl
  const seen = new Set();
  const merged = [];
  for (const job of [...javaJobs, ...fsJobs]) {
    const key = job.applyUrl || `${job.company}::${job.title}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(job);
    }
  }

  // Sort by score desc
  merged.sort((a, b) => b.score - a.score);

  const top50 = merged.slice(0, 50);

  console.log(`\nFiltered to ${merged.length} senior/junior jobs (no clearance). Showing top ${top50.length}.\n`);

  // Output markdown table
  console.log('| # | Title | Company | Apply URL |');
  console.log('|---|-------|---------|-----------|');
  top50.forEach((job, i) => {
    const safeTitle = job.title.replace(/\|/g, '-');
    const safeCompany = job.company.replace(/\|/g, '-');
    const url = job.applyUrl ? `[Apply](${job.applyUrl})` : 'N/A';
    console.log(`| ${i + 1} | ${safeTitle} | ${safeCompany} | ${url} |`);
  });

  // Stats
  console.log(`\n---`);
  console.log(`Total Java jobs after filter: ${javaJobs.length}`);
  console.log(`Total Full Stack jobs after filter: ${fsJobs.length}`);
  console.log(`Failures: ${javaRaw.failures.length + fsRaw.failures.length}`);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
