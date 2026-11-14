import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leverFormUrl, _private } from '../dist/apply/lever.js';
import { applyFormFor } from '../dist/apply/platforms.js';
import { autoApplyLink, parseAutoApplyLink } from '../dist/apply/protocol.js';

const ID = '1825c7df-ea96-4a2d-b57b-609a61300382';

test('Lever job URLs map to the /apply form; other hosts do not', () => {
  assert.equal(leverFormUrl(`https://jobs.lever.co/acme/${ID}`), `https://jobs.lever.co/acme/${ID}/apply`);
  assert.equal(leverFormUrl(`https://jobs.lever.co/acme/${ID}/apply?lever-source=x`), `https://jobs.lever.co/acme/${ID}/apply`);
  assert.equal(leverFormUrl(`https://jobs.eu.lever.co/acme/${ID}`), `https://jobs.eu.lever.co/acme/${ID}/apply`);
  assert.equal(leverFormUrl('https://jobs.lever.co/acme'), null);
  assert.equal(leverFormUrl('https://jobs.lever.co/acme/123'), null);
  assert.equal(leverFormUrl(`https://evil.example/jobs.lever.co/acme/${ID}`), null);
  assert.equal(applyFormFor(`https://jobs.lever.co/acme/${ID}/apply`).platform, 'lever');
  const link = autoApplyLink(`https://jobs.lever.co/acme/${ID}/apply`);
  assert.equal(parseAutoApplyLink(link), `https://jobs.lever.co/acme/${ID}/apply`);
});

test('pronoun checkboxes match the saved pronouns', () => {
  const opts = ['He/him', 'She/her', 'They/them', 'Use name only'];
  assert.equal(_private.pronounOption('She', opts), 'She/her');
  assert.equal(_private.pronounOption('she/her', opts), 'She/her');
  assert.equal(_private.pronounOption('they/them', opts), 'They/them');
  assert.equal(_private.pronounOption('ze/zir', opts), null);
});

test('Lever EEO option wording is matched by meaning', async () => {
  const { chooseOption } = await import('../dist/apply/standard-answers.js');
  const vet = ['I am a veteran', 'I am not a veteran', 'Decline to self-identify'];
  assert.equal(chooseOption('veteran', { veteran: 'no' }, vet), 'I am not a veteran');
  assert.equal(chooseOption('veteran', { veteran: 'yes' }, vet), 'I am a veteran');
  assert.equal(chooseOption('veteran', { veteran: 'decline' }, vet), 'Decline to self-identify');
  assert.equal(chooseOption('race', { race: 'Asian' }, ['Hispanic or Latino', 'White (Not Hispanic or Latino)', 'Asian (Not Hispanic or Latino)']), 'Asian (Not Hispanic or Latino)');
  assert.equal(chooseOption('sponsorship', { sponsorship: 'no' }, ['Yes', 'No']), 'No');
});

test('"authorized to work without sponsorship" needs both saved answers', async () => {
  const { classifyQuestion, chooseOption, savedAnswer } = await import('../dist/apply/standard-answers.js');
  const label = 'Are you currently authorized to work in the United States without employer sponsorship?';
  assert.equal(classifyQuestion(label), 'authorizedWithoutSponsorship');
  assert.equal(classifyQuestion('Will you now or in the future require employer sponsorship to work in the United States?'), 'sponsorship');
  assert.equal(chooseOption('authorizedWithoutSponsorship', { workAuthorized: 'yes', sponsorship: 'no' }, ['Yes', 'No']), 'Yes');
  assert.equal(chooseOption('authorizedWithoutSponsorship', { workAuthorized: 'yes', sponsorship: 'future' }, ['Yes', 'No']), 'No');
  assert.equal(chooseOption('authorizedWithoutSponsorship', { workAuthorized: 'no' }, ['Yes', 'No']), 'No');
  assert.equal(savedAnswer('authorizedWithoutSponsorship', { workAuthorized: 'yes' }), undefined); // sponsorship unknown: leave it
});

test('authorization and sponsorship wordings give Yes / No for an authorized candidate who needs no sponsorship', async () => {
  const { classifyQuestion, chooseOption } = await import('../dist/apply/standard-answers.js');
  const std = { workAuthorized: 'yes', sponsorship: 'no' };
  const answer = (q) => chooseOption(classifyQuestion(q), std, ['Yes', 'No']);
  for (const q of [
    'Are you currently authorized to work in the United States without employer sponsorship?',
    'Are you legally authorized to work in the US without the need for visa sponsorship?',
    'Are you eligible to work in the United States without sponsorship?',
    'Are you authorized to work in the U.S. without requiring sponsorship now or in the future?',
    'Are you legally authorized to work in the United States?',
  ]) assert.equal(answer(q), 'Yes', q);
  for (const q of [
    'Do you need sponsorship?',
    'Will you now or in the future require employer sponsorship to work in the United States?',
    'Will you require Stripe to sponsor you for a work permit now or in the future?',
    'Do you require visa sponsorship?',
  ]) assert.equal(answer(q), 'No', q);
});
