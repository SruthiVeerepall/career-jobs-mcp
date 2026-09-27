/**
 * guess-board-ids.mjs — last-resort discovery for bot-walled careers sites.
 *
 * When neither the careers page nor the browser pass reveals an ATS, try slug
 * variants of the company name against the four JSON board APIs.
 *
 * A hit is NOT enough. Staffing agencies and scam boards register under real
 * brand names — `greenhouse:mcafee` is a heating-and-air-conditioning company,
 * `smartrecruiters:dunbradstreetinc` is a visa scam — so every candidate must
 * clear an identity check before it is proposed:
 *
 *   strong  the board's own name matches the company name (Greenhouse,
 *           SmartRecruiters expose one), or the company's apex domain appears
 *           in the board's page/postings.
 *   weak    only the slug matched. Recorded as rejected, never proposed.
 *
 * Output: board-guesses.json (accepted) + board-guesses-rejected.json.
 * Read the samples before applying — this is the one pipeline stage that can
 * confidently return the wrong employer.
 *
 * Usage: node guess-board-ids.mjs [--in registry-repairs-browser.json]
 *                                 [--only slug1,slug2] [--concurrency 4]
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
const IN_FILE = argVal('--in', 'registry-repairs-browser.json');
const OUT_FILE = argVal('--out', 'board-guesses.json');
const REJECT_FILE = argVal('--rejected', 'board-guesses-rejected.json');
const ONLY = argVal('--only', null)?.split(',').map((s) => s.trim());
const CONCURRENCY = parseInt(argVal('--concurrency', '4'), 10);

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const H = { 'User-Agent': UA, Accept: 'application/json' };
const TIMEOUT = 12000;

const get = (url, headers = H) =>
  axios.get(url, { timeout: TIMEOUT, validateStatus: () => true, headers }).catch((e) => ({ status: 0, data: null, error: e.message }));

// ── Slug variants ────────────────────────────────────────────────────────────

const SUFFIXES = /\b(inc|inc\.|corp|corporation|co|company|llc|ltd|plc|group|holdings|technologies|technology|tech|networks|systems|solutions|software|labs|international|worldwide|global)\b/gi;

function variants(name, slug) {
  const clean = name.replace(/&/g, 'and').replace(SUFFIXES, '').trim();
  const words = clean.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const out = new Set();
  const add = (s) => s && s.length >= 3 && out.add(s);

  add(slug);
  add(slug.replace(/-/g, ''));
  add(words.join('').toLowerCase());
  add(words.join('-').toLowerCase());
  add(words.join('_').toLowerCase());
  if (words.length > 1) add(words[0].toLowerCase());
  // Boards are frequently the brand name in its display casing.
  add(words.join(''));
  add(name.replace(/[^A-Za-z0-9]/g, ''));
  // Common corporate board suffixes.
  const base = words.join('').toLowerCase();
  for (const s of ['careers', 'inc', 'global', 'us']) add(base + s);
  return [...out];
}

/** Apex domain of the company's careers URL — the strongest identity signal. */
function apexOf(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    const p = h.split('.');
    // Handle co.uk-style two-part TLDs crudely; good enough for a substring check.
    return p.length > 2 && p.at(-2).length <= 3 ? p.slice(-3).join('.') : p.slice(-2).join('.');
  } catch {
    return null;
  }
}

const norm = (s) => (s || '').toLowerCase().replace(SUFFIXES, '').replace(/[^a-z0-9]/g, '');

