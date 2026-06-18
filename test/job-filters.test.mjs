import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OVER_5YR,
  CLEARANCE,
  isUSJob,
  resumeScore,
  matchesProfile,
  RESUME_MATCH_THRESHOLD,
} from '../dist/utils/job-filters.js';

test('OVER_5YR excludes >5yr titles per CLAUDE.md rule #2', () => {
  for (const title of [
    'Principal Software Engineer',
    'Staff Engineer',
    'Engineering Manager',
    'Lead Java Developer',
    'Director of Engineering',
    'VP of Engineering',
    'Distinguished Engineer',
    'Head of Platform',
  ]) {
    assert.equal(OVER_5YR.test(title), true, `expected "${title}" to be excluded`);
  }
});

test('OVER_5YR keeps Senior and junior-to-mid titles', () => {
  for (const title of [
    'Senior Java Full Stack Developer',
    'Java Developer',
    'Software Engineer II',
    'Associate Software Engineer',
  ]) {
    assert.equal(OVER_5YR.test(title), false, `expected "${title}" to be kept`);
  }
});

test('CLEARANCE excludes jobs requiring security clearance / citizenship', () => {
  for (const title of [
    'Java Developer (Top Secret Clearance Required)',
    'Software Engineer - active clearance required',
    'Full Stack Developer - US Citizen only',
    'Backend Engineer - TS/SCI required',
  ]) {
    assert.equal(CLEARANCE.test(title), true, `expected "${title}" to be excluded`);
  }
});

test('CLEARANCE allows jobs with no clearance mention', () => {
  assert.equal(CLEARANCE.test('Java Full Stack Developer'), false);
});

test('isUSJob accepts US states, USA, and remote (non-international)', () => {
  assert.equal(isUSJob(['Austin, TX']), true);
  assert.equal(isUSJob(['New York, NY, USA']), true);
  assert.equal(isUSJob(['Remote']), true);
  assert.equal(isUSJob([]), true);
  assert.equal(isUSJob(undefined), true);
});

test('isUSJob rejects non-US locations', () => {
  assert.equal(isUSJob(['Toronto, ON']), false);
  assert.equal(isUSJob(['London, United Kingdom']), false);
  assert.equal(isUSJob(['Bangalore, India']), false);
  assert.equal(isUSJob(['Remote - Germany']), false);
});

test('resumeScore weighs CORE/HIGH/MID/LOW keywords per CLAUDE.md rule #6', () => {
  assert.equal(resumeScore('Senior Java Full Stack Developer'), 17); // java(10) + full stack(7)
  assert.equal(resumeScore('Java Developer with Spring Boot and AWS'), 32); // java(10) + spring boot(10) + spring(7) + aws(5)
  assert.equal(resumeScore('Software Engineer'), 0);
});

test('matchesProfile applies the >=5 threshold and target-role fallback', () => {
  // score 17 >= threshold -> included
  assert.equal(matchesProfile('Senior Java Full Stack Developer'), true);
  // score 0 but recognized target role title -> included
  assert.equal(matchesProfile('Software Engineer'), true);
  assert.equal(matchesProfile('Backend Developer'), true);
  // score 0 and not a target role -> excluded
  assert.equal(matchesProfile('Data Scientist'), false);
  assert.equal(matchesProfile('Machine Learning Engineer'), false);
});

test('RESUME_MATCH_THRESHOLD is 5 (60% match per CLAUDE.md)', () => {
  assert.equal(RESUME_MATCH_THRESHOLD, 5);
});
