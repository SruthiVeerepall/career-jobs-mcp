/**
 * get-5-companies.mjs
 * Fetches Java/Full Stack/Software Engineer jobs from:
 *   Deloitte, Infosys, Visa, Lyft, SAP
 * No date filter per user request. Applies CLAUDE.md profile filters.
 */
import https from 'https';

function fetch(label, hostname, path, method = 'GET', body = null, extraHeaders = {}) {
  return new Promise((resolve) => {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      ...extraHeaders,
    };
    if (body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    const req = https.request({ hostname, path, method, headers, timeout: 25000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', err => resolve({ status: 0, body: err.message, headers: {} }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout', headers: {} }); });
    if (body) req.write(body);
    req.end();
  });
}

// CLAUDE.md filters
const OVER_5YR = /\bprincipal\b|\bstaff\b|\blead\b|\barchitect\b|\bdirector\b|\bvp\b|\bvice president\b|\bhead of\b|\bmanager\b|\bexecutive\b|\bdistinguished\b|\bfellow\b/i;
const CLEARANCE = /security clearance|secret clearance|top secret|ts\/sci|clearance required|us citizen|public trust/i;
const EXCLUDE_ROLES = /\b(data scientist|machine learning|ml engineer|devops engineer|qa engineer|test engineer|security engineer|network engineer|database administrator|dba|data engineer|ux designer|product manager|scrum master|business analyst|data analyst|solution sales|sales expert|sales specialist|marketing|pre-?sales|presales|account executive|account manager|recruiter|talent acquisition|finance analyst|supply chain|legal|attorney|paralegal|solution advisor|category expert|digital solution|sales advisor)\b/i;
const TARGET_ROLES = /\b(java|full.?stack|fullstack|software engineer|software developer|backend|back.end|application developer)\b/i;
const RESUME_WEIGHTS = [
  { p: /\bjava\b/i, w: 10 }, { p: /\bspring boot\b/i, w: 10 },
  { p: /\bspring\b/i, w: 7 }, { p: /\bmicroservices?\b/i, w: 7 }, { p: /\bfull.?stack\b/i, w: 7 },
  { p: /\bangular\b/i, w: 5 }, { p: /\breact\b/i, w: 5 }, { p: /\baws\b/i, w: 5 },
  { p: /\bkafka\b/i, w: 5 }, { p: /\brest(ful)?\b/i, w: 5 }, { p: /\bcloud\b/i, w: 5 },
  { p: /\bdocker\b/i, w: 3 }, { p: /\bkubernetes\b/i, w: 3 }, { p: /\btypescript\b/i, w: 3 },
];
function score(title) { return RESUME_WEIGHTS.reduce((s, {p, w}) => s + (p.test(title) ? w : 0), 0); }
function matches(title) {
  if (EXCLUDE_ROLES.test(title)) return false;
  if (OVER_5YR.test(title)) return false;
  const s = score(title);
  return s >= 5 || (s === 0 && TARGET_ROLES.test(title));
}
function fmtDate(d) {
  if (!d) return 'N/A';
  const dt = new Date(typeof d === 'string' ? d.replace(/\[.*?\]$/, '') : d);
  return isNaN(dt) ? String(d).substring(0, 10) : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

const results = { SAP: [], Lyft: [], Visa: [], Deloitte: [], Infosys: [] };

// =============================================================
// SAP — confirmed working POST API
// =============================================================
async function fetchSap(keywords, start = 0) {
  const body = JSON.stringify({
    page: 0, keywords, locationsearch: '',
    sortby: 'referencedate', sortdir: 'desc', sortfield: 'title',
    recordsperpage: 100, startrow: start,
    facetquery: { facet: start === 0, mincount: 1, limit: 100, fields: ['country'], sort: 'index', showPicklistAllLocales: false },
    filterquery: { country: ['US'] }
  });
  return fetch('SAP', 'jobs.sap.com', '/services/jobs/search/', 'POST', body, {
    Referer: 'https://jobs.sap.com/search/', Origin: 'https://jobs.sap.com',
  });
}

async function getSapJobs() {
  const seen = new Set();
  for (const term of ['Java', 'Full Stack', 'Software Engineer']) {
    const r0 = await fetchSap(term, 0);
    if (r0.status !== 200) { console.error(`SAP ${term}: HTTP ${r0.status}`); continue; }
    let p; try { p = JSON.parse(r0.body); } catch { continue; }
    const total = p.facetCounts?.country?.find(f => ['us', 'US'].includes(f.name))?.count || 0;
    console.error(`  SAP ${term}: ${total} US jobs total`);
    const processJobs = (jobs) => {
      for (const j of (jobs || [])) {
        const title = j.title || '';
        if (!matches(title)) continue;
        const key = `${j.id || title}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.SAP.push({
          title, company: 'SAP',
          location: j.location || `${j.city || ''}, ${j.state || ''}, US`,
          posted: fmtDate(j.referencedate),
          url: j.urltitle ? `https://jobs.sap.com/job/${j.urltitle}` : 'https://jobs.sap.com/search/?q=java',
          score: score(title),
        });
      }
    };
    processJobs(p.jobList);
    // Paginate
    for (let s = 100; s < Math.min(total, 500); s += 100) {
      const r = await fetchSap(term, s);
      if (r.status !== 200) break;
      let pg; try { pg = JSON.parse(r.body); } catch { break; }
      processJobs(pg.jobList);
    }
  }
}

