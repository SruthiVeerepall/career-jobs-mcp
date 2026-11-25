import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProfile } from '../dist/resume/build-profile.js';
import { judgeTitle } from '../dist/resume/match-jobs.js';
import { matchDescription } from '../dist/resume/jd-match.js';
import { familyOfTitle, titleRank } from '../dist/resume/skill-taxonomy.js';

// Non-engineering résumés get their own roles; a developer's résumé never does.
// Every candidate here is fictional.

const ANALYST_RESUME = `Jordan Ellis
Denver, CO | jordan@example.com

SUMMARY
Data Analyst with 4 years of experience turning data into decisions.

SKILLS
SQL, Python, Pandas, Tableau, Power BI, Excel, Statistics, A/B Testing, Snowflake

EXPERIENCE
Senior Data Analyst | Northwind | Jan 2023 - Present
- Built Tableau dashboards over Snowflake; wrote SQL for weekly revenue reporting.
- Ran A/B testing analysis in Python and Pandas; presented results in Power BI.
- Automated Excel reporting with SQL extracts.

Business Intelligence Analyst | Contoso | Jun 2021 - Dec 2022
- SQL and Tableau reporting for finance; Excel models.

EDUCATION
BS Statistics | 2017 - 2021
`;

const PM_RESUME = `Jordan Ellis
Denver, CO | jordan@example.com

Product Manager with 6 years of experience.

EXPERIENCE
Senior Product Manager | Fabrikam | Mar 2022 - Present
- Owned the product roadmap; wrote PRDs and user stories in Jira.
Product Owner | Contoso | Jan 2019 - Feb 2022
- Requirements gathering with stakeholders; A/B testing of onboarding.
`;

const JAVA_RESUME = `Jordan Ellis
Denver, CO | jordan@example.com
Java Full Stack Developer with 5 years of professional experience.
EXPERIENCE
Java Full Stack Developer | Northwind | Mar 2023 - Present
- Spring Boot microservices, Angular front ends, AWS.
Software Engineer | Contoso | Aug 2020 - Jun 2021
`;

test('a data analyst résumé claims the analytics family, not software', () => {
  const p = buildProfile(ANALYST_RESUME);
  assert.ok(p.families.includes('data-analytics'), `families: ${p.families}`);
  assert.ok(!p.families.includes('generic-swe'));
  assert.ok(!p.families.includes('backend'));
  assert.ok(p.searchTerms.some((t) => /data analyst/i.test(t)), `terms: ${p.searchTerms}`);
  // Python is its strongest core skill, but an analyst must not be searched as a developer.
  assert.ok(!p.searchTerms.some((t) => /developer/i.test(t)), `terms: ${p.searchTerms}`);
  for (const s of ['SQL', 'Tableau', 'Power BI', 'Excel', 'Statistics', 'A/B Testing']) {
    assert.ok(p.skills.some((k) => k.name === s), `missing skill ${s}`);
  }
});

test('analyst jobs are kept for an analyst and dropped for a developer', () => {
  const analyst = buildProfile(ANALYST_RESUME);
  const dev = buildProfile(JAVA_RESUME);
  for (const title of ['Data Analyst', 'Senior Data Analyst', 'Business Intelligence Analyst', 'Marketing Analyst', 'Product Analyst II']) {
    assert.equal(judgeTitle(title, analyst).matched, true, `analyst should keep "${title}"`);
    assert.equal(judgeTitle(title, dev).matched, false, `developer should drop "${title}"`);
  }
  for (const title of ['Software Engineer', 'Java Developer', 'Data Scientist', 'Principal Data Analyst']) {
    assert.equal(judgeTitle(title, analyst).matched, false, `analyst should drop "${title}"`);
  }
});

test('a developer still sees engineering jobs that merely name a business area', () => {
  const dev = buildProfile(JAVA_RESUME);
  for (const title of ['Backend Engineer, Payroll', 'Full Stack Developer - Marketing', 'Software Engineer, Accounting Platform']) {
    assert.equal(judgeTitle(title, dev).matched, true, `expected "${title}" kept`);
  }
  for (const title of ['Product Manager', 'UX Designer', 'Account Executive', 'Recruiter', 'Technical Writer', 'Solutions Architect']) {
    assert.equal(judgeTitle(title, dev).matched, false, `expected "${title}" dropped`);
  }
});

