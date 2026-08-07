import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProfile, extractSkills, extractTitles, inferYears, detectCountry } from '../dist/resume/build-profile.js';
import { judgeTitle, matchesCountry, scoreTitle } from '../dist/resume/match-jobs.js';

const JAVA_RESUME = `Sruthi Veerepalli
Dallas, TX | sruthi@example.com

SUMMARY
Java / Full Stack Developer with 5 years of professional experience.

TECHNICAL SKILLS
Java 8, Spring Boot, Spring MVC, Hibernate, JPA, Angular, React.js, Node.js, TypeScript,
AWS, Azure, Docker, Kubernetes, Terraform, Jenkins, Apache Kafka, PostgreSQL, MongoDB,
Microservices, REST, CI/CD, Splunk, JUnit, Selenium

PROFESSIONAL EXPERIENCE

Java Full Stack Developer | Fidelity | Mar 2023 - Present
- Built Spring Boot microservices on AWS EKS.
- Collaborated with the DevOps team on CI/CD pipelines using Jenkins and Terraform.

Software Engineer | Tech Mahindra | Aug 2020 - Jun 2021
- Wrote Java REST services with Hibernate.

EDUCATION
MS Computer Science | UT Dallas | 2018 - 2020
`;

const DS_RESUME = `Alex Rivera
Seattle, WA | alex@example.com

Machine Learning Engineer with 9 years of experience.

SKILLS
Python, PyTorch, TensorFlow, scikit-learn, Pandas, NLP, Spark, Airflow, AWS

EXPERIENCE
Senior Machine Learning Engineer | Zillow | Jan 2021 - Present
Data Scientist | Expedia | Jun 2016 - Dec 2020
`;

test('buildProfile reproduces the previously hard-coded Java/Full Stack profile', () => {
  const p = buildProfile(JAVA_RESUME);
  assert.equal(p.name, 'Sruthi Veerepalli');
  assert.equal(p.yearsOfExperience, 5);
  assert.equal(p.yearsSource, 'stated');
  assert.equal(p.country, 'US');
  // CLAUDE.md rule #2: 5 years → Senior is the ceiling.
  assert.equal(p.maxLevel, 'Senior');
  assert.equal(p.minLevel, 'Entry');
  assert.equal(p.matchThreshold, 5);
});

test('role families come from held titles, not from supporting tooling', () => {
  const p = buildProfile(JAVA_RESUME);
  assert.ok(p.families.includes('fullstack'));
  assert.ok(p.families.includes('backend'));
  assert.ok(p.families.includes('generic-swe'));
  // Docker/Kubernetes/Terraform/Jenkins are all present, but no DevOps role was ever held.
  assert.ok(!p.families.includes('devops'), 'DevOps tooling must not claim the DevOps role family');
  assert.ok(!p.families.includes('data-science'));
});

test('extractTitles rejects prose that merely mentions a role family', () => {
  const titles = extractTitles(JAVA_RESUME).map((t) => t.toLowerCase());
  assert.ok(titles.includes('java full stack developer'));
  assert.ok(titles.includes('software engineer'));
  assert.ok(
    !titles.some((t) => t.includes('collaborated')),
    'a bullet naming DevOps must not be read as a held title',
  );
});

test('board search terms are derived from the resume and drop seniority words', () => {
  const p = buildProfile(JAVA_RESUME);
  assert.ok(p.searchTerms.length > 0 && p.searchTerms.length <= 4);
  assert.ok(p.searchTerms.some((t) => /full stack/i.test(t)));
  assert.ok(!p.searchTerms.some((t) => /\b(senior|sr|junior|lead|principal)\b/i.test(t)));
});

test('a different resume yields a different profile — nothing is candidate-specific', () => {
  const p = buildProfile(DS_RESUME);
  assert.equal(p.name, 'Alex Rivera');
  assert.equal(p.yearsOfExperience, 9);
  assert.deepEqual(p.families, ['data-science']);
  assert.equal(p.maxLevel, 'Lead'); // 9 yrs
  assert.ok(p.searchTerms.some((t) => /machine learning|data scientist/i.test(t)));
});

