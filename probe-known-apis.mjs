/**
 * probe-known-apis.mjs — Phase 4
 *
 * The browser pass answers "what ATS does this careers page load?". When the
 * page is bot-walled or renders nothing useful, that question goes unanswered
 * even though the employer is running an ATS we speak.
 *
 * This flips it around: take the company's own domain and ask every supported
 * platform's endpoint directly. Four of them (SuccessFactors, Phenom, iCIMS JRA
 * and Eightfold PCSX) are hosted on the EMPLOYER's domain rather than a vendor
 * one, so the host is guessable from the careers URL in a way a Greenhouse board
 * token never is — and every candidate is confirmed by real dated postings
 * before it is proposed.
 *
 * Output: registry-repairs-apis.json
 *
 * Usage: node probe-known-apis.mjs [--in registry-repairs-b2.json]
 *                                  [--only slug1,slug2] [--concurrency 6]
 */

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
const IN_FILE = argVal('--in', 'registry-repairs-b2.json');
const OUT_FILE = argVal('--out', 'registry-repairs-apis.json');
const ONLY = argVal('--only', null)?.split(',').map((s) => s.trim());
const CONCURRENCY = parseInt(argVal('--concurrency', '6'), 10);

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const TIMEOUT = 15000;
const H = { 'User-Agent': UA, Accept: 'application/json', 'Content-Type': 'application/json' };

const post = (url, body, extra = {}) =>
  axios.post(url, body, { timeout: TIMEOUT, validateStatus: () => true, headers: { ...H, ...extra } }).catch(() => ({ status: 0, data: null }));
const get = (url) =>
  axios.get(url, { timeout: TIMEOUT, validateStatus: () => true, headers: H }).catch(() => ({ status: 0, data: null }));

// ── Per-platform probes, each returning evidence or null ─────────────────────

async function trySuccessFactors(host) {
  const r = await post(
    `https://${host}/services/jobs/search/`,
    {
      keywords: '', locationsearch: '', sortby: 'referencedate', sortdir: 'desc',
      recordsperpage: 20, startrow: 0,
      facetquery: { facet: true, limit: 100, fields: ['country'] },
      filterquery: { country: ['us'] },
    },
    { Origin: `https://${host}`, Referer: `https://${host}/search/` },
  );
  const list = r.status === 200 && typeof r.data === 'object' ? r.data?.jobList : null;
  if (!list?.length) return null;
  return {
    total: list.length, count: list.length,
    dated: list.filter((j) => j.referencedate).length,
    samples: list.slice(0, 3).map((j) => ({ title: j.title, location: j.location, posted: j.referencedate })),
  };
}

async function tryPhenom(host) {
  const r = await post(
    `https://${host}/widgets`,
    {
      lang: 'en_us', deviceType: 'desktop', country: 'us', pageName: 'search-results', ddoKey: 'refineSearch',
      sortBy: 'Most recent', subsearch: '', from: 0, jobs: true, counts: true,
      all_fields: ['category', 'country', 'state', 'city', 'type'],
      pageNumber: 1, size: 20, clearAll: false, jdsource: 'facets', isSliderEnable: false,
      pageId: 'page3', siteType: 'external', keywords: '', global: true, selected_fields: {}, locationData: {},
    },
    { Origin: `https://${host}`, Referer: `https://${host}/search-results` },
  );
  const rs = r.status === 200 ? r.data?.refineSearch : null;
  const jobs = rs?.data?.jobs;
  if (!jobs?.length) return null;
  return {
    total: rs.totalHits ?? jobs.length, count: jobs.length,
    dated: jobs.filter((j) => j.postedDate ?? j.dateCreated).length,
    samples: jobs.slice(0, 3).map((j) => ({ title: j.title, location: j.cityStateCountry, posted: j.postedDate })),
  };
}

