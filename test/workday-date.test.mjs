import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkdayDate } from '../dist/scrapers/platforms/workday.js';

// Workday resolves only to the calendar day, so each relative string is anchored to
// the START of that day rather than to the scrape instant. That keeps the timestamp
// stable across reads of the 24h cache instead of rejuvenating on every hit.
const startOfDaysAgo = (n, now) => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.getTime();
};

// A fixed mid-afternoon instant, so "start of day" is unambiguously in the past.
const NOW = new Date(2026, 7, 2, 15, 30, 0).getTime();

test('parseWorkdayDate anchors "Posted Today" to the start of today', () => {
  const iso = parseWorkdayDate('Posted Today', NOW);
  assert.equal(new Date(iso).getTime(), startOfDaysAgo(0, NOW));
});

test('parseWorkdayDate anchors "Posted Yesterday" to the start of yesterday', () => {
  const iso = parseWorkdayDate('Posted Yesterday', NOW);
  assert.equal(new Date(iso).getTime(), startOfDaysAgo(1, NOW));
});

test('parseWorkdayDate handles "Posted N Days Ago"', () => {
  const iso = parseWorkdayDate('Posted 4 Days Ago', NOW);
  assert.equal(new Date(iso).getTime(), startOfDaysAgo(4, NOW));
});

test('parseWorkdayDate handles "Posted 30+ Days Ago"', () => {
  const iso = parseWorkdayDate('Posted 30+ Days Ago', NOW);
  assert.equal(new Date(iso).getTime(), startOfDaysAgo(30, NOW));
});

test('parseWorkdayDate returns undefined for missing input', () => {
  assert.equal(parseWorkdayDate(undefined), undefined);
});

test('parseWorkdayDate returns the raw string for unrecognized formats', () => {
  assert.equal(parseWorkdayDate('Some weird format'), 'Some weird format');
});

// Regression: "Posted Yesterday" used to be stamped `now - 24h`, landing exactly on the
// 24h boundary, and was then compared with `>` microseconds later — so it was dropped by
// a timing race rather than by a decision. Midnight-anchored it is deterministically
// 24-48h old: outside a 24h window, inside a 3-day one.
test('a "Posted Yesterday" job is deterministically outside 24h but inside 3 days', () => {
  const posted = new Date(parseWorkdayDate('Posted Yesterday', NOW)).getTime();
  const age = NOW - posted;
  assert.ok(age > 86_400_000, 'older than 24h');
  assert.ok(age < 3 * 86_400_000, 'newer than 3 days');
});

// Regression: a "Posted Today" job read back from the 24h cache must not still look
// 0 hours old. Anchored to midnight, its age grows with real time.
test('"Posted Today" does not rejuvenate when read back hours later', () => {
  const posted = new Date(parseWorkdayDate('Posted Today', NOW)).getTime();
  const twentyHoursLater = NOW + 20 * 3_600_000;
  assert.ok(twentyHoursLater - posted > 20 * 3_600_000, 'age must grow with wall time');
});
