/**
 * fetch-sap-infosys.mjs
 * Fetches US Java/Full Stack/Software Engineer jobs from SAP (confirmed working API).
 * Also probes Infosys US sourcelist and alternative portals.
 */
import https from 'https';

function fetchJson(label, hostname, path, method = 'GET', body = null, extraHeaders = {}) {
  return new Promise((resolve) => {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      ...extraHeaders,
    };
    if (body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    const req = https.request({ hostname, path, method, headers, timeout: 30000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', err => resolve({ status: 0, body: '', headers: {} }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout', headers: {} }); });
    if (body) req.write(body);
    req.end();
  });
}

// --- SAP ---
async function fetchSapJobs(keywords, startRow = 0, recordsPerPage = 100) {
  const body = JSON.stringify({
    page: 0,
    keywords,
    locationsearch: '',
    sortby: 'referencedate',
    sortdir: 'desc',
    sortfield: 'title',
    recordsperpage: recordsPerPage,
    startrow: startRow,
    facetquery: {
      facet: true, mincount: 1, limit: 5000,
      fields: ['country'],
      sort: 'index', showPicklistAllLocales: false
    },
    filterquery: { country: ['US'] }
  });
  return fetchJson(`SAP[${keywords}@${startRow}]`, 'jobs.sap.com', '/services/jobs/search/', 'POST', body, {
    Referer: 'https://jobs.sap.com/search/',
    Origin: 'https://jobs.sap.com',
  });
}

const OVER_5YR = /\bprincipal\b|\bstaff\b|\blead\b|\barchitect\b|\bdirector\b|\bvp\b|\bhead of\b|\bmanager\b|\bexecutive\b|\bdistinguished\b|\bfellow\b/i;
const CLEARANCE = /security clearance|secret clearance|top secret|ts\/sci|clearance required|us citizen/i;
const RESUME_WEIGHTS = [
  { pattern: /\bjava\b/i, weight: 10 },
  { pattern: /\bspring boot\b/i, weight: 10 },
  { pattern: /\bspring\b/i, weight: 7 },
  { pattern: /\bmicroservices?\b/i, weight: 7 },
  { pattern: /\bfull.?stack\b/i, weight: 7 },
  { pattern: /\bangular\b/i, weight: 5 },
  { pattern: /\breact\b/i, weight: 5 },
  { pattern: /\baws\b/i, weight: 5 },
  { pattern: /\bkafka\b/i, weight: 5 },
  { pattern: /\brest(ful)?\b/i, weight: 5 },
  { pattern: /\bcloud\b/i, weight: 5 },
  { pattern: /\bdocker\b/i, weight: 3 },
  { pattern: /\bkubernetes\b/i, weight: 3 },
];
const TARGET_ROLES = /\b(java|full.?stack|fullstack|software engineer|software developer|backend|back.end|application developer)\b/i;
const EXCLUDE_ROLES = /\b(data scientist|machine learning|ml engineer|devops engineer|qa engineer|test engineer|security engineer|network engineer|database administrator|dba|data engineer|ui developer|ux designer|product manager|scrum master|business analyst|data analyst)\b/i;

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
  if (score >= 5) return true;
  if (score === 0 && TARGET_ROLES.test(title)) return true;
  return false;
}

