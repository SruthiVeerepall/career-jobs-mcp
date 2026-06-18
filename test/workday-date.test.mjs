import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkdayDate } from '../dist/scrapers/platforms/workday.js';

const DAY = 86_400_000;

test('parseWorkdayDate handles "Posted Today"', () => {
  const iso = parseWorkdayDate('Posted Today');
  assert.ok(iso, 'should return an ISO string');
  assert.ok(Math.abs(Date.now() - new Date(iso).getTime()) < 5000);
});

test('parseWorkdayDate handles "Posted Yesterday"', () => {
  const iso = parseWorkdayDate('Posted Yesterday');
  const expected = Date.now() - DAY;
  assert.ok(Math.abs(expected - new Date(iso).getTime()) < 5000);
});

test('parseWorkdayDate handles "Posted N Days Ago"', () => {
  const iso = parseWorkdayDate('Posted 4 Days Ago');
  const expected = Date.now() - 4 * DAY;
  assert.ok(Math.abs(expected - new Date(iso).getTime()) < 5000);
});

test('parseWorkdayDate handles "Posted 30+ Days Ago"', () => {
  const iso = parseWorkdayDate('Posted 30+ Days Ago');
  const expected = Date.now() - 30 * DAY;
  assert.ok(Math.abs(expected - new Date(iso).getTime()) < 5000);
});

test('parseWorkdayDate returns undefined for missing input', () => {
  assert.equal(parseWorkdayDate(undefined), undefined);
});

test('parseWorkdayDate returns the raw string for unrecognized formats', () => {
  assert.equal(parseWorkdayDate('Some weird format'), 'Some weird format');
});
