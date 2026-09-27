/**
 * repair-registry-browser.mjs — Phase 2 (headless Chrome)
 *
 * Second pass over whatever repair-registry.mjs could not resolve. A plain HTTP
 * GET of a careers page loses to two things: a 403 bot wall, and a page whose
 * ATS is only referenced from JavaScript. Loading the page in Chrome and
 * watching the network solves both — the ATS reveals itself the moment the job
 * list loads.
 *
 * When the landing page is pure marketing with no job list, it follows the
 * first link that looks like "search/view/all jobs" and watches again.
 *
 * Output: registry-repairs-browser.json (same shape as registry-repairs.json)
 *
 * Usage: node repair-registry-browser.mjs [--in registry-repairs.json]
 *                                         [--only slug1,slug2] [--headful]
 *                                         [--concurrency 3] [--no-deep]
 */

import puppeteer from 'puppeteer';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const argVal = (f, d) => {
  const i = args.indexOf(f);
  return i !== -1 ? args[i + 1] : d;
};
const IN_FILE = argVal('--in', 'registry-repairs.json');
const OUT_FILE = argVal('--out', 'registry-repairs-browser.json');
const ONLY = argVal('--only', null)?.split(',').map((s) => s.trim());
const CONCURRENCY = parseInt(argVal('--concurrency', '3'), 10);
const HEADFUL = args.includes('--headful');
const DEEP = !args.includes('--no-deep');
const NAV_TIMEOUT = 45000;
const SETTLE_MS = 6000;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': UA };
const TIMEOUT = 15000;

// ── Verifiers (a candidate only counts if it actually returns jobs) ──────────

async function verifyWorkday(id) {
  const [tenant, wd, site] = id.split('|');
  if (!tenant || !wd || !site) return null;
  try {
    const res = await axios.post(
      `https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`,
      { limit: 20, offset: 0, searchText: '', appliedFacets: {} },
      { timeout: TIMEOUT, validateStatus: () => true, headers: JSON_HEADERS },
    );
    const p = res.data?.jobPostings;
    if (res.status !== 200 || !Array.isArray(p) || !p.length) return null;
    return {
      total: res.data.total ?? p.length,
      count: p.length,
      dated: p.filter((x) => x.postedOn).length,
      samples: p.slice(0, 3).map((x) => ({ title: x.title, location: x.locationsText, posted: x.postedOn })),
    };
  } catch {
    return null;
  }
}

async function verifyGreenhouse(id) {
  try {
    const r = await axios.get(`https://boards-api.greenhouse.io/v1/boards/${id}/jobs`, {
      timeout: TIMEOUT,
      validateStatus: () => true,
      headers: JSON_HEADERS,
    });
    const j = r.data?.jobs;
    if (r.status !== 200 || !j?.length) return null;
    return { total: j.length, count: j.length, dated: j.length, samples: j.slice(0, 3).map((x) => ({ title: x.title, location: x.location?.name })) };
  } catch {
    return null;
  }
}

async function verifyLever(id) {
  try {
    const r = await axios.get(`https://api.lever.co/v0/postings/${id}?mode=json&limit=20`, {
      timeout: TIMEOUT,
      validateStatus: () => true,
      headers: JSON_HEADERS,
    });
    if (r.status !== 200 || !Array.isArray(r.data) || !r.data.length) return null;
    return {
      total: r.data.length,
      count: r.data.length,
      dated: r.data.filter((x) => x.createdAt).length,
      samples: r.data.slice(0, 3).map((x) => ({ title: x.text, location: x.categories?.location })),
    };
  } catch {
    return null;
  }
}

async function verifyAshby(id) {
  try {
    const r = await axios.get(`https://api.ashbyhq.com/posting-api/job-board/${id}`, {
      timeout: TIMEOUT,
      validateStatus: () => true,
      headers: JSON_HEADERS,
    });
    const j = r.data?.jobs;
    if (r.status !== 200 || !j?.length) return null;
    return { total: j.length, count: j.length, dated: j.filter((x) => x.publishedAt).length, samples: j.slice(0, 3).map((x) => ({ title: x.title, location: x.location })) };
  } catch {
    return null;
  }
}