test('"Manager" in a role name is not a seniority rung', () => {
  assert.equal(titleRank('Product Manager'), 2);
  assert.equal(titleRank('Senior Product Manager'), 3);
  assert.equal(titleRank('Account Executive'), 2);
  assert.equal(titleRank('Engineering Manager'), 6);
  assert.equal(titleRank('Director of Product Management'), 7);

  const pm = buildProfile(PM_RESUME);
  assert.ok(pm.families.includes('product'), `families: ${pm.families}`);
  assert.equal(pm.maxLevel, 'Senior'); // 6 yrs; "Product Manager" must not lift it to Manager
  assert.equal(judgeTitle('Product Manager', pm).matched, true);
  assert.equal(judgeTitle('Senior Product Manager, Growth', pm).matched, true);
  assert.equal(judgeTitle('Group Product Manager', pm).matched, true);
  assert.equal(judgeTitle('Director of Product Management', pm).matched, false);
  assert.equal(judgeTitle('Software Engineer', pm).matched, false);
});

test('role family rules for non-engineering titles', () => {
  const cases = {
    'Data Analyst': 'data-analytics',
    'BI Analyst': 'data-analytics',
    'Business Intelligence Engineer': 'data-engineering',
    'Business Systems Analyst': 'business-analysis',
    'Technical Program Manager': 'project-management',
    'Scrum Master': 'project-management',
    'Senior UX Designer': 'design',
    'UX Researcher': 'design',
    'Sales Engineer': 'solutions',
    'Account Executive': 'sales',
    'Product Marketing Manager': 'marketing',
    'Customer Success Manager': 'customer-support',
    'Technical Recruiter': 'recruiting',
    'Senior Accountant': 'finance',
    'Salesforce Developer': null, // not "sales"
  };
  for (const [title, family] of Object.entries(cases)) {
    assert.equal(familyOfTitle(title), family, title);
  }
});

const DOTNET_RESUME = `Jordan Ellis
Denver, CO | jordan@example.com
.NET Developer with 4 years of experience.
EXPERIENCE
.NET Developer | Northwind | Jan 2022 - Present
- C#, ASP.NET Core, Azure, SQL Server.
C# Software Engineer | Contoso | Jan 2021 - Dec 2021
`;

const DATA_ENGINEER_RESUME = `Jordan Ellis
Denver, CO | jordan@example.com
Data Engineer with 4 years of experience.
EXPERIENCE
Data Engineer | Northwind | Jan 2022 - Present
- Spark, Airflow, Snowflake, dbt, Python, SQL, Kafka on AWS.
ETL Developer | Contoso | Jan 2021 - Dec 2021
`;

test('a .NET résumé is read as backend and gets .NET / C# jobs', () => {
  // `\b.net` never matched after a space, so ".NET Developer" was not read as a held title.
  assert.equal(familyOfTitle('.NET Developer'), 'backend');
  assert.equal(familyOfTitle('Senior ASP.NET Core Developer'), 'backend');
  assert.equal(familyOfTitle('C# Software Engineer'), 'backend');
  const p = buildProfile(DOTNET_RESUME);
  assert.ok(p.families.includes('backend'), `families: ${p.families}`);
  assert.ok(p.searchTerms.includes('.NET Developer'), `terms: ${p.searchTerms}`);
  for (const title of ['.NET Developer', 'Senior .NET Developer', 'C# Developer', 'ASP.NET Developer', 'Software Engineer (.NET)']) {
    assert.equal(judgeTitle(title, p).matched, true, `expected "${title}" kept`);
  }
  for (const title of ['Data Engineer', 'Data Analyst', 'Lead .NET Developer']) {
    assert.equal(judgeTitle(title, p).matched, false, `expected "${title}" dropped`);
  }
});

test('a data engineer résumé gets data engineering jobs and no developer query it would drop', () => {
  const p = buildProfile(DATA_ENGINEER_RESUME);
  assert.deepEqual(p.families, ['data-engineering']);
  assert.ok(!p.searchTerms.includes('Python Developer'), `terms: ${p.searchTerms}`);
  for (const title of ['Data Engineer', 'Senior Data Engineer', 'Analytics Engineer', 'ETL Developer']) {
    assert.equal(judgeTitle(title, p).matched, true, `expected "${title}" kept`);
  }
  for (const title of ['Java Developer', '.NET Developer', 'Data Analyst', 'Data Scientist']) {
    assert.equal(judgeTitle(title, p).matched, false, `expected "${title}" dropped`);
  }
});

