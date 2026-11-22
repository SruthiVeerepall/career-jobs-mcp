import axios from 'axios';
import { cacheManager } from '../cache/cache-manager.js';
import { companyRegistry } from '../scrapers/company-registry.js';
import type { CareerPlatform, CompanyConfig, JobListing } from '../types.js';
import { logger } from '../utils/logger.js';
import { STATE_NAMES } from './common.js';
import { applyFormFor } from './platforms.js';

// Auto apply for job board listings without the board. LinkedIn, BuiltIn, Jobicy and Himalayas
// show the employer's link only to signed-in members (seen live 2026-11-22: authwall, sign-up
// pages), and signing in to a board from an automated browser risks the account. But most of
// those jobs are also posted on the employer's own public job board, which needs no account.
// So: take the board job's company, title and location, find the same posting on the
// employer's board (the registry's entry, or a guessed Greenhouse / Lever / Ashby board name),
// and hand that posting's URL to the usual filler. The board is never opened.

/** Registry platforms whose postings auto apply fills (applyFormFor). */
const FILLABLE: CareerPlatform[] = ['greenhouse', 'lever', 'ashby', 'workday'];
/** Public boards a company name can be guessed on: one JSON request each, no account. */
const GUESSABLE: CareerPlatform[] = ['greenhouse', 'lever', 'ashby'];

export interface BoardJobInfo {
  companyName: string;
  title: string;
  locations: string[] | string;
}

export interface EmployerPosting {
  url: string;
  title: string;
  locations: string[];
  /** registry: the company's registered board; guess: a board found under its name. */
  via: 'registry' | 'guess';
}

/** "Northwind Bank, Inc." -> "northwindbank": company names compared without suffixes or spaces. */
export function companyKey(name: string): string {
  return (name ?? '').toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(?:inc|llc|l\.l\.c|ltd|limited|corp|corporation|co|company|plc|gmbh|lp|llp|the)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Title compared for "same posting": case, punctuation, Sr./Jr. ignored. `loose` also drops
 * parentheses and a trailing " - …" ("Software Engineer (Remote)", "Java Developer - Austin").
 */
export function titleKey(title: string, loose = false): string {
  let s = (title ?? '').toLowerCase()
    .replace(/\bsr\b\.?/g, 'senior').replace(/\bjr\b\.?/g, 'junior').replace(/&/g, ' and ');
  if (loose) s = s.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\s+[-–—|:]\s+.*$/, ' ');
  return s.replace(/[^a-z0-9]+/g, ' ').trim();
}

const CODE_BY_NAME = new Map(Object.entries(STATE_NAMES).map(([code, name]) => [name.toLowerCase(), code]));
const NOT_A_PLACE = /^(?:united states(?: of america)?|usa?|u s a?|remote|hybrid|on ?site|in office|anywhere|multiple locations|north america|americas)$/i;

/** Cities, states and "remote" named by a job's locations. */
export function places(locations: string[] | string): { remote: boolean; states: Set<string>; cities: Set<string> } {
  const list = Array.isArray(locations) ? locations : String(locations ?? '').split(/\s*;\s*|\s+\|\s+/);
  const out = { remote: false, states: new Set<string>(), cities: new Set<string>() };
  for (const loc of list) {
    if (/\bremote\b|\banywhere\b/i.test(loc)) out.remote = true;
    // Workday writes "TX-Dallas" / "US-NY-New York": split those prefixes too.
    const parts = loc.split(/\s*[,/()]\s*|\s+-\s+|\s*\|\s*/).flatMap((p) => (/^[A-Z]{2}-/.test(p.trim()) ? p.trim().split('-') : [p]));
    for (const raw of parts) {
      const part = raw.trim();
      if (!part || NOT_A_PLACE.test(part)) continue;
      const code = /^[A-Z]{2}$/.test(part) && STATE_NAMES[part] ? part : CODE_BY_NAME.get(part.toLowerCase());
      if (code) out.states.add(code);
      else if (!/\d/.test(part) && part.length > 2) out.cities.add(part.toLowerCase().replace(/^remote\s*[-:]?\s*/, ''));
    }
  }
  return out;
}

/**
 * Do two postings' locations agree? yes: a shared city, a shared state when one side names
 * no city, or both remote. state: only the state is shared, both naming different cities
 * (LinkedIn's "San Francisco, CA" for Wealthfront's "Palo Alto, CA", seen live). no: both name
 * places and none is shared. unknown: one side names none.
 */
