import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { eightfoldFormUrl, fillEightfold, eightfoldWantsSignIn, usDialCode, usCountry } from '../dist/apply/eightfold.js';
import { applyFormFor } from '../dist/apply/platforms.js';
import { autoApplyLink, parseAutoApplyLink } from '../dist/apply/protocol.js';
import { getBrowser, closeSharedBrowser } from '../dist/utils/browser.js';

after(() => closeSharedBrowser());

// Job URLs as the eightfold scraper emits them (ids changed).
const JOBS = [
  ['https://lockheedmartin.eightfold.ai/careers/job/996477931669', 'https://lockheedmartin.eightfold.ai/careers/apply?pid=996477931669'],
  ['https://explore.jobs.netflix.net/careers/job/790319500144', 'https://explore.jobs.netflix.net/careers/apply?pid=790319500144'],
  ['https://careers.qualcomm.com/careers/job/446717833433', 'https://careers.qualcomm.com/careers/apply?pid=446717833433'],
  ['https://apply.careers.microsoft.com/careers/job/1970393557044053', 'https://apply.careers.microsoft.com/careers/apply?pid=1970393557044053'],
  ['https://lockheedmartin.eightfold.ai/careers/apply?pid=996477931669&domain=x', 'https://lockheedmartin.eightfold.ai/careers/apply?pid=996477931669'],
];
const NOT_JOBS = [
  'http://lockheedmartin.eightfold.ai/careers/job/996477931669', // not https
  'https://evil.example/careers/job/996477931669', // any site can fire a jobquest:// link
  'https://lockheedmartin.eightfold.ai.evil.example/careers/job/996477931669',
  'https://careers.qualcomm.com/careers?query=java',
  'https://lockheedmartin.eightfold.ai/careers/job/abc',
];

test('Eightfold job URLs map to their application form; other sites do not', () => {
  for (const [job, form] of JOBS) {
    assert.equal(eightfoldFormUrl(job), form, job);
    assert.equal(applyFormFor(job)?.platform, 'eightfold', job);
    assert.equal(parseAutoApplyLink(autoApplyLink(job)), job);
  }
  for (const u of NOT_JOBS) {
    assert.equal(eightfoldFormUrl(u), null, u);
    assert.equal(applyFormFor(u), null, u);
  }
});

test("the board's EIGHTFOLD_JOB regex agrees with eightfoldFormUrl()", () => {
  const html = fs.readFileSync(new URL('../templates/job-quest.html', import.meta.url), 'utf8');
  const re = new Function(`return ${html.match(/var EIGHTFOLD_JOB = (\/.+\/i);/)[1]}`)();
  for (const u of [...JOBS.map(([j]) => j), ...NOT_JOBS]) assert.equal(re.test(u), eightfoldFormUrl(u) !== null, u);
});

test('phone country code and country lists: the US option', () => {
  assert.equal(usDialCode(['🇦🇩 (+376) ANDORRA', '🇨🇦 (+1) CANADA', '🇺🇸 (+1) United States of America']), '🇺🇸 (+1) United States of America');
  assert.equal(usDialCode(['🇦🇬 (+1 268) ANTIGUA AND BARBUDA']), null);
  assert.equal(usCountry(['United Kingdom', 'UNITED STATES', 'United States Minor Outlying Islands']), 'UNITED STATES');
});

// The markup of a live Eightfold form (Netflix / Lockheed Martin, 2026-11-22), trimmed.
const q = (id, label, inner) => `<div><label id="${id}_label" for="${id}"><span>${label}</span></label><div>${inner}</div></div>`;
const combo = (id, label, n, options) => q(id, label,
  `<div id="${id}" data-opts="${options.join('|')}"><input role="combobox" aria-controls="list-${n}" aria-labelledby="${id}_label" aria-required="true" id="input-${n}" placeholder="Select" type="text" value=""></div>`);
const group = (id, label, options) => `<div><legend id="${id}_legend"><span>${label}</span></legend><div role="group" id="${id}" aria-labelledby="${id}_legend">`
  + options.map((o, k) => `<div><input aria-label="${o}" id="${id}-${k}" name="${id}" type="checkbox" aria-required="true" value="${o}"><label for="${id}-${k}">${o}</label></div>`).join('') + '</div></div>';
