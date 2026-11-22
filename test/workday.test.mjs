import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { workdayFormUrl, workdayState, fillWorkdayStep, chooseDegree, nationalNumber, _private } from '../dist/apply/workday.js';
import { applyFormFor } from '../dist/apply/platforms.js';
import { autoApplyLink, parseAutoApplyLink } from '../dist/apply/protocol.js';
import { getBrowser, closeSharedBrowser } from '../dist/utils/browser.js';

after(() => closeSharedBrowser());

// Real Workday job URLs as the workday scraper emits them (tenants and requisition ids anonymised
// only where they named a person; the shapes are what matters).
const JOBS = [
  'https://acme.wd5.myworkdayjobs.com/en-US/Acme/job/Denver-CO/Software-Engineer_JR-0110760',
  'https://contoso.wd1.myworkdayjobs.com/en-US/contoso/job/Tokyo%2C-Japan/SMB-Account-Executive_R35771-1',
  'https://fabrikam.wd501.myworkdayjobs.com/Fabrikam_careers/job/Penang-Malaysia/Business-Systems-Analyst_JR104111',
  'https://northwind.wd1.myworkdayjobs.com/en-US/NorthwindJobs/job/DES-MOINES-IA/Senior-Representative--Inside-Sales-_R-585000',
];

test('Workday job URLs map to their Apply Manually application; other URLs do not', () => {
  assert.equal(workdayFormUrl(JOBS[0]), 'https://acme.wd5.myworkdayjobs.com/en-US/Acme/job/Denver-CO/Software-Engineer_JR-0110760/apply/applyManually');
  assert.equal(workdayFormUrl(JOBS[2]), 'https://fabrikam.wd501.myworkdayjobs.com/Fabrikam_careers/job/Penang-Malaysia/Business-Systems-Analyst_JR104111/apply/applyManually');
  // Already on the apply flow, or with tracking parameters: same form.
  assert.equal(workdayFormUrl(`${JOBS[0]}/apply/autofillWithResume?source=LinkedIn`), workdayFormUrl(JOBS[0]));
  assert.equal(workdayFormUrl(`${JOBS[0]}?utm_source=x`), workdayFormUrl(JOBS[0]));
  // /details/ links.
  assert.equal(workdayFormUrl('https://acme.wd5.myworkdayjobs.com/en-US/Acme/details/Software-Engineer_JR-1'), 'https://acme.wd5.myworkdayjobs.com/en-US/Acme/details/Software-Engineer_JR-1/apply/applyManually');

  assert.equal(workdayFormUrl('https://acme.wd5.myworkdayjobs.com/en-US/Acme'), null);                       // the board, not a job
  assert.equal(workdayFormUrl('https://acme.wd5.myworkdayjobs.com/en-US/Acme/job/Denver-CO/'), null);         // no requisition
  assert.equal(workdayFormUrl('http://acme.wd5.myworkdayjobs.com/en-US/Acme/job/X/Engineer_R1'), null);       // https only
  assert.equal(workdayFormUrl('https://acme.wd5.myworkdayjobs.com.evil.example/en-US/Acme/job/X/Engineer_R1'), null);
  assert.equal(workdayFormUrl('https://evil.example/acme.wd5.myworkdayjobs.com/en-US/Acme/job/X/Engineer_R1'), null);
  assert.equal(workdayFormUrl('https://www.myworkday.com/acme/d/inst/1$1/rel-task/2.htmld'), null);          // the employee app
});

test('Workday goes through the one platform lookup, so links, the sheet and the board offer it', () => {
  for (const url of JOBS) {
    assert.equal(applyFormFor(url)?.platform, 'workday', url);
    const link = autoApplyLink(url);
    assert.ok(link.startsWith('jobquest://apply?url='));
    assert.equal(parseAutoApplyLink(link), url);
  }
});