const dev = (title, prev, skills) => `Jordan Ellis
Denver, CO | jordan@example.com
${title} with 4 years of experience.
SKILLS
${skills}
EXPERIENCE
${title} | Northwind | Jan 2022 - Present
- Work using ${skills}.
${prev} | Contoso | Jan 2021 - Dec 2021
`;

test('a title naming a language needs that language on the résumé', () => {
  // The backend family spans every language: a Python developer was offered "Java Developer".
  const py = buildProfile(dev('Python Developer', 'Software Engineer', 'Python, Django, PostgreSQL, AWS'));
  for (const t of ['Python Developer', 'Senior Python Engineer', 'Backend Engineer', 'Software Engineer', 'Java / Python Developer']) {
    assert.equal(judgeTitle(t, py).matched, true, `python résumé should keep "${t}"`);
  }
  for (const t of ['Java Developer', '.NET Developer', 'Golang Engineer', 'Backend Software Engineer (Rust)']) {
    assert.equal(judgeTitle(t, py).matched, false, `python résumé should drop "${t}"`);
  }
  const java = buildProfile(JAVA_RESUME);
  for (const t of ['.NET & React Full Stack Developer', 'C# Developer', 'C++ Software Engineer', 'iOS Engineer']) {
    assert.equal(judgeTitle(t, java).matched, false, `java résumé should drop "${t}"`);
  }
  assert.equal(judgeTitle('Senior Java Full Stack Developer', java).matched, true);
  // C# and .NET imply each other.
  const cs = buildProfile(dev('Software Engineer', 'Backend Developer', 'C#, Azure, SQL Server'));
  assert.equal(judgeTitle('.NET Developer', cs).matched, true);
  // An iOS developer is not offered Android jobs, and vice versa.
  const ios = buildProfile(dev('iOS Developer', 'Mobile Engineer', 'Swift, iOS'));
  assert.equal(judgeTitle('iOS Engineer', ios).matched, true);
  assert.equal(judgeTitle('Android Engineer', ios).matched, false);
});

test('"Go-to-Market" is not the Go language', async () => {
  const { stackSkillsInTitle } = await import('../dist/resume/skill-taxonomy.js');
  assert.deepEqual(stackSkillsInTitle('AI Solution Developer Go-to-Market').map((s) => s.name), []);
  assert.deepEqual(stackSkillsInTitle('Backend Developer - Go').map((s) => s.name), ['Go']);
});

test('Rails, cybersecurity and staff accountant titles', () => {
  const ruby = buildProfile(dev('Ruby on Rails Developer', 'Software Engineer', 'Ruby on Rails, PostgreSQL'));
  assert.ok(ruby.families.includes('backend'), `families: ${ruby.families}`);
  assert.equal(judgeTitle('Ruby Developer', ruby).matched, true);
  assert.equal(familyOfTitle('Cybersecurity Engineer'), 'security');
  assert.equal(titleRank('Staff Accountant'), 2);
  assert.equal(titleRank('Staff Software Engineer'), 4);
  assert.equal(buildProfile(dev('Staff Accountant', 'Accountant', 'GAAP, QuickBooks, Excel')).maxLevel, 'Senior');
});

test('JD match scores an analyst JD on analyst skills', () => {
  const p = buildProfile(ANALYST_RESUME);
  const jd = matchDescription('Strong SQL and Tableau. Excel and Python. Experience with A/B testing and statistics.', p);
  assert.equal(jd.status, 'scored');
  assert.ok(jd.percent >= 80, `got ${jd.percent}`);
  assert.deepEqual(jd.missingSkills, []);
});

test('"excel at" is the verb, not Microsoft Excel', () => {
  const dev = buildProfile(JAVA_RESUME);
  const jd = matchDescription('You will excel at building Java services.', dev);
  assert.ok(!jd.missingSkills.includes('Excel'), `missing: ${jd.missingSkills}`);
});

test("the employer's own name is not counted as a required skill", () => {
  const dev = buildProfile(JAVA_RESUME);
  const text = 'At Snowflake, you will build Java services for Snowflake customers. Snowflake grows fast.';
  const anywhere = matchDescription(text, dev);
  assert.ok(anywhere.missingSkills.includes('Snowflake'));
  const atEmployer = matchDescription(text, dev, 'Snowflake Inc.');
  assert.deepEqual(atEmployer.missingSkills, []);
  assert.ok(atEmployer.percent > anywhere.percent, `${atEmployer.percent} vs ${anywhere.percent}`);
});
