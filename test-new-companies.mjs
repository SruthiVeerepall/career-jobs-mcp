/**
 * test-new-companies.mjs
 * Probes the 64 newly added companies to verify ATS identifiers work.
 * Tests Greenhouse, Lever, and Workday endpoints.
 * No date filter — just checks if the board exists and returns any jobs.
 */
import https from 'https';

const TIMEOUT = 15000;

function request(hostname, path, method = 'GET', body = null, extraHeaders = {}) {
  return new Promise((resolve) => {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json, */*',
      ...extraHeaders,
    };
    if (body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    const req = https.request({ hostname, path, method, headers, timeout: TIMEOUT }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', e => resolve({ status: 0, body: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
    if (body) req.write(body);
    req.end();
  });
}

async function probeGreenhouse(id) {
  const r = await request('boards-api.greenhouse.io', `/v1/boards/${id}/jobs`);
  if (r.status === 200) {
    try {
      const p = JSON.parse(r.body);
      return { ok: true, count: p.jobs?.length ?? 0, status: 200 };
    } catch { return { ok: true, count: '?', status: 200 }; }
  }
  return { ok: false, count: 0, status: r.status };
}

async function probeLever(id) {
  const r = await request('api.lever.co', `/v0/postings/${id}?mode=json&limit=5`);
  if (r.status === 200) {
    try {
      const p = JSON.parse(r.body);
      return { ok: true, count: Array.isArray(p) ? p.length : '?', status: 200 };
    } catch { return { ok: true, count: '?', status: 200 }; }
  }
  return { ok: false, count: 0, status: r.status };
}

async function probeWorkday(id) {
  const parts = id.split('|');
  if (parts.length !== 3) return { ok: false, count: 0, status: 0, note: 'bad format' };
  const [tenant, wd, site] = parts;
  const body = JSON.stringify({ limit: 20, offset: 0, searchText: 'software engineer', appliedFacets: {} });
  const r = await request(
    `${tenant}.${wd}.myworkdayjobs.com`,
    `/wday/cxs/${tenant}/${site}/jobs`,
    'POST', body,
    { Origin: `https://${tenant}.${wd}.myworkdayjobs.com`, 'X-Requested-With': 'XMLHttpRequest' }
  );
  if (r.status === 200) {
    try {
      const p = JSON.parse(r.body);
      return { ok: true, count: p.total ?? p.jobPostings?.length ?? '?', status: 200 };
    } catch { return { ok: true, count: '?', status: 200 }; }
  }
  // 422 = CSRF required but endpoint exists
  if (r.status === 422) return { ok: true, count: '(CSRF)', status: 422, note: 'endpoint exists, CSRF required' };
  return { ok: false, count: 0, status: r.status };
}

// ── New companies added ────────────────────────────────────────────────────────
const NEW_COMPANIES = [
  // Big Tech / Cloud
  { name: 'Spotify',               platform: 'greenhouse', id: 'spotify' },
  { name: 'Zoom',                  platform: 'workday',    id: 'zoom|wd5|Zoom_External' },
  { name: 'GitHub',                platform: 'greenhouse', id: 'github' },

  // Cloud & SaaS
  { name: 'Monday.com',            platform: 'greenhouse', id: 'monday' },
  { name: 'Notion',                platform: 'lever',      id: 'notion' },
  { name: 'DocuSign',              platform: 'workday',    id: 'docusign|wd1|DocuSign' },
  { name: 'Miro',                  platform: 'greenhouse', id: 'mirohq' },
  { name: 'Rippling',              platform: 'greenhouse', id: 'rippling' },
  { name: 'Shopify',               platform: 'greenhouse', id: 'shopify' },
  { name: 'Retool',                platform: 'greenhouse', id: 'retool' },

  // Cybersecurity
  { name: 'SentinelOne',           platform: 'greenhouse', id: 'sentinelone' },
  { name: 'CyberArk',              platform: 'greenhouse', id: 'cyberark' },
  { name: 'Rapid7',                platform: 'greenhouse', id: 'rapid7' },
  { name: 'Secureworks',           platform: 'workday',    id: 'secureworks|wd5|Secureworks_Careers' },

  // Hardware & Semiconductors
  { name: 'Garmin',                platform: 'workday',    id: 'garmin|wd5|Garmin' },
  { name: 'Western Digital',       platform: 'workday',    id: 'wdc|wd5|WDCCareers' },
  { name: 'Seagate',               platform: 'workday',    id: 'seagatetechnology|wd3|Seagate' },

  // Analytics & BI
  { name: 'TransUnion',            platform: 'workday',    id: 'transunion|wd5|TransUnion' },
  { name: 'MSCI',                  platform: 'workday',    id: 'msci|wd3|MSCICareers' },
  { name: "Moody's",               platform: 'workday',    id: 'moodyscorporation|wd1|External' },
  { name: 'FactSet',               platform: 'workday',    id: 'factset|wd5|FactSet_Careers' },

  // Fintech
  { name: 'Klarna',                platform: 'greenhouse', id: 'klarna' },
  { name: 'NerdWallet',            platform: 'greenhouse', id: 'nerdwallet' },

  // Banks
  { name: 'PNC Bank',              platform: 'workday',    id: 'pnc|wd5|jobsearch' },
  { name: 'Truist',                platform: 'workday',    id: 'truist|wd5|Truist' },

  // Investment & Wealth
  { name: 'Vanguard',              platform: 'workday',    id: 'vanguard|wd5|VanguardCareers' },
  { name: 'Prudential Financial',  platform: 'workday',    id: 'prudential|wd5|Prudential_Financial' },

  // Real Estate & Construction
  { name: 'Compass',               platform: 'greenhouse', id: 'compass-1' },
  { name: 'Procore',               platform: 'greenhouse', id: 'procore' },
  { name: 'Trimble',               platform: 'workday',    id: 'trimble|wd5|Trimble_Careers' },
  { name: 'Autodesk',              platform: 'workday',    id: 'autodesk|wd1|Autodesk_Careers_External' },

  // Health Insurance
  { name: 'Kaiser Permanente',     platform: 'workday',    id: 'kaiserpermanente|wd3|KP_EXC_SEARCH' },

  // Media & Entertainment
  { name: 'Vimeo',                 platform: 'greenhouse', id: 'vimeo' },
  { name: 'Brightcove',            platform: 'greenhouse', id: 'brightcove' },

  // Biotech
  { name: 'Benchling',             platform: 'greenhouse', id: 'benchling' },
  { name: 'Recursion Pharma',      platform: 'greenhouse', id: 'recursionpharmaceuticals' },
  { name: '10x Genomics',          platform: 'greenhouse', id: '10xgenomics' },

  // Energy Tech
  { name: 'Enphase Energy',        platform: 'workday',    id: 'enphase|wd5|Enphase_Careers' },
  { name: 'SolarEdge',             platform: 'greenhouse', id: 'solaredge' },
  { name: 'First Solar',           platform: 'workday',    id: 'firstsolar|wd5|FirstSolar' },
  { name: 'Sunrun',                platform: 'greenhouse', id: 'sunrun' },
  { name: 'Bloom Energy',          platform: 'greenhouse', id: 'bloomenergy' },

  // Industrial & Manufacturing
  { name: 'Siemens',               platform: 'workday',    id: 'siemens|wd3|Siemens' },
  { name: 'Honeywell',             platform: 'workday',    id: 'honeywell|wd5|Honeywell' },
  { name: 'Rockwell Automation',   platform: 'workday',    id: 'rockwellautomation|wd5|External' },
  { name: 'Emerson Electric',      platform: 'workday',    id: 'emerson|wd5|Emerson' },

  // GovTech
  { name: 'Tyler Technologies',    platform: 'workday',    id: 'tylertech|wd5|External' },
  { name: 'SAIC',                  platform: 'workday',    id: 'saic|wd5|SAIC' },
  { name: 'CACI',                  platform: 'workday',    id: 'caci|wd1|CACI_Careers' },
  { name: 'Peraton',               platform: 'workday',    id: 'peraton|wd1|Peraton_Careers' },
  { name: 'Maximus',               platform: 'workday',    id: 'maximusfederal|wd5|Maximus' },
  { name: 'Granicus',              platform: 'greenhouse', id: 'granicus' },

  // MarTech
  { name: 'Attentive',             platform: 'greenhouse', id: 'attentivemobile' },
  { name: 'Yotpo',                 platform: 'greenhouse', id: 'yotpo' },
  { name: 'Sprinklr',              platform: 'workday',    id: 'sprinklr|wd5|Sprinklr' },
  { name: 'Brevo',                 platform: 'greenhouse', id: 'brevo' },
  { name: 'Moz',                   platform: 'greenhouse', id: 'moz' },

  // Telecom
  { name: 'AT&T',                  platform: 'workday',    id: 'att|wd1|ATT' },
  { name: 'Verizon',               platform: 'workday',    id: 'verizon|wd5|External' },

  // Contact Center & CX
  { name: 'Genesys',               platform: 'workday',    id: 'genesys|wd5|External' },
  { name: 'Talkdesk',              platform: 'greenhouse', id: 'talkdesk' },

  // Accounting & Tax Tech
  { name: 'Avalara',               platform: 'greenhouse', id: 'avalara' },

  // AgriTech
  { name: 'Farmers Bus Network',   platform: 'greenhouse', id: 'farmersbusinessnetwork' },
  { name: 'Indigo Agriculture',    platform: 'greenhouse', id: 'indigoag' },

  // Mobility
  { name: 'Lime',                  platform: 'greenhouse', id: 'lime' },

  // Credit & Risk
  { name: 'Dun & Bradstreet',      platform: 'workday',    id: 'dnb|wd5|DnBCareers' },
];

async function probeCompany(c) {
  try {
    if (c.platform === 'greenhouse') return await probeGreenhouse(c.id);
    if (c.platform === 'lever')      return await probeLever(c.id);
    if (c.platform === 'workday')    return await probeWorkday(c.id);
    return { ok: false, count: 0, status: 0, note: 'unknown platform' };
  } catch (e) {
    return { ok: false, count: 0, status: 0, note: e.message };
  }
}

async function run() {
  console.log(`Testing ${NEW_COMPANIES.length} new companies...\n`);

  const CONCURRENCY = 10;
  const results = [];
  let idx = 0;

  async function worker() {
    while (idx < NEW_COMPANIES.length) {
      const i = idx++;
      const c = NEW_COMPANIES[i];
      process.stderr.write(`  [${i+1}/${NEW_COMPANIES.length}] ${c.name} (${c.platform})...\n`);
      const r = await probeCompany(c);
      results[i] = { ...c, ...r };
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const working  = results.filter(r => r.ok);
  const broken   = results.filter(r => !r.ok);

  console.log(`\n${'='.repeat(75)}`);
  console.log(`RESULTS: ${working.length} working, ${broken.length} broken\n`);

  // Working table
  console.log('## Working Companies\n');
  console.log('| # | Company | Platform | Jobs/Status | ATS ID |');
  console.log('|---|---------|----------|-------------|--------|');
  working.forEach((r, i) => {
    const status = r.status === 422 ? '422 (CSRF-OK)' : `${r.count} jobs`;
    const id = r.id.length > 40 ? r.id.substring(0, 40) + '…' : r.id;
    console.log(`| ${i+1} | ${r.name} | ${r.platform} | ${status} | ${id} |`);
  });

  if (broken.length > 0) {
    console.log('\n## Broken / Need Fix\n');
    console.log('| # | Company | Platform | HTTP | ATS ID | Note |');
    console.log('|---|---------|----------|------|--------|------|');
    broken.forEach((r, i) => {
      const id = r.id.length > 35 ? r.id.substring(0, 35) + '…' : r.id;
      console.log(`| ${i+1} | ${r.name} | ${r.platform} | ${r.status} | ${id} | ${r.note || ''} |`);
    });
  }
}

run().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