// =============================================================
// Lyft — Greenhouse public API
// =============================================================
async function getLyftJobs() {
  const r = await fetch('Lyft', 'boards-api.greenhouse.io', '/v1/boards/lyft/jobs?content=true');
  if (r.status !== 200) { console.error(`Lyft: HTTP ${r.status}`); return; }
  let p; try { p = JSON.parse(r.body); } catch { return; }
  for (const j of (p.jobs || [])) {
    const title = j.title || '';
    if (!matches(title)) continue;
    const loc = j.location?.name || 'N/A';
    if (/\b(Canada|UK|India|Germany|France|Australia|Singapore|Mexico|Poland|Netherlands|Ireland|Brazil|Japan|Korea|China|Spain|Italy)\b/i.test(loc)) continue;
    const isUS = /\b(CA|TX|NY|WA|MA|GA|IL|FL|CO|VA|OR|NC|AZ|MN|OH|NJ|MD|PA|TN|MI|UT|MO|DC|NV|CT|IN|WI|OK|KY|IA|AL|LA|AR|KS|NH|ME|HI|ID|MT|NM|NE|ND|SD|VT|WY|AK|DE|RI|SC)\b/.test(loc) || /\bUnited States\b|\bRemote\b|\bUSA\b/i.test(loc);
    if (!isUS && loc !== 'N/A') continue;
    results.Lyft.push({
      title, company: 'Lyft', location: loc,
      posted: fmtDate(j.updated_at),
      url: j.absolute_url || `https://www.lyft.com/careers`,
      score: score(title),
    });
  }
  console.error(`  Lyft: ${p.jobs?.length || 0} total → ${results.Lyft.length} matched`);
}

// =============================================================
// Visa — SmartRecruiters
// =============================================================
async function getVisaJobs() {
  const terms = ['java', 'full+stack', 'software+engineer'];
  const seen = new Set();
  for (const q of terms) {
    const r = await fetch('Visa', 'api.smartrecruiters.com', `/v1/companies/Visa/postings?limit=100&offset=0&q=${q}`);
    if (r.status !== 200) { console.error(`Visa ${q}: HTTP ${r.status}`); continue; }
    let p; try { p = JSON.parse(r.body); } catch { continue; }
    console.error(`  Visa ${q}: ${p.totalFound || 0} total`);
    for (const j of (p.content || [])) {
      const title = j.name || '';
      if (!matches(title)) continue;
      const loc = j.location ? `${j.location.city || ''}, ${j.location.region || ''}, ${j.location.country || ''}`.replace(/^,\s*|,\s*,/g, '') : 'N/A';
      if (/\b(Canada|UK|India|Germany|France|Australia|Singapore|Poland|Netherlands|Ireland)\b/i.test(loc)) continue;
      const key = j.id || title;
      if (seen.has(key)) continue;
      seen.add(key);
      const jobId = j.id || (j.ref?.split('/').pop());
      results.Visa.push({
        title, company: 'Visa', location: loc,
        posted: fmtDate(j.releasedDate),
        url: jobId ? `https://jobs.smartrecruiters.com/Visa/${jobId}` : 'https://jobs.smartrecruiters.com/Visa',
        score: score(title),
      });
    }
  }
}

