/**
 * repair-uncertain.mjs
 *
 * Resolves the Workday entries probe-registry.mjs reports as "uncertain".
 *
 * Diagnosis behind this script: HTTP 422 from the Workday cxs endpoint is NOT a CSRF
 * wall. A real tenant with a wrong site name answers 404 with
 * `{"message":"not found: Job_Posting_Site_ID=..."}`; a tenant subdomain that does not
 * exist answers a bodyless 422 — byte-identical to a made-up tenant. Every "uncertain"
 * entry returns the latter, so its tenant is simply wrong and no session handshake will
 * ever fix it. This finds where the board actually lives.
 *
 * Two passes per company:
 *   1. Follow careerUrl (redirect chain + HTML body) looking for a real board URL, on
 *      Workday or on any other ATS we speak.
 *   2. Workday tenant hunt: probe tenant-name variants x wd hosts using the 404-vs-422
 *      signal to detect a live tenant, then enumerate site names against it.
 *
 * Removes nothing. Output: repair-uncertain.json
 *
 * Usage: node repair-uncertain.mjs [--concurrency N] [--slug X]
 */
import axios from 'axios';
import fs from 'fs';
import { companyRegistry } from './dist/scrapers/company-registry.js';

const args = process.argv.slice(2);
const argVal = (f, d) => {
  const i = args.indexOf(f);
  return i !== -1 ? args[i + 1] : d;
};
const CONCURRENCY = parseInt(argVal('--concurrency', '4'), 10);
const ONLY_SLUG = argVal('--slug', null);

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const uncertain = JSON.parse(fs.readFileSync('probe-results.json', 'utf8')).uncertainCompanies.filter(
  (c) => !ONLY_SLUG || c.slug === ONLY_SLUG,
);

const get = (url, opts = {}) =>
  axios.get(url, {
    timeout: 20000,
    maxRedirects: 6,
    validateStatus: () => true,
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    ...opts,
  });

const postJson = (url, body) =>
  axios.post(url, body, {
    timeout: 20000,
    validateStatus: () => true,
    headers: { 'User-Agent': UA, Accept: 'application/json', 'Content-Type': 'application/json' },
  });

// ── Workday primitives ────────────────────────────────────────────────────────

const WD_BODY = { limit: 20, offset: 0, searchText: '', appliedFacets: {} };

async function wdFetch(tenant, wd, site) {
  const url = `https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`;
  try {
    const r = await postJson(url, WD_BODY);
    return { status: r.status, data: r.data };
  } catch (e) {
    return { status: 0, error: e.code || e.message };
  }
}

/**
 * 404 (with a Job_Posting_Site_ID message) => tenant+host are real, site name is wrong.
 * 422 (empty message)                      => tenant subdomain does not exist on this host.
 */
async function tenantExists(tenant, wd) {
  const r = await wdFetch(tenant, wd, 'ZzNoSuchSiteZz');
  if (r.status === 404) return true;
  if (r.status === 200) return true;
  return false;
}

const WD_HOSTS = ['wd1', 'wd3', 'wd5', 'wd2', 'wd12', 'wd10', 'wd101', 'wd103', 'wd6', 'wd8'];

function siteCandidates(tenant, name, configuredSite) {
  const clean = name.replace(/[^a-zA-Z0-9]/g, '');
  return [
    ...new Set(
      [
        configuredSite,
        'External',
        'Careers',
        'careers',
        'External_Career_Site',
        'ExternalCareers',
        'External_Careers',
        'externalcareers',
        'CareerSite',
        clean,
        `${clean}_Careers`,
        `${clean}Careers`,
        `${clean}_External`,
        tenant,
        `${tenant}_careers`,
        `${tenant}Careers`,
      ].filter(Boolean),
    ),
  ];
}

function tenantCandidates(slug, name, configuredTenant) {
  const lower = name.toLowerCase();
  const nospace = lower.replace(/[^a-z0-9]/g, '');
  const firstWord = lower.split(/[^a-z0-9]+/).filter(Boolean)[0] ?? nospace;
  return [...new Set([configuredTenant, nospace, firstWord, slug.replace(/-/g, ''), slug].filter(Boolean))];
}

function summarize(data) {
  const posts = Array.isArray(data?.jobPostings) ? data.jobPostings : [];
  const dated = posts.filter((p) => typeof p.postedOn === 'string' && p.postedOn.trim() !== '');
  return {
    total: data?.total ?? posts.length,
    returned: posts.length,
    datedCount: dated.length,
    samplePostedOn: [...new Set(dated.map((p) => p.postedOn))].slice(0, 3),
    sampleTitles: posts.map((p) => p.title).filter(Boolean).slice(0, 3),
  };
}