test("the board's WORKDAY_JOB regex agrees with workdayFormUrl()", () => {
  const html = fs.readFileSync(new URL('../templates/job-quest.html', import.meta.url), 'utf8');
  const src = html.match(/var WORKDAY_JOB = (\/.+\/i);/)[1];
  const re = new Function(`return ${src}`)();
  const samples = [...JOBS, `${JOBS[0]}/apply`, `${JOBS[0]}?q=1`,
    'https://acme.wd5.myworkdayjobs.com/en-US/Acme', 'https://acme.wd5.myworkdayjobs.com/en-US/Acme/job/Denver-CO/',
    'http://acme.wd5.myworkdayjobs.com/en-US/Acme/job/X/Engineer_R1', 'https://evil.example/acme.wd5.myworkdayjobs.com/en-US/Acme/job/X/Engineer_R1'];
  for (const u of samples) assert.equal(re.test(u), workdayFormUrl(u) !== null, u);
});

test('helpers: degree options, US phone digits, question keys by field id', () => {
  const degrees = ["Associate's Degree", "Bachelor's Degree", "Master's Degree", 'MBA', 'Doctorate', 'High School Diploma'];
  assert.equal(chooseDegree({ degreeLevel: "Master's" }, degrees), "Master's Degree");
  assert.equal(chooseDegree({ degreeLevel: "Bachelor's" }, degrees), "Bachelor's Degree");
  assert.equal(chooseDegree({ degreeLevel: 'MBA' }, degrees), 'MBA');
  // Tenants that list specific degrees: the field of study picks science vs arts; MBA is never a plain Master's.
  const specific = ['Bachelor of Arts (BA)', 'Bachelor of Science (BS)', 'Master of Arts (MA)', 'Master of Science (MS)', 'Master of Business Administration (MBA)'];
  assert.equal(chooseDegree({ degree: 'Master of Computer Science', degreeLevel: "Master's", discipline: 'Computer Science' }, specific), 'Master of Science (MS)');
  assert.equal(chooseDegree({ degree: 'Bachelor of Technology', degreeLevel: "Bachelor's", discipline: 'Computer Science' }, specific), 'Bachelor of Science (BS)');
  assert.equal(chooseDegree({ degree: 'Master of Arts in History', degreeLevel: "Master's", discipline: 'History' }, specific), 'Master of Arts (MA)');
  assert.equal(chooseDegree({ degreeLevel: "Master's" }, ['Masters', 'Masters (Other)']), 'Masters');         // the one generic option
  assert.equal(chooseDegree({ degree: 'Master of Computer Science', degreeLevel: "Master's", discipline: 'Computer Science' }, ['Master of Science (MS)', 'Master of Science (MSc)']), null); // a tie stays blank
  assert.equal(chooseDegree({ degree: 'Master of Computer Science', degreeLevel: "Master's" }, ['Master of Computer Science', 'Master of Science (MS)']), 'Master of Computer Science'); // exact wins
  assert.equal(nationalNumber('+1 (555) 014-2233'), '5550142233');
  assert.equal(nationalNumber('555-014-2233'), '5550142233');
  assert.equal(_private.questionKey({ id: 'disabilityStatus', label: 'Please check one of the boxes below' }), 'disability');
  assert.equal(_private.questionKey({ id: 'veteranStatus', label: 'Veteran Status' }), 'veteran');
  assert.equal(_private.pickUS(['Canada', 'United States of America', 'United States Minor Outlying Islands']), 'United States of America');
});

// ---- the filler, against a page shaped like Workday's apply flow ----

