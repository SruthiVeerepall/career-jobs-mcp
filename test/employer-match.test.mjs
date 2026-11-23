import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { companyKey, titleKey, placesAgree, pickPosting, registeredEmployer, boardNameGuesses } from '../dist/apply/employer-match.js';

// Board jobs are matched to the employer's own posting by company, title and location, so a
// LinkedIn job can be auto-filled without opening (or signing in to) LinkedIn.

test('company names compare without suffixes, spaces or punctuation', () => {
  assert.equal(companyKey('Northwind Bank, Inc.'), companyKey('northwind bank'));
  assert.equal(companyKey('Contoso & Co.'), companyKey('Contoso and'));
  assert.equal(companyKey('JPMorgan Chase'), companyKey('JPMorganChase'));
  assert.notEqual(companyKey('Northwind'), companyKey('Northwind Traders'));
});

test('titles: Sr./Jr. and punctuation ignored; loose also drops "(Remote)" and " - City"', () => {
  assert.equal(titleKey('Sr. Java Developer'), titleKey('Senior Java Developer'));
  assert.notEqual(titleKey('Java Developer (Remote)'), titleKey('Java Developer'));
  assert.equal(titleKey('Java Developer (Remote)', true), titleKey('Java Developer', true));
  assert.equal(titleKey('Senior Java Developer - Austin', true), titleKey('Sr Java Developer', true));
  assert.notEqual(titleKey('Software Engineer II'), titleKey('Software Engineer III'));
});

test('locations agree on a shared city, a state when one side names no city, or both remote', () => {
  assert.equal(placesAgree(['Denver, CO'], ['Denver, Colorado, United States']), 'yes');
  assert.equal(placesAgree(['Colorado, United States'], ['TX-Dallas']), 'no');
  assert.equal(placesAgree(['Texas, United States'], ['TX-Dallas']), 'yes', 'Workday prefix');
  assert.equal(placesAgree('Remote', ['Remote - US']), 'yes');
  assert.equal(placesAgree(['New York, NY'], ['San Francisco, CA']), 'no');
  assert.equal(placesAgree(['Austin, TX'], ['Remote - US']), 'unknown');
  assert.equal(placesAgree(['United States'], ['Denver, CO']), 'unknown');
  // Seen live: a board said "San Francisco, CA" for a posting in "Palo Alto, CA; New York City".
  assert.equal(placesAgree(['San Francisco, CA'], ['Palo Alto, CA', 'New York City, NY']), 'state');
});

test('a shared state is enough at a registered company, not on a guessed board', () => {
  const sf = { companyName: 'Fabrikam', title: 'Backend Engineer', locations: ['San Francisco, CA'] };
  const list = [{ id: '1', companyName: 'Fabrikam', title: 'Backend Engineer', locations: ['Palo Alto, CA'], applyUrl: 'https://jobs.lever.co/fabrikam/0a1b2c3d-1111-2222-3333-444455556666' }];
  assert.ok(pickPosting(sf, list, 'registry'));
  assert.equal(pickPosting(sf, list, 'guess'), null);
});

const job = { companyName: 'Northwind Labs', title: 'Sr. Java Developer', locations: ['Denver, CO'] };
const posting = (title, locations, applyUrl) => ({ id: title, companyName: 'Northwind Labs', title, locations, applyUrl });
const GH = (id) => `https://job-boards.greenhouse.io/northwindlabs/jobs/${id}`;

test("the employer's posting: same title, locations that don't disagree, a form auto apply fills", () => {
  const list = [
    posting('Senior Java Developer', ['Austin, TX'], GH(1)),
    posting('Senior Java Developer', ['Denver, CO'], GH(2)),
    posting('Senior Java Developer', ['Denver, CO'], 'https://northwind.example/careers/3'), // not a form auto apply fills
    posting('Java Developer', ['Denver, CO'], GH(4)),
  ];
  assert.equal(pickPosting(job, list, 'registry').url, GH(2), 'the Denver posting, not Austin');
  assert.equal(pickPosting(job, list.slice(0, 1), 'registry'), null, 'Austin is a different posting');
  assert.equal(pickPosting({ ...job, locations: ['United States'] }, list.slice(0, 1), 'registry').url, GH(1), 'no place to compare: the registered company is trusted');
});