async function tryIcimsJra(host) {
  const r = await get(`https://${host}/api/jobs?limit=20`);
  const jobs = r.status === 200 ? (r.data?.jobs ?? r.data?.data) : null;
  if (!Array.isArray(jobs) || !jobs.length) return null;
  // JRA nests each row under `.data`.
  const rows = jobs.map((j) => j.data ?? j);
  return {
    total: r.data?.totalCount ?? rows.length, count: rows.length,
    dated: rows.filter((j) => j.posted_date).length,
    samples: rows.slice(0, 3).map((j) => ({ title: j.title, location: j.location_name, posted: j.posted_date })),
  };
}

async function tryEightfold(host, domain) {
  const q = `domain=${encodeURIComponent(domain)}&start=0&num=10&sort_by=timestamp`;
  const v2 = await get(`https://${host}/api/apply/v2/jobs?${q}`);
  if (v2.status === 200 && v2.data?.positions?.length) {
    const p = v2.data.positions;
    return {
      total: v2.data.count ?? p.length, count: p.length,
      dated: p.filter((x) => x.t_create).length,
      samples: p.slice(0, 3).map((x) => ({ title: x.name, location: x.locations?.[0], posted: x.t_create && new Date(x.t_create * 1000).toISOString().slice(0, 10) })),
    };
  }
  const px = await get(`https://${host}/api/pcsx/search?${q}&query=&location=`);
  const p = px.status === 200 ? px.data?.data?.positions : null;
  if (!p?.length) return null;
  return {
    total: px.data.data.count ?? p.length, count: p.length,
    dated: p.filter((x) => x.postedTs).length,
    samples: p.slice(0, 3).map((x) => ({ title: x.name, location: x.locations?.[0], posted: x.postedTs && new Date(x.postedTs * 1000).toISOString().slice(0, 10) })),
  };
}