/** Workday-like markup: formField wrappers, listbox dropdowns that render options only while open, Add sections, prompts, dates. */
function mockPage(body) {
  return `<!doctype html><html><body><div data-automation-id="applyFlowPage">
<ol data-automation-id="progressBar"><li data-automation-id="progressBarActiveStep">current step 2 of 6<br>My Information</li></ol>
${body}
<button data-automation-id="bottom-navigation-next-button">Save and Continue</button>
</div><script>
function dropdown(id, label, options) {
  return '<div data-automation-id="formField-' + id + '"><label>' + label + '</label><button aria-haspopup="listbox" data-opts="' + options.join('|') + '">Select One</button></div>';
}
document.addEventListener('click', (e) => {
  const btn = e.target.closest('button[aria-haspopup=listbox]');
  if (btn) {
    document.querySelectorAll('[role=listbox]').forEach((l) => l.remove());
    const ul = document.createElement('ul'); ul.setAttribute('role', 'listbox');
    for (const o of btn.dataset.opts.split('|')) {
      const li = document.createElement('li'); li.setAttribute('role', 'option'); li.textContent = o;
      li.onclick = (ev) => { ev.stopPropagation(); btn.textContent = o; ul.remove(); };
      ul.appendChild(li);
    }
    document.body.appendChild(ul);
  }
  const add = e.target.closest('[data-automation-id=add-button]');
  if (add) {
    // As on Workday: each entry is a group labelled "Work Experience N"; dates are fieldsets
    // with a legend ("From" / "To"); the section's button reads "Add Another" once one exists.
    const kind = add.dataset.kind, n = document.querySelectorAll('[data-entry=' + kind + ']').length + 1;
    const div = document.createElement('div'); div.dataset.entry = kind;
    div.setAttribute('role', 'group'); div.setAttribute('aria-labelledby', kind + n);
    // Each date part sits under a display overlay that takes the mouse click, as on Workday.
    const datePart = (p) => '<span style="position:relative;display:inline-block"><input data-automation-id="dateSection' + p + '-input">'
      + '<div data-automation-id="dateSection' + p + '-display" style="position:absolute;inset:0;background:#fff"></div></span>';
    const date = (id, legend, month) => '<div data-automation-id="formField-' + id + '"><fieldset><legend>' + legend + '</legend>'
      + (month ? datePart('Month') : '') + datePart('Year') + '</fieldset></div>';
    const prompt = (id, label, opts) => '<div data-automation-id="formField-' + id + '"><label>' + label + '</label>'
      + '<div data-automation-id="multiselectInputContainer" data-opts="' + opts.join('|') + '"><input data-automation-id="searchBox"></div></div>';
    div.innerHTML = kind === 'work'
      ? '<h4 id="' + kind + n + '">Work Experience ' + n + '</h4>'
        + '<div data-automation-id="formField-jobTitle"><label>Job Title*</label><input type="text"></div>'
        + '<div data-automation-id="formField-companyName"><label>Company*</label><input type="text"></div>'
        + '<div data-automation-id="formField-location"><label>Location</label><input type="text"></div>'
        + '<div data-automation-id="formField-currentlyWorkHere"><input type="checkbox" id="cw' + n + '"><label for="cw' + n + '">I currently work here</label></div>'
        + date('startDate', 'From*', true) + date('endDate', 'To*', true)
        + '<div data-automation-id="formField-roleDescription"><label>Role Description</label><textarea></textarea></div>'
      : '<h4 id="' + kind + n + '">Education ' + n + '</h4>'
        + prompt('school', 'School or University*', ['Lakeview State University - Main Campus', 'Lakeview Community College', 'Riverside Institute of Technology'])
        + dropdown('degree', 'Degree*', ['Associate of Science (AS)', 'Bachelor of Arts (BA)', 'Bachelor of Science (BS)', 'Master of Arts (MA)', 'Master of Science (MS)', 'Master of Business Administration (MBA)'])
        + prompt('fieldOfStudy', 'Field of Study', ['Computer Science', 'Computer Engineering', 'Information Systems'])
        + date('firstYearAttended', 'From', false) + date('lastYearAttended', 'To (Actual or Expected)', false);
    add.before(div);
    add.textContent = 'Add Another';
  }
});
// "I currently work here" hides the To date, as on Workday.
document.addEventListener('change', (e) => {
  if (e.target.id && e.target.id.startsWith('cw')) e.target.closest('[data-entry]').querySelector('[data-automation-id=formField-endDate]').style.display = e.target.checked ? 'none' : '';
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('[role=listbox], [data-mock=promptList]').forEach((l) => l.remove());
  const box = e.target.closest && e.target.closest('[data-automation-id=multiselectInputContainer]');
  if (box && e.key === 'Enter') {
    document.querySelectorAll('[data-mock=promptList]').forEach((l) => l.remove());
    const q = e.target.value.toLowerCase();
    // As on Workday: the results list is a popup over the page, and it STAYS OPEN after a pick
    // (prompts are multi-selects). Until it is closed (Escape), it covers the fields below; a
    // click outside only closes it, the click itself is swallowed. (Seen live: Degree, Field of
    // Study and the years were all missed after the school was picked.)
    const list = document.createElement('div'); list.setAttribute('data-mock', 'promptList');
    list.style.cssText = 'position:fixed;inset:0;z-index:50;background:rgba(255,255,255,.01)';
    list.addEventListener('mousedown', (ev) => { if (ev.target === list) { ev.preventDefault(); ev.stopPropagation(); list.remove(); } });
    list.addEventListener('click', (ev) => { if (ev.target === list) ev.stopPropagation(); });
    for (const o of (box.dataset.opts || 'Computer Science|Computer Engineering|Information Systems').split('|').filter((x) => x.toLowerCase().includes(q))) {
      const d = document.createElement('div'); d.setAttribute('data-automation-id', 'promptOption'); d.textContent = o;
      d.onclick = () => {
        const s = document.createElement('div'); s.setAttribute('data-automation-id', 'selectedItem'); s.textContent = o;
        box.after(s); e.target.value = '';
      };
      list.appendChild(d);
    }
    document.body.appendChild(list);
  }
});
document.querySelectorAll('[data-dropdown]').forEach((el) => { const [id, label, opts] = el.dataset.dropdown.split('::'); el.outerHTML = dropdown(id, label, opts.split(';')); });
</script></body></html>`;
}