async function verifySmartRecruiters(id) {
  try {
    const r = await axios.get(`https://api.smartrecruiters.com/v1/companies/${id}/postings?limit=20`, {
      timeout: TIMEOUT,
      validateStatus: () => true,
      headers: JSON_HEADERS,
    });
    const c = r.data?.content;
    if (r.status !== 200 || !c?.length) return null;
    return { total: r.data.totalFound ?? c.length, count: c.length, dated: c.filter((x) => x.releasedDate).length, samples: c.slice(0, 3).map((x) => ({ title: x.name, location: x.location?.city })) };
  } catch {
    return null;
  }
}

async function verifyIcimsJra(host) {
  try {
    const r = await axios.get(`https://${host}/api/jobs?limit=20`, {
      timeout: TIMEOUT,
      validateStatus: () => true,
      headers: JSON_HEADERS,
    });
    const j = r.data?.jobs ?? r.data?.data;
    if (r.status !== 200 || !Array.isArray(j) || !j.length) return null;
    const posted = (x) => x.posted_date ?? x.postedDate ?? x.job?.posted_date;
    return { total: r.data.totalCount ?? j.length, count: j.length, dated: j.filter(posted).length, samples: j.slice(0, 3).map((x) => ({ title: x.title ?? x.job?.title, posted: posted(x) })) };
  } catch {
    return null;
  }
}

async function verifyOracleOrc(id) {
  const [host, site] = id.split('|');
  if (!host || !site) return null;
  const finder = `findReqs;siteNumber=${site},facetsList=LOCATIONS%3BTITLES%3BCATEGORIES,limit=20,offset=0,sortBy=POSTING_DATES_DESC`;
  try {
    // `expand` is not optional: without it the response carries TotalJobsCount
    // but no requisitionList, which reads as a live board with zero jobs.
    const r = await axios.get(
      `https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?finder=${finder}&expand=requisitionList.secondaryLocations&onlyData=true`,
      { timeout: TIMEOUT, validateStatus: () => true, headers: JSON_HEADERS },
    );
    const item = r.data?.items?.[0];
    const reqs = item?.requisitionList;
    if (r.status !== 200 || !reqs?.length) return null;
    return {
      total: item.TotalJobsCount ?? reqs.length,
      count: reqs.length,
      dated: reqs.filter((x) => x.PostedDate).length,
      samples: reqs.slice(0, 3).map((x) => ({ title: x.Title, location: x.PrimaryLocation, posted: x.PostedDate })),
    };
  } catch {
    return null;
  }
}

async function verifyPhenom(host) {
  const body = {
    lang: 'en_us', deviceType: 'desktop', country: 'us', pageName: 'search-results', ddoKey: 'refineSearch',
    sortBy: 'Most recent', subsearch: '', from: 0, jobs: true, counts: true,
    all_fields: ['category', 'country', 'state', 'city', 'type'],
    pageNumber: 1, size: 20, clearAll: false, jdsource: 'facets', isSliderEnable: false,
    pageId: 'page3', siteType: 'external', keywords: '', global: true, selected_fields: {}, locationData: {},
  };
  try {
    const r = await axios.post(`https://${host}/widgets`, body, {
      timeout: TIMEOUT,
      validateStatus: () => true,
      headers: { ...JSON_HEADERS, Origin: `https://${host}`, Referer: `https://${host}/search-results` },
    });
    const rs = r.data?.refineSearch;
    const jobs = rs?.data?.jobs;
    if (r.status !== 200 || !jobs?.length) return null;
    return {
      total: rs.totalHits ?? jobs.length,
      count: jobs.length,
      dated: jobs.filter((j) => j.postedDate ?? j.dateCreated).length,
      samples: jobs.slice(0, 3).map((j) => ({ title: j.title, location: j.cityStateCountry, posted: j.postedDate })),
    };
  } catch {
    return null;
  }
}