test('judgeTitle applies family, seniority, and clearance rules', () => {
  const p = buildProfile(JAVA_RESUME);
  const keep = [
    'Senior Java Full Stack Developer',
    'Software Engineer',
    'Java Developer',
    'Backend Engineer',
    'Associate Software Engineer',
    'Software Engineer II',
  ];
  for (const title of keep) {
    assert.equal(judgeTitle(title, p).matched, true, `expected "${title}" to match`);
  }

  const drop = [
    'Principal Software Engineer',   // above ceiling
    'Staff Engineer',                // above ceiling
    'Lead Java Developer',           // above ceiling
    'Engineering Manager',           // above ceiling
    'Machine Learning Engineer',     // unclaimed family
    'DevOps Engineer',               // unclaimed family
    'QA Automation Engineer',        // unclaimed family
    'Software Engineering Intern',   // below floor
    'Product Manager',               // not an IC engineering role
    'Java Developer (Top Secret Clearance Required)',
  ];
  for (const title of drop) {
    assert.equal(judgeTitle(title, p).matched, false, `expected "${title}" to be dropped`);
  }
});

test('a title with no known family still matches on skill score alone', () => {
  const p = buildProfile(JAVA_RESUME);
  const verdict = judgeTitle('Spring Boot Specialist', p);
  assert.equal(verdict.matched, true);
  assert.ok(verdict.score >= p.matchThreshold);
});

test('scoreTitle sums the profile weights present in the title', () => {
  const p = buildProfile(JAVA_RESUME);
  // Java (10) + Full Stack (7) = 17, matching the worked example in CLAUDE.md rule #6.
  assert.equal(scoreTitle('Senior Java Full Stack Developer', p).score, 17);
  assert.equal(scoreTitle('Software Engineer', p).score, 0);
});

test('inferYears prefers a stated claim and ignores education dates otherwise', () => {
  assert.deepEqual(inferYears('7+ years of professional experience in Java'), { years: 7, source: 'stated' });

  const dated = `EXPERIENCE
Software Engineer | Acme | Jan 2019 - Dec 2021
Software Engineer | Beta | Jan 2022 - Present

EDUCATION
BS Computer Science | 2011 - 2015`;
  const inferred = inferYears(dated);
  assert.equal(inferred.source, 'inferred-from-dates');
  // Measured from 2019, not from the 2011 degree start.
  assert.ok(inferred.years >= 6 && inferred.years < 12, `unexpected inferred years: ${inferred.years}`);
});

test('extractSkills does not match "Go" against ordinary prose', () => {
  const names = extractSkills('Ready to go live with the release. Java and Spring Boot.').map((s) => s.name);
  assert.ok(!names.includes('Go'), '"go" as a verb must not register the Go language');
  assert.ok(names.includes('Java'));
});

test('detectCountry reads the header only, not the employment history', () => {
  assert.equal(detectCountry(JAVA_RESUME), 'US');
  assert.equal(detectCountry('Priya Nair\nBengaluru, India | p@example.com\n\nJava Developer'), 'IN');
  // An offshore office named deep in the history must not relocate the search.
  assert.equal(
    detectCountry(`Jane Doe\nAustin, TX | j@example.com\n${'x'.repeat(700)}\nWorked with the Hyderabad team.`),
    'US',
  );
});

test('matchesCountry applies the US rule for US and keeps remote elsewhere', () => {
  assert.equal(matchesCountry(['Austin, TX'], 'US'), true);
  assert.equal(matchesCountry(['Toronto, Canada'], 'US'), false);
  assert.equal(matchesCountry(['Toronto, ON'], 'CA'), true);
  assert.equal(matchesCountry(['Remote'], 'CA'), true);
  assert.equal(matchesCountry(['Berlin, Germany'], 'ANY'), true);
});