export function placesAgree(a: string[] | string, b: string[] | string): 'yes' | 'state' | 'no' | 'unknown' {
  const x = places(a), y = places(b);
  if (x.remote && y.remote) return 'yes';
  for (const c of x.cities) if (y.cities.has(c)) return 'yes';
  const sharedState = [...x.states].some((s) => y.states.has(s));
  if (sharedState) return !x.cities.size || !y.cities.size ? 'yes' : 'state';
  const xNamed = x.cities.size + x.states.size > 0, yNamed = y.cities.size + y.states.size > 0;
  if (!xNamed || !yNamed) return 'unknown';
  return 'no';
}

/**
 * The employer posting that is the board job. Same title (exactly, after titleKey) and
 * locations that don't disagree (a shared state is enough at a registered company); on a
 * guessed board the city (or state, when one side names no city) must agree, because a guess
 * can be another company's board. A loose title match counts only when it is the only one.
 * Only postings auto apply can fill are considered.
 */
export function pickPosting(job: BoardJobInfo, postings: JobListing[], via: EmployerPosting['via']): EmployerPosting | null {
  const fillable = postings.filter((p) => p.applyUrl && applyFormFor(p.applyUrl));
  const ok = (p: JobListing) => {
    const agree = placesAgree(job.locations, p.locations ?? []);
    return via === 'guess' ? agree === 'yes' : agree !== 'no';
  };
  const best = (list: JobListing[]) => list.find((p) => placesAgree(job.locations, p.locations ?? []) === 'yes') ?? list[0];
  const exact = fillable.filter((p) => titleKey(p.title) === titleKey(job.title)).filter(ok);
  let hit = exact.length ? best(exact) : undefined;
  if (!hit) {
    const loose = fillable.filter((p) => titleKey(p.title, true) === titleKey(job.title, true)).filter(ok);
    if (loose.length === 1) hit = loose[0];
  }
  return hit ? { url: hit.applyUrl, title: hit.title, locations: hit.locations ?? [], via } : null;
}

/** The registered company a board job's employer name names, if its board is one auto apply fills. */
export function registeredEmployer(companyName: string): CompanyConfig | null {
  const key = companyKey(companyName);
  if (!key) return null;
  const hit = companyRegistry.list().find((c) => companyKey(c.name) === key || companyKey(c.slug) === key);
  return hit && FILLABLE.includes(hit.platform) ? hit : null;
}

/** Board names to try for an unregistered company: "Northwind Labs" -> northwindlabs, northwind-labs. */
export function boardNameGuesses(companyName: string): string[] {
  const words = (companyName ?? '').toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(?:inc|llc|ltd|limited|corp|corporation|co|company|plc|the)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length || words.join('').length < 3) return [];
  return [...new Set([words.join(''), words.join('-')])];
}

const TIMEOUT_MS = 15_000;
const get = async <T>(url: string): Promise<T | null> => {
  try {
    const res = await axios.get<T>(url, { timeout: TIMEOUT_MS, headers: { 'User-Agent': 'career-jobs-mcp/0.1' }, validateStatus: (s) => s === 200 });
    return res.data;
  } catch {
    return null; // no such board, or it failed: treated as "not found"
  }
};
const listing = (title: string, locations: (string | undefined)[], applyUrl: string): JobListing =>
  ({ id: applyUrl, companyName: '', title, locations: locations.filter((l): l is string => !!l), applyUrl, scrapedAt: '' } as JobListing);

/**
 * A public board's postings: title, locations and the URL of a form auto apply fills. One
 * light request (no descriptions, which made the Greenhouse scraper's download megabytes).
 * Greenhouse's `absolute_url` is often the company's own careers page, which is not the form,
 * so the job-boards URL is built from the board name and job id.
 */
async function listPublicBoard(platform: CareerPlatform, name: string): Promise<JobListing[] | null> {
  const n = encodeURIComponent(name);
  if (platform === 'greenhouse') {
    const d = await get<{ jobs?: Array<{ id: number; title: string; location?: { name?: string } }> }>(`https://boards-api.greenhouse.io/v1/boards/${n}/jobs`);
    return d?.jobs ? d.jobs.map((j) => listing(j.title, [j.location?.name], `https://job-boards.greenhouse.io/${n}/jobs/${j.id}`)) : null;
  }
  if (platform === 'lever') {
    const d = await get<Array<{ text: string; hostedUrl: string; categories?: { location?: string; allLocations?: string[] } }>>(`https://api.lever.co/v0/postings/${n}?mode=json`);
    return Array.isArray(d) ? d.map((j) => listing(j.text, j.categories?.allLocations?.length ? j.categories.allLocations : [j.categories?.location], j.hostedUrl)) : null;
  }
  if (platform === 'ashby') {
    const d = await get<{ jobs?: Array<{ title: string; location?: string; secondaryLocations?: Array<{ location?: string }>; jobUrl: string }> }>(`https://api.ashbyhq.com/posting-api/job-board/${n}`);
    return d?.jobs ? d.jobs.map((j) => listing(j.title, [j.location, ...(j.secondaryLocations ?? []).map((s) => s.location)], j.jobUrl)) : null;
  }
  return null;
}

