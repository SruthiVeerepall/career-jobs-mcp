import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boardJobFor, followBoardApply, unwrapRedirect, boardMessage } from '../dist/apply/board-link.js';
import { acceptsAutoApply, autoApplyLink, parseAutoApplyLink } from '../dist/apply/protocol.js';
import { getBrowser, closeSharedBrowser } from '../dist/utils/browser.js';

after(() => closeSharedBrowser());

// Job URLs exactly as the board scrapers emit them (ids changed).
const BOARD_JOBS = [
  ['LinkedIn', 'https://www.linkedin.com/jobs/view/4493100463/'],
  ['LinkedIn', 'https://www.linkedin.com/jobs/view/java-developer-at-northwind-4478018450?trk=x'],
  ['BuiltIn', 'https://builtin.com/job/middle-full-stack-engineer-react-java/12406831'],
  ['SimplyHired', 'https://www.simplyhired.com/job/fEhC3zIPnHRIR9NcAtMxfrzLZK6-UjTloJRst-gjXNQLk2wJeC7mbQ'],
  ['Himalayas', 'https://himalayas.app/companies/contoso/jobs/senior-software-engineer?utm_source=api'],
  ['We Work Remotely', 'https://weworkremotely.com/remote-jobs/fabrikam-data-engineer'],
  ['Jobicy', 'https://jobicy.com/jobs/163760-senior-backend-engineer-northwind'],
  ['RemoteOK', 'https://remoteok.com/remote-jobs/remote-java-developer-contoso-1137796'],
  ['Remotive', 'https://remotive.com/remote-jobs/software-dev/java-developer-2091177'],
];
const NOT_JOBS = [
  'http://www.linkedin.com/jobs/view/4493100463/', // not https
  'https://www.linkedin.com.evil.example/jobs/view/4493100463/',
  'https://evil.example/www.linkedin.com/jobs/view/4493100463/',
  'https://www.linkedin.com/jobs/search/?keywords=java',
  'https://builtin.com/jobs/remote',
  'https://www.indeed.com/viewjob?jk=abc',
];

test('board job pages are recognised by exact host and path; lookalikes are not', () => {
  for (const [board, url] of BOARD_JOBS) assert.equal(boardJobFor(url)?.board, board, url);
  for (const url of NOT_JOBS) assert.equal(boardJobFor(url), null, url);
  // LinkedIn is reduced to the bare job page.
  assert.equal(boardJobFor(BOARD_JOBS[1][1]).url, 'https://www.linkedin.com/jobs/view/4478018450/');
});

test('jobquest:// links accept board jobs (still only a URL) and still refuse other sites', () => {
  for (const [, url] of BOARD_JOBS) {
    assert.ok(acceptsAutoApply(url), url);
    assert.equal(parseAutoApplyLink(autoApplyLink(url)), url);
  }
  for (const url of NOT_JOBS) {
    assert.equal(autoApplyLink(url), null, url);
    assert.throws(() => parseAutoApplyLink('jobquest://apply?url=' + encodeURIComponent(url)), /only/);
  }
});

test("the board's BOARD_JOB regex agrees with boardJobFor()", () => {
  const html = fs.readFileSync(new URL('../templates/job-quest.html', import.meta.url), 'utf8');
  const re = new Function(`return ${html.match(/var BOARD_JOB = (\/.+\/i);/)[1]}`)();
  for (const u of [...BOARD_JOBS.map(([, u]) => u), ...NOT_JOBS]) assert.equal(re.test(u), boardJobFor(u) !== null, u);
});

test('redirect links that name their destination are unwrapped, on board hosts only', () => {
  const gh = 'https://job-boards.greenhouse.io/contoso/jobs/7012345';
  assert.equal(unwrapRedirect(`https://www.linkedin.com/jobs/view/externalApply/4493100463?url=${encodeURIComponent(gh)}&urlHash=x`), gh);
  assert.equal(unwrapRedirect(`https://remotive.com/redirect?url=${encodeURIComponent(gh)}`), gh);
  const other = `https://evil.example/r?url=${encodeURIComponent(gh)}`;
  assert.equal(unwrapRedirect(other), other);
});

// ---- Following the Apply button, on mock board pages ------------------------------------
// Every request is answered from SITES (unknown URLs get an empty page), so no network is used.

