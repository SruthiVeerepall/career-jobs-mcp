/**
 * probe-registry.mjs
 *
 * Tests every company in the registry against its platform API.
 * Outputs probe-results.json, then removes broken entries from
 * src/scrapers/company-registry.ts.
 *
 * Usage:  node probe-registry.mjs [--dry-run] [--platform greenhouse]
 *
 * Options:
 *   --dry-run      Report only; do not patch the registry file
 *   --platform X   Only probe one platform (greenhouse|lever|ashby|smartrecruiters|workday)
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

async function probeWorkday(id) {
  const parts = id.split('|');
  if (parts.length !== 3) return { ok: false, status: 0, error: 'bad format' };
  const [tenant, wd, site] = parts;
  const url = `https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`;
  const res = await axios.post(
    url,
    { limit: 1, offset: 0, searchText: '', appliedFacets: {} },
    {
      timeout: TIMEOUT,
      validateStatus: () => true,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    },
  );
  // 422 = endpoint exists but CSRF/session required — treat as "uncertain" (not definitely broken)
  return { ok: res.status === 200, status: res.status, uncertain: res.status === 422 };
}

const PROBERS = {
  greenhouse: probeGreenhouse,
  lever: probeLever,
  ashby: probeAshby,
  smartrecruiters: probeSmartRecruiters,
  workday: probeWorkday,
};

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
  const toProbe = PLATFORM_FILTER
    ? all.filter(c => c.platform === PLATFORM_FILTER)
    : all.filter(c => PROBERS[c.platform]); // skip custom/oracle-orc/icims

  const skipped = all.filter(c => !PROBERS[c.platform]);
  console.log(`\nRegistry: ${all.length} total companies`);
  console.log(`Probing:  ${toProbe.length} (${PLATFORM_FILTER || 'all supported platforms'})`);
  console.log(`Skipping: ${skipped.length} (custom/oracle/icims — no standard JSON API)`);
  console.log(`Concurrency: ${CONCURRENCY}  Timeout: ${TIMEOUT}ms\n`);

  const passed = [];
  const broken = [];    // definitive 404/error — safe to remove
  const uncertain = []; // 422/401 — endpoint may exist, needs auth
  let done = 0;

  const tasks = toProbe.map(company => async () => {
    const prober = PROBERS[company.platform];
    let result;
    try {
      result = await prober(company.platformIdentifier);
    } catch (e) {
      result = { ok: false, status: 0, error: e.code || e.message };
    }
    done++;
    if (done % 50 === 0 || done === toProbe.length) {
      process.stderr.write(`  Progress: ${done}/${toProbe.length}\n`);
    }
    const entry = { ...company, probeStatus: result.status, probeError: result.error };
    if (result.ok) passed.push(entry);
    else if (result.uncertain) uncertain.push(entry);
    else broken.push(entry);
    return entry;
  });

  await runPool(tasks, CONCURRENCY);

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
    console.log(`\nUncertain (keeping — needs auth/CSRF) — ${uncertain.length}:`);
    for (const c of uncertain.sort((a, b) => a.platform.localeCompare(b.platform))) {
      console.log(`  [${c.platform.padEnd(16)}] ${c.name.padEnd(40)} id=${c.platformIdentifier}  HTTP ${c.probeStatus}`);
    }
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
    uncertainCompanies: uncertain.map(c => ({ slug: c.slug, name: c.name, platform: c.platform, platformIdentifier: c.platformIdentifier, httpStatus: c.probeStatus })),
  };
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(report, null, 2));
  console.log(`\nFull results saved to: probe-results.json`);

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

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
