import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBuiltInAgo } from '../dist/scrapers/platforms/builtin.js';

const NOW = new Date(2026, 7, 2, 15, 30, 0).getTime();
const startOfDaysAgo = (n) => {
  const d = new Date(NOW);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.getTime();
};
const startOfDaysAgoIso = (n) => new Date(startOfDaysAgo(n)).toISOString();

test('hour and minute strings stay relative to now', () => {
  assert.equal(new Date(parseBuiltInAgo('4 Hours Ago', NOW)).getTime(), NOW - 4 * 3_600_000);
  assert.equal(new Date(parseBuiltInAgo('56 Minutes Ago', NOW)).getTime(), NOW);
});

test('day-granular strings anchor to the start of that calendar day', () => {
  assert.equal(new Date(parseBuiltInAgo('Today', NOW)).getTime(), startOfDaysAgo(0));
  assert.equal(new Date(parseBuiltInAgo('Yesterday', NOW)).getTime(), startOfDaysAgo(1));
  assert.equal(new Date(parseBuiltInAgo('3 Days Ago', NOW)).getTime(), startOfDaysAgo(3));
  assert.equal(new Date(parseBuiltInAgo('2 Weeks Ago', NOW)).getTime(), startOfDaysAgo(14));
});

// Observed live on builtin.com: "Reposted 14 Hours Ago", "Reposted Yesterday".
// The prefix must not break parsing — the timestamp is the republish time.
test('the "Reposted" prefix parses to the same timestamp as the bare form', () => {
  assert.equal(parseBuiltInAgo('Reposted 14 Hours Ago', NOW), parseBuiltInAgo('14 Hours Ago', NOW));
  assert.equal(parseBuiltInAgo('Reposted Yesterday', NOW), parseBuiltInAgo('Yesterday', NOW));
});

// Regression: BuiltIn words singular quantities. Matching only digits left "An Hour Ago"
// unparseable, and because unparseable now means EXCLUDED, the freshest jobs on the board
// were being silently dropped — found by re-checking live results against the source.
test('worded singular quantities parse as 1 unit', () => {
  assert.equal(parseBuiltInAgo('An Hour Ago', NOW), parseBuiltInAgo('1 Hour Ago', NOW));
  assert.equal(parseBuiltInAgo('A Day Ago', NOW), parseBuiltInAgo('1 Day Ago', NOW));
  assert.equal(parseBuiltInAgo('A Week Ago', NOW), parseBuiltInAgo('1 Week Ago', NOW));
  assert.equal(parseBuiltInAgo('Reposted An Hour Ago', NOW), parseBuiltInAgo('1 Hour Ago', NOW));
});

test('an "An Hour Ago" job is inside a 24h window rather than dropped as undated', () => {
  const iso = parseBuiltInAgo('An Hour Ago', NOW);
  assert.ok(iso, 'must parse');
  assert.equal(NOW - new Date(iso).getTime(), 3_600_000);
});

test('the "30+ Days Ago" form parses rather than falling through as undated', () => {
  assert.equal(parseBuiltInAgo('30+ Days Ago', NOW), startOfDaysAgoIso(30));
});

test('unrecognized and empty text yield undefined so the strict window excludes them', () => {
  assert.equal(parseBuiltInAgo('', NOW), undefined);
  assert.equal(parseBuiltInAgo(undefined, NOW), undefined);
  assert.equal(parseBuiltInAgo('Posted recently', NOW), undefined);
});

// Regression: "Today" used to be stamped as `now`, so a job read back from the 24h
// cache still looked 0 hours old.
test('"Today" does not rejuvenate when read back hours later', () => {
  const posted = new Date(parseBuiltInAgo('Today', NOW)).getTime();
  const later = NOW + 20 * 3_600_000;
  assert.ok(later - posted > 20 * 3_600_000, 'age must grow with wall time');
});
