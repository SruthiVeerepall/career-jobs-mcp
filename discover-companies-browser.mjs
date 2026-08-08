// Second-pass ATS discovery for career sites that are JS-rendered, where the
// ATS endpoint only appears as a runtime network call. Loads each page in
// headless Chrome, watches every request, and verifies whatever it finds
// against the live ATS API.
//
// Usage: node discover-companies-browser.mjs companies-batch2.txt
import { promises as fs } from 'node:fs';
import puppeteer from 'puppeteer';
import axios from 'axios';

const inputFile = process.argv[2] || 'companies-batch2.txt';
const outBase = inputFile.replace(/\.txt$/, '');
const prior = JSON.parse(await fs.readFile(`discovered-${outBase}.json`, 'utf8'));

const inputs = (await fs.readFile(inputFile, 'utf8'))
  .split('\n').map(l => l.trim()).filter(Boolean)
  .map(l => { const [n, u] = l.split('|'); return { name: n.trim(), url: u.trim() }; });

// Only retry the ones the HTTP pass could not resolve.
const verifiedNames = new Set(prior.verified.map(r => r.name));
const targets = inputs.filter(c => !verifiedNames.has(c.name));
console.log(`Retrying ${targets.length} unresolved companies in a browser\n`);

const TIMEOUT = 20000;
const g = (url, opts = {}) => axios.get(url, { timeout: TIMEOUT, validateStatus: () => true, ...opts });