// One run asks for the same company's board many times (several of its jobs on LinkedIn).
const boards = new Map<string, Promise<JobListing[] | null>>();

function fetchBoard(config: CompanyConfig, jobTitle?: string): Promise<JobListing[] | null> {
  const ident = config.platformIdentifier ?? config.slug;
  const key = `${config.platform}|${ident}|${config.platform === 'workday' ? jobTitle ?? '' : ''}`;
  if (!boards.has(key)) {
    boards.set(key, config.platform === 'workday'
      // Workday searches server-side by title; its scraper handles the tenant's session.
      ? companyRegistry.createScraper(config).fetchJobs({ jobTitle }).catch(() => null)
      : listPublicBoard(config.platform, ident));
  }
  return boards.get(key)!;
}

/**
 * An unregistered company's public board, by guessing its name on Greenhouse, Lever and Ashby.
 * The answer (including "none") is remembered for days, so a company is guessed once.
 */
async function guessedBoard(companyName: string): Promise<{ platform: CareerPlatform; name: string } | null> {
  const key = companyKey(companyName);
  const known = cacheManager.getEmployerBoard(key);
  if (known !== undefined) return known ? { platform: known.platform as CareerPlatform, name: known.ident } : null;
  for (const name of boardNameGuesses(companyName)) {
    for (const platform of GUESSABLE) {
      const list = await fetchBoard({ name: companyName, slug: name, careerUrl: '', platform, platformIdentifier: name });
      if (list?.length) { cacheManager.setEmployerBoard(key, { platform, ident: name }); return { platform, name }; }
    }
  }
  cacheManager.setEmployerBoard(key, null);
  return null;
}

/** Find the board job's posting on the employer's own board. The board itself is not contacted. */
export async function findEmployerPosting(job: BoardJobInfo): Promise<EmployerPosting | null> {
  const reg = registeredEmployer(job.companyName);
  if (reg) {
    let list = await fetchBoard(reg, job.title);
    let hit = list ? pickPosting(job, list, 'registry') : null;
    // Workday matched the title as typed; a board may add "(Remote)" or " - City".
    if (!hit && reg.platform === 'workday' && titleKey(job.title, true) !== titleKey(job.title)) {
      list = await fetchBoard(reg, titleKey(job.title, true));
      hit = list ? pickPosting(job, list, 'registry') : null;
    }
    // A registered company's board is its board: no guessing another one.
    return hit;
  }
  const guess = await guessedBoard(job.companyName);
  if (!guess) return null;
  const list = await fetchBoard({ name: job.companyName, slug: guess.name, careerUrl: '', platform: guess.platform, platformIdentifier: guess.name });
  return list ? pickPosting(job, list, 'guess') : null;
}

/**
 * The employer posting for one board job URL: from the cache when looked up before, else
 * looked up now (with the job's details, or the cached board job's) and remembered.
 */
export async function employerUrlFor(boardUrl: string, job?: BoardJobInfo): Promise<string | null> {
  const known = cacheManager.getEmployerLink(boardUrl);
  if (known !== undefined) return known;
  const info = job ?? (() => {
    const cached = cacheManager.getJobByApplyUrl(boardUrl);
    return cached ? { companyName: cached.companyName, title: cached.title, locations: cached.locations } : null;
  })();
  if (!info?.companyName || !info.title) return null;
  const hit = await findEmployerPosting(info).catch((err) => { logger.warn('Employer lookup failed', err); return null; });
  cacheManager.setEmployerLink(boardUrl, hit?.url ?? null);
  return hit?.url ?? null;
}

/** Look up many board jobs, a few at a time. Returns board URL -> employer posting URL (matches only). */
export async function matchBoardJobs(
  jobs: Array<{ url: string; company: string; title: string; locations: string[] | string }>,
  concurrency = 4,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const j = jobs[next++];
      const url = await employerUrlFor(j.url, { companyName: j.company, title: j.title, locations: j.locations }).catch(() => null);
      if (url) out.set(j.url, url);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  return out;
}
