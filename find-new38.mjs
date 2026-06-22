/**
 * find-new38.mjs — search ONLY the 38 companies added in batch6.
 * Same CLAUDE.md rules as find-java-24h.mjs (3-day default; --week / --today).
 */
import { searchMultipleCompanies } from './dist/tools/search-multiple-companies.js';
import { OVER_5YR, CLEARANCE, isUSJob, matchesProfile, resumeScore } from './dist/utils/job-filters.js';

const NEW38 = [
  'kohl-s','anthem','becton-dickinson','bristol-myers-squibb','johnson-controls',
  'u-s-bank','northern-trust','cigna-group','juniper-networks','redis','dataiku',
  'starburst','monte-carlo','boomi','snaplogic','uipath','olo','braze','iterable',
  'sprout-social','clari','highspot','6sense','2u','guild-education','liveperson',
  'qualtrics','surveymonkey','mixpanel','split','contentful','sanity','vultr',
  'sonar','dashlane','sailpoint','delinea','yubico',
];

const DAY_MS = 86_400_000;
const WINDOW_DAYS = process.argv.includes('--today') ? 1 : process.argv.includes('--week') ? 7 : 3;
const WINDOW_LABEL = WINDOW_DAYS === 1 ? '24 hours' : `${WINDOW_DAYS} days`;
const API_SINCE = WINDOW_DAYS <= 1 ? 'today' : 'week';
const SEARCH_TERMS = ['Java', 'Full Stack', 'Software Engineer', 'Software Developer', 'Backend', 'Back End', 'Application Developer'];

async function run() {
  console.log(`\nSearching ${NEW38.length} NEW companies | terms [${SEARCH_TERMS.join(', ')}] | last ${WINDOW_LABEL} | US | Jr–Sr | no clearance | ≥60% match\n`);
  const start = Date.now();

  const termResults = await Promise.all(SEARCH_TERMS.map(term =>
    searchMultipleCompanies({ companyList: NEW38, jobTitle: term, postedSince: API_SINCE })
  ));

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const rawTotal = termResults.reduce((s, r) => s + r.totalJobs, 0);

  // Track which companies returned anything / errored
  const companyStatus = new Map();
  for (const r of termResults) {
    for (const c of r.perCompany) {
      const prev = companyStatus.get(c.company) || { raw: 0, error: null };
      prev.raw += (c.jobs ? c.jobs.length : 0);
      if (c.error) prev.error = c.error;
      companyStatus.set(c.company, prev);
    }
  }

  const cutoff = Date.now() - WINDOW_DAYS * DAY_MS;
  const jobs = [];
  const seen = new Set();
  for (let t = 0; t < SEARCH_TERMS.length; t++) {
    for (const company of termResults[t].allPerCompany || termResults[t].perCompany) {
      if (company.error || !company.jobs || !company.jobs.length) continue;
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
          postedDate: job.postedDate ? new Date(job.postedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'N/A',
          applyUrl: job.applyUrl || '',
          score: resumeScore(title),
        });
      }
    }
  }

  console.log(`Raw: ${rawTotal} jobs (API window: ${API_SINCE}) in ${elapsed}s\n`);

  // Per-company coverage report
  console.log('Company coverage:');
  const ok = [], empty = [], errored = [];
  for (const slug of NEW38) {
    // company display name may differ; match by checking status map keys loosely
  }
  for (const [name, st] of [...companyStatus.entries()].sort((a,b)=>a[0].localeCompare(b[0]))) {
    if (st.error) errored.push(`${name} (${st.error.slice(0,40)})`);
    else if (st.raw > 0) ok.push(`${name}:${st.raw}`);
    else empty.push(name);
  }
  console.log(`  ✓ returned jobs (${ok.length}): ${ok.join(', ') || 'none'}`);
  console.log(`  ○ zero in window (${empty.length}): ${empty.join(', ') || 'none'}`);
  console.log(`  ✗ errored (${errored.length}): ${errored.join(', ') || 'none'}`);

  if (jobs.length === 0) {
    console.log(`\nNo matching jobs in last ${WINDOW_LABEL}. Try: node find-new38.mjs --week\n`);
    return;
  }

  jobs.sort((a, b) => b.score - a.score);
  console.log(`\nFound ${jobs.length} matching jobs:\n`);
  console.log('| # | Title | Company | Location | Posted | Score | Apply |');
  console.log('|---|-------|---------|----------|--------|-------|-------|');
  jobs.forEach((j, i) => {
    console.log(`| ${i + 1} | ${j.title.replace(/\|/g,'-')} | ${j.company.replace(/\|/g,'-')} | ${j.locations.replace(/\|/g,'/')} | ${j.postedDate} | ${j.score} | ${j.applyUrl ? `[Apply](${j.applyUrl})` : 'N/A'} |`);
  });
  console.log(`\nTotal: ${jobs.length} jobs from the 38 new companies.`);
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