async function run() {
  console.log('=== SAP US Jobs ===');
  const SEARCH_TERMS = ['Java', 'Full Stack', 'Software Engineer'];
  const allJobs = [];
  const seen = new Set();

  for (const term of SEARCH_TERMS) {
    // First call to get total
    const r0 = await fetchSapJobs(term, 0, 100);
    if (r0.status !== 200) { console.log(`SAP ${term}: HTTP ${r0.status}`); continue; }
    let parsed;
    try { parsed = JSON.parse(r0.body); } catch { console.log(`SAP ${term}: parse error`); continue; }

    const total = parsed.facetCounts?.country?.find(f => f.name === 'us' || f.name === 'US')?.count || parsed.jobList?.length || 0;
    console.log(`  SAP ${term}: ${total} US jobs (page 1 returned ${parsed.jobList?.length || 0})`);

    const batch = parsed.jobList || [];
    for (const job of batch) {
      const title = job.title || job.internaltitle || '';
      if (!matchesProfile(title)) continue;
      if (OVER_5YR.test(title)) continue;
      if (CLEARANCE.test(title)) continue;
      const key = `sap::${job.id || title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      allJobs.push({
        title,
        company: 'SAP',
        location: job.location || (job.city ? `${job.city}, ${job.state || ''}, US` : 'US'),
        posted: job.referencedate ? new Date(job.referencedate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'N/A',
        url: job.urltitle ? `https://jobs.sap.com/job/${job.urltitle}` : 'https://jobs.sap.com/search/',
        score: resumeScore(title),
      });
    }

    // Paginate if there are more results
    if (total > 100) {
      for (let start = 100; start < Math.min(total, 400); start += 100) {
        const r = await fetchSapJobs(term, start, 100);
        if (r.status !== 200) break;
        let p; try { p = JSON.parse(r.body); } catch { break; }
        for (const job of (p.jobList || [])) {
          const title = job.title || job.internaltitle || '';
          if (!matchesProfile(title)) continue;
          if (OVER_5YR.test(title)) continue;
          if (CLEARANCE.test(title)) continue;
          const key = `sap::${job.id || title}`;
          if (seen.has(key)) continue;
          seen.add(key);
          allJobs.push({
            title,
            company: 'SAP',
            location: job.location || 'US',
            posted: job.referencedate ? new Date(job.referencedate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'N/A',
            url: job.urltitle ? `https://jobs.sap.com/job/${job.urltitle}` : 'https://jobs.sap.com/search/',
            score: resumeScore(title),
          });
        }
      }
    }
  }

  allJobs.sort((a, b) => b.score - a.score);
  console.log(`\nSAP matching jobs: ${allJobs.length}`);

  // ============================================================
  // Infosys — check the full sourcelist and US-specific APIs
  // ============================================================
  console.log('\n=== Infosys sourcelist.json ===');
  const srcList = await fetchJson('Infosys-sourcelist', 'career.infosys.com', '/assets/json/sourcelist.json');
  if (srcList.status === 200 || srcList.status === 304) {
    try {
      const sl = JSON.parse(srcList.body);
      console.log(JSON.stringify(sl, null, 2));
    } catch { console.log(srcList.body.substring(0, 1000)); }
  }

  // Check Infosys Company.json for US entries
  console.log('\n=== Infosys Company.json ===');
  const compJson = await fetchJson('Infosys-company', 'career.infosys.com', '/assets/json/Company.json');
  if (compJson.status === 200 || compJson.status === 304) {
    try {
      const cj = JSON.parse(compJson.body);
      console.log(JSON.stringify(cj, null, 2));
    } catch { console.log(compJson.body.substring(0, 2000)); }
  }

  // Check Infosys environment.json for the full content
  console.log('\n=== Infosys environment.json (full) ===');
  const envJson = await fetchJson('Infosys-env', 'career.infosys.com', '/assets/environments/environment.json');
  if (envJson.status === 200 || envJson.status === 304) {
    console.log(envJson.body);
  }

  // Try Infosys BPO/US portal
  console.log('\n=== Infosys BPO Greenhouse check ===');
  const ghInfBpo = await fetchJson('Infosys-BPO-GH', 'boards-api.greenhouse.io', '/v1/boards/infosysbpo/jobs');
  console.log(`  Status: ${ghInfBpo.status} | Preview: ${ghInfBpo.body.substring(0, 200)}`);

  // Try Lever for Infosys
  const leverInfosys = await fetchJson('Infosys-Lever', 'api.lever.co', '/v0/postings/infosys?limit=10');
  console.log(`  Lever: ${leverInfosys.status} | Preview: ${leverInfosys.body.substring(0, 200)}`);

  // ============================================================
  // Print SAP results table
  // ============================================================
  if (allJobs.length > 0) {
    console.log(`\n\n${'='.repeat(80)}`);
    console.log(`SAP US JOBS (${allJobs.length} matching the active profile)`);
    console.log('='.repeat(80));
    console.log('| # | Title | Location | Posted | Score | Apply |');
    console.log('|---|-------|----------|--------|-------|-------|');
    allJobs.forEach((j, i) => {
      const t = j.title.replace(/\|/g, '-').substring(0, 60);
      const l = j.location.replace(/\|/g, '/').substring(0, 40);
      console.log(`| ${i + 1} | ${t} | ${l} | ${j.posted} | ${j.score} | ${j.url} |`);
    });
  }
}

run().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
