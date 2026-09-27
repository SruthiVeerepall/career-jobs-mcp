/**
 * probe-registry.mjs
 *
 * Tests every company in the registry: platforms with a public JSON board API are
 * probed with one request; every other platform is probed by running its real scraper.
 * Outputs probe-results.json, then removes broken entries from
 * src/scrapers/company-registry.ts.
 *
 * Usage:  node probe-registry.mjs [--dry-run] [--platform greenhouse]
 *
 * Options:
 *   --dry-run      Report only; do not patch the registry file
 *   --platform X   Only probe one platform (any platform in the registry)
 *   --concurrency N  Max parallel requests (default 20)
 */

import { companyRegistry } from './dist/scrapers/company-registry.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const PLATFORM_FILTER = (() => {
  const i = args.indexOf('--platform');
  return i !== -1 ? args[i + 1] : null;
})();
const CONCURRENCY = (() => {
  const i = args.indexOf('--concurrency');
  return i !== -1 ? parseInt(args[i + 1], 10) : 20;
})();

const TIMEOUT = 12000; // ms per request
const REGISTRY_SRC = path.join(__dirname, 'src', 'scrapers', 'company-registry.ts');
const RESULTS_FILE = path.join(__dirname, 'probe-results.json');

// ── Probe functions per platform ──────────────────────────────────────────────

async function probeGreenhouse(id) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${id}/jobs`;
  const res = await axios.get(url, { timeout: TIMEOUT, validateStatus: () => true });
  return { ok: res.status === 200, status: res.status };
}

async function probeLever(id) {
  const url = `https://api.lever.co/v0/postings/${id}?mode=json&limit=1`;
  const res = await axios.get(url, { timeout: TIMEOUT, validateStatus: () => true });
  return { ok: res.status === 200, status: res.status };
}

async function probeAshby(id) {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${id}`;
  const res = await axios.get(url, { timeout: TIMEOUT, validateStatus: () => true });
  return { ok: res.status === 200, status: res.status };
}

async function probeSmartRecruiters(id) {
  const url = `https://api.smartrecruiters.com/v1/companies/${id}/postings?limit=1`;
  const res = await axios.get(url, { timeout: TIMEOUT, validateStatus: () => true });
  return { ok: res.status === 200, status: res.status };
}

const wdPost = (tenant, wd, site) =>
  axios.post(
    `https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`,
    { limit: 1, offset: 0, searchText: '', appliedFacets: {} },
    {
      timeout: TIMEOUT,
      validateStatus: () => true,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    },
  );

async function probeWorkday(id) {
  const parts = id.split('|');
  if (parts.length !== 3) return { ok: false, status: 0, error: 'bad format' };
  const [tenant, wd, site] = parts;
  const res = await wdPost(tenant, wd, site);
  if (res.status === 200) return { ok: true, status: 200 };

  // A Workday 422 is NOT a CSRF wall, despite what it looks like. Control test: a real
  // tenant asked for a nonexistent site answers 404 with
  // `{"message":"not found: Job_Posting_Site_ID=..."}`, while a made-up tenant answers a
  // bodyless 422 — exactly what these entries return. So 422 means the tenant subdomain
  // does not resolve and no session handshake can fix it; the identifier is simply wrong
  // and the board has to be re-discovered (see repair-uncertain*.mjs).
  //
  // Still reported as uncertain rather than broken, so a wrong identifier never costs us
  // the company: re-discovery keeps the entry, deletion would lose it.
  if (res.status === 422) {
    const control = await wdPost(tenant, wd, 'ZzNoSuchSiteZz');
    const tenantLive = control.status === 404 || control.status === 200;
    return {
      ok: false,
      status: 422,
      uncertain: true,
      error: tenantLive
        ? 'tenant resolves but site id rejected — re-discover the site name'
        : 'tenant subdomain does not exist — re-discover the board (not a CSRF issue)',
    };
  }

  // 404 with a site-id message: tenant is fine, only the site name is stale. Keep it and
  // re-discover rather than delete a company that is demonstrably still on Workday.
  if (res.status === 404) {
    return {
      ok: false,
      status: 404,
      uncertain: true,
      error: 'tenant resolves, site id not found — re-discover the site name',
    };
  }

  return { ok: false, status: res.status, uncertain: res.status === 401 };
}

const PROBERS = {
  greenhouse: probeGreenhouse,
  lever: probeLever,
  ashby: probeAshby,
  smartrecruiters: probeSmartRecruiters,
  workday: probeWorkday,
};