const applicant = {
  firstName: 'Jordan', lastName: 'Ellis', fullName: 'Jordan Ellis', email: 'jordan@example.com', phone: '555-014-2233',
  city: 'Denver', state: 'CO', linkedin: 'https://www.linkedin.com/in/jordan-ellis-example',
  experience: [
    { company: 'Northwind Bank', title: 'Full Stack Developer', location: 'Denver, CO', start: { year: 2023, month: 3 }, current: true,
      description: '• Built Java and Spring Boot services for online banking.\n• Moved batch jobs to AWS Lambda.' },
    { company: 'Contoso', title: 'Java Developer', start: { year: 2020, month: 6 }, end: { year: 2023, month: 2 }, current: false },
    { company: 'Fabrikam', title: 'Software Developer', start: { year: 2018, month: 1 }, end: { year: 2020, month: 5 }, current: false },
  ],
  education: [
    { school: 'Lakeview State University', degree: 'Master of Computer Science', degreeLevel: "Master's", discipline: 'Computer Science', start: { year: 2018 }, end: { year: 2020 } },
    { school: 'Riverside Institute of Technology', degree: 'Bachelor of Technology', degreeLevel: "Bachelor's", discipline: 'Computer Science', start: { year: 2014 }, end: { year: 2018 } },
  ],
};
const extra = { standard: { disability: 'no', workAuthorized: 'yes', sponsorship: 'no' } };

async function open(html) {
  const page = await (await getBrowser()).newPage();
  await page.setContent(html);
  return page;
}

