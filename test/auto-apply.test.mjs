import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApplicant, splitCompanyTitle } from '../dist/resume/applicant.js';
import { greenhouseFormUrl } from '../dist/apply/greenhouse.js';
import { autoApplyLink, parseAutoApplyLink } from '../dist/apply/protocol.js';

test('jobquest:// links round-trip and only ever carry a Greenhouse job', () => {
  const job = 'https://job-boards.greenhouse.io/boxinc/jobs/8328785?gh_src=x&a=1';
  const link = autoApplyLink(job);
  assert.equal(link, `jobquest://apply?url=${encodeURIComponent(job)}`);
  assert.equal(parseAutoApplyLink(link), job);
  // Some browsers add a slash after the action.
  assert.equal(parseAutoApplyLink(link.replace('apply?', 'apply/?')), job);
  assert.equal(autoApplyLink('https://jobs.lever.co/acme/1'), null);
  assert.throws(() => parseAutoApplyLink('jobquest://apply?url=' + encodeURIComponent('https://evil.example/x')), /Greenhouse/);
  assert.throws(() => parseAutoApplyLink('jobquest://delete?url=x'), /Unknown/);
  assert.throws(() => parseAutoApplyLink('https://job-boards.greenhouse.io/a/jobs/1'), /Not a jobquest/);
});

// The layout of the user's real résumé: "Company / Title  Mon YYYY - Mon YYYY".
const SLASH_RESUME = `Jordan Ellis

Denver, CO | jordan@example.com +1 (555)0142233

Summary
Java Software Developer with 5 years of experience.

Education

Lakeview State University, OH August 2022 - December 2023

Master of Computer Science

Relevant courses: Advanced software engineering, Machine Learning.

Experience

Northwind Bank / Full Stack Developer Mar 2026 - Present

Location: Columbus, OH
Developed scalable full-stack applications using Java and Angular.

Contoso / Java Developer Dec 2023 - July 2025

Fabrikam / Software Developer Jan 2020 - Aug 2021

Projects
Github Repo: https://github.com/someone/career-jobs-mcp
`;

// The layout the profile tests use: "Title | Company | dates".
const PIPE_RESUME = `Alex Rivera
Dallas, TX | alex@example.com | linkedin.com/in/alex-rivera

PROFESSIONAL EXPERIENCE
Java Full Stack Developer | Fidelity | Mar 2023 - Present
- Collaborated with the DevOps team on CI/CD.
Software Engineer | Tech Mahindra | 08/2020 - 06/2021

EDUCATION
MS Computer Science | UT Dallas | 2018 - 2020
Bachelor of Technology in Electronics, JNTU Hyderabad, 2016
`;

test('contact details from the header', () => {
  const a = buildApplicant(SLASH_RESUME);
  assert.equal(a.firstName, 'Jordan');
  assert.equal(a.lastName, 'Ellis');
  assert.equal(a.email, 'jordan@example.com');
  assert.equal(a.phone, '555-014-2233');
  assert.equal(a.city, 'Denver');
  assert.equal(a.state, 'CO');
  assert.equal(a.github, 'https://github.com/someone'); // repo link -> profile
});

test('company / title layout, current role, months', () => {
  const { experience } = buildApplicant(SLASH_RESUME);
  assert.deepEqual(experience.map((j) => [j.company, j.title]), [
    ['Northwind Bank', 'Full Stack Developer'], ['Contoso', 'Java Developer'], ['Fabrikam', 'Software Developer'],
  ]);
  assert.deepEqual(experience[0].start, { year: 2026, month: 3 });
  assert.equal(experience[0].current, true);
  assert.equal(experience[0].end, undefined);
  assert.equal(experience[0].location, 'Columbus, OH');
  assert.deepEqual(experience[1].end, { year: 2025, month: 7 });
});

test('education: school line with dates, degree on the next line', () => {
  const [e] = buildApplicant(SLASH_RESUME).education;
  assert.equal(e.school, 'Lakeview State University');
  assert.equal(e.degreeLevel, "Master's");
  assert.equal(e.discipline, 'Computer Science');
  assert.deepEqual(e.end, { year: 2023, month: 12 });
});

test('title | company layout and numeric dates', () => {
  const a = buildApplicant(PIPE_RESUME);
  assert.equal(a.linkedin, 'https://linkedin.com/in/alex-rivera');
  assert.deepEqual(a.experience.map((j) => [j.company, j.title, j.current]), [
    ['Fidelity', 'Java Full Stack Developer', true], ['Tech Mahindra', 'Software Engineer', false],
  ]);
  assert.deepEqual(a.experience[1].start, { year: 2020, month: 8 });
  assert.deepEqual(a.education.map((e) => [e.school, e.degreeLevel, e.discipline]), [
    ['UT Dallas', "Master's", 'Computer Science'],
    ['JNTU Hyderabad', "Bachelor's", 'Electronics'],
  ]);
});

test('a prose bullet with a date range is not a job', () => {
  assert.equal(splitCompanyTitle('Improved build times'), null);
});

test('Greenhouse URLs map to the embed form; other hosts do not', () => {
  assert.equal(greenhouseFormUrl('https://job-boards.greenhouse.io/boxinc/jobs/8328785'),
    'https://job-boards.greenhouse.io/embed/job_app?for=boxinc&token=8328785');
  assert.equal(greenhouseFormUrl('https://boards.greenhouse.io/coinbase/jobs/8175363?gh_jid=1'),
    'https://job-boards.greenhouse.io/embed/job_app?for=coinbase&token=8175363');
  assert.equal(greenhouseFormUrl('https://job-boards.eu.greenhouse.io/acme/jobs/42'),
    'https://job-boards.eu.greenhouse.io/embed/job_app?for=acme&token=42');
  assert.equal(greenhouseFormUrl('https://jobs.lever.co/acme/123'), null);
  assert.equal(greenhouseFormUrl('https://evil.example/job-boards.greenhouse.io/x/jobs/1'), null);
});