function detect(url) {
  let m;
  if ((m = url.match(/https?:\/\/([a-z0-9_-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:wday\/cxs\/[a-z0-9_-]+\/)?(?:[a-z]{2}-[A-Z]{2}\/)?([A-Za-z0-9_-]+)/i))) {
    const site = m[3];
    if (!/^(wday|cxs|assets|static)$/i.test(site)) return { platform: 'workday', identifier: `${m[1].toLowerCase()}|${m[2].toLowerCase()}|${site}` };
  }
  if ((m = url.match(/(?:job-)?boards(?:-api)?\.greenhouse\.io\/(?:v1\/boards\/|embed\/job_board\?for=)?([a-z0-9_-]+)/i))) {
    if (!/^(embed|v1|boards)$/i.test(m[1]) && m[1].length > 1) return { platform: 'greenhouse', identifier: m[1] };
  }
  if ((m = url.match(/api\.lever\.co\/v\d\/postings\/([a-z0-9_-]+)/i))) return { platform: 'lever', identifier: m[1] };
  if ((m = url.match(/jobs\.lever\.co\/([a-z0-9_-]+)/i))) return { platform: 'lever', identifier: m[1] };
  if ((m = url.match(/(?:jobs|api)\.ashbyhq\.com\/(?:posting-api\/job-board\/)?([a-z0-9_-]+)/i))) {
    if (!/^(posting-api|non-user-graphql)$/i.test(m[1]) && m[1].length > 1) return { platform: 'ashby', identifier: m[1] };
  }
  if ((m = url.match(/api\.smartrecruiters\.com\/v\d\/companies\/([A-Za-z0-9_-]+)/i))) return { platform: 'smartrecruiters', identifier: m[1] };
  if ((m = url.match(/jobs\.smartrecruiters\.com\/([A-Za-z0-9_-]+)/))) return { platform: 'smartrecruiters', identifier: m[1] };
  return null;
}

// Non-addable ATSes — recorded so the run explains *why* a company was skipped.
function otherAts(url) {
  if (/icims\.com/i.test(url)) return 'icims';
  if (/taleo\.net/i.test(url)) return 'taleo';
  if (/successfactors|sapsf\.com|jobs\.sap\.com/i.test(url)) return 'successfactors';
  if (/phenompeople|phenom\.com|\.phenom/i.test(url)) return 'phenom';
  if (/avature\.net/i.test(url)) return 'avature';
  if (/brassring|kenexa/i.test(url)) return 'brassring';
  if (/oraclecloud\.com|oracle\.com\/.*recruiting/i.test(url)) return 'oracle-orc';
  if (/eightfold\.ai/i.test(url)) return 'eightfold';
  if (/jibeapply|radancy|talemetry/i.test(url)) return 'radancy';
  if (/workable\.com/i.test(url)) return 'workable';
  if (/bamboohr\.com/i.test(url)) return 'bamboohr';
  if (/jobvite\.com/i.test(url)) return 'jobvite';
  return null;
}

async function verify(platform, identifier) {
  if (platform === 'greenhouse') {
    const r = await g(`https://boards-api.greenhouse.io/v1/boards/${identifier}/jobs`);
    return r.status === 200 && (r.data?.jobs?.length || 0) > 0;
  }
  if (platform === 'lever') {
    const r = await g(`https://api.lever.co/v0/postings/${identifier}?mode=json`);
    return r.status === 200 && Array.isArray(r.data) && r.data.length > 0;
  }
  if (platform === 'ashby') {
    const r = await g(`https://api.ashbyhq.com/posting-api/job-board/${identifier}`);
    return r.status === 200 && (r.data?.jobs?.length || 0) > 0;
  }
  if (platform === 'smartrecruiters') {
    const r = await g(`https://api.smartrecruiters.com/v1/companies/${identifier}/postings?limit=1`);
    return r.status === 200 && (r.data?.totalFound || 0) > 0;
  }
  if (platform === 'workday') {
    const [tenant, wd, site] = identifier.split('|');
    const r = await axios.post(
      `https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`,
      { limit: 1, offset: 0, searchText: '', appliedFacets: {} },
      { timeout: TIMEOUT, validateStatus: () => true, headers: { 'Content-Type': 'application/json', Accept: 'application/json' } },
    );
    return r.status === 200 && (r.data?.jobPostings?.length || 0) > 0;
  }
  return false;
}

const launch = () => puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

async function probe(browser, company) {
  const page = await browser.newPage();
  const hits = new Set();
  const others = new Set();
  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 900 });
    await page.setRequestInterception(true);
    page.on('request', req => {
      const u = req.url();
      const d = detect(u);
      if (d) hits.add(`${d.platform}|${d.identifier}`);
      const o = otherAts(u);
      if (o) others.add(o);
      if (['image', 'font', 'media'].includes(req.resourceType())) req.abort().catch(() => {});
      else req.continue().catch(() => {});
    });

    await page.goto(company.url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 6000));

    // The ATS link is often behind a "search jobs" click; scan the DOM too.
    const html = await page.content().catch(() => '');
    for (const re of [
      /https?:\/\/[a-z0-9_-]+\.wd\d+\.myworkdayjobs\.com\/[^"'\s<>\\]+/gi,
      /https?:\/\/(?:job-)?boards\.greenhouse\.io\/[^"'\s<>\\]+/gi,
      /https?:\/\/jobs\.lever\.co\/[^"'\s<>\\]+/gi,
      /https?:\/\/jobs\.ashbyhq\.com\/[^"'\s<>\\]+/gi,
      /https?:\/\/jobs\.smartrecruiters\.com\/[^"'\s<>\\]+/gi,
    ]) {
      for (const u of html.match(re) || []) {
        const d = detect(u);
        if (d) hits.add(`${d.platform}|${d.identifier}`);
      }
    }
    for (const o of [otherAts(page.url()), otherAts(html.slice(0, 400000))]) if (o) others.add(o);
  } catch { /* fall through to whatever was captured */ } finally {
    await page.close().catch(() => {});
  }

  for (const hit of hits) {
    const [platform, ...rest] = hit.split('|');
    const identifier = rest.join('|');
    if (await verify(platform, identifier)) {
      return { ...company, platform, identifier, verified: true };
    }
  }
  return { ...company, error: others.size ? `unsupported-ats:${[...others].join(',')}` : 'no-ats-found' };
}

const CONCURRENCY = 4;
const results = [];
let idx = 0, done = 0;

// Each worker owns a browser. A hostile career site can take the whole browser
// down with a protocol error, so a dead browser is relaunched rather than
// aborting the run and losing every result gathered so far.
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  let browser = await launch();
  while (idx < targets.length) {
    const c = targets[idx++];
    let r;
    try {
      r = await probe(browser, c);
    } catch (e) {
      try { await browser.close(); } catch { /* already gone */ }
      browser = await launch();
      r = { ...c, error: 'browser-crash:' + (e.message || '').slice(0, 60) };
    }
    results.push(r);
    done++;
    console.log(`${String(done).padStart(3)}/${targets.length} ${c.name.padEnd(32)} ${r.verified ? '✓ ' + r.platform + ':' + r.identifier : '✗ ' + r.error}`);
    if (done % 10 === 0) {
      await fs.writeFile(`discovered-browser-${outBase}.json`,
        JSON.stringify({ verified: results.filter(x => x.verified), failed: results.filter(x => !x.verified) }, null, 2));
    }
  }
  await browser.close().catch(() => {});
}));

const verified = results.filter(r => r.verified);
console.log(`\n=== browser pass: ${verified.length} newly verified / ${results.length} tried ===`);
await fs.writeFile(`discovered-browser-${outBase}.json`, JSON.stringify({ verified, failed: results.filter(r => !r.verified) }, null, 2));
console.log(`Wrote discovered-browser-${outBase}.json`);