test('My Information: name, address, phone and saved answers are filled; unknowns and consent are left', async () => {
  const page = await open(mockPage(`
    <h3>Country</h3>
    <div data-dropdown="country::Country*::Canada;United States of America;United States Minor Outlying Islands"></div>
    <h3>Legal Name</h3>
    <div data-automation-id="formField-legalName--firstName"><label>First Name*</label><input type="text"></div>
    <div data-automation-id="formField-legalName--lastName"><label>Last Name*</label><input type="text"></div>
    <h3>Address</h3>
    <div data-automation-id="formField-addressLine1"><label>Address Line 1*</label><input type="text"></div>
    <div data-automation-id="formField-city"><label>City*</label><input type="text"></div>
    <div data-dropdown="countryRegion::State*::California;Colorado;Connecticut"></div>
    <h3>Phone</h3>
    <div data-dropdown="phoneType::Phone Device Type*::Home;Mobile;Work"></div>
    <div data-automation-id="formField-phoneNumber"><label>Phone Number*</label><input type="text"></div>
    <div data-automation-id="formField-candidateIsPreviousWorker"><legend>Have you previously worked for Contoso?*</legend>
      <input type="radio" name="pw" id="pw1"><label for="pw1">Yes</label><input type="radio" name="pw" id="pw2"><label for="pw2">No</label></div>
    <div data-automation-id="formField-sponsorship"><label>Will you now or in the future require sponsorship?*</label><button aria-haspopup="listbox" data-opts="Yes|No">Select One</button></div>
    <div data-automation-id="formField-agreementCheckbox"><input type="checkbox" id="agree"><label for="agree">I have read and agree to the terms*</label></div>
    <input data-automation-id="beecatcher" name="website" type="text">`));
  try {
    assert.equal((await workdayState(page)).state, 'step');
    const r = await fillWorkdayStep(page, applicant, undefined, [], extra);
    const got = Object.fromEntries(r.filled.map((f) => [f.field, f.value]));
    assert.equal(got['Country'], 'United States of America');
    assert.equal(got['First Name'], 'Jordan');
    assert.equal(got['Last Name'], 'Ellis');
    assert.equal(got['City'], 'Denver');
    assert.equal(got['State'], 'Colorado');
    assert.equal(got['Phone Device Type'], 'Mobile');
    assert.equal(got['Phone Number'], '5550142233');
    assert.equal(got['Will you now or in the future require sponsorship?'], 'No');
    assert.equal(await page.$eval('#agree', (x) => x.checked), false, 'terms are never ticked');
    assert.equal(await page.$eval('[data-automation-id=beecatcher]', (x) => x.value), '', 'the honeypot is never touched');
    assert.ok(r.needsYou.includes('Have you previously worked for Contoso?'));
    assert.ok(r.needsYou.includes('Address Line 1'));
    assert.ok(r.needsYou.includes('I have read and agree to the terms'));
    assert.deepEqual(r.failed, []);
  } finally { await page.close(); }
});

const EXPERIENCE_STEP = `
    <div role="group" aria-labelledby="ws"><h3 id="ws">Work Experience</h3><button data-automation-id="add-button" data-kind="work">Add</button></div>
    <div role="group" aria-labelledby="es"><h3 id="es">Education</h3><button data-automation-id="add-button" data-kind="edu">Add</button></div>
    <h3>Social Network URLs</h3>
    <div data-automation-id="formField-linkedInAccount"><label>LinkedIn</label><input type="text"></div>`;