/** Phenom portals answer on their own host, so candidates come from the domain. */
function phenomGuesses(careerUrl, seenUrls) {
  const hosts = new Set();
  try {
    const u = new URL(careerUrl);
    const apex = u.hostname.split('.').slice(-2).join('.');
    hosts.add(u.hostname);
    hosts.add(`jobs.${apex}`);
    hosts.add(`careers.${apex}`);
  } catch {}
  for (const s of seenUrls) {
    if (!/\/widgets\b/.test(s)) continue;
    try {
      hosts.add(new URL(s).hostname);
    } catch {}
  }
  return [...hosts];
}

async function verifyEightfold(id) {
  const [host, domain] = id.split('|');
  if (!host || !domain) return null;
  const shape = (positions, tsKey) =>
    positions?.length
      ? {
          total: positions.length,
          count: positions.length,
          dated: positions.filter((p) => p[tsKey]).length,
          samples: positions.slice(0, 3).map((p) => ({
            title: p.name,
            location: p.locations?.[0] ?? p.location,
            posted: p[tsKey] ? new Date(p[tsKey] * 1000).toISOString().slice(0, 10) : undefined,
          })),
        }
      : null;
  const q = `domain=${encodeURIComponent(domain)}&start=0&num=10&sort_by=timestamp`;
  try {
    const v2 = await axios.get(`https://${host}/api/apply/v2/jobs?${q}`, { timeout: TIMEOUT, validateStatus: () => true, headers: JSON_HEADERS });
    if (v2.status === 200) return shape(v2.data?.positions, 't_create');
    // 403 "Not authorized for PCSX" means the board moved to the newer API, not
    // that it is gated — the same board answers /api/pcsx/search publicly.
    const px = await axios.get(`https://${host}/api/pcsx/search?${q}&query=&location=`, { timeout: TIMEOUT, validateStatus: () => true, headers: JSON_HEADERS });
    if (px.status === 200) return shape(px.data?.data?.positions, 'postedTs');
    return null;
  } catch {
    return null;
  }
}

const VERIFIERS = {
  workday: verifyWorkday,
  phenom: verifyPhenom,
  eightfold: verifyEightfold,
  greenhouse: verifyGreenhouse,
  lever: verifyLever,
  ashby: verifyAshby,
  smartrecruiters: verifySmartRecruiters,
  'icims-jra': verifyIcimsJra,
  'oracle-orc': verifyOracleOrc,
};

// ── Extract ATS candidates from any URL the page touched ─────────────────────

