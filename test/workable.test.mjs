import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workableFormUrl, _private } from '../dist/apply/workable.js';
import { applyFormFor } from '../dist/apply/platforms.js';
import { autoApplyLink, parseAutoApplyLink } from '../dist/apply/protocol.js';

test('Workable board and company-page URLs map to the page holding the form; other hosts do not', () => {
  // The Workable job board (what the workable-jobs scraper returns): the slug after the id is dropped.
  assert.equal(workableFormUrl('https://jobs.workable.com/view/fomAmsTZKqLrECgi2haMeT/remote-software-engineer-in-united-states-at-acme'),
    'https://jobs.workable.com/view/fomAmsTZKqLrECgi2haMeT');
  assert.equal(workableFormUrl('https://jobs.workable.com/view/747efea0-09c7-4d5a-8703-e117901d7041'),
    'https://jobs.workable.com/view/747efea0-09c7-4d5a-8703-e117901d7041');
  // A company's own Workable careers page: always the /apply/ form.
  assert.equal(workableFormUrl('https://apply.workable.com/acme/j/DB4D7C0EC8/'), 'https://apply.workable.com/acme/j/DB4D7C0EC8/apply/');
  assert.equal(workableFormUrl('https://apply.workable.com/acme/j/db4d7c0ec8/apply?utm_source=x'), 'https://apply.workable.com/acme/j/DB4D7C0EC8/apply/');
  assert.equal(workableFormUrl('https://acme.workable.com/j/DB4D7C0EC8'), 'https://apply.workable.com/acme/j/DB4D7C0EC8/apply/');

  assert.equal(workableFormUrl('https://jobs.workable.com/company/gUoUNid2RSFNTLynjVyFJb/jobs-at-acme'), null); // a company, not a job
  assert.equal(workableFormUrl('https://apply.workable.com/acme/'), null);                                       // a board, not a job
  assert.equal(workableFormUrl('https://www.workable.com/j/DB4D7C0EC8'), null);
  assert.equal(workableFormUrl('http://apply.workable.com/acme/j/DB4D7C0EC8/'), null);                          // https only
  assert.equal(workableFormUrl('https://evil.example/apply.workable.com/acme/j/DB4D7C0EC8/'), null);
  assert.equal(workableFormUrl('https://apply.workable.com.evil.example/acme/j/DB4D7C0EC8/'), null);
});

test('Workable goes through the one platform lookup, so links, the sheet and the board offer it', () => {
  const url = 'https://jobs.workable.com/view/fomAmsTZKqLrECgi2haMeT/remote-software-engineer';
  assert.equal(applyFormFor(url).platform, 'workable');
  assert.equal(applyFormFor('https://apply.workable.com/acme/j/DB4D7C0EC8/').platform, 'workable');
  const link = autoApplyLink(url);
  assert.ok(link.startsWith('jobquest://apply?url='));
  assert.equal(parseAutoApplyLink(link), url);
});

test('a profile link goes only into questions that ask for the profile', () => {
  const asks = (label) => _private.wantsProfileLink(label.toLowerCase());
  // Real Workable labels.
  assert.equal(asks('Link to Github'), true);
  assert.equal(asks('Please provide a link to your LinkedIn profile, if available:'), true);
  assert.equal(asks('Paste the full web address (URL) of your GitHub profile or portfolio, beginning with https, for example, https://github.com/yourname. If you do not have one, enter None'), true);
  assert.equal(asks('Share 2–3 of your open-source contributions with links (GitHub PRs, issues, or projects)'), false);
  assert.equal(asks('Describe a GitHub project you are proud of'), false);
});

test('Workable YES / NO options are matched by the shared answers', async () => {
  const { chooseOption, classifyQuestion } = await import('../dist/apply/standard-answers.js');
  const std = { workAuthorized: 'yes', sponsorship: 'no' };
  const answer = (q, opts) => chooseOption(classifyQuestion(q), std, opts);
  assert.equal(answer('Are you currently authorized to work in the US for any employer?', ['YES', 'NO']), 'YES');
  assert.equal(answer('Do you require any kind of visa sponsorship now or in the future?', ['YES', 'NO']), 'NO');
  // Two "No" options that differ by citizenship: not ours to pick.
  assert.equal(answer('Do you now, or will you in the future, require immigration sponsorship for work authorization (e.g., H-1B)?',
    ["No - I'm a US Citizen", "No - I'm a US Resident / Green Card", 'Yes - I will need Work Authorization']), null);
  assert.equal(_private.matchAnswer('yes', ['YES', 'NO']), 'YES');
});