async function tryRadancy(host) {
  const p = new URLSearchParams({
    ActiveFacetID: '0', CurrentPage: '1', RecordsPerPage: '20', Distance: '50', RadiusUnitType: '0',
    Keywords: '', Location: '', ShowRadius: 'False', IsPagination: 'True',
    CustomFacetName: '', FacetTerm: '', FacetType: '0',
    SearchResultsModuleName: 'Search Results', SearchFiltersModuleName: 'Search Filters',
    SortCriteria: '1', SortDirection: '1', SearchType: '5',
  });
  const r = await get(`https://${host}/search-jobs/results?${p}`);
  const html = r.status === 200 ? String(r.data?.results ?? '') : '';
  const ids = html.match(/data-job-id="(\d+)"/g) ?? [];
  if (!ids.length) return null;
  const titles = [...html.matchAll(/<h2>([^<]+)<\/h2>/g)].map((m) => m[1].trim());
  const dates = [...html.matchAll(/job-date-posted">([^<]+)</g)].map((m) => m[1].trim());
  const totalMatch = html.match(/data-total-job-results="(\d+)"/);
  return {
    total: totalMatch ? Number(totalMatch[1]) : ids.length,
    count: ids.length,
    // A dateless list is still usable: the scraper backfills from job pages.
    dated: dates.length,
    samples: titles.slice(0, 3).map((t, i) => ({ title: t, posted: dates[i] })),
  };
}

async function tryOracleOrc(host, site) {
  const finder = `findReqs;siteNumber=${site},facetsList=LOCATIONS%3BTITLES%3BCATEGORIES,limit=20,offset=0,sortBy=POSTING_DATES_DESC`;
  const r = await get(`https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?finder=${finder}&expand=requisitionList.secondaryLocations&onlyData=true`);
  const item = r.status === 200 ? r.data?.items?.[0] : null;
  const reqs = item?.requisitionList;
  if (!reqs?.length) return null;
  return {
    total: item.TotalJobsCount ?? reqs.length, count: reqs.length,
    dated: reqs.filter((x) => x.PostedDate).length,
    samples: reqs.slice(0, 3).map((x) => ({ title: x.Title, location: x.PrimaryLocation, posted: x.PostedDate })),
  };
}

// ── Host candidates derived from the company's own domain ────────────────────

function hostCandidates(careerUrl, name) {
  const out = [];
  const add = (h) => h && !out.includes(h) && out.push(h);
  let apex = null;
  try {
    const u = new URL(careerUrl);
    add(u.hostname);
    apex = u.hostname.replace(/^www\./, '').split('.').slice(-2).join('.');
  } catch {}
  if (apex) {
    for (const p of ['careers', 'jobs', 'career', 'apply', 'jobsearch', 'talent']) add(`${p}.${apex}`);
    add(`jobs-us.${apex}`);
    add(`apply.careers.${apex}`);
  }
  // Employers frequently park the portal on a "<brand>jobs.com" domain.
  const brand = (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (brand.length >= 3) {
    add(`jobs.${brand}.com`);
    add(`careers.${brand}.com`);
    add(`${brand}jobs.com`);
    add(`jobs.${brand}jobs.com`);
    add(`careers.${brand}jobs.com`);
  }
  return { hosts: out, apex };
}

async function probeCompany(entry, log) {
  const { hosts, apex } = hostCandidates(entry.careerUrl, entry.name);

  for (const host of hosts) {
    for (const [platform, fn] of [
      ['successfactors', trySuccessFactors],
      ['phenom', tryPhenom],
      ['icims-jra', tryIcimsJra],
      ['radancy', tryRadancy],
    ]) {
      const ev = await fn(host);
      if (ev) {
        log(`  ✅ ${platform}:${host} — ${ev.total} jobs, ${ev.dated}/${ev.count} dated`);
        return { platform, platformIdentifier: host, evidence: ev };
      }
    }
    if (apex) {
      const ev = await tryEightfold(host, apex);
      if (ev) {
        log(`  ✅ eightfold:${host}|${apex} — ${ev.total} jobs`);
        return { platform: 'eightfold', platformIdentifier: `${host}|${apex}`, evidence: ev };
      }
    }
  }
  return null;
}

// ── Runner ───────────────────────────────────────────────────────────────────

async function main() {
  const prior = JSON.parse(fs.readFileSync(path.join(__dirname, IN_FILE), 'utf8'));
  const { companyRegistry } = await import('./dist/scrapers/company-registry.js');
  const bySlug = new Map(companyRegistry.list().map((c) => [c.slug, c]));

  let targets = prior.filter((r) => !r.resolved);
  if (ONLY) targets = prior.filter((r) => ONLY.includes(r.slug));
  targets = targets.map((t) => ({ ...t, careerUrl: t.careerUrl ?? bySlug.get(t.slug)?.careerUrl }));

  console.log(`Direct API probe over ${targets.length} companies\n`);
  const results = [];
  let i = 0;

  const worker = async () => {
    while (i < targets.length) {
      const idx = i++;
      const entry = targets[idx];
      const lines = [`[${idx + 1}/${targets.length}] ${entry.name} (${entry.slug}) — ${entry.careerUrl}`];
      const log = (s) => lines.push(s);
      let hit = null;
      try {
        hit = await probeCompany(entry, log);
      } catch (e) {
        log(`  error: ${e.message}`);
      }
      if (!hit) lines.push('  ❌ no supported API answered');
      console.log(lines.join('\n'));
      results.push({
        slug: entry.slug, name: entry.name, careerUrl: entry.careerUrl,
        old: entry.old, httpStatus: entry.httpStatus,
        ...(hit ? { resolved: true, via: 'api-probe', ...hit } : { resolved: false, unsupported: entry.unsupported }),
      });
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  results.sort((a, b) => targets.findIndex((t) => t.slug === a.slug) - targets.findIndex((t) => t.slug === b.slug));
  fs.writeFileSync(path.join(__dirname, OUT_FILE), JSON.stringify(results, null, 2));
  const ok = results.filter((r) => r.resolved);
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Resolved ${ok.length}/${results.length}. Wrote ${OUT_FILE}`);
  console.log(`Still unresolved: ${results.filter((r) => !r.resolved).map((r) => r.slug).join(', ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
