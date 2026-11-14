import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyQuestion, chooseOption, setupHint } from '../dist/apply/standard-answers.js';

// Labels and option lists copied from live Greenhouse forms (Coinbase, Airbnb, Stripe, Discord, Robinhood).
test('labels map to the standard question they ask', () => {
  const cases = {
    'Are you legally authorized to work in the United States for our Company?': 'workAuthorized',
    'Are you legally work authorized to work in the US?': 'workAuthorized',
    'Will you require sponsorship for employment visa status now or in the future?': 'sponsorship',
    'Will you require Stripe to sponsor you for a work permit now or in the future?': 'sponsorship',
    'What are your pronouns?': 'pronouns',
    'Gender': 'gender', 'Gender Identity (optional)': 'gender',
    'Are you Hispanic/Latino?': 'hispanic',
    'Race and Ethnicity': 'race', 'What is your race or ethnicity?': 'race',
    'Veteran Status': 'veteran', 'What is your disability status?': 'disability',
    'I consider myself a member of the LGBTQ+ community. (optional)': 'lgbtq',
  };
  for (const [label, key] of Object.entries(cases)) assert.equal(classifyQuestion(label), key, label);
  assert.equal(classifyQuestion('Do you identify as transgender?'), null);
  assert.equal(classifyQuestion('How did you hear about this job?'), null);
});

const AIRBNB_AUTH = ['Yes, I am currently legally authorized to work in the country where the job is located.', 'No, I am not currently legally authorized to work in the country where the job is located.'];
const AIRBNB_SPONSOR = ['Yes, I will require immigration sponsorship now to legally work in the country where the job is located.', 'Yes, I will require immigration sponsorship in the future to legally work in the country where the job is located.', 'No, I do not and will not require immigration sponsorship to legally work in the country where the job is located.'];

test('yes/no questions, including full-sentence options', () => {
  assert.equal(chooseOption('workAuthorized', { workAuthorized: 'yes' }, ['Yes', 'No']), 'Yes');
  assert.equal(chooseOption('workAuthorized', { workAuthorized: 'yes' }, AIRBNB_AUTH), AIRBNB_AUTH[0]);
  assert.equal(chooseOption('sponsorship', { sponsorship: 'no' }, AIRBNB_SPONSOR), AIRBNB_SPONSOR[2]);
  assert.equal(chooseOption('sponsorship', { sponsorship: 'future' }, AIRBNB_SPONSOR), AIRBNB_SPONSOR[1]);
  assert.equal(chooseOption('sponsorship', { sponsorship: 'now' }, AIRBNB_SPONSOR), AIRBNB_SPONSOR[0]);
  assert.equal(chooseOption('sponsorship', { sponsorship: 'future' }, ['Yes', 'No']), 'Yes');
  assert.equal(chooseOption('sponsorship', {}, ['Yes', 'No']), null); // never answered: left alone
});

test('demographic options match on meaning, and decline finds each board wording', () => {
  assert.equal(chooseOption('gender', { gender: 'female' }, ['Male', 'Female', 'Decline To Self Identify']), 'Female');
  assert.equal(chooseOption('gender', { gender: 'female' }, ['Man', 'Woman', 'Non-binary or third gender', 'Genderqueer', "I don't wish to answer"]), 'Woman');
  assert.equal(chooseOption('gender', { gender: 'male' }, ['Male', 'Female', 'Other']), 'Male');
  assert.equal(chooseOption('gender', { gender: 'decline' }, ['Male', 'Female', 'Decline To Self Identify']), 'Decline To Self Identify');
  assert.equal(chooseOption('hispanic', { hispanic: 'no' }, ['Yes', 'No', 'Decline To Self Identify']), 'No');
  const vet = ['I am not a protected veteran', 'I identify as one or more of the classifications of a protected veteran', "I don't wish to answer"];
  assert.equal(chooseOption('veteran', { veteran: 'no' }, vet), vet[0]);
  assert.equal(chooseOption('veteran', { veteran: 'yes' }, vet), vet[1]);
  assert.equal(chooseOption('veteran', { veteran: 'decline' }, vet), vet[2]);
  const dis = ["Yes, I have a disability, or have had one in the past", "No, I do not have a disability and have not had one in the past", "I don't wish to answer"];
  assert.equal(chooseOption('disability', { disability: 'no' }, dis), dis[1]);
  assert.equal(chooseOption('disability', { disability: 'no' }, ['Yes, I have a disability', "No, I don't have a disability", "I don't wish to answer"]), "No, I don't have a disability");
  assert.equal(chooseOption('pronouns', { pronouns: 'she/her' }, ['He/him/his', 'She/her/hers', 'They/them/theirs']), 'She/her/hers');
});