test('a guessed board needs agreeing locations; a loose title match counts only when it is the only one', () => {
  const list = [posting('Senior Java Developer (Hybrid)', ['Denver, CO'], GH(5))];
  assert.equal(pickPosting(job, list, 'guess').url, GH(5));
  assert.equal(pickPosting({ ...job, locations: ['United States'] }, list, 'guess'), null, 'a guess with no place to compare is not trusted');
  const two = [...list, posting('Senior Java Developer - Platform', ['Denver, CO'], GH(6))];
  assert.equal(pickPosting(job, two, 'guess'), null, 'two loose matches: ambiguous, so none');
});

test('registered employers are found by name; only boards auto apply fills count', () => {
  const src = fs.readFileSync(new URL('../src/scrapers/company-registry.ts', import.meta.url), 'utf8');
  const gh = src.match(/\{ name: "([^"]+)", slug: '([^']+)', careerUrl: "[^"]*", platform: 'greenhouse'/);
  assert.ok(gh, 'the registry has a Greenhouse company');
  assert.equal(registeredEmployer(`${gh[1]}, Inc.`)?.slug, gh[2]);
  const other = src.match(/\{ name: "([^"]+)", slug: '[^']+', careerUrl: "[^"]*", platform: 'eightfold'/);
  if (other) assert.equal(registeredEmployer(other[1]), null, 'Eightfold forms are not filled');
  assert.equal(registeredEmployer(''), null);
});

test('board name guesses for unregistered companies', () => {
  assert.deepEqual(boardNameGuesses('Northwind Labs, Inc.'), ['northwindlabs', 'northwind-labs']);
  assert.deepEqual(boardNameGuesses('Contoso'), ['contoso']);
  assert.deepEqual(boardNameGuesses('AB'), []);
});

test("the board page sends Auto apply to the export's employer link, and hides it when there is none", () => {
  const html = fs.readFileSync(new URL('../templates/job-quest.html', import.meta.url), 'utf8');
  const grab = (name) => html.match(new RegExp(`var ${name} = (\\/.+\\/i);`))[1];
  const fns = html.match(/function isForm[\s\S]*?function isGh\(j\)\{[^\n]*\}/)[0];
  const { autoUrl, isGh } = new Function(
    ['GH_JOB', 'ASHBY_JOB', 'LEVER_JOB', 'WORKABLE_JOB', 'WORKDAY_JOB', 'EIGHTFOLD_JOB', 'BOARD_JOB'].map((n) => `var ${n} = ${grab(n)};`).join('\n')
    + fns + '\nreturn { autoUrl, isGh };')();
  const li = 'https://www.linkedin.com/jobs/view/4493100463/';
  assert.equal(autoUrl({ url: li, auto: GH(7) }), GH(7), 'matched: straight to the employer form');
  assert.equal(isGh({ url: li, auto: '' }), false, 'no match: no Auto apply button');
  assert.equal(autoUrl({ url: li }), li, 'instant search (no auto field): looked up on click');
  assert.equal(autoUrl({ url: GH(8), auto: GH(8) }), GH(8));
  assert.equal(isGh({ url: 'https://evil.example/x', auto: 'https://evil.example/x' }), false);
});

test("a Greenhouse company's own careers-page link (…?gh_jid=N) maps to its Greenhouse job", async () => {
  const { greenhouseJobFor } = await import('../dist/apply/employer-match.js');
  const src = fs.readFileSync(new URL('../src/scrapers/company-registry.ts', import.meta.url), 'utf8');
  const [, name, slug, ident] = src.match(/\{ name: "([^"]+)", slug: '([^']+)', careerUrl: "[^"]*", platform: 'greenhouse', platformIdentifier: "([^"]+)" \}/);
  assert.equal(greenhouseJobFor(`https://careers.example.com/jobs/5008299101?gh_jid=5008299101`, name), `https://job-boards.greenhouse.io/${ident}/jobs/5008299101`, slug);
  assert.equal(greenhouseJobFor('https://careers.example.com/apply?gh_jid=8367097&utm=x', name), `https://job-boards.greenhouse.io/${ident}/jobs/8367097`);
  assert.equal(greenhouseJobFor('https://careers.example.com/jobs/5008299101', name), null, 'no gh_jid');
  assert.equal(greenhouseJobFor('https://careers.example.com/jobs?gh_jid=5008299101', 'Not A Registered Company Ltd'), null);
});
