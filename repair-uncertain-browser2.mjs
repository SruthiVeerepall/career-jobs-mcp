/**
 * repair-uncertain-browser2.mjs
 *
 * Third pass. The first browser pass loaded each company's careers *landing* page and
 * found nothing on 38 of 42 — Goldman's landing page, for instance, makes 145 requests
 * and not one touches an ATS. The board lives one click deeper, on the job-search page.
 * This crawls one level in: load the landing page, rank its links by job-search intent,
 * follow the best few, and sniff each. Also retries the six entries whose careerUrl no
 * longer resolves against candidate careers hosts derived from the company domain.
 *
 * Removes nothing. Output: repair-uncertain-browser2.json
 *
 * Usage: node repair-uncertain-browser2.mjs [--slug X] [--from <json>]
 */
import fs from 'fs';
import axios from 'axios';
import puppeteer from 'puppeteer';
import { companyRegistry } from './dist/scrapers/company-registry.js';

const args = process.argv.slice(2);
const argVal = (f, d) => {
  const i = args.indexOf(f);
  return i !== -1 ? args[i + 1] : d;
};
const ONLY_SLUG = argVal('--slug', null);
const FROM = argVal('--from', 'repair-uncertain.json');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const targets = JSON.parse(fs.readFileSync(FROM, 'utf8'))
  .results.filter((r) => !String(r.resolution ?? '').startsWith('FIXED'))
  .filter((r) => !ONLY_SLUG || r.slug === ONLY_SLUG);

// Careers hosts to try when the registry's careerUrl no longer resolves.
const FALLBACK_URLS = {
  factset: ['https://www.factset.com/careers', 'https://careers.factset.com/en/search-jobs'],
  secureworks: ['https://www.secureworks.com/about/careers'],
  'dun-bradstreet': ['https://www.dnb.com/about-us/careers.html', 'https://jobs.dnb.com'],
  broadcom: ['https://www.broadcom.com/company/careers', 'https://jobs.broadcom.com'],
  maximus: ['https://maximus.com/careers', 'https://jobs.maximus.com'],
  'kaiser-permanente': ['https://www.kaiserpermanentejobs.org', 'https://about.kaiserpermanente.org/careers'],
  'hbomax-careers': ['https://careers.wbd.com', 'https://www.wbd.com/careers'],
  vmware: ['https://www.broadcom.com/company/careers', 'https://careers.vmware.com/main'],
  'first-solar': ['https://www.firstsolar.com/en/Careers', 'https://jobs.firstsolar.com'],
};

// ── Detection (same vocabulary as discover-companies-browser.mjs, extended) ────

function safeHost(u) {
  try {
    return new URL(u).host;
  } catch {
    return null;
  }
}

