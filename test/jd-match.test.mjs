import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProfile } from '../dist/resume/build-profile.js';
import { byJdMatch, matchDescription, skillStrength } from '../dist/resume/jd-match.js';

const profile = buildProfile(`Jane Doe
SKILLS
Java, Spring Boot, Angular, AWS, Kafka, Docker, PostgreSQL

EXPERIENCE
Java Developer | Northwind | Jan 2021 - Present
- Built Java microservices with Spring Boot on AWS, streaming events through Kafka.
- Moved Java batch jobs to Spring Boot, deployed on AWS ECS with Docker; Kafka consumers.
- Tuned Java and Spring Boot APIs over PostgreSQL; AWS Lambda jobs fed by Kafka.
- PostgreSQL schema design; PostgreSQL query tuning.`);

// A Java developer who used Python once, in a side project (the case that used to score 100%).
const javaDevWithPythonProject = buildProfile(`Jordan Ellis
SKILLS
Java, Spring Boot, AWS, Python

EXPERIENCE
Java Developer | Contoso | Jan 2021 - Present
- Built Java services with Spring Boot on AWS.
- Migrated Java batch jobs to Spring Boot.
- Java and Spring Boot APIs on AWS.

PROJECTS
- Expense tracker written in Python.`);

test('a JD asking only for the resume\'s skills is a 100% match', () => {
  const jd = matchDescription('We need Java and Spring Boot experience, plus AWS and Kafka.', profile);
  assert.equal(jd.status, 'scored');
  assert.equal(jd.percent, 100);
  assert.deepEqual(jd.missingSkills, []);
});

test('a JD for a different stack scores low and lists what is missing', () => {
  const jd = matchDescription('Strong Python, Django and Go (Golang) skills. Docker a plus.', profile);
  assert.equal(jd.status, 'scored');
  assert.ok(jd.percent < 20, `expected < 20, got ${jd.percent}`);
  assert.deepEqual(jd.matchedSkills, ['Docker']);
  assert.ok(jd.missingSkills.includes('Python') && jd.missingSkills.includes('Django'));
});

test('missing a core skill costs more than missing a tool', () => {
  const missingCore = matchDescription('Java, Python, Docker.', profile).percent;
  const missingTool = matchDescription('Java, Python, Docker, Terraform.', profile).percent;
  const missingOnlyTool = matchDescription('Java, Docker, Terraform.', profile).percent;
  assert.ok(missingOnlyTool > missingCore);
  assert.ok(missingTool < missingCore);
});

test('an unreadable or skill-free JD is unscored, not zero', () => {
  assert.deepEqual(matchDescription(undefined, profile), { percent: null, status: 'no-description', matchedSkills: [], missingSkills: [] });
  assert.equal(matchDescription('Join our friendly team and grow your career.', profile).status, 'no-known-skills');
});

test('byJdMatch sorts best fit first and unscored last', () => {
  const rows = [{ jdMatchPercent: null }, { jdMatchPercent: 20 }, { jdMatchPercent: 0 }, { jdMatchPercent: 90 }];
  assert.deepEqual(rows.sort(byJdMatch).map((r) => r.jdMatchPercent), [90, 20, 0, null]);
});

test('every skill the JD asks for that the resume lacks lowers the score', () => {
  // Each of these was outside the taxonomy once, so the JD scored 100% on Java alone.
  const jd = matchDescription(
    'Required: Java, Spring Boot, Cassandra, Elasticsearch. Experience with Datadog, Grafana, Helm, OpenShift, gRPC, Redux, Jest and Gradle.',
    profile,
  );
  assert.ok(jd.percent < 60, `expected < 60, got ${jd.percent}`);
  for (const s of ['Cassandra', 'Elasticsearch', 'Datadog', 'Grafana', 'Helm', 'OpenShift', 'gRPC', 'Redux', 'Jest', 'Gradle']) {
    assert.ok(jd.missingSkills.includes(s), `${s} should be missing`);
  }
  const fewer = matchDescription('Java, Spring Boot, Cassandra.', profile).percent;
  const more = matchDescription('Java, Spring Boot, Cassandra, Gradle.', profile).percent;
  assert.ok(more < fewer, 'adding a missing skill must lower the percentage');
});