// ── Pass 1: follow the careers URL ────────────────────────────────────────────

const ATS_PATTERNS = [
  { platform: 'workday', re: /https?:\/\/([a-z0-9_-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:(?:[a-z]{2}-[A-Z]{2})\/)?([A-Za-z0-9_-]+)/i, build: (m) => `${m[1]}|${m[2]}|${m[3]}` },
  { platform: 'greenhouse', re: /(?:boards|job-boards)\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9_-]+)/i, build: (m) => m[1] },
  { platform: 'greenhouse', re: /boards-api\.greenhouse\.io\/v1\/boards\/([a-z0-9_-]+)/i, build: (m) => m[1] },
  { platform: 'lever', re: /jobs\.lever\.co\/([a-z0-9_-]+)/i, build: (m) => m[1] },
  { platform: 'ashby', re: /jobs\.ashbyhq\.com\/([a-z0-9_.-]+)/i, build: (m) => m[1] },
  { platform: 'smartrecruiters', re: /jobs\.smartrecruiters\.com\/([A-Za-z0-9_-]+)/i, build: (m) => m[1] },
  { platform: 'eightfold', re: /([a-z0-9-]+)\.eightfold\.ai/i, build: (m) => m[1] },
  { platform: 'rippling', re: /ats\.rippling\.com\/([a-z0-9_-]+)/i, build: (m) => m[1] },
];

// ATSes worth naming in the report even when we cannot use them directly.
const ATS_HINTS = [
  ['successfactors', /successfactors\.com|jobs\.sap\.com|careersection|\/sfcareer\//i],
  ['phenom', /phenompeople\.com|phenom\.com|\/widgets\?|ph_?app/i],
  ['icims', /icims\.com/i],
  ['taleo', /taleo\.net/i],
  ['avature', /avature\.net/i],
  ['radancy', /radancy\.com|talentbrew/i],
  ['brassring', /brassring\.com/i],
  ['oracle-orc', /oraclecloud\.com\/hcmUI|\/hcmUI\/CandidateExperience/i],
  ['eightfold', /eightfold\.ai/i],
  ['workable', /apply\.workable\.com/i],
];

async function followCareers(careerUrl) {
  if (!careerUrl) return { found: [], hints: [], status: 0 };
  let res;
  try {
    res = await get(careerUrl);
  } catch (e) {
    return { found: [], hints: [], status: 0, error: e.code || e.message };
  }
  const finalUrl = res.request?.res?.responseUrl ?? res.request?.responseUrl ?? careerUrl;
  const html = typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? '');
  const hay = `${finalUrl}\n${html}`;

  const found = [];
  for (const p of ATS_PATTERNS) {
    const m = hay.match(p.re);
    if (m) found.push({ platform: p.platform, identifier: p.build(m) });
  }
  const hints = ATS_HINTS.filter(([, re]) => re.test(hay)).map(([n]) => n);
  return { found, hints, status: res.status, finalUrl };
}

// ── Verification of a discovered non-Workday board ────────────────────────────

