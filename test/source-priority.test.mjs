import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bySourceThenScore, companySitesFirst, crossSourceKey, sourceOf } from '../dist/utils/source-priority.js';

test('the same opening is recognised across a company site and a board', () => {
  // LinkedIn spells the employer differently from the registry.
  assert.equal(
    crossSourceKey('JPMorganChase', 'Software Engineer III - Java/Spring Boot'),
    crossSourceKey('JPMorgan Chase', 'Software Engineer III – Java / Spring Boot'),
  );
  assert.equal(crossSourceKey('Capital One', 'Full-Stack Engineer 4'), crossSourceKey('Capital One, Inc.', 'Full Stack Engineer 4'));
  assert.equal(crossSourceKey('Stripe (via LinkedIn)', 'Backend Engineer'), crossSourceKey('Stripe', 'Backend Engineer'));
});

test('different openings stay distinct', () => {
  assert.notEqual(crossSourceKey('Capital One', 'Full-Stack Engineer 4'), crossSourceKey('Capital One', 'Full-Stack Engineer 3'));
  assert.notEqual(crossSourceKey('Stripe', 'Backend Engineer'), crossSourceKey('Square', 'Backend Engineer'));
});

test('company sites sort before job boards even when a board job scores higher', () => {
  const jobs = [
    { title: 'Java Full Stack (Spring Boot, Kafka, AWS)', source: 'job-board', score: 34 },
    { title: 'Software Engineer II', source: 'company-site', score: 0 },
    { title: 'Java Developer', source: 'company-site', score: 10 },
    { title: 'Java Developer', source: 'job-board', score: 10 },
  ];
  assert.deepEqual(
    [...jobs].sort(bySourceThenScore).map((j) => `${j.source}:${j.score}`),
    ['company-site:10', 'company-site:0', 'job-board:34', 'job-board:10'],
  );
});

test('scrape results are reordered company sites first', () => {
  const order = companySitesFirst([{ company: 'LinkedIn' }, { company: 'Stripe' }, { company: 'BuiltIn.com' }, { company: 'Google' }]).map((r) => r.company);
  assert.deepEqual(order.slice(0, 2).sort(), ['Google', 'Stripe']);
  assert.equal(sourceOf('LinkedIn'), 'job-board');
  assert.equal(sourceOf('Stripe'), 'company-site');
});
