import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ashbyFormUrl, _private } from '../dist/apply/ashby.js';
import { applyFormFor } from '../dist/apply/platforms.js';
import { autoApplyLink, parseAutoApplyLink } from '../dist/apply/protocol.js';
import { classifyDerived, derivedText } from '../dist/apply/standard-answers.js';

const ID = '6e717b06-6613-42ad-a1ee-f852a305fa37';

test('Ashby job URLs map to the application form; other hosts do not', () => {
  assert.equal(ashbyFormUrl(`https://jobs.ashbyhq.com/ramp/${ID}`), `https://jobs.ashbyhq.com/ramp/${ID}/application`);
  assert.equal(ashbyFormUrl(`https://jobs.ashbyhq.com/ramp/${ID}/application?utm_source=x`), `https://jobs.ashbyhq.com/ramp/${ID}/application`);
  assert.equal(ashbyFormUrl(`https://jobs.ashbyhq.com/ramp`), null);                 // board, not a job
  assert.equal(ashbyFormUrl(`https://jobs.ashbyhq.com/ramp/not-a-job-id`), null);
  assert.equal(ashbyFormUrl(`https://evil.example/jobs.ashbyhq.com/ramp/${ID}`), null);
  assert.equal(ashbyFormUrl(`http://jobs.ashbyhq.com/ramp/${ID}`), null);            // https only
});

test('one platform lookup serves every entry point', () => {
  assert.equal(applyFormFor(`https://jobs.ashbyhq.com/ramp/${ID}`).platform, 'ashby');
  assert.equal(applyFormFor('https://job-boards.greenhouse.io/acme/jobs/42').platform, 'greenhouse');
  assert.equal(applyFormFor('https://jobs.smartrecruiters.com/Acme/123'), null);
  const link = autoApplyLink(`https://jobs.ashbyhq.com/ramp/${ID}/application`);
  assert.ok(link.startsWith('jobquest://apply?url='));
  assert.equal(parseAutoApplyLink(link), `https://jobs.ashbyhq.com/ramp/${ID}/application`);
  assert.throws(() => parseAutoApplyLink('jobquest://apply?url=' + encodeURIComponent('https://jobs.smartrecruiters.com/Acme/1')), /Greenhouse, Ashby, Lever, Workable, Workday and Eightfold/);
});

test('current employer and title come from the latest job on the résumé', () => {
  const f = { inUS: true, company: 'Northwind Bank', title: 'Full Stack Developer' };
  assert.equal(classifyDerived('Who is your current or previous employer?'), 'currentEmployer');
  assert.equal(classifyDerived('Current Company'), 'currentEmployer');
  assert.equal(classifyDerived('What is your current or previous job title?'), 'currentTitle');
  assert.equal(derivedText('currentEmployer', f), 'Northwind Bank');
  assert.equal(derivedText('currentTitle', f), 'Full Stack Developer');
});

test('free-text answers pick the matching single-choice option', () => {
  assert.equal(_private.matchAnswer('LinkedIn', ['Job board', 'LinkedIn', 'Referral']), 'LinkedIn');
  assert.equal(_private.matchAnswer('yes', ['Yes, I am', 'No']), 'Yes, I am');
  assert.equal(_private.matchAnswer('Twitter', ['LinkedIn', 'Referral']), null);
});
