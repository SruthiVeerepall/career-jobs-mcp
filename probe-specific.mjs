/**
 * probe-specific.mjs
 * Probes SAP, Deloitte, and Infosys job search APIs with correct formats.
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
    const req = https.request({ hostname, path, method, headers, timeout: 20000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const preview = data.substring(0, 800);
        console.log(`\n[${label}] ${method} https://${hostname}${path}`);
        console.log(`  Status: ${res.statusCode}`);
        console.log(`  Preview: ${preview}`);
        resolve({ status: res.statusCode, body: data });
      });
    });
    req.on('error', err => {
      console.log(`\n[${label}] ERROR: ${err.message}`);
      resolve({ status: 0, body: '' });
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
    if (body) req.write(body);
    req.end();
  });
}

async function run() {
  // ============================================================
  // SAP — try /services/jobs/search/ with country filter US
  // ============================================================
  const sapBody1 = JSON.stringify({
    page: 0,
    keywords: 'Java Software Engineer',
    locationsearch: '',
    sortby: 'referencedate',
    sortdir: 'desc',
    sortfield: 'title',
    recordsperpage: 25,
    startrow: 0,
    facetquery: {
      facet: true, mincount: 1, limit: 5000,
      fields: ['department', 'customfield3', 'country'],
      sort: 'index', showPicklistAllLocales: false
    },
    filterquery: { country: ['US'] }
  });
  await fetchJson('SAP-search-US', 'jobs.sap.com', '/services/jobs/search/', 'POST', sapBody1, {
    Referer: 'https://jobs.sap.com/search/',
    Origin: 'https://jobs.sap.com',
  });

  // Also try without filter to see if we get any results at all
  const sapBody2 = JSON.stringify({
    page: 0,
    keywords: 'Java',
    locationsearch: 'United States',
    sortby: 'referencedate',
    sortdir: 'desc',
    sortfield: 'title',
    recordsperpage: 25,
    startrow: 0,
    facetquery: { facet: false },
    filterquery: {}
  });
  await fetchJson('SAP-search-locationsearch', 'jobs.sap.com', '/services/jobs/search/', 'POST', sapBody2, {
    Referer: 'https://jobs.sap.com/search/',
    Origin: 'https://jobs.sap.com',
  });

  // ============================================================
  // Infosys — try double-slash path (as seen in browser intercept)
  // ============================================================
  await fetchJson('Infosys-functionalAreaCount', 'intapgateway.infosysapps.com',
    '/careersci/search/intapjbsrch//jobListingPage/functionalAreaCount?sourceId=1,21');

  await fetchJson('Infosys-locationCount', 'intapgateway.infosysapps.com',
    '/careersci/search/intapjbsrch//jobListingPage/locationCount?sourceId=1,21');

  // Try the jobListing page itself with double slash
  await fetchJson('Infosys-jobListing-doubleslash', 'intapgateway.infosysapps.com',
    '/careersci/search/intapjbsrch//jobListingPage?sourceId=1,21&pageIndex=0&pageSize=20');

  // Try with keyword
  await fetchJson('Infosys-jobListing-java', 'intapgateway.infosysapps.com',
    '/careersci/search/intapjbsrch//jobListingPage?keyword=java&sourceId=1,21&pageIndex=0&pageSize=20');

  // ============================================================
  // Infosys US — check if there's a separate US jobs API
  // SmartRecruiters (Infosys uses SR for US hiring)
  // ============================================================
  await fetchJson('Infosys-SmartRecruiters', 'api.smartrecruiters.com',
    '/v1/companies/Infosys/postings?limit=10&offset=0');

  await fetchJson('Infosys-SmartRecruiters-java', 'api.smartrecruiters.com',
    '/v1/companies/Infosys/postings?limit=10&offset=0&q=java');

  // ============================================================
  // Deloitte — try Avature API patterns
  // ============================================================
  await fetchJson('Deloitte-SearchJobsJSON', 'apply.deloitte.com',
    '/en_US/careers/SearchJobsJSON?sort=relevancy&keyword=Java+Software+Engineer&radiusUnit=MILES', 'GET', null, {
    Referer: 'https://apply.deloitte.com/en_US/careers/SearchJobs',
    'X-Requested-With': 'XMLHttpRequest',
  });

  await fetchJson('Deloitte-SearchJobsJSON-noterm', 'apply.deloitte.com',
    '/en_US/careers/SearchJobsJSON?sort=relevancy', 'GET', null, {
    Referer: 'https://apply.deloitte.com/en_US/careers/SearchJobs',
    'X-Requested-With': 'XMLHttpRequest',
  });

  // Try Deloitte Workday approach (different URL)
  await fetchJson('Deloitte-Workday-DTI', 'deloitte.wd1.myworkdayjobs.com',
    '/api/apply/v1/jobs?limit=20&offset=0&q=Java', 'GET', null, {
    Accept: 'application/json',
  });
}

run().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
