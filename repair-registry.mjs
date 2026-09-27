/**
 * repair-registry.mjs — Phase 1 (HTTP only, no browser)
 *
 * For every company the probe could not reach, find the identifier it uses NOW.
 * Never removes a company; only proposes a replacement platform/platformIdentifier.
 *
 * Two independent strategies, run per company, best answer wins:
 *
 *   A. Workday host/site sweep — myworkdayjobs.com has wildcard DNS, so a wrong
 *      tenant/site answers 422. A tenant that migrated hosts (wd1 -> wd12, as
 *      Salesforce did) is found by re-trying the same tenant+site on every host.
 *   B. Careers-page scrape — follow the company's own careers URL and read the
 *      ATS identifier out of the HTML/redirect chain. Authoritative when it hits.
 *
 * Output: registry-repairs.json  (apply with apply-repairs.mjs)
 *
 * Usage: node repair-registry.mjs [--in probe-results.json] [--concurrency 6]
 *                                 [--only slug1,slug2] [--no-sweep] [--no-page]
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const argVal = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : dflt;
};
const IN_FILE = argVal('--in', 'probe-results.json');
const OUT_FILE = argVal('--out', 'registry-repairs.json');
const CONCURRENCY = parseInt(argVal('--concurrency', '6'), 10);
const ONLY = argVal('--only', null)?.split(',').map((s) => s.trim());
const DO_SWEEP = !args.includes('--no-sweep');
const DO_PAGE = !args.includes('--no-page');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': UA };
const HTML_HEADERS = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};
const TIMEOUT = 15000;

// Workday hosts seen in the wild, most common first.
const WD_HOSTS = ['wd1', 'wd5', 'wd3', 'wd12', 'wd2', 'wd10', 'wd101', 'wd103', 'wd102', 'wd104', 'wd105'];

// ── Verification: does this identifier return jobs? ───────────────────────────

async function verifyWorkday(tenant, wd, site) {
  const url = `https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`;
  try {
    const res = await axios.post(
      url,
      { limit: 20, offset: 0, searchText: '', appliedFacets: {} },
      { timeout: TIMEOUT, validateStatus: () => true, headers: JSON_HEADERS },
    );
    if (res.status !== 200 || !res.data || !Array.isArray(res.data.jobPostings)) return null;
    const posts = res.data.jobPostings;
    const dated = posts.filter((p) => p.postedOn || p.bulletFields?.some?.((b) => /posted|ago|today|yesterday/i.test(b)));
    return {
      total: res.data.total ?? posts.length,
      count: posts.length,
      dated: dated.length,
      samples: posts.slice(0, 3).map((p) => ({ title: p.title, location: p.locationsText, posted: p.postedOn })),
    };
  } catch {
    return null;
  }
}

async function verifyGreenhouse(id) {
  try {
    const res = await axios.get(`https://boards-api.greenhouse.io/v1/boards/${id}/jobs?content=false`, {
      timeout: TIMEOUT,
      validateStatus: () => true,
      headers: JSON_HEADERS,
    });
    if (res.status !== 200 || !res.data?.jobs) return null;
    return {
      total: res.data.jobs.length,
      count: res.data.jobs.length,
      dated: res.data.jobs.length,
      samples: res.data.jobs.slice(0, 3).map((j) => ({ title: j.title, location: j.location?.name })),
    };
  } catch {
    return null;
  }
}

async function verifyLever(id) {
  try {
    const res = await axios.get(`https://api.lever.co/v0/postings/${id}?mode=json&limit=20`, {
      timeout: TIMEOUT,
      validateStatus: () => true,
      headers: JSON_HEADERS,
    });
    if (res.status !== 200 || !Array.isArray(res.data)) return null;
    return {
      total: res.data.length,
      count: res.data.length,
      dated: res.data.filter((j) => j.createdAt).length,
      samples: res.data.slice(0, 3).map((j) => ({ title: j.text, location: j.categories?.location })),
    };
  } catch {
    return null;
  }
}

async function verifyAshby(id) {
  try {
    const res = await axios.get(`https://api.ashbyhq.com/posting-api/job-board/${id}`, {
      timeout: TIMEOUT,
      validateStatus: () => true,
      headers: JSON_HEADERS,
    });
    if (res.status !== 200 || !res.data?.jobs) return null;
    return {
      total: res.data.jobs.length,
      count: res.data.jobs.length,
      dated: res.data.jobs.filter((j) => j.publishedAt).length,
      samples: res.data.jobs.slice(0, 3).map((j) => ({ title: j.title, location: j.location })),
    };
  } catch {
    return null;
  }
}

async function verifySmartRecruiters(id) {
  try {
    const res = await axios.get(`https://api.smartrecruiters.com/v1/companies/${id}/postings?limit=20`, {
      timeout: TIMEOUT,
      validateStatus: () => true,
      headers: JSON_HEADERS,
    });
    if (res.status !== 200 || !res.data?.content) return null;
    const c = res.data.content;
    return {
      total: res.data.totalFound ?? c.length,
      count: c.length,
      dated: c.filter((j) => j.releasedDate).length,
      samples: c.slice(0, 3).map((j) => ({ title: j.name, location: j.location?.city })),
    };
  } catch {
    return null;
  }
}

async function verifyIcimsJra(host) {
  try {
    const res = await axios.get(`https://${host}/api/jobs?limit=20`, {
      timeout: TIMEOUT,
      validateStatus: () => true,
      headers: JSON_HEADERS,
    });
    const jobs = res.data?.jobs ?? res.data?.data;
    if (res.status !== 200 || !Array.isArray(jobs)) return null;
    return {
      total: res.data.totalCount ?? jobs.length,
      count: jobs.length,
      dated: jobs.filter((j) => j.posted_date || j.postedDate).length,
      samples: jobs.slice(0, 3).map((j) => ({ title: j.title, location: j.location, posted: j.posted_date })),
    };
  } catch {
    return null;
  }
}

const VERIFIERS = {
  workday: (id) => {
    const [t, wd, s] = id.split('|');
    return verifyWorkday(t, wd, s);
  },
  greenhouse: verifyGreenhouse,
  lever: verifyLever,
  ashby: verifyAshby,
  smartrecruiters: verifySmartRecruiters,
  'icims-jra': verifyIcimsJra,
};

// ── Strategy A: Workday host / site sweep ────────────────────────────────────

function siteVariants(tenant, site, name) {
  const brand = (name || tenant).replace(/[^A-Za-z0-9]/g, '');
  const set = new Set([
    site,
    'External',
    'External_Career_Site',
    'ExternalCareerSite',
    'Careers',
    'careers',
    'external',
    `${brand}`,
    `${brand}Careers`,
    `${brand}_Careers`,
    `${brand}ExternalCareerSite`,
    `${brand}_External_Career_Site`,
    `${tenant}`,
    `${tenant}Careers`,
    `${tenant}_careers`,
    'External_Careers',
    'ExternalCareers',
    'CareerSite',
    'jobs',
    'Jobs',
    'Search',
    'Professional',
  ]);
  return [...set];
}

async function workdaySweep(entry, log) {
  const [tenant, wd, site] = entry.platformIdentifier.split('|');
  if (!tenant) return null;

  // Pass 1: same tenant+site, every host. Catches a plain host migration.
  for (const host of WD_HOSTS) {
    if (host === wd) continue;
    const r = await verifyWorkday(tenant, host, site);
    if (r && r.count > 0) {
      log(`  host-migration ${wd} -> ${host}`);
      return { platform: 'workday', platformIdentifier: `${tenant}|${host}|${site}`, evidence: r, via: 'host-sweep' };
    }
  }

  // Pass 2: same tenant, alternate site names on the likeliest hosts.
  const variants = siteVariants(tenant, site, entry.name).filter((s) => s !== site);
  for (const host of [wd, 'wd1', 'wd5', 'wd3', 'wd12']) {
    for (const s of variants) {
      const r = await verifyWorkday(tenant, host, s);
      if (r && r.count > 0) {
        log(`  site-change ${wd}|${site} -> ${host}|${s}`);
        return { platform: 'workday', platformIdentifier: `${tenant}|${host}|${s}`, evidence: r, via: 'site-sweep' };
      }
    }
  }
  return null;
}

// ── Strategy B: read the careers page ────────────────────────────────────────

const ATS_PATTERNS = [
  {
    platform: 'workday',
    re: /https?:\/\/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([A-Za-z0-9_\-]+)/g,
    build: (m) => `${m[1]}|${m[2]}|${m[3]}`,
  },
  {
    platform: 'greenhouse',
    re: /(?:boards|job-boards)\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-zA-Z0-9_-]+)/g,
    build: (m) => m[1],
  },
  { platform: 'greenhouse', re: /boards-api\.greenhouse\.io\/v1\/boards\/([a-zA-Z0-9_-]+)/g, build: (m) => m[1] },
  { platform: 'lever', re: /jobs\.(?:eu\.)?lever\.co\/([a-zA-Z0-9_-]+)/g, build: (m) => m[1] },
  { platform: 'lever', re: /api\.lever\.co\/v0\/postings\/([a-zA-Z0-9_-]+)/g, build: (m) => m[1] },
  { platform: 'ashby', re: /jobs\.ashbyhq\.com\/([a-zA-Z0-9_.-]+)/g, build: (m) => m[1] },
  { platform: 'smartrecruiters', re: /jobs\.smartrecruiters\.com\/([a-zA-Z0-9_-]+)/g, build: (m) => m[1] },
  {
    platform: 'smartrecruiters',
    re: /api\.smartrecruiters\.com\/v1\/companies\/([a-zA-Z0-9_-]+)/g,
    build: (m) => m[1],
  },
];

// ATS platforms we cannot scrape — recorded so a failure explains itself.
const UNSUPPORTED_MARKERS = [
  [/successfactors|sfcareers|jobs\.sap\.com|\.sapsf\.(com|eu)/i, 'SuccessFactors'],
  [/oraclecloud\.com|\/hcmUI\/CandidateExperience/i, 'Oracle Recruiting'],
  [/phenompeople|phenom\.com|\.phenom/i, 'Phenom'],
  [/icims\.com/i, 'iCIMS'],
  [/taleo\.net/i, 'Taleo'],
  [/brassring|kenexa/i, 'BrassRing'],
  [/avature\.net/i, 'Avature'],
  [/eightfold\.ai|\/api\/apply\/v2\/jobs/i, 'Eightfold'],
  [/radancy|talentbrew/i, 'Radancy'],
  [/jobvite\.com/i, 'Jobvite'],
  [/workablehr|apply\.workable\.com/i, 'Workable'],
  [/recruitee\.com/i, 'Recruitee'],
  [/paylocity\.com\/recruiting/i, 'Paylocity'],
  [/dayforcehcm\.com/i, 'Dayforce'],
];

async function fetchPage(url) {
  try {
    const res = await axios.get(url, {
      timeout: TIMEOUT,
      maxRedirects: 8,
      validateStatus: () => true,
      headers: HTML_HEADERS,
    });
    return { status: res.status, html: typeof res.data === 'string' ? res.data : '', finalUrl: res.request?.res?.responseUrl || url };
  } catch (e) {
    return { status: 0, html: '', finalUrl: url, error: e.code || e.message };
  }
}

function harvest(text) {
  const hits = [];
  for (const { platform, re, build } of ATS_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const id = build(m);
      if (!id || id.length < 2) continue;
      // Common false positives from doc/marketing links.
      if (/^(embed|job_board|search|jobs|careers|www|api|v1|static|assets)$/i.test(id)) continue;
      hits.push({ platform, platformIdentifier: id });
    }
  }
  return hits;
}

function detectUnsupported(text) {
  for (const [re, label] of UNSUPPORTED_MARKERS) if (re.test(text)) return label;
  return null;
}

async function careersPage(entry, log) {
  const urls = [];
  if (entry.careerUrl) urls.push(entry.careerUrl);
  const seen = new Set();
  const unsupported = new Set();

  for (const url of urls) {
    if (seen.has(url)) continue;
    seen.add(url);
    const { status, html, finalUrl } = await fetchPage(url);
    if (!html) continue;
    const blob = html + '\n' + finalUrl;

    const hits = harvest(blob);
    // Dedupe, then verify each candidate for real.
    const uniq = [...new Map(hits.map((h) => [`${h.platform}|${h.platformIdentifier}`, h])).values()];
    for (const h of uniq) {
      const verifier = VERIFIERS[h.platform];
      if (!verifier) continue;
      const ev = await verifier(h.platformIdentifier);
      if (ev && ev.count > 0) {
        log(`  careers-page -> ${h.platform}:${h.platformIdentifier}`);
        return { ...h, evidence: ev, via: 'careers-page', sourceUrl: finalUrl };
      }
    }
    const u = detectUnsupported(blob);
    if (u) unsupported.add(u);
    if (status >= 400) log(`  careers page ${status} ${url}`);
  }
  return unsupported.size ? { unsupported: [...unsupported] } : null;
}

// ── Runner ───────────────────────────────────────────────────────────────────

async function runPool(items, concurrency, fn) {
  const out = new Array(items.length);
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return out;
}

async function main() {
  const probe = JSON.parse(fs.readFileSync(path.join(__dirname, IN_FILE), 'utf8'));
  const { companyRegistry } = await import('./dist/scrapers/company-registry.js');
  const bySlug = new Map(companyRegistry.list().map((c) => [c.slug, c]));

  let targets = [...(probe.brokenCompanies ?? []), ...(probe.uncertainCompanies ?? [])];
  if (ONLY) targets = targets.filter((t) => ONLY.includes(t.slug));
  targets = targets.map((t) => ({ ...t, careerUrl: bySlug.get(t.slug)?.careerUrl }));

  console.log(`Repairing ${targets.length} companies (concurrency ${CONCURRENCY})\n`);

  const results = await runPool(targets, CONCURRENCY, async (entry, idx) => {
    const lines = [];
    const log = (s) => lines.push(s);
    log(`[${idx + 1}/${targets.length}] ${entry.name} (${entry.slug}) ${entry.platform}:${entry.platformIdentifier} ${entry.httpStatus}`);

    let found = null;
    let unsupported = null;

    if (DO_PAGE && entry.careerUrl) {
      const r = await careersPage(entry, log);
      if (r?.platform) found = r;
      else if (r?.unsupported) unsupported = r.unsupported;
    }
    if (!found && DO_SWEEP && entry.platform === 'workday') {
      found = await workdaySweep(entry, log);
    }

    log(found ? `  ✅ ${found.platform}:${found.platformIdentifier} (${found.evidence.total} jobs, ${found.evidence.dated}/${found.evidence.count} dated) via ${found.via}` : `  ❌ unresolved${unsupported ? ` — uses ${unsupported.join(', ')}` : ''}`);
    console.log(lines.join('\n'));

    return {
      slug: entry.slug,
      name: entry.name,
      careerUrl: entry.careerUrl,
      old: { platform: entry.platform, platformIdentifier: entry.platformIdentifier },
      httpStatus: entry.httpStatus,
      ...(found
        ? {
            resolved: true,
            platform: found.platform,
            platformIdentifier: found.platformIdentifier,
            via: found.via,
            evidence: found.evidence,
          }
        : { resolved: false, unsupported }),
    };
  });

  const resolved = results.filter((r) => r.resolved);
  fs.writeFileSync(path.join(__dirname, OUT_FILE), JSON.stringify(results, null, 2));
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Resolved ${resolved.length}/${results.length}. Wrote ${OUT_FILE}`);
  console.log(`Unresolved: ${results.filter((r) => !r.resolved).map((r) => r.slug).join(', ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