function detect(url) {
  let m;
  if ((m = url.match(/https?:\/\/([a-z0-9_-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:wday\/cxs\/[a-z0-9_-]+\/)?(?:[a-z]{2}-[A-Z]{2}\/)?([A-Za-z0-9_-]+)/i))) {
    const site = m[3];
    if (!/^(wday|cxs|assets|static|images|favicon|api)$/i.test(site))
      return { platform: 'workday', identifier: `${m[1].toLowerCase()}|${m[2].toLowerCase()}|${site}` };
  }
  if ((m = url.match(/(?:job-)?boards(?:-api)?\.greenhouse\.io\/(?:v1\/boards\/|embed\/job_board\?for=)?([a-z0-9_-]+)/i))) {
    if (!/^(embed|v1|boards)$/i.test(m[1]) && m[1].length > 1) return { platform: 'greenhouse', identifier: m[1] };
  }
  if ((m = url.match(/api\.lever\.co\/v\d\/postings\/([a-z0-9_-]+)/i))) return { platform: 'lever', identifier: m[1] };
  if ((m = url.match(/jobs\.lever\.co\/([a-z0-9_-]+)/i))) return { platform: 'lever', identifier: m[1] };
  if ((m = url.match(/(?:jobs|api)\.ashbyhq\.com\/(?:posting-api\/job-board\/)?([a-z0-9_.-]+)/i))) {
    if (!/^(posting-api|non-user-graphql)$/i.test(m[1]) && m[1].length > 1) return { platform: 'ashby', identifier: m[1] };
  }
  if ((m = url.match(/api\.smartrecruiters\.com\/v\d\/companies\/([A-Za-z0-9_-]+)/i))) return { platform: 'smartrecruiters', identifier: m[1] };
  if ((m = url.match(/jobs\.smartrecruiters\.com\/([A-Za-z0-9_-]+)/))) return { platform: 'smartrecruiters', identifier: m[1] };
  if ((m = url.match(/api\.rippling\.com\/platform\/api\/ats\/v\d\/board\/([a-z0-9_-]+)/i))) return { platform: 'rippling', identifier: m[1] };
  if ((m = url.match(/ats\.rippling\.com\/([a-z0-9_-]+)/i))) return { platform: 'rippling', identifier: m[1] };
  if (/\/api\/(apply\/v2\/jobs|pcsx\/search)\?/i.test(url)) {
    const h = safeHost(url);
    let domain = null;
    try {
      domain = new URL(url).searchParams.get('domain');
    } catch {}
    if (h && domain) return { platform: 'eightfold', identifier: `${h}|${domain}` };
  }
  if (/\/services\/jobs\/search\/?$/i.test(url)) {
    const h = safeHost(url);
    if (h) return { platform: 'successfactors', identifier: h };
  }
  if (/\/widgets(\?|$)/i.test(url)) {
    const h = safeHost(url);
    if (h) return { platform: 'phenom', identifier: h };
  }
  if (/\/search-jobs\/results/i.test(url)) {
    const h = safeHost(url);
    if (h) return { platform: 'radancy', identifier: h };
  }
  return null;
}

function otherAts(url) {
  if (/icims\.com/i.test(url)) return 'icims';
  if (/taleo\.net/i.test(url)) return 'taleo';
  if (/successfactors|sapsf\.com/i.test(url)) return 'successfactors';
  if (/phenompeople|phenom\.com/i.test(url)) return 'phenom';
  if (/avature\.net/i.test(url)) return 'avature';
  if (/brassring|kenexa/i.test(url)) return 'brassring';
  if (/oraclecloud\.com/i.test(url)) return 'oracle-orc';
  if (/eightfold\.ai/i.test(url)) return 'eightfold';
  if (/jibeapply|radancy|talemetry|talentbrew/i.test(url)) return 'radancy';
  if (/workable\.com/i.test(url)) return 'workable';
  if (/bamboohr\.com/i.test(url)) return 'bamboohr';
  if (/jobvite\.com/i.test(url)) return 'jobvite';
  if (/myworkdayjobs\.com/i.test(url)) return 'workday';
  if (/comeet\.co/i.test(url)) return 'comeet';
  if (/ashbyhq\.com/i.test(url)) return 'ashby';
  if (/greenhouse\.io/i.test(url)) return 'greenhouse';
  if (/lever\.co/i.test(url)) return 'lever';
  if (/smartrecruiters\.com/i.test(url)) return 'smartrecruiters';
  if (/eqx\.jobs|jobs\.jobvite/i.test(url)) return 'jobvite';
  return null;
}

// ── Verification ──────────────────────────────────────────────────────────────

const g = (url, opts = {}) =>
  axios.get(url, { timeout: 20000, validateStatus: () => true, headers: { 'User-Agent': UA }, ...opts });

async function verify(platform, id) {
  try {
    if (platform === 'workday') {
      const [t, w, s] = id.split('|');
      const r = await axios.post(
        `https://${t}.${w}.myworkdayjobs.com/wday/cxs/${t}/${s}/jobs`,
        { limit: 20, offset: 0, searchText: '', appliedFacets: {} },
        { timeout: 20000, validateStatus: () => true, headers: { 'User-Agent': UA, Accept: 'application/json', 'Content-Type': 'application/json' } },
      );
      if (r.status !== 200 || !Array.isArray(r.data?.jobPostings)) return { ok: false, status: r.status };
      const posts = r.data.jobPostings;
      const dated = posts.filter((p) => typeof p.postedOn === 'string' && p.postedOn.trim());
      return { ok: posts.length > 0, jobCount: r.data.total ?? posts.length, datedCount: dated.length, returned: posts.length, samplePostedOn: [...new Set(dated.map((p) => p.postedOn))].slice(0, 3), sampleTitles: posts.map((p) => p.title).filter(Boolean).slice(0, 3) };
    }
    if (platform === 'greenhouse') {
      const r = await g(`https://boards-api.greenhouse.io/v1/boards/${id}/jobs?content=true`);
      const jobs = r.data?.jobs ?? [];
      const dated = jobs.filter((j) => j.first_published);
      return { ok: r.status === 200 && jobs.length > 0, jobCount: jobs.length, datedCount: dated.length, returned: jobs.length, samplePostedOn: dated.slice(0, 2).map((j) => j.first_published), sampleTitles: jobs.slice(0, 3).map((j) => j.title) };
    }
    if (platform === 'lever') {
      const r = await g(`https://api.lever.co/v0/postings/${id}?mode=json&limit=20`);
      const jobs = Array.isArray(r.data) ? r.data : [];
      const dated = jobs.filter((j) => j.createdAt);
      return { ok: r.status === 200 && jobs.length > 0, jobCount: jobs.length, datedCount: dated.length, returned: jobs.length, samplePostedOn: dated.slice(0, 2).map((j) => new Date(j.createdAt).toISOString().slice(0, 10)), sampleTitles: jobs.slice(0, 3).map((j) => j.text) };
    }
    if (platform === 'ashby') {
      const r = await g(`https://api.ashbyhq.com/posting-api/job-board/${id}`);
      const jobs = r.data?.jobs ?? [];
      const dated = jobs.filter((j) => j.publishedAt);
      return { ok: r.status === 200 && jobs.length > 0, jobCount: jobs.length, datedCount: dated.length, returned: jobs.length, samplePostedOn: dated.slice(0, 2).map((j) => j.publishedAt), sampleTitles: jobs.slice(0, 3).map((j) => j.title) };
    }
    if (platform === 'smartrecruiters') {
      const r = await g(`https://api.smartrecruiters.com/v1/companies/${id}/postings?limit=20`);
      const jobs = r.data?.content ?? [];
      const dated = jobs.filter((j) => j.releasedDate);
      return { ok: r.status === 200 && jobs.length > 0, jobCount: r.data?.totalFound ?? jobs.length, datedCount: dated.length, returned: jobs.length, samplePostedOn: dated.slice(0, 2).map((j) => j.releasedDate), sampleTitles: jobs.slice(0, 3).map((j) => j.name) };
    }
    if (platform === 'rippling') {
      const r = await g(`https://api.rippling.com/platform/api/ats/v1/board/${id}/jobs`);
      const jobs = Array.isArray(r.data) ? r.data : (r.data?.items ?? []);
      return { ok: r.status === 200 && jobs.length > 0, jobCount: jobs.length, datedCount: null, returned: jobs.length, sampleTitles: jobs.slice(0, 3).map((j) => j.name ?? j.title) };
    }
    if (platform === 'eightfold') {
      const [host, domain] = id.split('|');
      const r = await g(`https://${host}/api/apply/v2/jobs?domain=${encodeURIComponent(domain)}&start=0&num=20&sort_by=timestamp`);
      const jobs = r.data?.positions ?? [];
      const dated = jobs.filter((j) => j.t_create);
      return { ok: r.status === 200 && jobs.length > 0, jobCount: r.data?.count ?? jobs.length, datedCount: dated.length, returned: jobs.length, samplePostedOn: dated.slice(0, 2).map((j) => new Date(j.t_create * 1000).toISOString().slice(0, 10)), sampleTitles: jobs.slice(0, 3).map((j) => j.name) };
    }
    if (platform === 'successfactors') {
      const r = await axios.post(
        `https://${id}/services/jobs/search/`,
        { keywords: '', locationsearch: '', sortby: 'referencedate', sortdir: 'desc', recordsperpage: 20, startrow: 0, facetquery: { facet: true, limit: 100, fields: ['country'] }, filterquery: {} },
        { timeout: 20000, validateStatus: () => true, headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json', Origin: `https://${id}`, Referer: `https://${id}/search/` } },
      );
      const jobs = r.data?.jobs ?? r.data?.data?.jobs ?? [];
      const dated = jobs.filter((j) => j.referencedate);
      return { ok: r.status === 200 && jobs.length > 0, jobCount: r.data?.hits ?? jobs.length, datedCount: dated.length, returned: jobs.length, samplePostedOn: dated.slice(0, 2).map((j) => j.referencedate), sampleTitles: jobs.slice(0, 3).map((j) => j.title) };
    }
    if (platform === 'phenom') {
      const r = await axios.post(
        `https://${id}/widgets`,
        { lang: 'en_us', deviceType: 'desktop', country: 'us', pageName: 'search-results', ddoKey: 'refineSearch', sortBy: 'Most recent', subsearch: '', from: 0, jobs: true, counts: true, all_fields: [], size: 20, clearAll: false, jdsource: 'facets', isSliderEnable: false, pageId: 'page1', siteType: 'external', keywords: '', global: true },
        { timeout: 20000, validateStatus: () => true, headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json', Origin: `https://${id}`, Referer: `https://${id}/search-results` } },
      );
      const jobs = r.data?.refineSearch?.data?.jobs ?? [];
      const dated = jobs.filter((j) => j.postedDate);
      return { ok: r.status === 200 && jobs.length > 0, jobCount: r.data?.refineSearch?.totalHits ?? jobs.length, datedCount: dated.length, returned: jobs.length, samplePostedOn: dated.slice(0, 2).map((j) => j.postedDate), sampleTitles: jobs.slice(0, 3).map((j) => j.title) };
    }
    if (platform === 'radancy') {
      const r = await g(`https://${id}/search-jobs/results?ActiveFacetID=0&CurrentPage=1&RecordsPerPage=20&Distance=50&RadiusUnitType=0&Keywords=&Location=&ShowRadius=False&IsPagination=False&CustomFacetName=&FacetTerm=&FacetType=0&SearchResultsModuleName=Search+Results&SearchFiltersModuleName=Search+Filters&SortCriteria=0&SortDirection=0&SearchType=5`, { headers: { 'User-Agent': UA, Accept: 'application/json', Referer: `https://${id}/search-jobs` } });
      const html = r.data?.results ?? '';
      const n = (String(html).match(/search-jobs\/\d+/g) ?? []).length;
      return { ok: r.status === 200 && n > 0, jobCount: r.data?.hits ?? n, datedCount: null, returned: n, sampleTitles: [] };
    }
  } catch (e) {
    return { ok: false, error: e.code || e.message };
  }
  return { ok: false, note: 'no verifier' };
}

// ── Browser ───────────────────────────────────────────────────────────────────

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});

const LINK_SCORE = [
  [/search[-_ ]?jobs|job[-_ ]?search|search\/jobs/i, 10],
  [/\b(all[-_ ]?)?(open[-_ ]?)?(jobs|openings|opportunities|positions|vacancies)\b/i, 7],
  [/apply|explore[-_ ]?(jobs|careers)|view[-_ ]?jobs|find[-_ ]?a[-_ ]?job/i, 5],
  [/careers?\/(search|jobs|professionals|experienced)/i, 6],
  [/students|internship|campus|university/i, -6],
  [/blog|news|story|stories|life-at|culture|benefits|privacy|cookie|legal/i, -8],
];

async function sniffPage(url, budgetMs = 9000) {
  const page = await browser.newPage();
  const seen = new Set();
  const hits = [];
  const others = new Set();
  const collect = (u) => {
    if (!u || seen.has(u)) return;
    seen.add(u);
    const d = detect(u);
    if (d) hits.push(d);
    const o = otherAts(u);
    if (o) others.add(o);
  };
  try {
    await page.setUserAgent(UA);
    await page.setViewport({ width: 1366, height: 900 });
    page.on('request', (r) => collect(r.url()));
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await new Promise((r) => setTimeout(r, budgetMs));
    await page.evaluate(() => window.scrollBy(0, 3000)).catch(() => {});
    await new Promise((r) => setTimeout(r, 2500));

    const html = await page.content().catch(() => '');
    for (const m of html.matchAll(/https?:\/\/[^\s"'<>()\\]+/g)) collect(m[0]);
    collect(page.url());

    const links = await page
      .$$eval('a[href]', (as) => as.map((a) => ({ href: a.href, text: (a.textContent || '').trim().slice(0, 80) })))
      .catch(() => []);
    return { hits, others: [...others], links, finalUrl: page.url() };
  } catch (e) {
    return { hits, others: [...others], links: [], error: e.message.split('\n')[0].slice(0, 90) };
  } finally {
    await page.close().catch(() => {});
  }
}

function rankLinks(links, baseHost) {
  const scored = [];
  for (const l of links) {
    let h;
    try {
      h = new URL(l.href);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(h.protocol)) continue;
    const hay = `${l.href} ${l.text}`;
    let s = 0;
    for (const [re, pts] of LINK_SCORE) if (re.test(hay)) s += pts;
    // An off-site careers host is usually the ATS itself.
    if (h.host !== baseHost && /job|career|talent|hire|recruit/i.test(h.host)) s += 8;
    if (s > 0) scored.push({ ...l, score: s });
  }
  const out = [];
  const seenUrl = new Set();
  for (const l of scored.sort((a, b) => b.score - a.score)) {
    const k = l.href.split('#')[0];
    if (seenUrl.has(k)) continue;
    seenUrl.add(k);
    out.push(l);
    if (out.length >= 4) break;
  }
  return out;
}

// ── Driver ────────────────────────────────────────────────────────────────────

console.log(`Deep pass over ${targets.length} entries (landing page + one level in)\n`);
const results = [];

for (const t of targets) {
  const cfg = companyRegistry.companies.get(t.slug);
  const startUrls = [cfg?.careerUrl ?? t.careerUrl, ...(FALLBACK_URLS[t.slug] ?? [])].filter(Boolean);
  const rec = { slug: t.slug, name: t.name, current: t.current };
  const allHits = [];
  const allOthers = new Set();
  const visited = [];
  let fixed = null;

  outer: for (const start of startUrls) {
    const first = await sniffPage(start);
    visited.push(start);
    allHits.push(...first.hits);
    first.others.forEach((o) => allOthers.add(o));

    let candidates = dedupe(allHits);
    fixed = await firstVerified(candidates);
    if (fixed) break outer;

    const baseHost = safeHost(first.finalUrl ?? start) ?? '';
    for (const link of rankLinks(first.links, baseHost)) {
      const deep = await sniffPage(link.href, 7000);
      visited.push(link.href);
      allHits.push(...deep.hits);
      deep.others.forEach((o) => allOthers.add(o));
      candidates = dedupe(allHits);
      fixed = await firstVerified(candidates);
      if (fixed) break outer;
    }
  }

  rec.visited = visited;
  rec.atsSeen = [...allOthers];
  rec.candidates = dedupe(allHits).map((h) => `${h.platform}|${h.identifier}`);

  if (fixed) {
    Object.assign(rec, fixed, {
      resolution: fixed.platform === 'workday' ? 'FIXED' : 'FIXED-NEW-PLATFORM',
      usable: fixed.datedCount === null ? 'unknown-dates' : fixed.datedCount > 0 ? 'yes' : 'no-dates',
    });
  } else {
    rec.resolution = allOthers.size ? 'ATS-IDENTIFIED-UNSUPPORTED' : 'UNRESOLVED';
    rec.note = allOthers.size ? `runs ${[...allOthers].join(', ')}` : 'no ATS signal';
  }

  process.stderr.write(
    `  ${rec.resolution.padEnd(28)} ${rec.name.padEnd(22)} ${
      fixed ? `${fixed.platform}:${fixed.identifier} jobs=${fixed.jobCount} dated=${fixed.datedCount}/${fixed.returned}` : rec.note
    }\n`,
  );
  results.push(rec);
}

function dedupe(hits) {
  const out = [];
  for (const h of hits) {
    const k = `${h.platform}|${h.identifier}`;
    if (!out.some((u) => `${u.platform}|${u.identifier}` === k)) out.push(h);
  }
  return out;
}

async function firstVerified(cands) {
  for (const h of cands) {
    if (h._checked) continue;
    h._checked = true;
    const v = await verify(h.platform, h.identifier);
    if (v.ok) return { platform: h.platform, identifier: h.identifier, ...v };
  }
  return null;
}

await browser.close();

const by = {};
for (const r of results) (by[r.resolution] ??= []).push(r);
console.log(`\n${'-'.repeat(80)}`);
for (const [k, list] of Object.entries(by).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n${k} — ${list.length}`);
  for (const r of list) {
    console.log(
      r.resolution.startsWith('FIXED')
        ? `  ${r.name.padEnd(22)} ${r.current.padEnd(40)} => ${r.platform}: ${r.identifier}  jobs=${r.jobCount} dated=${r.datedCount}/${r.returned} usable=${r.usable} | ${(r.sampleTitles ?? [])[0] ?? ''}`
        : `  ${r.name.padEnd(22)} ${(r.current ?? '').padEnd(40)} ${r.note}${r.candidates?.length ? '  saw: ' + r.candidates.join(', ') : ''}`,
    );
  }
}

fs.writeFileSync('repair-uncertain-browser2.json', JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2));
console.log(`\nSaved repair-uncertain-browser2.json`);