test('My Experience: every job and every school, with dates, current job, degree and field of study', async () => {
  const page = await open(mockPage(EXPERIENCE_STEP));
  try {
    const r = await fillWorkdayStep(page, applicant, undefined, [], extra);
    const got = Object.fromEntries(r.filled.map((f) => [f.field, f.value]));
    assert.deepEqual(r.failed, []);
    assert.equal(got['Work Experience 1: Job Title'], 'Full Stack Developer');
    assert.equal(got['Work Experience 1: Company'], 'Northwind Bank');
    assert.equal(got['Work Experience 1: Location'], 'Denver, CO');
    // Role description from the résumé bullets, newlines kept.
    assert.equal(await page.$eval('[data-entry=work] [data-automation-id=formField-roleDescription] textarea', (x) => x.value), applicant.experience[0].description);
    assert.ok(got['Work Experience 1: Role Description']);
    // The school comes from Workday's list, campus suffix and all.
    assert.equal(await page.$eval('[data-entry=edu] [data-automation-id=formField-school] [data-automation-id=selectedItem]', (x) => x.textContent), 'Lakeview State University - Main Campus');
    assert.equal(got['Work Experience 1: I currently work here'], 'Yes');
    assert.equal(got['Work Experience 1: From'], '03/2023');
    assert.equal(got['Work Experience 1: To'], undefined, 'a current job has no end date');
    assert.equal(got['Work Experience 2: Company'], 'Contoso');
    assert.equal(got['Work Experience 2: To'], '02/2023');
    // The third job is added with "Add Another", past the "To" legend of the job before it.
    assert.equal(got['Work Experience 3: Company'], 'Fabrikam');
    assert.equal(got['Work Experience 3: From'], '01/2018');
    assert.equal(got['Work Experience 3: To'], '05/2020');
    assert.equal(got['Education 1: School or University'], 'Lakeview State University');
    assert.equal(got['Education 1: Degree'], 'Master of Science (MS)');
    assert.equal(got['Education 1: Field of Study'], 'Computer Science');
    assert.equal(got['Education 1: From'], '2018');
    assert.equal(got['Education 1: To (Actual or Expected)'], '2020');
    assert.equal(got['Education 2: School or University'], 'Riverside Institute of Technology');
    assert.equal(got['Education 2: Degree'], 'Bachelor of Science (BS)');
    assert.equal(got['LinkedIn'], applicant.linkedin);
    assert.equal(await page.$$eval('[data-entry=work]', (x) => x.length), 3);
    assert.equal(await page.$$eval('[data-entry=edu]', (x) => x.length), 2);
    const years = await page.$$eval('[data-entry=work] [data-automation-id=dateSectionYear-input]', (xs) => xs.map((x) => x.value));
    assert.deepEqual(years, ['2023', '', '2020', '2023', '2018', '2020']);

    // Filling the same step again (the candidate went Back) adds no duplicate entries.
    await fillWorkdayStep(page, applicant, undefined, [], extra);
    assert.equal(await page.$$eval('[data-entry=work]', (x) => x.length), 3);
    assert.equal(await page.$$eval('[data-entry=edu]', (x) => x.length), 2);
  } finally { await page.close(); }
});

test("My Experience: an Add button under Workday's fixed footer still adds the entry", async () => {
  // As on Workday: the Back / Save and Continue bar is fixed to the bottom of the window. The
  // Education Add sits just above the fold, under the bar, so a plain mouse click hits the bar.
  const page = await open(mockPage(`
    <div style="height:70vh"></div>
    <div role="group" aria-labelledby="es"><h3 id="es">Education</h3><button data-automation-id="add-button" data-kind="edu">Add</button></div>
    <div style="height:150vh"></div>
    <div data-automation-id="pageFooter" style="position:fixed;left:0;right:0;bottom:0;height:35vh;background:#eee;z-index:10"></div>`));
  try {
    const r = await fillWorkdayStep(page, { ...applicant, experience: [] }, undefined, [], extra);
    const got = Object.fromEntries(r.filled.map((f) => [f.field, f.value]));
    assert.deepEqual(r.failed, []);
    assert.equal(await page.$$eval('[data-entry=edu]', (x) => x.length), 2);
    assert.equal(got['Education 1: Degree'], 'Master of Science (MS)');
  } finally { await page.close(); }
});

