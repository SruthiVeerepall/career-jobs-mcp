// Probe public JSON endpoints for high-value companies that failed ATS auto-discovery.
import https from 'node:https';

const TARGETS = [
  // IBM Eightfold AI - actual endpoints
  ['IBM Eightfold ATS',   'https://ibm.eightfold.ai/api/apply/v2/jobs?domain=ibm.com&start=0&num=1&Job_Profile=&category=&country=&location=&query=java'],
  ['IBM Eightfold v3',    'https://ibmglobal.eightfold.ai/api/apply/v2/jobs?domain=ibm.com&start=0&num=1'],
  ['IBM careers.ibm api', 'https://careers.ibm.com/wp-json/wp/v2/jobs'],

  // Oracle Recruiting Cloud (HCM REST)
  ['Oracle ORC',          'https://eeho.fa.us2.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&limit=1'],
  ['Oracle ORC v2',       'https://eeho.fa.us2.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions'],

  // Cisco
  ['Cisco JSON',          'https://jobs.cisco.com/jobs/SearchJobs/?listFilterMode=1&projectId=18&keyword=java&format=json'],
  ['Cisco static',        'https://jobs.cisco.com/jobs/SearchJobs/?keyword=java'],

  // UnitedHealth Group iCIMS
  ['UHG iCIMS',           'https://careers.unitedhealthgroup.com/jobs/search?q=java&format=json'],
  ['UHG search',          'https://careers.unitedhealthgroup.com/api/jobs?q=java&page=1'],

  // AT&T iCIMS
  ['AT&T iCIMS',          'https://www.att.jobs/searchjobs?q=java&format=json'],
  ['AT&T api',            'https://www.att.jobs/api/jobs?keyword=java'],

  // Verizon
  ['Verizon search',      'https://mycareer.verizon.com/jobs/search/?q=java&format=json'],

  // Activision Blizzard
  ['Activision API',      'https://careers.activisionblizzard.com/api/jobs'],

  // Electronic Arts
  ['EA API',              'https://www.ea.com/careers/api/jobs'],

  // Lockheed Martin (Brassring)
  ['Lockheed Martin',     'https://www.lockheedmartinjobs.com/search-jobs/results?ActiveFacetID=0&CurrentPage=1&RecordsPerPage=15&Distance=50&RadiusUnitType=0&Keywords=java&Location=&ShowRadius=False&IsPagination=False&CustomFacetName=&FacetTerm=&FacetType=0&FacetFilters=&SearchResultsModuleName=Search+Results&SearchFiltersModuleName=Search+Filters&SortCriteria=0&SortDirection=0&SearchType=5&CategoryFacetTerm=&CategoryFacetType=&LocationFacetTerm=&LocationFacetType=&KeywordType=&LocationType=&LocationPath=&OrganizationIds='],

  // Northrop Grumman
  ['Northrop Grumman',    'https://www.northropgrumman.com/jobs/api/jobs?keyword=java'],

  // Verizon
  ['Verizon Workday cxs', 'https://verizon.wd5.myworkdayjobs.com/wday/cxs/verizon/Verizon_Careers_External/jobs'],
  ['Verizon workday alt', 'https://verizon.wd1.myworkdayjobs.com/wday/cxs/verizon/Verizon_Careers/jobs'],

  // T-Mobile (already in registry)
  ['Comcast workday',     'https://comcast.wd5.myworkdayjobs.com/wday/cxs/comcast/Comcast_Careers/jobs'],

  // Cognizant
  ['Cognizant',           'https://careers.cognizant.com/global/en/api/jobs?query=java'],

  // Infosys SmartRecruiters
  ['Infosys SR',          'https://api.smartrecruiters.com/v1/companies/Infosys/postings?limit=1'],
  ['Wipro SR',            'https://api.smartrecruiters.com/v1/companies/Wipro/postings?limit=1'],
  ['Capgemini SR',        'https://api.smartrecruiters.com/v1/companies/Capgemini/postings?limit=1'],
  ['Cognizant SR',        'https://api.smartrecruiters.com/v1/companies/Cognizant/postings?limit=1'],
  ['Infosys SR alt',      'https://api.smartrecruiters.com/v1/companies/Infosys1/postings?limit=1'],

  // Verizon SR
  ['Verizon SR',          'https://api.smartrecruiters.com/v1/companies/Verizon/postings?limit=1'],

  // Snap (was probed greenhouse failed; try snap)
  ['Snap SR',             'https://api.smartrecruiters.com/v1/companies/Snap/postings?limit=1'],
  ['Snap SR2',            'https://api.smartrecruiters.com/v1/companies/SnapInc/postings?limit=1'],

  // Wells Fargo extra
  ['WF wd5 alt',          'https://wd5.myworkdayjobs.com/wday/cxs/wf/External/jobs'],
];

function get(url, opts = {}) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request({
      method: opts.method || 'GET',
      hostname: u.hostname, port: 443, path: u.pathname + u.search,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json,*/*', ...(opts.headers || {}) },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data, ct: res.headers['content-type'] || '' }));
    });
    req.on('error', (e) => resolve({ status: 0, error: e.message, ct: '', body: '' }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'timeout', ct: '', body: '' }); });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

(async () => {
  for (const [name, url] of TARGETS) {
    const r = await get(url);
    const isJson = r.ct.includes('json') || (r.body && r.body.trim().startsWith('{'));
    const tag = r.status === 200 ? (isJson ? '✓ JSON' : '~ HTML') : `✗ ${r.status}`;
    const preview = (r.body || '').slice(0, 100).replace(/\n/g, ' ');
    console.log(`${tag.padEnd(12)} ${name.padEnd(28)} ${preview}`);
  }
})();
