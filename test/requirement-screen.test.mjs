import { test } from 'node:test';
import assert from 'node:assert/strict';
import { screenRequirementText } from '../dist/utils/requirement-screen.js';

const blocks = (text, kind) => {
  const v = screenRequirementText(text);
  assert.equal(v.blocked, true, `expected block: ${text}`);
  assert.equal(v.kind, kind, `wrong kind for: ${text}`);
};
const passes = (text) => {
  const v = screenRequirementText(text);
  assert.equal(v.blocked, false, `expected pass, blocked on: ${v.evidence}`);
};

test('clearance requirements are blocked', () => {
  blocks('Requirements: 3+ years of Java. Active Secret clearance required.', 'clearance');
  blocks('Must hold an active TS/SCI with polygraph.', 'clearance');
  blocks('Candidates must be able to obtain and maintain a DoD Secret clearance.', 'clearance');
  blocks('This role requires a Top Secret security clearance.', 'clearance');
  blocks('Ability to obtain a Public Trust.', 'clearance');
  blocks('Eligible for a government security clearance.', 'clearance');
  blocks('Current DOE Q clearance is required for this position.', 'clearance');
});

test('citizenship requirements are blocked', () => {
  blocks('Must be a U.S. citizen.', 'citizenship');
  blocks('US Citizenship is required due to federal contract requirements.', 'citizenship');
  blocks('Only United States citizens will be considered for this role.', 'citizenship');
  blocks('Basic Qualifications • U.S. Citizenship • 3+ years with Spring Boot', 'citizenship');
  blocks('Applicants must be U.S. persons as defined by ITAR.', 'citizenship');
  blocks('Must be a US citizen or green card holder.', 'citizenship');
});

test('EEO boilerplate mentioning citizenship is not a requirement', () => {
  passes(
    'We are an equal opportunity employer. All qualified applicants will receive consideration ' +
      'without regard to race, color, religion, sex, national origin, citizenship status, or protected veteran status.',
  );
  passes('We participate in E-Verify to confirm U.S. citizenship or work authorization.');
  passes('We do not discriminate on the basis of citizenship.');
});

test('negated requirements pass', () => {
  passes('No security clearance required. Strong Java and Angular skills.');
  passes('A clearance is not required for this role.');
  passes('You do not need to be a US citizen to apply.');
  // Defense-contractor field format (CACI, Northrop) answering "none" / "no".
  passes('Minimum Clearance Required to Start: None. Java and Spring Boot.');
  passes('CLEARANCE REQUIRED FOR START: No');
});

test('field format answering yes / a level is blocked', () => {
  blocks('Minimum Clearance Required to Start: Top Secret.', 'clearance');
  blocks('CLEARANCE REQUIRED FOR START: Yes.', 'clearance');
});

test('company-wide hedging about some roles passes; a direct requirement does not', () => {
  passes(
    'Accordingly, roles that carry more sensitive requirements may be limited to candidates that can ' +
      'satisfy additional scrutiny and eligibility may hinge on verification of U.S. person status.',
  );
  blocks('This position requires that the candidate be a US Citizen.', 'citizenship');
});

test('unrelated uses of the words pass', () => {
  passes('Experience with customs clearance workflows in logistics software is a plus.');
  passes('Build Spring Boot microservices on AWS with Kafka and PostgreSQL.');
  passes('Medical clearance and drug screening may be part of onboarding.');
  passes('');
  passes(undefined);
});

test('title-level requirements are caught when the description is empty', () => {
  blocks('Java Developer (TS/SCI). ', 'clearance');
  blocks('Software Engineer - Secret Clearance. ', 'clearance');
});

test('a requirement buried in a long unpunctuated run is still found', () => {
  // SpaceX: HTML bullets flattened to text merged the skills list with the ITAR paragraph
  // into one 884-char run, which the screen used to skip as "too coarse".
  const bullets = Array.from({ length: 12 }, (_, i) => `Experience with build system ${i} and package management`).join(' ');
  blocks(
    `${bullets} Must be willing to work extended hours and weekends as needed ITAR REQUIREMENTS: ` +
      'To conform to U.S. Government export regulations, applicant must be a (i) U.S. citizen or national, ' +
      '(ii) U.S. lawful, permanent resident (aka green card holder)',
    'citizenship',
  );
});