test('race: exact or detailed match only; an ambiguous list is left for the candidate', () => {
  const eeoc = ['American Indian or Alaska Native', "I don't wish to answer", 'Asian', 'Black or African American', 'Hispanic or Latino', 'White', 'Two or More Races'];
  const detailed = ['American Indian or Alaskan Native', 'Black or African American', 'East Asian', 'Hispanic or Latino', 'South Asian', 'Southeast Asian', 'White', "I don't wish to answer"];
  assert.equal(chooseOption('race', { race: 'Asian' }, eeoc), 'Asian');
  assert.equal(chooseOption('race', { race: 'Asian' }, detailed), null);
  assert.equal(chooseOption('race', { race: 'Asian', raceDetail: 'South Asian' }, detailed), 'South Asian');
  assert.equal(chooseOption('race', { race: 'Asian', raceDetail: 'South Asian' }, eeoc), 'Asian');
  assert.equal(chooseOption('race', { race: 'decline' }, detailed), "I don't wish to answer");
});

test('setup hint names only what the one-time answers would cover', () => {
  assert.match(setupHint(['Linkedin Profile URL', 'Will you require sponsorship for employment visa status now or in the future?'], {}, false), /LinkedIn URL; Will you now or in the future require visa sponsorship\?.*--setup/);
  assert.equal(setupHint(['Why do you want to work here?'], {}, false), null);
  assert.equal(setupHint(['Linkedin Profile URL'], {}, true), null);
});

test('résumé facts answer location, residence and legal-name questions', async () => {
  const { classifyDerived, derivedText, chooseDerived } = await import('../dist/apply/standard-answers.js');
  const f = { fullName: 'Jordan Ellis', city: 'Denver', state: 'CO', inUS: true };
  assert.equal(classifyDerived('Full Legal Name'), 'legalName');
  assert.equal(classifyDerived('Full Legal Name in Native Language (e.g. Chinese Characters, Cyrillic, Farsi etc)'), null);
  assert.equal(classifyDerived('Your Location'), 'currentLocation');
  assert.equal(classifyDerived('Are you currently located in the US?'), 'locatedInUS');
  assert.equal(classifyDerived('To ensure timezone alignment with this particular team, we are prioritizing candidates based in the UK, Spain, Ireland, the US, or Canada. Are you based in these locations?'), 'locatedInUS');
  assert.equal(classifyDerived('In which country do you currently reside and intend to work?'), 'residenceCountry');
  assert.equal(classifyDerived('In which country/region do you have citizenship?'), null);
  assert.equal(classifyDerived('Are you open to relocation?'), null);
  assert.equal(classifyDerived('What is your preferred office location?'), null);
  assert.equal(derivedText('legalName', f), 'Jordan Ellis');
  assert.equal(derivedText('currentLocation', f), 'Denver, CO');
  assert.equal(chooseDerived('residenceCountry', f, ['United States', 'Canada', 'None of the above']), 'United States');
  assert.equal(chooseDerived('locatedInUS', f, ['Yes', 'No']), 'Yes');
  assert.equal(chooseDerived('locatedInUS', { ...f, inUS: false }, ['Yes', 'No']), null);
  assert.equal(classifyQuestion('If offered employment by Amazon, would you be legally eligible to begin employment immediately?'), 'workAuthorized');
});
