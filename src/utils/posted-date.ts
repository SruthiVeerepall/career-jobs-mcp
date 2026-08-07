// Shared posting-date parsing and window checks.
//
// Two rules hold everywhere a date window is applied:
//
//  1. STRICT. A job whose posting date is missing or unparseable is EXCLUDED when a
//     window is requested. We cannot prove it is recent, and CLAUDE.md rule #1 says
//     never return jobs older than the window. Callers that want to report the drop
//     count use `countUndated()`.
//
//  2. ABSOLUTE. Relative strings ("Posted Today", "3 Days Ago") are anchored to the
//     START of that calendar day, not to `Date.now()` at scrape time. A scrape-relative
//     stamp silently rejuvenates on every cache read: a job cached at 09:00 as "now"
//     still reads as 0h old when the cache is hit 20h later. Anchoring to midnight
//     makes the timestamp stable for the whole 24h cache TTL, and picks the earliest
//     instant the day could mean, which keeps the filter conservative.

import type { JobListing, SearchFilters } from '../types.js';

export const DAY_MS = 86_400_000;

export const POSTED_SINCE_MS: Record<NonNullable<SearchFilters['postedSince']>, number> = {
  today: DAY_MS,
  week: 7 * DAY_MS,
  month: 30 * DAY_MS,
};

/** Parse a posting date to epoch ms. Returns null for missing/unparseable values. */
export function parsePostedDate(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * True when the job is provably within the window.
 * Missing/unparseable date => false (see rule 1 above).
 */
export function withinPostedWindow(
  postedDate: string | undefined | null,
  postedSince: SearchFilters['postedSince'],
  now = Date.now(),
): boolean {
  if (!postedSince) return true;
  const posted = parsePostedDate(postedDate);
  if (posted === null) return false;
  return now - posted <= POSTED_SINCE_MS[postedSince];
}

/**
 * Lenient variant for use INSIDE scrapers, whose output is what gets cached.
 * Undated jobs are kept so the cache stays a faithful copy of the board — a
 * `postedSince: 'today'` scrape must not permanently strip them from the cache that
 * a later `'week'` or unfiltered request will read. The strict rule is applied once,
 * at the orchestrator response boundary, after caching.
 */
export function withinPostedWindowOrUndated(
  postedDate: string | undefined | null,
  postedSince: SearchFilters['postedSince'],
  now = Date.now(),
): boolean {
  if (!postedSince || parsePostedDate(postedDate) === null) return true;
  return withinPostedWindow(postedDate, postedSince, now);
}

/**
 * Window check for a whole job, honouring `windowVerified`.
 *
 * A source that already filtered by the requested window using its real timestamp knows
 * the age better than we can reconstruct it — LinkedIn publishes only a date, so our
 * reconstruction is up to 24h pessimistic. Re-applying the client-side cut there discards
 * correct results, so the upstream answer wins.
 */
export function jobWithinWindow(
  job: Pick<JobListing, 'postedDate' | 'windowVerified'>,
  postedSince: SearchFilters['postedSince'],
  now = Date.now(),
): boolean {
  if (!postedSince) return true;
  if (job.windowVerified) return true;
  return withinPostedWindow(job.postedDate, postedSince, now);
}

/**
 * How many jobs a window filter would drop purely for lacking a usable date.
 * Jobs the source already verified are not drops, so they are not counted.
 */
export function countUndated(jobs: JobListing[]): number {
  return jobs.reduce(
    (n, j) => (!j.windowVerified && parsePostedDate(j.postedDate) === null ? n + 1 : n),
    0,
  );
}

/**
 * ISO timestamp for local midnight `n` days ago — the anchor for day-granular
 * relative strings. `n = 0` is today, `1` is yesterday.
 */
export function startOfDaysAgo(n: number, now = Date.now()): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}
