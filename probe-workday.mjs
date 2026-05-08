// Probe known Workday tenant guesses for companies discovery couldn't find.
import https from 'node:https';

const CANDIDATES = [
  // [Display Name, careerUrl, tenant, wdHost, site]
  ['Wells Fargo',         'https://www.wellsfargojobs.com',                     'wf',          'wd1', 'External_Career'],
  ['BNY Mellon',          'https://www.bnymellon.com/us/en/careers.html',       'bnymellon',   'wd1', 'BNYM_Careers_Site'],
  ['BlackRock',           'https://careers.blackrock.com',                      'blackrock',   'wd1', 'BlackRock_Professional'],
  ['IBM',                 'https://www.ibm.com/careers',                        'ibmglobal',   'wd1', 'IBM_Professional_Hiring'],
  ['Oracle',              'https://careers.oracle.com',                         'oracle',      'wd5', 'Oracle'],
  ['Cisco',               'https://jobs.cisco.com',                             'cisco',       'wd5', 'External_Careers'],
  ['Dell Technologies',   'https://jobs.dell.com',                              'dell',        'wd1', 'External_Career'],
  ['VMware (Broadcom)',   'https://careers.broadcom.com',                       'broadcom',    'wd1', 'External_Career_Site'],
  ['Mastercard',          'https://careers.mastercard.com',                     'mastercard',  'wd1', 'CorporateCareers'],
  ['American Express',    'https://careers.americanexpress.com',                'aexp',        'wd1', 'amexcareers'],
  ['PayPal',              'https://careers.pypl.com',                           'paypal',      'wd1', 'jobs'],
  ['Synchrony Financial', 'https://careers.synchrony.com',                      'synchrony',   'wd5', 'Synchrony_Careers'],
  ['Bloomberg',           'https://www.bloomberg.com/company/careers',          'bloomberg',   'wd1', 'External'],
  ['ICE',                 'https://careers.theice.com',                         'theice',      'wd1', 'ICE'],
  ['Intuit',              'https://www.intuit.com/careers',                     'intuit',      'wd5', 'IntuitExternalCareerSite'],
  ['Splunk',              'https://www.splunk.com/en_us/careers.html',          'splunk',      'wd1', 'Splunk'],
  ['ServiceNow',          'https://careers.servicenow.com',                     'servicenow',  'wd1', 'ServiceNow'],
  ['Box',                 'https://www.box.com/about-us/careers',               'boxinc',      'wd5', 'Box'],
  ['DocuSign',            'https://careers.docusign.com',                       'docusign',    'wd1', 'External'],
  ['monday.com',          'https://monday.com/careers',                         'mondaycom',   'wd3', 'External'],
  ['Slack',               'https://slack.com/careers',                          'slack',       'wd5', 'SlackCareers'],
  ['Zoom',                'https://careers.zoom.us',                            'zoom',        'wd1', 'Zoom'],
  ['Klarna',              'https://www.klarna.com/careers',                     'klarna',      'wd5', 'Klarna'],
  ['Adyen',               'https://careers.adyen.com',                          'adyen',       'wd5', 'Adyen'],
  ['Mimecast',            'https://careers.mimecast.com',                       'mimecast',    'wd1', 'Mimecast_Careers'],
  ['Sophos',              'https://www.sophos.com/en-us/careers',               'sophos',      'wd5', 'sophos'],
  ['Citrix',              'https://www.citrix.com/about/careers',               'citrix',      'wd5', 'Citrix_Careers'],
  ['NetApp',              'https://careers.netapp.com',                         'netapp',      'wd1', 'ncareers'],
  ['Discover Financial',  'https://jobs.discover.com',                          'discover',    'wd1', 'discover'],
  ['Wells Fargo (alt)',   'https://www.wellsfargojobs.com',                     'wellsfargojobs', 'wd1', 'External'],
  ['Wells Fargo (alt2)',  'https://www.wellsfargojobs.com',                     'wf',          'wd1', 'WellsFargoJobs'],
  ['Wells Fargo (alt3)',  'https://www.wellsfargojobs.com',                     'wellsfargo',  'wd1', 'External'],
  ['BlackRock (alt)',     'https://careers.blackrock.com',                      'blackrock',   'wd1', 'BlackRock_Careers'],
  ['BlackRock (alt2)',    'https://careers.blackrock.com',                      'blackrock',   'wd1', 'BR_External'],
  ['Cisco (alt)',         'https://jobs.cisco.com',                             'cisco',       'wd5', 'JOBS'],
  ['Cisco (alt2)',        'https://jobs.cisco.com',                             'cisco',       'wd5', 'careers'],
  ['Mastercard (alt)',    'https://careers.mastercard.com',                     'mastercard',  'wd1', 'mastercard_careers'],
  ['PayPal (alt)',        'https://careers.pypl.com',                           'paypal',      'wd1', 'paypalcareers'],
  ['American Express(alt)','https://careers.americanexpress.com',               'aexp',        'wd1', 'AmericanExpress'],
];

function get(url, opts = {}) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request({
      method: opts.method || 'GET',
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*', ...(opts.headers || {}) },
      timeout: 8000,
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', () => resolve({ status: 0 }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0 }); });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function probe(tenant, wd, site) {
  const r = await get(`https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: 1, offset: 0, searchText: '' }),
  });
  return r.status === 200;
}

(async () => {
  const verified = [];
  const failed = [];
  for (const [name, url, tenant, wd, site] of CANDIDATES) {
    const ok = await probe(tenant, wd, site);
    const tag = ok ? '✓' : '✗';
    console.log(`${tag} ${name.padEnd(28)} ${tenant}|${wd}|${site}`);
    if (ok) verified.push({ name, url, identifier: `${tenant}|${wd}|${site}` });
    else failed.push(name);
  }
  console.log(`\n=== ${verified.length} verified, ${failed.length} failed ===`);
  console.log(JSON.stringify(verified, null, 2));
})();