const GH = 'https://job-boards.greenhouse.io/contoso/jobs/7012345';
const SITES = {
  // Signed in to LinkedIn: a company-site job's Apply goes through externalApply?url=<employer>.
  'https://www.linkedin.com/jobs/view/1000001/': `<h1>Java Developer</h1>
    <a target="_blank" href="https://www.linkedin.com/jobs/view/externalApply/1000001?url=${encodeURIComponent(GH)}&amp;urlHash=ab">Apply</a>`,
  // Signed in, Easy Apply only: never pressed.
  'https://www.linkedin.com/jobs/view/1000002/': '<h1>Java Developer</h1><button id="easy">Easy Apply</button>',
  // Signed out (as seen live): both kinds show "Apply", which opens a sign-in dialog. The
  // tracking names tell them apart.
  'https://www.linkedin.com/jobs/view/1000003/': `<h1>Java Developer</h1>
    <button class="apply-button" data-tracking-control-name="public_jobs_apply-link-onsite">Apply</button>`,
  'https://www.linkedin.com/jobs/view/1000004/': `<h1>Java Developer</h1>
    <button class="apply-button" data-tracking-control-name="public_jobs_apply-link-offsite_sign-up-modal">Apply</button>
    <a data-tracking-control-name="public_jobs_apply-link-offsite_contextual-sign-in-modal_join-link" href="https://www.linkedin.com/signup/cold-join">Join now</a>`,
  // A button (no link) that goes through the board's redirect to a careers page embedding Greenhouse.
  'https://builtin.com/job/java-developer/2000001': `<h1>Java Developer</h1><button id="save">Save job</button>
    <button id="go" onclick="location.href='https://builtin.com/redirect/2000001'">Apply</button>`,
  // BuiltIn's own apply (as seen live).
  'https://builtin.com/job/java-developer/2000002': `<h1>Java Developer</h1>
    <a href="/auth/login?destination=/job/java-developer/2000002">LOG IN TO EASY APPLY</a><a href="/auth/signup">SIGN UP TO EASY APPLY</a>`,
  // Cloudflare's check (SimplyHired, Himalayas, We Work Remotely in automated Chrome).
  'https://himalayas.app/companies/contoso/jobs/java-developer': '<html><head><title>Just a moment...</title></head><body><div id="challenge-form"></div></body></html>',
  'https://builtin.com/redirect/2000001': `<script>location.replace('https://careers.contoso.example/jobs/java?gh_jid=7012345')</script>`,
  'https://careers.contoso.example/jobs/java?gh_jid=7012345': `<h1>Careers</h1><iframe src="https://job-boards.greenhouse.io/embed/job_app?for=contoso&token=7012345"></iframe>`,
  // A link to an employer form auto apply doesn't fill.
  'https://jobicy.com/jobs/3000001-java-developer': `<a href="https://careers-fabrikam.icims.example/jobs/55/job">Apply now</a>`,
  'https://careers-fabrikam.icims.example/jobs/55/job': '<h1>Fabrikam careers</h1><form><input name="email"></form>',
  // SimplyHired handing over to Indeed's own apply.
  'https://www.simplyhired.com/job/abcdefghijklmnop': `<a href="https://smartapply.indeed.com/beta/indeedapply/form/1">Apply now</a>`,
  // The job closed: no Apply anywhere.
  'https://remotive.com/remote-jobs/software-dev/closed-4000001': '<h1>This job is no longer available</h1>',
};

async function mockPage() {
  const page = await (await getBrowser()).newPage();
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const body = SITES[r.url()];
    r.respond({ status: 200, contentType: 'text/html', body: body ?? '<html><body></body></html>' });
  });
  return page;
}

test("LinkedIn (signed in): a company-site job's Apply leads straight to the Greenhouse form", async () => {
  const page = await mockPage();
  try {
    const f = await followBoardApply(page, 'https://www.linkedin.com/jobs/view/1000001/', { timeoutMs: 5000 });
    assert.equal(f.outcome, 'form');
    assert.equal(f.platform, 'greenhouse');
    assert.equal(f.formUrl, 'https://job-boards.greenhouse.io/embed/job_app?for=contoso&token=7012345');
  } finally { await page.close(); }
});

test('LinkedIn Easy Apply is never pressed; the page is left for the candidate', async () => {
  const page = await mockPage();
  try {
    await page.evaluateOnNewDocument(() => document.addEventListener('click', (e) => { if (e.target.id === 'easy') window.__pressed = true; }, true));
    const f = await followBoardApply(page, 'https://www.linkedin.com/jobs/view/1000002/', { timeoutMs: 3000 });
    assert.equal(f.outcome, 'board-apply');
    assert.equal(await page.evaluate(() => !!window.__pressed), false);
    assert.match(boardMessage(f), /Easy Apply/);
  } finally { await page.close(); }
});

test('BuiltIn: a button through a redirect to a careers page finds the embedded Greenhouse form', async () => {
  const page = await mockPage();
  try {
    const f = await followBoardApply(page, 'https://builtin.com/job/java-developer/2000001', { timeoutMs: 8000 });
    assert.equal(f.outcome, 'form');
    assert.equal(f.platform, 'greenhouse');
    assert.equal(f.formUrl, 'https://job-boards.greenhouse.io/embed/job_app?for=contoso&token=7012345');
  } finally { await page.close(); }
});

test("an employer form auto apply doesn't fill, the board's own apply, sign-in, a bot check and a closed job are reported, not filled", async () => {
  for (const [url, outcome, says] of [
    ['https://jobicy.com/jobs/3000001-java-developer', 'employer', /doesn't fill/],
    ['https://www.simplyhired.com/job/abcdefghijklmnop', 'board-apply', /Indeed/],
    ['https://www.linkedin.com/jobs/view/1000003/', 'board-apply', /Easy Apply/],
    ['https://www.linkedin.com/jobs/view/1000004/', 'sign-in', /Sign in to LinkedIn/],
    ['https://builtin.com/job/java-developer/2000002', 'board-apply', /Easy Apply/],
    ['https://himalayas.app/companies/contoso/jobs/java-developer', 'blocked', /bot check/],
    ['https://remotive.com/remote-jobs/software-dev/closed-4000001', 'stuck', /closed/],
  ]) {
    const page = await mockPage();
    try {
      const f = await followBoardApply(page, url, { timeoutMs: 4000, botCheckMs: 1500 });
      assert.match(boardMessage(f), says, url);
      assert.equal(f.outcome, outcome, url);
      assert.equal(f.formUrl, undefined, url);
      assert.ok(boardMessage(f), url);
    } finally { await page.close(); }
  }
});