test('a skill implied by the resume is not a gap', () => {
  // PostgreSQL is SQL; a JD asking for "SQL" should not penalise it.
  const jd = matchDescription('Java and strong SQL.', profile);
  assert.equal(jd.percent, 100);
  assert.ok(jd.matchedSkills.includes('SQL'));
});

test('English words are not read as skills', () => {
  const jd = matchDescription('The rest of the team will go live with soap. Java required.', profile);
  assert.deepEqual(jd.missingSkills, []);
});

test('a skill the JD repeats weighs more than one it names once', () => {
  // Same skills, same tiers (Java core, Python core); only the repetition differs.
  const javaHeavy = matchDescription('Java. Java services. Java APIs. Python a plus.', profile).percent;
  const pythonHeavy = matchDescription('Python. Python services. Python APIs. Java a plus.', profile).percent;
  const even = matchDescription('Java and Python.', profile).percent;
  assert.equal(even, 50);
  assert.ok(javaHeavy > even, `repeating a skill the resume has should raise the score (${javaHeavy})`);
  assert.ok(pythonHeavy < even, `repeating a skill the resume lacks should lower it (${pythonHeavy})`);
});

test('emphasis is capped so keyword stuffing cannot dominate', () => {
  const stuffed = matchDescription(`${'Java '.repeat(40)} Python.`, profile).percent;
  // 10*3 / (10*3 + 10*1) = 75 — the cap, not 40x.
  assert.equal(stuffed, 75);
});

test('every JD skill found in the resume is still 100%, however often repeated', () => {
  assert.equal(matchDescription('Java, Java, Java, Spring Boot, Kafka, Kafka.', profile).percent, 100);
});

test('a skill only listed or used in a side project earns partial credit', () => {
  const python = javaDevWithPythonProject.skills.find((s) => s.name === 'Python');
  assert.equal(python.workMentions, 0);
  assert.equal(skillStrength(python), 0.5);
  const java = javaDevWithPythonProject.skills.find((s) => s.name === 'Java');
  assert.ok(java.workMentions >= 3);
  assert.equal(skillStrength(java), 1);
});

test('a Python-heavy JD is not a 100% match for a Java developer with one Python project', () => {
  const pythonJd = matchDescription(
    'Senior Python engineer. Python services, Python APIs, Python data pipelines, Python testing. AWS experience a plus.',
    javaDevWithPythonProject,
  );
  assert.ok(pythonJd.percent < 65, `expected < 65, got ${pythonJd.percent}`);
  assert.ok(pythonJd.matchedSkills.includes('Python'), 'Python is still matched, only weaker');

  const javaJd = matchDescription(
    'Java engineer. Java services, Java APIs with Spring Boot, Java testing. Python a plus. AWS.',
    javaDevWithPythonProject,
  );
  assert.ok(javaJd.percent >= 90, `expected >= 90, got ${javaJd.percent}`);
  assert.ok(javaJd.percent > pythonJd.percent + 25);
});

test('skill strength scale', () => {
  assert.equal(skillStrength({ mentions: 5, workMentions: 3 }), 1);
  assert.equal(skillStrength({ mentions: 3, workMentions: 2 }), 0.9);
  assert.equal(skillStrength({ mentions: 2, workMentions: 1 }), 0.8);
  assert.equal(skillStrength({ mentions: 2, workMentions: 0 }), 0.5);
  // No experience header: judged by total mentions, never as "listed only".
  assert.equal(skillStrength({ mentions: 1 }), 0.8);
  assert.equal(skillStrength({ mentions: 4 }), 1);
});