const FORM = `<!doctype html><html><body>
<section><label id="Resume_resume_label" for="Resume_resume">Upload your resume/CV</label><div id="Resume_resume"><input type="file" accept=".pdf,.doc,.docx,.txt"></div></section>
${q('Contact_Information_email', 'Email', '<input id="Contact_Information_email" aria-required="true" value="">')}
${q('Contact_Information_firstname', 'First name', '<input id="Contact_Information_firstname" aria-required="true" value="">')}
${q('Contact_Information_lastname', 'Last name', '<input id="Contact_Information_lastname" aria-required="true" value="">')}
<div><input role="combobox" aria-controls="list-3" aria-label="Country code" id="input-5" type="text" value="" data-opts="🇨🇦 (+1) CANADA|🇺🇸 (+1) United States of America"></div>
${q('Contact_Information_phone', 'Phone', '<input id="Contact_Information_phone" aria-required="true" value="">')}
${combo('Contact_Information_country', 'Country', 8, ['Canada', 'United States'])}
${q('Contact_Information_city', 'City', '<input id="Contact_Information_city" aria-required="true" value="">')}
${group('Self_ID_Questions_US_genderIdentity', 'Which gender identities do you most identify with? Please select all that apply.', ['Man', 'Non-binary', 'Woman', 'I choose not to disclose'])}
${group('Self_ID_Questions_US_sexualOrientation', 'Which sexual orientations do you most identify with?', ['Gay', 'Heterosexual', 'I choose not to disclose'])}
${combo('Q_vet', 'Are you a US veteran, and if so, do you belong to any of the categories of protected veterans?', 11, ['I AM A US VETERAN IN A NON-PROTECTED STATUS', 'I AM A US VETERAN IN A PROTECTED STATUS', 'I AM NEITHER A PROTECTED OR NON-PROTECTED US VETERAN', 'I CHOOSE NOT TO DISCLOSE'])}
${combo('Q_trans', 'Are you a person of transgender experience?', 14, ['YES', 'NO', 'I CHOOSE NOT TO DISCLOSE'])}
${combo('Q_sponsor', 'Do you require sponsorship to legally work in the job location?', 26, ['YES', 'NO'])}
${q('Q_url', 'URL (LinkedIn, Github, Portfolio):', '<input id="Q_url" value="">')}
${q('Q_sign', 'Please sign by typing your full legal name', '<input id="Q_sign" aria-required="true" value="">')}
${group('Q_agree', 'Statement of agreement', ['I have read and understand and I agree to the above'])}
<script>
// As on Eightfold: a click on a combobox opens its list (button[role=option] in #list-N) a moment later.
document.addEventListener('click', (e) => {
  const c = e.target.closest('input[role=combobox]');
  if (!c) return;
  document.querySelectorAll('[data-mock-list]').forEach((l) => l.remove());
  const opts = (c.dataset.opts || c.parentElement.dataset.opts || '').split('|');
  setTimeout(() => {
    const ul = document.createElement('ul'); ul.id = c.getAttribute('aria-controls'); ul.setAttribute('data-mock-list', '');
    for (const o of opts) { const li = document.createElement('li'); const b = document.createElement('button'); b.setAttribute('role', 'option'); b.textContent = o;
      b.onclick = (ev) => { ev.stopPropagation(); c.value = o.replace(/^\\S+ \\(\\+1\\) /, (m) => m).toLowerCase().replace(/\\b\\w/g, (x) => x.toUpperCase()); ul.remove(); };
      li.appendChild(b); ul.appendChild(li); }
    document.body.appendChild(ul);
  }, 200);
});
</script></body></html>`;

const applicant = {
  firstName: 'Jordan', lastName: 'Ellis', fullName: 'Jordan Ellis', email: 'jordan@example.com', phone: '+1 (555) 014-2233',
  city: 'Denver', state: 'CO', linkedin: 'https://www.linkedin.com/in/jordan-ellis-example', github: 'https://github.com/jordan-ellis-example',
  experience: [{ company: 'Northwind Bank', title: 'Full Stack Developer' }], education: [],
};
const extra = { standard: { workAuthorized: 'yes', sponsorship: 'no', gender: 'female', veteran: 'no', lgbtq: 'no' } };

test('Eightfold form: contact, phone code, country, saved answers; orientation, transgender, signature and consent are left', async () => {
  const page = await (await getBrowser()).newPage();
  try {
    await page.setContent(FORM);
    const r = await fillEightfold(page, applicant, undefined, [], extra);
    const got = Object.fromEntries(r.filled.map((f) => [f.field, f.value]));
    assert.deepEqual(r.failed, []);
    const val = (sel) => page.$eval(sel, (e) => e.value);
    assert.equal(await val('#Contact_Information_email'), 'jordan@example.com');
    assert.equal(await val('#Contact_Information_firstname'), 'Jordan');
    assert.equal(await val('#Contact_Information_lastname'), 'Ellis');
    assert.equal(await val('#Contact_Information_phone'), '5550142233');
    assert.equal(await val('#Contact_Information_city'), 'Denver');
    assert.match(got['Phone country code'], /\(\+1\) United States/);
    assert.equal(got['Country'], 'United States');
    assert.equal(got['Do you require sponsorship to legally work in the job location?'], 'NO');
    assert.equal(got['Are you a US veteran, and if so, do you belong to any of the categories of protected veterans?'], 'I AM NEITHER A PROTECTED OR NON-PROTECTED US VETERAN');
    assert.equal(await page.$eval('[value="Woman"]', (e) => e.checked), true);
    assert.equal(await val('#Q_url'), applicant.linkedin, 'a box naming LinkedIn gets the LinkedIn profile');
    // Never answered for the candidate:
    assert.equal(await page.$$eval('[name=Self_ID_Questions_US_sexualOrientation]', (xs) => xs.some((x) => x.checked)), false);
    assert.equal(await val('#input-14'), '', 'transgender experience is never guessed');
    assert.equal(await val('#Q_sign'), '', 'a signature is never typed');
    assert.equal(await page.$eval('[name=Q_agree]', (e) => e.checked), false, 'consent is never ticked');
    for (const left of ['Which sexual orientations do you most identify with?', 'Are you a person of transgender experience?', 'Please sign by typing your full legal name', 'Statement of agreement']) {
      assert.ok(r.needsYou.includes(left), left);
    }
  } finally { await page.close(); }
});

test('no form yet: a sign-in page waits for the candidate, a closed job does not', async () => {
  const page = await (await getBrowser()).newPage();
  try {
    const form = 'https://careers.qualcomm.com/careers/apply?pid=446717833433';
    await page.setContent('<h1>Sign in to apply</h1><input type="email" id="email"><button>Continue</button>');
    assert.equal(await eightfoldWantsSignIn(page, form), true);
    await page.setContent('<h1>This position is no longer available</h1><a href="/careers">See all jobs</a>');
    assert.equal(await eightfoldWantsSignIn(page, form), false);
  } finally { await page.close(); }
});