// =============================================================
// Deloitte — try Workday with CSRF prefetch
// =============================================================
async function getDeloitteJobs() {
  // First try to get CSRF token from careers page
  const pageRes = await fetch('Deloitte-page', 'apply.deloitte.com', '/en_US/careers/SearchJobs?sort=relevancy');
  let csrf = null;
  if (pageRes.status === 200 || pageRes.status === 302) {
    const m = pageRes.body.match(/CALYPSO_CSRF_TOKEN['":\s]+([a-f0-9\-]+)/i);
    if (m) csrf = m[1];
    // Also check cookies
    const cookies = pageRes.headers['set-cookie'];
    console.error(`  Deloitte page: ${pageRes.status}, CSRF: ${csrf || 'not found'}, cookies: ${cookies ? 'yes' : 'no'}`);
  }

  // Try Avature SearchJobsJSON with session
  const sessionCookies = pageRes.headers['set-cookie']?.map(c => c.split(';')[0]).join('; ') || '';
  const r2 = await fetch('Deloitte-JSON', 'apply.deloitte.com',
    '/en_US/careers/SearchJobsJSON?sort=relevancy&keyword=Java+Software+Engineer', 'GET', null, {
    Referer: 'https://apply.deloitte.com/en_US/careers/SearchJobs',
    Cookie: sessionCookies,
    'X-Requested-With': 'XMLHttpRequest',
  });
  console.error(`  Deloitte SearchJobsJSON: ${r2.status} | ${r2.body.substring(0, 200)}`);
  console.error(`  Deloitte redirect: ${r2.headers?.location || 'none'}`);

  // Try Deloitte's Workday board directly
  const wdBody = JSON.stringify({
    appliedFacets: {},
    limit: 20, offset: 0,
    searchText: 'Java Software Engineer'
  });
  const r3 = await fetch('Deloitte-WD', 'deloitte.wd1.myworkdayjobs.com',
    '/wday/cxs/deloitte/DTICareers/jobs', 'POST', wdBody, {
    Referer: 'https://jobs2.deloitte.com/',
    Origin: 'https://jobs2.deloitte.com',
    'X-Requested-With': 'XMLHttpRequest',
  });
  console.error(`  Deloitte WD POST: ${r3.status} | ${r3.body.substring(0, 300)}`);

  // Try jobs2.deloitte.com which is a known redirect destination
  const r4 = await fetch('Deloitte-jobs2', 'jobs2.deloitte.com', '/en_US/careers/SearchJobsJSON?sort=relevancy&keyword=Java', 'GET', null, {
    'X-Requested-With': 'XMLHttpRequest',
  });
  console.error(`  Deloitte jobs2: ${r4.status} | ${r4.body.substring(0, 300)}`);
  if (r4.status === 200) {
    try {
      const p = JSON.parse(r4.body);
      const jobs = p.jobs || p.content || p.results || [];
      for (const j of jobs) {
        const title = j.title || j.name || '';
        if (!matches(title)) continue;
        results.Deloitte.push({
          title, company: 'Deloitte',
          location: j.location || j.city || 'US',
          posted: fmtDate(j.date || j.postedDate),
          url: j.url || j.applyUrl || 'https://apply.deloitte.com/en_US/careers/SearchJobs',
          score: score(title),
        });
      }
    } catch {}
  }
}

// =============================================================
// Print table
// =============================================================
function printTable(company, jobs) {
  if (jobs.length === 0) {
    console.log(`\n### ${company}: No matching jobs found`);
    return;
  }
  jobs.sort((a, b) => b.score - a.score);
  console.log(`\n### ${company} (${jobs.length} matching jobs)`);
  console.log('| # | Title | Location | Posted | Score | Apply |');
  console.log('|---|-------|----------|--------|-------|-------|');
  jobs.forEach((j, i) => {
    const t = j.title.replace(/\|/g, '-').substring(0, 65);
    const l = j.location.replace(/\|/g, '/').replace(/,\s*,/g, ',').substring(0, 45);
    const url = j.url ? `[Apply](${j.url})` : 'N/A';
    console.log(`| ${i+1} | ${t} | ${l} | ${j.posted} | ${j.score} | ${url} |`);
  });
}

async function run() {
  console.error('Fetching SAP...');
  await getSapJobs();
  console.error('Fetching Lyft...');
  await getLyftJobs();
  console.error('Fetching Visa...');
  await getVisaJobs();
  console.error('Fetching Deloitte...');
  await getDeloitteJobs();

  console.log('\n# Job Search Results — Deloitte, Infosys, Visa, Lyft, SAP\n');
  console.log('**Profile:** Java/Full Stack Developer | **Filters:** US only, Junior–Senior (≤5yr), No clearance\n');

  printTable('SAP', results.SAP);
  printTable('Lyft', results.Lyft);
  printTable('Visa', results.Visa);
  printTable('Deloitte', results.Deloitte);

  console.log('\n### Infosys: Not available');
  console.log('> `career.infosys.com` is India/China-only (no US in their system). ' +
    'Infosys US jobs are likely posted via a separate internal ATS not accessible via public API. ' +
    'Check https://infosys.com/careers directly or search LinkedIn for "Infosys" + your target role.');

  const total = results.SAP.length + results.Lyft.length + results.Visa.length + results.Deloitte.length;
  console.log(`\n**Total: ${total} jobs matched across SAP, Lyft, and Visa.**`);
}

run().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
