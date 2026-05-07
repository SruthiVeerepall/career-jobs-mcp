import { promises as fs } from 'node:fs';
import https from 'node:https';
import http from 'node:http';

// Existing slugs to skip — read live from src/scrapers/company-registry.ts
const EXISTING = new Set();
{
  const reg = await fs.readFile('src/scrapers/company-registry.ts', 'utf8');
  const re = /slug:\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(reg)) !== null) EXISTING.add(m[1]);
}
console.log(`Loaded ${EXISTING.size} existing slugs from registry; will skip duplicates.`);

function get(url, opts = {}, redirects = 0) {
  return new Promise((resolve) => {
    let parsed;
    try { parsed = new URL(url); } catch { return resolve({ error: 'bad url' }); }
    const lib = parsed.protocol === 'http:' ? http : https;
    const req = lib.request({
      method: opts.method || 'GET',
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'http:' ? 80 : 443),
      path: parsed.pathname + parsed.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        ...(opts.headers || {}),
      },
      timeout: opts.timeout || 10000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 6) {
        const next = new URL(res.headers.location, url).href;
        res.destroy();
        return get(next, opts, redirects + 1).then(resolve);
      }
      let data = '';
      res.on('data', (d) => { data += d; if (data.length > 2_000_000) { res.destroy(); resolve({ status: res.statusCode, body: data, finalUrl: url }); } });
      res.on('end', () => resolve({ status: res.statusCode, body: data, finalUrl: url, headers: res.headers }));
      res.on('error', (e) => resolve({ error: e.message }));
    });
    req.on('error', (e) => resolve({ error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function detectFromUrl(url) {
  const m1 = url.match(/^https?:\/\/([a-z0-9_-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([a-z0-9_-]+)/i);
  if (m1) return { platform: 'workday', identifier: `${m1[1].toLowerCase()}|${m1[2].toLowerCase()}|${m1[3]}` };
  const m2 = url.match(/^https?:\/\/(?:job-)?boards(?:-api)?\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9_-]+)/i);
  if (m2 && m2[1] !== 'embed') return { platform: 'greenhouse', identifier: m2[1] };
  const m3 = url.match(/^https?:\/\/jobs\.lever\.co\/([a-z0-9_-]+)/i);
  if (m3) return { platform: 'lever', identifier: m3[1] };
  const m4 = url.match(/^https?:\/\/(?:jobs|api)\.ashbyhq\.com\/(?:posting-api\/job-board\/)?([a-z0-9_-]+)/i);
  if (m4) return { platform: 'ashby', identifier: m4[1] };
  const m5 = url.match(/^https?:\/\/jobs\.smartrecruiters\.com\/([A-Za-z0-9_-]+)/);
  if (m5) return { platform: 'smartrecruiters', identifier: m5[1] };
  return null;
}

function detectFromHtml(html) {
  if (!html) return null;
  const wd = html.match(/https?:\/\/([a-z0-9_-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([a-z0-9_-]+)/i);
  if (wd) return { platform: 'workday', identifier: `${wd[1].toLowerCase()}|${wd[2].toLowerCase()}|${wd[3]}` };
  const gh = html.match(/(?:job-)?boards(?:-api)?\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9_-]+)/i);
  if (gh && gh[1] !== 'embed' && gh[1] !== 'v1' && gh[1].length > 1) return { platform: 'greenhouse', identifier: gh[1] };
  const lv = html.match(/jobs\.lever\.co\/([a-z0-9_-]+)/i);
  if (lv) return { platform: 'lever', identifier: lv[1] };
  const ash = html.match(/(?:jobs|api)\.ashbyhq\.com\/(?:posting-api\/job-board\/)?([a-z0-9_-]+)/i);
  if (ash && ash[1].length > 1) return { platform: 'ashby', identifier: ash[1] };
  const sr = html.match(/jobs\.smartrecruiters\.com\/([A-Za-z0-9_-]+)/);
  if (sr) return { platform: 'smartrecruiters', identifier: sr[1] };
  return null;
}

async function verify(platform, identifier) {
  if (platform === 'greenhouse') {
    const r = await get(`https://boards-api.greenhouse.io/v1/boards/${identifier}/jobs?content=false`);
    return r.status === 200 && r.body && r.body.includes('"jobs"');
  }
  if (platform === 'lever') {
    const r = await get(`https://api.lever.co/v0/postings/${identifier}?limit=1`);
    return r.status === 200;
  }
  if (platform === 'ashby') {
    const r = await get(`https://api.ashbyhq.com/posting-api/job-board/${identifier}`);
    return r.status === 200 && r.body && r.body.includes('"jobs"');
  }
  if (platform === 'smartrecruiters') {
    const r = await get(`https://api.smartrecruiters.com/v1/companies/${identifier}/postings?limit=1`);
    return r.status === 200;
  }
  if (platform === 'workday') {
    // The cxs endpoint takes POST with empty body for a job listing
    const [tenant, wd, site] = identifier.split('|');
    const r = await get(`https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 1, offset: 0, searchText: '' }),
    });
    return r.status === 200;
  }
  return false;
}

async function discover(name, url) {
  // 1. URL pattern match
  let det = detectFromUrl(url);
  let finalUrl = url;
  let html = '';

  if (!det) {
    // 2. Fetch page; check final URL after redirects, and page HTML
    const r = await get(url, { timeout: 15000 });
    if (r.error) return { name, url, error: 'fetch:' + r.error };
    finalUrl = r.finalUrl || url;
    html = r.body || '';
    det = detectFromUrl(finalUrl) || detectFromHtml(html);
  }

  if (!det) {
    // 3. Brute-force common slug variants against API-based ATSes
    const slugVariants = [
      name.toLowerCase().replace(/[^a-z0-9]/g, ''),
      name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
      name.toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g, ''),
    ];
    const tried = new Set();
    for (const slug of slugVariants) {
      if (!slug || tried.has(slug)) continue;
      tried.add(slug);
      for (const platform of ['greenhouse', 'lever', 'ashby']) {
        if (await verify(platform, slug)) {
          return { name, url: finalUrl, platform, identifier: slug, verified: true };
        }
      }
    }
    return { name, url, error: 'no-ats-found' };
  }

  // 4. Verify
  const ok = await verify(det.platform, det.identifier);
  if (!ok) return { name, url: finalUrl, ...det, error: 'verify-failed' };
  return { name, url: finalUrl, platform: det.platform, identifier: det.identifier, verified: true };
}

// Concurrency limiter
function pLimit(n) {
  let active = 0;
  const queue = [];
  const next = () => {
    while (active < n && queue.length) {
      const { fn, resolve, reject } = queue.shift();
      active++;
      fn().then(resolve, reject).finally(() => { active--; next(); });
    }
  };
  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
}

(async () => {
  const inputFile = process.argv[2] || 'companies-input.txt';
  const outBase = inputFile.replace(/\.txt$/, '');
  const raw = await fs.readFile(inputFile, 'utf8');
  const inputs = raw.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const [name, url] = l.split('|');
    return [name.trim(), url.trim()];
  });
  console.log(`Loaded ${inputs.length} companies`);

  const lim = pLimit(8);
  let done = 0;
  const results = await Promise.all(inputs.map(([name, url]) => lim(async () => {
    const r = await discover(name, url);
    done++;
    process.stdout.write(`\r${done}/${inputs.length} ${name.slice(0,30).padEnd(30)} ${r.verified ? '✓ '+r.platform : '✗ '+(r.error||'?')}`.slice(0,90).padEnd(95));
    if (r.verified) process.stdout.write('\n');
    return r;
  })));
  console.log();

  const verified = results.filter(r => r.verified);
  const failed = results.filter(r => !r.verified);

  console.log(`\n=== ${verified.length} verified, ${failed.length} failed ===\n`);

  // Group verified by platform
  const byPlat = {};
  for (const r of verified) (byPlat[r.platform] ||= []).push(r);
  for (const [p, list] of Object.entries(byPlat)) {
    console.log(`${p}: ${list.length}`);
  }

  // Output the list of TS entries (skipping ones whose slug is already in EXISTING)
  const tsLines = [];
  const dup = [];
  for (const r of verified) {
    const slug = r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (EXISTING.has(slug)) { dup.push(r.name); continue; }
    tsLines.push(`  { name: ${JSON.stringify(r.name)}, slug: '${slug}', careerUrl: ${JSON.stringify(r.url)}, platform: '${r.platform}', platformIdentifier: ${JSON.stringify(r.identifier)} },`);
  }
  console.log(`\nDeduped against ${dup.length} existing slugs`);

  await fs.writeFile(`discovered-${outBase}.json`, JSON.stringify({ verified, failed }, null, 2));
  await fs.writeFile(`new-${outBase}-entries.ts`, tsLines.join('\n') + '\n');

  console.log(`\nWrote discovered-companies.json (full results) and new-registry-entries.ts (${tsLines.length} new entries)`);
  console.log('\nFAILED COMPANIES (need manual handling, likely Taleo/iCIMS/SuccessFactors/bespoke):');
  console.log(failed.map(r => `  ${r.name.padEnd(30)} ${r.error || '?'}`).join('\n'));
})();