// Platforms with no cheap JSON endpoint (Oracle, iCIMS, Phenom, Radancy, SuccessFactors,
// Eightfold, the job boards, bespoke scrapers) used to be counted as "skipped" and never
// checked. They are now probed by running the REAL scraper, which is slower (some drive a
// headless browser) so they get their own small pool.
//
// Pass = jobs came back AND some carry a date — a dateless board is dropped whole by the
// strict window gate, so it is no more useful than an empty one. Any other outcome is
// `uncertain`, never `broken`: a scraper failing is not the definitive 404 that deletion
// requires.
const SCRAPER_CONCURRENCY = 4;
const SCRAPER_TIMEOUT = 180000;

async function probeViaScraper(company) {
  let timer;
  try {
    const scraper = companyRegistry.createScraper(company);
    const jobs = await Promise.race([
      scraper.fetchJobs({}),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout after ${SCRAPER_TIMEOUT / 1000}s`)), SCRAPER_TIMEOUT);
      }),
    ]);
    const dated = jobs.filter((j) => j.postedDate && !Number.isNaN(Date.parse(j.postedDate))).length;
    if (jobs.length > 0 && dated > 0) return { ok: true, status: 200, jobs: jobs.length, dated };
    return {
      ok: false,
      status: 200,
      uncertain: true,
      error: jobs.length === 0 ? 'scraper returned 0 jobs' : `${jobs.length} jobs, none dated`,
    };
  } catch (e) {
    return { ok: false, status: e.response?.status ?? 0, uncertain: true, error: `scraper: ${(e.message || String(e)).slice(0, 120)}` };
  } finally {
    clearTimeout(timer);
  }
}

// A single 5xx/429/timeout says the server was busy, not that the board is gone —
// Zebra, Nordstrom and MRI Software were all reported broken by one such blip while
// serving hundreds of jobs on retry. Only a definitive answer (404, or a repeated
// failure) is allowed to remove an entry.
const TRANSIENT = new Set([0, 408, 425, 429, 500, 502, 503, 504]);

async function probeWithRetry(prober, identifier) {
  let result;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      result = await prober(identifier);
    } catch (e) {
      result = { ok: false, status: 0, error: e.code || e.message };
    }
    if (result.ok || result.uncertain || !TRANSIENT.has(result.status)) return result;
    if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
  }
  // Still transient after a retry — flag as uncertain so it is kept, not deleted.
  return { ...result, uncertain: true };
}

// ── Concurrency pool ──────────────────────────────────────────────────────────

async function runPool(tasks, concurrency) {
  const results = new Array(tasks.length);
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const all = [...companyRegistry.companies.values()];
  const toProbe = PLATFORM_FILTER ? all.filter(c => c.platform === PLATFORM_FILTER) : all;
  const viaApi = toProbe.filter(c => PROBERS[c.platform]);
  const viaScraper = toProbe.filter(c => !PROBERS[c.platform]);
  const skipped = []; // every platform is probed now; kept so the report shape is stable
  console.log(`\nRegistry: ${all.length} total companies`);
  console.log(`Probing:  ${toProbe.length} (${PLATFORM_FILTER || 'all platforms'})`);
  console.log(`  via JSON API:     ${viaApi.length}  (concurrency ${CONCURRENCY}, timeout ${TIMEOUT}ms)`);
  console.log(`  via real scraper: ${viaScraper.length}  (concurrency ${SCRAPER_CONCURRENCY}, timeout ${SCRAPER_TIMEOUT}ms)\n`);

  const passed = [];
  const broken = [];    // definitive 404/error — safe to remove
  const uncertain = []; // 422/401, or a scraper that failed / returned nothing usable
  let done = 0;

  const record = (company, result) => {
    done++;
    if (done % 50 === 0 || done === toProbe.length) {
      process.stderr.write(`  Progress: ${done}/${toProbe.length}\n`);
    }
    const entry = { ...company, probeStatus: result.status, probeError: result.error };
    if (result.ok) passed.push(entry);
    else if (result.uncertain) uncertain.push(entry);
    else broken.push(entry);
    return entry;
  };

  const apiTasks = viaApi.map(company => async () =>
    record(company, await probeWithRetry(PROBERS[company.platform], company.platformIdentifier)));
  const scraperTasks = viaScraper.map(company => async () => {
    const result = await probeViaScraper(company);
    if (!result.ok) process.stderr.write(`  ? ${company.name} (${company.platform}): ${result.error}\n`);
    return record(company, result);
  });

  await Promise.all([runPool(apiTasks, CONCURRENCY), runPool(scraperTasks, SCRAPER_CONCURRENCY)]);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`RESULTS: ${passed.length} passed / ${broken.length} broken (404) / ${uncertain.length} uncertain (422/401)\n`);

  const byPlatform = {};
  for (const c of toProbe) {
    byPlatform[c.platform] = byPlatform[c.platform] || { pass: 0, broken: 0, uncertain: 0 };
  }
  for (const c of passed) byPlatform[c.platform].pass++;
  for (const c of broken) byPlatform[c.platform].broken++;
  for (const c of uncertain) byPlatform[c.platform].uncertain++;

  for (const [platform, counts] of Object.entries(byPlatform)) {
    const total = counts.pass + counts.broken + counts.uncertain;
    const pct = Math.round((counts.pass / total) * 100);
    console.log(`  ${platform.padEnd(18)} ${counts.pass}/${total} OK  broken=${counts.broken}  uncertain=${counts.uncertain}  (${pct}% passing)`);
  }

  // ── Broken list ───────────────────────────────────────────────────────────
  if (broken.length > 0) {
    console.log(`\nBroken (will remove) — ${broken.length}:`);
    for (const c of broken.sort((a, b) => a.platform.localeCompare(b.platform))) {
      console.log(`  [${c.platform.padEnd(16)}] ${c.name.padEnd(40)} id=${c.platformIdentifier}  HTTP ${c.probeStatus}${c.probeError ? ` (${c.probeError})` : ''}`);
    }
  }
  if (uncertain.length > 0) {
    console.log(`\nUncertain (kept — identifier needs re-discovery, never deleted) — ${uncertain.length}:`);
    for (const c of uncertain.sort((a, b) => a.platform.localeCompare(b.platform))) {
      console.log(`  [${c.platform.padEnd(16)}] ${c.name.padEnd(40)} id=${c.platformIdentifier}  HTTP ${c.probeStatus}${c.probeError ? `  — ${c.probeError}` : ''}`);
    }
    console.log(`\n  Resolve these with:  node repair-uncertain.mjs  then  node repair-uncertain-browser2.mjs`);
  }

  // ── Save results ──────────────────────────────────────────────────────────
  const report = {
    timestamp: new Date().toISOString(),
    total: all.length,
    probed: toProbe.length,
    passed: passed.length,
    broken: broken.length,
    uncertain: uncertain.length,
    skipped: skipped.length,
    passingCompanies: passed.map(c => c.slug),
    brokenCompanies: broken.map(c => ({ slug: c.slug, name: c.name, platform: c.platform, platformIdentifier: c.platformIdentifier, httpStatus: c.probeStatus })),
    uncertainCompanies: uncertain.map(c => ({ slug: c.slug, name: c.name, platform: c.platform, platformIdentifier: c.platformIdentifier, httpStatus: c.probeStatus, reason: c.probeError })),
  };
  // A --platform run only probes a slice of the registry, so writing it to the shared
  // results file would clobber every other platform's result with an absence. Filtered
  // runs get their own file; only a full sweep owns probe-results.json.
  const outFile = PLATFORM_FILTER
    ? path.join(__dirname, `probe-results-${PLATFORM_FILTER}.json`)
    : RESULTS_FILE;
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(`\nFull results saved to: ${path.basename(outFile)}`);

  // ── Patch registry ────────────────────────────────────────────────────────
  if (!DRY_RUN && broken.length > 0) {
    console.log(`\nPatching src/scrapers/company-registry.ts — removing ${broken.length} broken entries…`);
    patchRegistry(broken.map(c => c.slug));
    console.log(`Done. Rebuild with: npm run build`);
  } else if (DRY_RUN) {
    console.log(`\n[dry-run] Would remove ${broken.length} broken entries (keeping ${uncertain.length} uncertain). Run without --dry-run to apply.`);
  }
}

// ── Registry patcher ──────────────────────────────────────────────────────────

function patchRegistry(slugsToRemove) {
  const slugSet = new Set(slugsToRemove);
  const src = fs.readFileSync(REGISTRY_SRC, 'utf8');
  const lines = src.split('\n');
  let removed = 0;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === null) continue;
    const slugMatch = lines[i].match(/\bslug:\s*['"]([^'"]+)['"]/);
    if (!slugMatch || !slugSet.has(slugMatch[1])) continue;

    const trimmed = lines[i].trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('},')) {
      // Single-line entry — mark just this line
      lines[i] = null;
      removed++;
    } else {
      // Multi-line block — walk back to find opening { and forward to closing },
      let start = i;
      while (start > 0 && !lines[start].trim().startsWith('{')) start--;
      let end = i;
      while (end < lines.length - 1 && !/^\s*\},/.test(lines[end])) end++;
      for (let j = start; j <= end; j++) lines[j] = null;
      removed++;
    }
  }

  const final = lines.filter(l => l !== null).join('\n');
  fs.writeFileSync(REGISTRY_SRC, final, 'utf8');
  console.log(`  Removed ${removed} entries from registry source.`);
}

// Explicit exit: scraper probes leave a shared headless browser open, which would
// otherwise keep the process alive after the report is written.
main().then(() => process.exit(0), e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
