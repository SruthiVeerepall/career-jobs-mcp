/**
 * probe-broken-alts.mjs
 * Tests alternative ATS identifiers for all broken companies from test-new-companies.mjs
 */
import https from 'https';

const TIMEOUT = 12000;

function request(hostname, path, method = 'GET', body = null, extraHeaders = {}) {
  return new Promise((resolve) => {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json, */*',
      ...extraHeaders,
    };
    if (body) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(body); }
    const req = https.request({ hostname, path, method, headers, timeout: TIMEOUT }, (res) => {
      let data = ''; res.on('data', c => data += c); res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', e => resolve({ status: 0, body: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
    if (body) req.write(body); req.end();
  });
}

async function gh(id) {
  const r = await request('boards-api.greenhouse.io', `/v1/boards/${id}/jobs`);
  if (r.status !== 200) return null;
  try { const p = JSON.parse(r.body); return { platform: 'greenhouse', id, count: p.jobs?.length ?? 0 }; } catch { return null; }
}

async function lv(id) {
  const r = await request('api.lever.co', `/v0/postings/${id}?mode=json&limit=1`);
  if (r.status !== 200) return null;
  try { const p = JSON.parse(r.body); return { platform: 'lever', id, count: Array.isArray(p) ? p.length : '?' }; } catch { return null; }
}

async function wd(tenant, wdN, site) {
  const body = JSON.stringify({ limit: 5, offset: 0, searchText: 'software', appliedFacets: {} });
  const r = await request(`${tenant}.${wdN}.myworkdayjobs.com`, `/wday/cxs/${tenant}/${site}/jobs`, 'POST', body);
  if (r.status === 200) {
    try { const p = JSON.parse(r.body); return { platform: 'workday', id: `${tenant}|${wdN}|${site}`, count: p.total ?? p.jobPostings?.length ?? '?' }; } catch { return null; }
  }
  if (r.status === 422 || r.status === 401) return { platform: 'workday', id: `${tenant}|${wdN}|${site}`, count: `(${r.status})` };
  return null;
}

async function first(...probes) {
  for (const p of probes) {
    const r = await p();
    if (r) return r;
  }
  return null;
}

// ── Alternatives for each broken company ──────────────────────────────────────
const ALTS = [
  { name: 'Spotify',     probes: [() => gh('spotify'), () => lv('spotify'), () => gh('lifeatspotify')] },
  { name: 'Zoom',        probes: [() => wd('zoom','wd5','zoom_external'), () => wd('zoom','wd5','Zoom'), () => wd('zoom','wd1','Zoom_External'), () => wd('zoom','wd3','Zoom_External')] },
  { name: 'GitHub',      probes: [() => gh('github'), () => lv('github'), () => gh('githubincorporated'), () => gh('github-2')] },
  { name: 'Monday.com',  probes: [() => gh('monday'), () => lv('mondaydotcom'), () => gh('mondaydotcom'), () => lv('monday')] },
  { name: 'Notion',      probes: [() => lv('notion'), () => gh('notion'), () => lv('notionhq')] },
  { name: 'Miro',        probes: [() => gh('miro'), () => lv('miro'), () => gh('mirohq'), () => lv('mirohq')] },
  { name: 'Rippling',    probes: [() => lv('rippling'), () => gh('rippling'), () => gh('rippling-1')] },
  { name: 'Shopify',     probes: [() => gh('shopify'), () => lv('shopify'), () => wd('shopify','wd5','Shopify'), () => wd('shopify','wd1','Shopify_External')] },
  { name: 'Retool',      probes: [() => lv('retool'), () => gh('retool'), () => gh('tryretool')] },
  { name: 'SentinelOne', probes: [() => gh('sentinelone'), () => lv('sentinelone'), () => wd('sentinelone','wd5','SentinelOne_Careers'), () => wd('sentinelone','wd1','SentinelOne')] },
  { name: 'CyberArk',    probes: [() => lv('cyberark'), () => wd('cyberark','wd5','CyberArk'), () => gh('cyberark'), () => wd('cyberark','wd1','External')] },
  { name: 'Rapid7',      probes: [() => lv('rapid7'), () => gh('rapid7'), () => wd('rapid7','wd5','Rapid7')] },
  { name: 'Western Digital', probes: [() => wd('wdc','wd5','WDCCareers'), () => wd('wdc','wd1','WDCCareers'), () => wd('wdc','wd3','WDCCareers'), () => lv('westerndigital')] },
  { name: 'Klarna',      probes: [() => lv('klarna'), () => gh('klarna'), () => wd('klarna','wd5','Klarna')] },
  { name: 'NerdWallet',  probes: [() => lv('nerdwallet'), () => gh('nerdwallet'), () => wd('nerdwallet','wd5','NerdWallet')] },
  { name: 'PNC Bank',    probes: [() => wd('pnc','wd5','pnc_bank_jobs'), () => wd('pnc','wd1','jobsearch'), () => wd('pnc','wd5','PNC_Careers'), () => wd('pnc','wd3','jobsearch')] },
  { name: 'Vanguard',    probes: [() => wd('vanguard','wd1','VanguardCareers'), () => wd('vanguard','wd3','VanguardCareers'), () => wd('vanguard','wd5','External'), () => wd('vanguard','wd5','Vanguard_Careers')] },
  { name: 'Compass',     probes: [() => gh('compass'), () => lv('compass'), () => wd('compass','wd5','Compass'), () => gh('compassinc')] },
  { name: 'Procore',     probes: [() => wd('procore','wd5','Procore'), () => lv('procore'), () => gh('procore'), () => wd('procore','wd1','Procore_Careers')] },
  { name: 'Autodesk',    probes: [() => wd('autodesk','wd1','Autodesk'), () => wd('autodesk','wd5','Autodesk'), () => wd('autodesk','wd1','Autodesk_Careers'), () => wd('autodesk','wd3','Autodesk_Careers_External')] },
  { name: 'Vimeo',       probes: [() => lv('vimeo'), () => gh('vimeo'), () => gh('vimeoinc')] },
  { name: 'Brightcove',  probes: [() => lv('brightcove'), () => gh('brightcove'), () => gh('brightcoveinc')] },
  { name: 'Benchling',   probes: [() => lv('benchling'), () => gh('benchling'), () => wd('benchling','wd5','Benchling')] },
  { name: 'SolarEdge',   probes: [() => wd('solaredge','wd5','SolarEdge'), () => lv('solaredge'), () => gh('solaredge')] },
  { name: 'Sunrun',      probes: [() => wd('sunrun','wd5','Sunrun'), () => wd('sunrun','wd1','Sunrun'), () => lv('sunrun')] },
  { name: 'Bloom Energy',probes: [() => wd('bloomenergy','wd5','BloomEnergy'), () => lv('bloomenergy'), () => gh('bloomenergy')] },
  { name: 'Siemens',     probes: [() => wd('siemens','wd3','Siemens'), () => wd('siemens','wd5','Siemens'), () => wd('siemens','wd1','Siemens'), () => wd('siemensus','wd3','Siemens')] },
  { name: 'Emerson Electric', probes: [() => wd('emerson','wd5','External'), () => wd('emerson','wd1','Emerson'), () => wd('emerson','wd5','Emerson_Careers'), () => wd('emersonelectric','wd5','External')] },
  { name: 'CACI',        probes: [() => wd('caci','wd3','CACI_Careers'), () => wd('caci','wd5','CACI_Careers'), () => wd('caci','wd1','External'), () => lv('caci')] },
  { name: 'Peraton',     probes: [() => wd('peraton','wd1','External'), () => wd('peraton','wd5','Peraton_Careers'), () => wd('peraton','wd3','Peraton_Careers')] },
  { name: 'Granicus',    probes: [() => lv('granicus'), () => wd('granicus','wd5','Granicus'), () => gh('granicus')] },
  { name: 'Attentive',   probes: [() => gh('attentive'), () => lv('attentive'), () => gh('attentivemobile')] },
  { name: 'Brevo',       probes: [() => lv('brevo'), () => gh('brevo'), () => lv('sendinblue'), () => gh('sendinblue')] },
  { name: 'Moz',         probes: [() => lv('moz'), () => gh('moz')] },
  { name: 'AT&T',        probes: [() => wd('att','wd5','ATT'), () => wd('att','wd1','ATT_Jobs'), () => wd('att','wd3','ATT'), () => wd('att','wd5','External')] },
  { name: 'Talkdesk',    probes: [() => lv('talkdesk'), () => gh('talkdesk'), () => wd('talkdesk','wd5','Talkdesk')] },
  { name: 'Avalara',     probes: [() => wd('avalara','wd5','Avalara'), () => lv('avalara'), () => gh('avalara')] },
  { name: 'Farmers BN',  probes: [() => gh('fbn'), () => lv('farmersbusinessnetwork'), () => gh('farmersbusinessnetwork')] },
  { name: 'Indigo Ag',   probes: [() => gh('indigo'), () => lv('indigo'), () => lv('indigoag'), () => gh('indigoag')] },
  { name: 'Lime',        probes: [() => lv('lime'), () => gh('lime'), () => lv('limebike')] },
];

async function run() {
  const working = [];
  const stillBroken = [];
  let done = 0;

  // Run with limited concurrency (5 at a time since each company tries multiple)
  const CONCURRENCY = 5;
  let idx = 0;

  async function worker() {
    while (idx < ALTS.length) {
      const i = idx++;
      const c = ALTS[i];
      process.stderr.write(`  [${i+1}/${ALTS.length}] ${c.name}...\n`);
      const result = await first(...c.probes);
      done++;
      if (result) working.push({ name: c.name, ...result });
      else stillBroken.push(c.name);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`\n${'='.repeat(75)}`);
  console.log(`WORKING: ${working.length}  |  STILL BROKEN: ${stillBroken.length}\n`);

  console.log('## Working with correct identifiers\n');
  console.log('| Company | Platform | ATS Identifier | Jobs |');
  console.log('|---------|----------|----------------|------|');
  for (const r of working) {
    console.log(`| ${r.name} | ${r.platform} | \`${r.id}\` | ${r.count} |`);
  }

  if (stillBroken.length) {
    console.log('\n## Still no valid ATS found\n');
    stillBroken.forEach(n => console.log(`- ${n}`));
    console.log('\n> These companies should be removed from the registry or use platform: "custom"');
  }
}

run().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