const PATTERNS = [
  { platform: 'workday', re: /([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:wday\/cxs\/[a-z0-9-]+\/)?(?:[a-z]{2}-[A-Z]{2}\/)?([A-Za-z0-9_-]+)/i, build: (m) => `${m[1]}|${m[2]}|${m[3]}` },
  { platform: 'greenhouse', re: /(?:boards|job-boards|boards-api)\.greenhouse\.io\/(?:v1\/boards\/|embed\/job_board\?for=)?([a-zA-Z0-9_-]+)/i, build: (m) => m[1] },
  { platform: 'lever', re: /(?:jobs|api)\.(?:eu\.)?lever\.co\/(?:v0\/postings\/)?([a-zA-Z0-9_-]+)/i, build: (m) => m[1] },
  { platform: 'ashby', re: /(?:jobs\.ashbyhq\.com|api\.ashbyhq\.com\/posting-api\/job-board)\/([a-zA-Z0-9_.-]+)/i, build: (m) => m[1] },
  { platform: 'smartrecruiters', re: /(?:jobs\.smartrecruiters\.com|api\.smartrecruiters\.com\/v1\/companies)\/([a-zA-Z0-9_-]+)/i, build: (m) => m[1] },
  // Oracle Recruiting. The site number appears either in the SPA path
  // (/sites/CX_45001) or as a `siteNumber=` query param on the theme assets the
  // page loads — and it is not always suffixed: Texas Instruments' is bare `CX`.
  { platform: 'oracle-orc', re: /https?:\/\/([a-z0-9.-]*oraclecloud\.com)\/hcmUI\/CandidateExperience\/[a-zA-Z_-]+\/sites\/(CX[A-Za-z0-9_]*)/i, build: (m) => `${m[1]}|${m[2]}` },
  { platform: 'oracle-orc', re: /https?:\/\/([a-z0-9.-]*oraclecloud\.com)\/[^\s"']*[?&]siteNumber=(CX[A-Za-z0-9_]*)/i, build: (m) => `${m[1]}|${m[2]}` },
  // Eightfold, both API generations — the tenant is keyed by `domain=`.
  { platform: 'eightfold', re: /https?:\/\/([a-z0-9.-]+)\/api\/(?:apply\/v2\/jobs|pcsx\/[a-z_]+)\?[^\s"']*domain=([a-z0-9.-]+)/i, build: (m) => `${m[1]}|${m[2]}` },
];

/**
 * iCIMS JRA lives on the employer's own domain, so it is not discoverable by a
 * URL pattern the way a hosted board is. When the page shows any iCIMS marker,
 * try the conventional JRA hosts for that domain.
 */
function icimsJraGuesses(careerUrl, seenUrls) {
  const hosts = new Set();
  const add = (h) => h && hosts.add(h.toLowerCase());
  try {
    const u = new URL(careerUrl);
    const parts = u.hostname.split('.');
    const apex = parts.slice(-2).join('.');
    add(u.hostname);
    add(`careers.${apex}`);
    add(`jobs.${apex}`);
  } catch {}
  // A custom-domain iCIMS SPA usually calls its own /api/jobs; catch that host too.
  for (const s of seenUrls) {
    if (!/\/api\/jobs/.test(s)) continue;
    try {
      add(new URL(s).hostname);
    } catch {}
  }
  return [...hosts];
}

const NOISE = /^(embed|job_board|search|jobs|careers|www|api|v1|v0|static|assets|images|css|js|posting-api|companies|boards)$/i;

function candidatesFrom(url) {
  const out = [];
  for (const { platform, re, build } of PATTERNS) {
    const m = re.exec(url);
    if (!m) continue;
    const id = build(m);
    if (!id || NOISE.test(id)) continue;
    out.push({ platform, platformIdentifier: id, sourceUrl: url });
  }
  return out;
}

// Unsupported-ATS fingerprints, so an unresolved company explains itself.
const UNSUPPORTED = [
  [/\.sapsf\.(com|eu)|successfactors|jobs\.sap\.com/i, 'SuccessFactors'],
  [/oraclecloud\.com|hcmUI\/CandidateExperience/i, 'Oracle Recruiting'],
  [/phenompeople|\.phenom\.|phenomapi/i, 'Phenom'],
  [/\.icims\.com/i, 'iCIMS'],
  [/taleo\.net/i, 'Taleo'],
  [/brassring|kenexa/i, 'BrassRing'],
  [/avature\.net/i, 'Avature'],
  [/eightfold\.ai|api\/apply\/v2\/jobs/i, 'Eightfold'],
  [/radancy|talentbrew/i, 'Radancy'],
  [/jobvite\.com/i, 'Jobvite'],
  [/apply\.workable\.com/i, 'Workable'],
  [/recruitee\.com/i, 'Recruitee'],
  [/dayforcehcm\.com/i, 'Dayforce'],
  [/myworkdayjobs\.com/i, 'Workday (identifier not resolvable)'],
];

// Links that lead from a marketing landing page to the real job list.
const DEEP_LINK_RE = /(search|view|all|open|current|find|browse|explore)[-_\s]*(jobs|roles|openings|opportunities|positions)|job[-_\s]*search|(jobs|openings|opportunities|positions)[-_\s]*(search|list)/i;

// ── Per-company browser probe ────────────────────────────────────────────────

async function probeInBrowser(browser, entry, log) {
  const page = await browser.newPage();
  const seenUrls = new Set();
  const unsupported = new Set();

  await page.setUserAgent(UA);
  await page.setViewport({ width: 1366, height: 900 });
  page.setDefaultNavigationTimeout(NAV_TIMEOUT);

  const record = (url) => {
    if (!url || seenUrls.has(url)) return;
    seenUrls.add(url);
    for (const [re, label] of UNSUPPORTED) if (re.test(url)) unsupported.add(label);
  };
  page.on('request', (r) => record(r.url()));
  page.on('response', (r) => record(r.url()));
  page.on('framenavigated', (f) => record(f.url()));

  const visit = async (url) => {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      await new Promise((r) => setTimeout(r, SETTLE_MS));
      return true;
    } catch (e) {
      log(`  nav failed ${url}: ${(e.message || '').split('\n')[0]}`);
      return false;
    }
  };

  // Test every candidate the page revealed; first one that returns jobs wins.
  const resolveFromSeen = async () => {
    const cands = new Map();
    for (const u of seenUrls) for (const c of candidatesFrom(u)) cands.set(`${c.platform}|${c.platformIdentifier}`, c);
    // Prefer the platform the entry already claimed — usually a host migration.
    const ordered = [...cands.values()].sort((a, b) => (b.platform === entry.old?.platform) - (a.platform === entry.old?.platform));
    for (const c of ordered) {
      const ev = await VERIFIERS[c.platform]?.(c.platformIdentifier);
      if (ev) return { ...c, evidence: ev };
    }
    // No hosted board matched. Two ATS answer on the EMPLOYER's own domain
    // rather than a recognizable vendor host, so they can only be found by
    // trying the conventional endpoints against that domain.
    if ([...seenUrls].some((u) => /icims/i.test(u))) {
      for (const host of icimsJraGuesses(entry.careerUrl, seenUrls)) {
        const ev = await verifyIcimsJra(host);
        if (ev) return { platform: 'icims-jra', platformIdentifier: host, sourceUrl: `https://${host}/api/jobs`, evidence: ev };
      }
    }
    if ([...seenUrls].some((u) => /phenom|\/widgets\b/i.test(u))) {
      for (const host of phenomGuesses(entry.careerUrl, seenUrls)) {
        const ev = await verifyPhenom(host);
        if (ev) return { platform: 'phenom', platformIdentifier: host, sourceUrl: `https://${host}/widgets`, evidence: ev };
      }
    }
    return null;
  };

  // A registry careerUrl is often the marketing landing page rather than the job
  // portal. Try the conventional portal hosts too before giving up.
  const startUrls = [entry.careerUrl];
  try {
    const u = new URL(entry.careerUrl);
    const apex = u.hostname.replace(/^www\./, '').split('.').slice(-2).join('.');
    for (const alt of [`https://jobs.${apex}`, `https://careers.${apex}`, `https://jobs.${apex}/search-results`, `https://careers.${apex}/search-results`]) {
      if (!startUrls.includes(alt)) startUrls.push(alt);
    }
  } catch {}

  try {
    for (const startUrl of startUrls) {
    const ok = await visit(startUrl);
    if (ok) {
      // The DOM can hold ATS links the network never requested.
      try {
        const html = await page.content();
        for (const chunk of html.match(/https?:\/\/[^\s"'<>()]{10,200}/g) || []) record(chunk);
      } catch {}
      let hit = await resolveFromSeen();
      if (hit) {
        log(`  ✅ ${hit.platform}:${hit.platformIdentifier} via ${startUrl}`);
        return { hit, unsupported: [...unsupported], newCareerUrl: startUrl === entry.careerUrl ? undefined : startUrl };
      }

      if (DEEP) {
        // Landing page was marketing. Follow into the job search page.
        let links = [];
        try {
          links = await page.$$eval('a[href]', (as) =>
            as.map((a) => ({ href: a.href, text: (a.textContent || '').trim().slice(0, 60) })).filter((l) => l.href.startsWith('http')),
          );
        } catch {}
        const targets = links
          .filter((l) => DEEP_LINK_RE.test(l.text) || DEEP_LINK_RE.test(l.href))
          .slice(0, 4);
        for (const t of targets) {
          log(`  deep -> ${t.text || t.href}`);
          await visit(t.href);
          try {
            const html = await page.content();
            for (const chunk of html.match(/https?:\/\/[^\s"'<>()]{10,200}/g) || []) record(chunk);
          } catch {}
          hit = await resolveFromSeen();
          if (hit) {
            log(`  ✅ ${hit.platform}:${hit.platformIdentifier} via deep link`);
            return { hit, unsupported: [...unsupported], newCareerUrl: t.href };
          }
        }
      }
    }
    }
    return { hit: null, unsupported: [...unsupported] };
  } finally {
    await page.close().catch(() => {});
  }
}

// ── Runner ───────────────────────────────────────────────────────────────────

async function main() {
  const prior = JSON.parse(fs.readFileSync(path.join(__dirname, IN_FILE), 'utf8'));
  let targets = prior.filter((r) => !r.resolved && r.careerUrl);
  if (ONLY) targets = prior.filter((r) => ONLY.includes(r.slug));

  const skipped = prior.filter((r) => !r.resolved && !r.careerUrl).map((r) => r.slug);
  if (skipped.length) console.log(`No careerUrl, skipping: ${skipped.join(', ')}`);
  console.log(`Browser pass over ${targets.length} unresolved companies (concurrency ${CONCURRENCY})\n`);

  const browser = await puppeteer.launch({
    headless: HEADFUL ? false : 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
  });

  const results = [];
  let i = 0;
  const worker = async () => {
    while (i < targets.length) {
      const idx = i++;
      const entry = targets[idx];
      const lines = [`[${idx + 1}/${targets.length}] ${entry.name} (${entry.slug}) — ${entry.careerUrl}`];
      const log = (s) => lines.push(s);
      let out;
      try {
        out = await probeInBrowser(browser, entry, log);
      } catch (e) {
        log(`  browser error: ${e.message}`);
        out = { hit: null, unsupported: [] };
      }
      if (!out.hit) log(`  ❌ unresolved${out.unsupported?.length ? ` — uses ${out.unsupported.join(', ')}` : ''}`);
      console.log(lines.join('\n'));

      results.push({
        slug: entry.slug,
        name: entry.name,
        careerUrl: entry.careerUrl,
        old: entry.old,
        httpStatus: entry.httpStatus,
        ...(out.hit
          ? {
              resolved: true,
              platform: out.hit.platform,
              platformIdentifier: out.hit.platformIdentifier,
              via: 'browser',
              sourceUrl: out.hit.sourceUrl,
              newCareerUrl: out.newCareerUrl,
              evidence: out.hit.evidence,
            }
          : { resolved: false, unsupported: out.unsupported }),
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
  await browser.close();

  results.sort((a, b) => targets.findIndex((t) => t.slug === a.slug) - targets.findIndex((t) => t.slug === b.slug));
  fs.writeFileSync(path.join(__dirname, OUT_FILE), JSON.stringify(results, null, 2));

  const ok = results.filter((r) => r.resolved);
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Resolved ${ok.length}/${results.length}. Wrote ${OUT_FILE}`);
  const byAts = {};
  for (const r of results.filter((x) => !x.resolved)) for (const u of r.unsupported || ['unknown']) (byAts[u] ||= []).push(r.slug);
  for (const [ats, slugs] of Object.entries(byAts).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${ats} (${slugs.length}): ${slugs.join(', ')}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