/** Do two company names refer to the same employer? */
function namesMatch(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

// ── Per-platform lookup: return { jobs, boardName, blob } ────────────────────

async function lookupGreenhouse(id) {
  const r = await get(`https://boards-api.greenhouse.io/v1/boards/${id}/jobs?content=true`);
  if (r.status !== 200 || !r.data?.jobs?.length) return null;
  const meta = await get(`https://boards-api.greenhouse.io/v1/boards/${id}`);
  return {
    boardName: meta.data?.name,
    total: r.data.jobs.length,
    dated: r.data.jobs.filter((j) => j.first_published ?? j.updated_at).length,
    samples: r.data.jobs.slice(0, 3).map((j) => ({ title: j.title, location: j.location?.name, url: j.absolute_url })),
    blob: JSON.stringify(r.data.jobs.slice(0, 10)) + JSON.stringify(meta.data ?? {}),
  };
}

async function lookupLever(id) {
  const r = await get(`https://api.lever.co/v0/postings/${id}?mode=json&limit=20`);
  if (r.status !== 200 || !Array.isArray(r.data) || !r.data.length) return null;
  return {
    boardName: null, // Lever exposes no board name.
    total: r.data.length,
    dated: r.data.filter((j) => j.createdAt).length,
    samples: r.data.slice(0, 3).map((j) => ({ title: j.text, location: j.categories?.location, url: j.hostedUrl })),
    blob: JSON.stringify(r.data.slice(0, 10)),
  };
}

async function lookupAshby(id) {
  const r = await get(`https://api.ashbyhq.com/posting-api/job-board/${id}?includeCompensation=false`);
  if (r.status !== 200 || !r.data?.jobs?.length) return null;
  return {
    boardName: r.data.organizationName ?? null,
    total: r.data.jobs.length,
    dated: r.data.jobs.filter((j) => j.publishedAt).length,
    samples: r.data.jobs.slice(0, 3).map((j) => ({ title: j.title, location: j.location, url: j.jobUrl })),
    blob: JSON.stringify(r.data).slice(0, 40000),
  };
}

async function lookupSmartRecruiters(id) {
  const r = await get(`https://api.smartrecruiters.com/v1/companies/${id}/postings?limit=20`);
  if (r.status !== 200 || !r.data?.content?.length) return null;
  const c = r.data.content;
  return {
    boardName: c[0]?.company?.name ?? null,
    total: r.data.totalFound ?? c.length,
    dated: c.filter((j) => j.releasedDate).length,
    samples: c.slice(0, 3).map((j) => ({ title: j.name, location: j.location?.city, url: `https://jobs.smartrecruiters.com/${id}/${j.id}` })),
    blob: JSON.stringify(c.slice(0, 10)),
  };
}

const LOOKUPS = {
  greenhouse: lookupGreenhouse,
  lever: lookupLever,
  ashby: lookupAshby,
  smartrecruiters: lookupSmartRecruiters,
};

/** Fetch the board's public HTML page — carries the employer's name and links. */
async function boardPageBlob(platform, id) {
  const url =
    platform === 'lever' ? `https://jobs.lever.co/${id}`
    : platform === 'ashby' ? `https://jobs.ashbyhq.com/${id}`
    : platform === 'greenhouse' ? `https://job-boards.greenhouse.io/${id}`
    : `https://jobs.smartrecruiters.com/${id}`;
  const r = await get(url, { 'User-Agent': UA, Accept: 'text/html' });
  return typeof r.data === 'string' ? r.data.slice(0, 200000) : '';
}

// ── Identity check ───────────────────────────────────────────────────────────

async function identify(platform, id, company, apex, found) {
  const reasons = [];

  if (found.boardName && namesMatch(found.boardName, company)) reasons.push(`board name "${found.boardName}"`);

  const haystack = (found.blob + '\n' + (await boardPageBlob(platform, id))).toLowerCase();
  if (apex && haystack.includes(apex.toLowerCase())) reasons.push(`apex domain ${apex}`);

  const n = norm(company);
  if (n.length >= 5 && haystack.replace(/[^a-z0-9]/g, '').includes(n)) reasons.push('company name in postings');

  // A board whose name is a DIFFERENT real company is a hard reject, even if
  // the slug matched — this is the McAfee-HVAC failure mode.
  if (found.boardName && !namesMatch(found.boardName, company)) {
    return { ok: false, reasons, conflict: `board is named "${found.boardName}"` };
  }
  return { ok: reasons.length > 0, reasons };
}

// ── Runner ───────────────────────────────────────────────────────────────────

async function main() {
  const prior = JSON.parse(fs.readFileSync(path.join(__dirname, IN_FILE), 'utf8'));
  const { companyRegistry } = await import('./dist/scrapers/company-registry.js');
  const bySlug = new Map(companyRegistry.list().map((c) => [c.slug, c]));

  let targets = prior.filter((r) => !r.resolved);
  if (ONLY) targets = prior.filter((r) => ONLY.includes(r.slug));
  console.log(`Guessing board ids for ${targets.length} companies\n`);

  const accepted = [];
  const rejected = [];
  let i = 0;

  const worker = async () => {
    while (i < targets.length) {
      const idx = i++;
      const entry = targets[idx];
      const cfg = bySlug.get(entry.slug);
      const careerUrl = entry.careerUrl ?? cfg?.careerUrl;
      const apex = apexOf(careerUrl);
      const lines = [`[${idx + 1}/${targets.length}] ${entry.name} (${entry.slug})  apex=${apex}`];

      let hit = null;
      outer: for (const platform of ['greenhouse', 'lever', 'ashby', 'smartrecruiters']) {
        for (const id of variants(entry.name, entry.slug)) {
          const found = await LOOKUPS[platform](id);
          if (!found) continue;
          const ident = await identify(platform, id, entry.name, apex, found);
          const rec = { slug: entry.slug, name: entry.name, careerUrl, old: entry.old, platform, platformIdentifier: id, evidence: { total: found.total, count: found.total, dated: found.dated, samples: found.samples }, identity: ident.reasons, conflict: ident.conflict };
          if (ident.ok) {
            lines.push(`  ✅ ${platform}:${id} — ${found.total} jobs — identity: ${ident.reasons.join('; ')}`);
            hit = { ...rec, resolved: true, via: 'slug-guess' };
            break outer;
          }
          lines.push(`  ⚠️  rejected ${platform}:${id} — ${ident.conflict ?? 'no identity signal'}`);
          rejected.push({ ...rec, resolved: false });
        }
      }

      if (hit) accepted.push(hit);
      else lines.push('  ❌ no verified board');
      console.log(lines.join('\n'));
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  fs.writeFileSync(path.join(__dirname, OUT_FILE), JSON.stringify(accepted, null, 2));
  fs.writeFileSync(path.join(__dirname, REJECT_FILE), JSON.stringify(rejected, null, 2));
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Accepted ${accepted.length}, rejected ${rejected.length}.`);
  console.log(`Wrote ${OUT_FILE} and ${REJECT_FILE}. REVIEW THE SAMPLES before applying.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
