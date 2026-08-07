import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePostedDate,
  withinPostedWindow,
  withinPostedWindowOrUndated,
  jobWithinWindow,
  countUndated,
  startOfDaysAgo,
} from '../dist/utils/posted-date.js';

const DAY = 86_400_000;
const NOW = new Date(2026, 7, 2, 15, 30, 0).getTime();
const iso = (ms) => new Date(ms).toISOString();

test('parsePostedDate returns null for missing and unparseable values', () => {
  assert.equal(parsePostedDate(undefined), null);
  assert.equal(parsePostedDate(null), null);
  assert.equal(parsePostedDate(''), null);
  assert.equal(parsePostedDate('Posted recently'), null);
  assert.equal(parsePostedDate('2026-08-02T00:00:00.000Z'), Date.parse('2026-08-02T00:00:00.000Z'));
});

// The core regression: an undated job used to bypass the window check entirely and be
// returned as if it were fresh. It must now be excluded.
test('withinPostedWindow excludes jobs with no usable date', () => {
  assert.equal(withinPostedWindow(undefined, 'today', NOW), false);
  assert.equal(withinPostedWindow('Posted recently', 'today', NOW), false);
  assert.equal(withinPostedWindow(undefined, 'week', NOW), false);
  assert.equal(withinPostedWindow(undefined, 'month', NOW), false);
});

test('withinPostedWindow keeps undated jobs when no window is requested', () => {
  assert.equal(withinPostedWindow(undefined, undefined, NOW), true);
});

test('withinPostedWindow enforces each window boundary', () => {
  assert.equal(withinPostedWindow(iso(NOW - 2 * 3_600_000), 'today', NOW), true);
  assert.equal(withinPostedWindow(iso(NOW - 25 * 3_600_000), 'today', NOW), false);
  assert.equal(withinPostedWindow(iso(NOW - 6 * DAY), 'week', NOW), true);
  assert.equal(withinPostedWindow(iso(NOW - 8 * DAY), 'week', NOW), false);
  assert.equal(withinPostedWindow(iso(NOW - 29 * DAY), 'month', NOW), true);
  assert.equal(withinPostedWindow(iso(NOW - 31 * DAY), 'month', NOW), false);
});

// Scraper output is what gets cached, so the in-scraper check keeps undated jobs —
// a 'today' scrape must not permanently strip them from the cache that a later
// 'week' or unfiltered request reads.
test('withinPostedWindowOrUndated keeps undated jobs but still drops stale dated ones', () => {
  assert.equal(withinPostedWindowOrUndated(undefined, 'today', NOW), true);
  assert.equal(withinPostedWindowOrUndated('Posted recently', 'today', NOW), true);
  assert.equal(withinPostedWindowOrUndated(iso(NOW - 25 * 3_600_000), 'today', NOW), false);
  assert.equal(withinPostedWindowOrUndated(iso(NOW - 2 * 3_600_000), 'today', NOW), true);
});

// Regression for the LinkedIn zero-results bug.
//
// LinkedIn filters server-side with f_TPR against the true posting timestamp, but the
// guest HTML exposes only a DATE. A job posted at 23:00 yesterday is ~2h old and inside
// LinkedIn's 24h window, yet reconstructing from the bare date puts it at UTC midnight —
// up to 48h — so the client-side cut discarded it. The share of the window falling on
// "yesterday" grows as the UTC hour drops, so running in the US evening (early UTC) threw
// away nearly every LinkedIn result. `windowVerified` makes the upstream answer win.
test('a windowVerified job survives even when its reconstructed date looks too old', () => {
  const yesterday = new Date(startOfDaysAgo(1, NOW)).toISOString();
  // Same job, same date, only the flag differs.
  assert.equal(jobWithinWindow({ postedDate: yesterday }, 'today', NOW), false);
  assert.equal(jobWithinWindow({ postedDate: yesterday, windowVerified: true }, 'today', NOW), true);
});

test('windowVerified also covers a job the source published with no date at all', () => {
  assert.equal(jobWithinWindow({ postedDate: undefined }, 'today', NOW), false);
  assert.equal(jobWithinWindow({ postedDate: undefined, windowVerified: true }, 'today', NOW), true);
});

test('windowVerified is inert when no window was requested', () => {
  assert.equal(jobWithinWindow({ postedDate: undefined }, undefined, NOW), true);
});

test('unverified jobs still get the strict treatment through jobWithinWindow', () => {
  assert.equal(jobWithinWindow({ postedDate: iso(NOW - 2 * 3_600_000) }, 'today', NOW), true);
  assert.equal(jobWithinWindow({ postedDate: iso(NOW - 30 * 3_600_000) }, 'today', NOW), false);
  assert.equal(jobWithinWindow({ postedDate: 'garbage' }, 'today', NOW), false);
});

test('countUndated does not count jobs the source already verified', () => {
  assert.equal(
    countUndated([
      { postedDate: undefined },
      { postedDate: undefined, windowVerified: true },
      { postedDate: 'not a date', windowVerified: true },
    ]),
    1,
  );
});

test('countUndated counts only jobs lacking a usable date', () => {
  assert.equal(
    countUndated([
      { postedDate: iso(NOW) },
      { postedDate: undefined },
      { postedDate: 'not a date' },
      { postedDate: iso(NOW - DAY) },
    ]),
    2,
  );
});

test('startOfDaysAgo returns local midnight n days back', () => {
  const today = new Date(startOfDaysAgo(0, NOW));
  assert.equal(today.getHours(), 0);
  assert.equal(today.getMinutes(), 0);
  assert.equal(today.getDate(), new Date(NOW).getDate());

  // NOW is Aug 2, so this must roll back across the month boundary to Jul 30.
  const threeAgo = new Date(startOfDaysAgo(3, NOW));
  assert.equal(threeAgo.getMonth(), 6, 'July');
  assert.equal(threeAgo.getDate(), 30);
  assert.equal(threeAgo.getHours(), 0);
});