async function verifyOther(platform, id) {
  const urls = {
    greenhouse: `https://boards-api.greenhouse.io/v1/boards/${id}/jobs?content=true`,
    lever: `https://api.lever.co/v0/postings/${id}?mode=json&limit=5`,
    ashby: `https://api.ashbyhq.com/posting-api/job-board/${id}`,
    smartrecruiters: `https://api.smartrecruiters.com/v1/companies/${id}/postings?limit=5`,
  };
  const url = urls[platform];
  if (!url) return { ok: false, note: 'no probe for platform' };
  try {
    const r = await get(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (r.status !== 200) return { ok: false, status: r.status };
    const d = r.data;
    const jobs = d?.jobs ?? d?.data ?? d?.content ?? (Array.isArray(d) ? d : []);
    const n = Array.isArray(jobs) ? jobs.length : (d?.totalFound ?? 0);
    const titles = (Array.isArray(jobs) ? jobs : []).map((j) => j.title ?? j.text ?? j.name).filter(Boolean).slice(0, 3);
    return { ok: n > 0, status: 200, jobCount: n, sampleTitles: titles };
  } catch (e) {
    return { ok: false, error: e.code || e.message };
  }
}

// ── Per-company resolution ────────────────────────────────────────────────────

async function resolveCompany(c) {
  const cfg = companyRegistry.companies.get(c.slug);
  const careerUrl = cfg?.careerUrl;
  const [tenant0, wd0, site0] = c.platformIdentifier.split('|');
  const rec = { slug: c.slug, name: c.name, current: c.platformIdentifier, careerUrl };

  // Pass 1 — follow the careers site.
  const follow = await followCareers(careerUrl);
  rec.atsHints = follow.hints;
  rec.finalUrl = follow.finalUrl;

  for (const f of follow.found) {
    if (f.platform === 'workday') {
      const [t, w, s] = f.identifier.split('|');
      const r = await wdFetch(t, w, s);
      if (r.status === 200 && Array.isArray(r.data?.jobPostings)) {
        const sum = summarize(r.data);
        if (sum.returned > 0) {
          return { ...rec, resolution: 'FIXED', platform: 'workday', identifier: f.identifier, via: 'careers-url', ...sum };
        }
      }
    } else {
      const v = await verifyOther(f.platform, f.identifier);
      if (v.ok) {
        return {
          ...rec,
          resolution: 'FIXED-NEW-PLATFORM',
          platform: f.platform,
          identifier: f.identifier,
          via: 'careers-url',
          jobCount: v.jobCount,
          sampleTitles: v.sampleTitles,
        };
      }
    }
  }

  // Pass 2 — Workday tenant hunt.
  for (const t of tenantCandidates(c.slug, c.name, tenant0)) {
    for (const w of WD_HOSTS) {
      if (!(await tenantExists(t, w))) continue;
      rec.liveTenantHost = `${t}.${w}`;
      for (const s of siteCandidates(t, c.name, site0)) {
        const r = await wdFetch(t, w, s);
        if (r.status === 200 && Array.isArray(r.data?.jobPostings)) {
          const sum = summarize(r.data);
          if (sum.returned > 0) {
            return { ...rec, resolution: 'FIXED', platform: 'workday', identifier: `${t}|${w}|${s}`, via: 'tenant-hunt', ...sum };
          }
        }
      }
    }
  }

  return {
    ...rec,
    resolution: rec.liveTenantHost ? 'TENANT-LIVE-SITE-UNKNOWN' : 'UNRESOLVED',
    note: follow.hints.length ? `careers site runs: ${follow.hints.join(', ')}` : follow.error || `careers page HTTP ${follow.status}`,
  };
}

// ── Driver ────────────────────────────────────────────────────────────────────

async function runPool(tasks, n) {
  const out = new Array(tasks.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, tasks.length) }, async () => {
      while (i < tasks.length) {
        const k = i++;
        try {
          out[k] = await tasks[k]();
        } catch (e) {
          out[k] = { error: e.message };
        }
      }
    }),
  );
  return out;
}

console.log(`Repairing ${uncertain.length} uncertain Workday entries (concurrency ${CONCURRENCY})…\n`);

const tasks = uncertain.map((c) => async () => {
  const r = await resolveCompany(c);
  const tail =
    r.resolution?.startsWith('FIXED')
      ? `${r.platform}:${r.identifier}  jobs=${r.total ?? r.jobCount} dated=${r.datedCount ?? 'n/a'}`
      : r.note ?? '';
  process.stderr.write(`  ${(r.resolution ?? 'ERR').padEnd(26)} ${r.name.padEnd(22)} ${tail}\n`);
  return r;
});

const results = await runPool(tasks, CONCURRENCY);

const by = {};
for (const r of results) (by[r.resolution ?? 'ERR'] ??= []).push(r);
console.log(`\n${'-'.repeat(78)}`);
for (const [k, list] of Object.entries(by).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n${k} — ${list.length}`);
  for (const r of list) {
    if (k.startsWith('FIXED')) {
      console.log(
        `  ${r.name.padEnd(22)} ${r.current.padEnd(40)} => ${r.platform}: ${r.identifier}` +
          `  jobs=${r.total ?? r.jobCount} dated=${r.datedCount ?? 'n/a'}/${r.returned ?? ''} ` +
          `e.g. "${(r.samplePostedOn ?? [])[0] ?? ''}" | ${(r.sampleTitles ?? [])[0] ?? ''}`,
      );
    } else {
      console.log(`  ${r.name.padEnd(22)} ${(r.current ?? '').padEnd(40)} ${r.note ?? ''}`);
    }
  }
}

fs.writeFileSync('repair-uncertain.json', JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2));
console.log(`\nSaved repair-uncertain.json`);