test('My Experience: entries Workday already made (parsed résumé) are completed, not duplicated', async () => {
  const page = await open(mockPage(EXPERIENCE_STEP));
  try {
    // Workday's résumé parse made one entry, with a longer company name, a title and no dates.
    await page.evaluate(() => {
      document.querySelector('[data-kind=work]').click();
      const e = document.querySelector('[data-entry=work]');
      e.querySelector('[data-automation-id=formField-jobTitle] input').value = 'Java Developer';
      e.querySelector('[data-automation-id=formField-companyName] input').value = 'Contoso Ltd';
    });
    const r = await fillWorkdayStep(page, applicant, undefined, [], extra);
    const got = Object.fromEntries(r.filled.map((f) => [f.field, f.value]));
    assert.equal(await page.$$eval('[data-entry=work]', (x) => x.length), 3, 'Contoso is not added twice');
    assert.equal(got['Work Experience 1: From'], '06/2020', 'the parsed entry gets its dates');
    assert.equal(got['Work Experience 1: Company'], undefined, 'what Workday typed is kept');
    assert.equal(await page.$eval('[data-entry=work] [data-automation-id=formField-companyName] input', (x) => x.value), 'Contoso Ltd');
    assert.equal(got['Work Experience 2: Company'], 'Northwind Bank');
    assert.equal(got['Work Experience 3: Company'], 'Fabrikam');
  } finally { await page.close(); }
});

test('Self Identify: the saved disability answer ticks its box; nothing else is guessed', async () => {
  const page = await open(mockPage(`
    <h3>Voluntary Self-Identification of Disability</h3>
    <div data-automation-id="formField-disabilityStatus"><legend>Please check one of the boxes below*</legend>
      <input type="checkbox" id="d1"><label for="d1">Yes, I have a disability (or previously had a disability)</label>
      <input type="checkbox" id="d2"><label for="d2">No, I do not have a disability and have not had one in the past</label>
      <input type="checkbox" id="d3"><label for="d3">I do not want to answer</label></div>`));
  try {
    const r = await fillWorkdayStep(page, applicant, undefined, [], extra);
    assert.deepEqual(await page.$$eval('[data-automation-id=formField-disabilityStatus] input', (xs) => xs.map((x) => x.checked)), [false, true, false]);
    assert.deepEqual(r.needsYou, []);
  } finally { await page.close(); }
});

test('workdayState tells sign-in and Review apart from a fillable step', async () => {
  const signIn = await open(`<div data-automation-id="applyFlowPage"><li data-automation-id="progressBarActiveStep">current step 1 of 7 Create Account/Sign In</li>
    <div data-automation-id="signInContent"><div data-automation-id="formField-email"><label>Email Address*</label><input data-automation-id="email"></div></div></div>`);
  const review = await open(`<div data-automation-id="applyFlowPage"><li data-automation-id="progressBarActiveStep">current step 7 of 7 Review</li><button>Submit</button></div>`);
  try {
    assert.deepEqual(await workdayState(signIn), { state: 'sign-in', step: 'Create Account/Sign In' });
    assert.equal((await workdayState(review)).state, 'review');
  } finally { await signIn.close(); await review.close(); }
});

test('role descriptions come from the lines under each job, up to the next job', async () => {
  const { buildApplicant } = await import('../dist/resume/applicant.js');
  const a = buildApplicant(`Jordan Ellis
Denver, CO | jordan@example.com

Experience
Northwind Bank / Full Stack Developer Mar 2023 - Present
Location: Denver, CO
• Built Java and Spring Boot services for online banking.
• Moved batch jobs to AWS Lambda.
Contoso / Java Developer Jun 2020 - Feb 2023
- Wrote REST APIs with Spring MVC.

Education
Lakeview State University August 2018 - May 2020
Master of Computer Science`);
  assert.equal(a.experience.length, 2);
  assert.equal(a.experience[0].description, '• Built Java and Spring Boot services for online banking.\n• Moved batch jobs to AWS Lambda.');
  assert.equal(a.experience[1].description, '• Wrote REST APIs with Spring MVC.');
});
