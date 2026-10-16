import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProfile } from '../dist/resume/build-profile.js';
import { byJdMatch, matchDescription } from '../dist/resume/jd-match.js';

const profile = buildProfile(`Jane Doe
SKILLS
Java, Spring Boot, Angular, AWS, Kafka, Docker, PostgreSQL

EXPERIENCE
Java Developer | Acme | Jan 2021 - Present
- Built Spring Boot services.`);

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
