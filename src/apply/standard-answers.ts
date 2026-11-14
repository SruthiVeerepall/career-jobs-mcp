// Answers to the questions nearly every application asks and no résumé contains: work
// authorization, sponsorship, pronouns, and the voluntary EEO / demographic questions.
//
// The candidate gives them ONCE (`node auto-apply.mjs --setup`, saved under `standard` in
// apply-profile.json). They are never inferred from a name or a résumé. Every demographic
// question accepts "decline" as an answer, which picks the form's "Decline to self identify" /
// "I don't wish to answer" option.
//
// Boards word the same question and its options differently ("Female" vs "Woman", "Decline To
// Self Identify" vs "I don't wish to answer", Airbnb's full-sentence Yes/No options), so
// options are matched on meaning. If no option clearly matches, or two match equally (an
// "Asian" answer against "East Asian" / "South Asian"), nothing is picked and the field is
// left for the candidate.

export type YesNo = 'yes' | 'no';
export type YesNoDecline = 'yes' | 'no' | 'decline';

export interface StandardAnswers {
  workAuthorized?: YesNo;
  /** no = never; now = needs it now; future = will need it later. */
  sponsorship?: 'no' | 'now' | 'future';
  /** As written, e.g. "she/her". */
  pronouns?: string;
  gender?: 'female' | 'male' | 'non-binary' | 'decline';
  hispanic?: YesNoDecline;
  /** One of RACES, or 'decline'. */
  race?: string;
  /** Optional finer answer for boards with a detailed list, e.g. "South Asian". */
  raceDetail?: string;
  veteran?: YesNoDecline;
  disability?: YesNoDecline;
  lgbtq?: YesNoDecline;
}

export type StandardKey = Exclude<keyof StandardAnswers, 'raceDetail'>;

export const RACES = [
  'American Indian or Alaska Native', 'Asian', 'Black or African American', 'Hispanic or Latino',
  'Native Hawaiian or Other Pacific Islander', 'White', 'Two or More Races',
];

/** Which standard question a form label asks, or null. Order matters: "sponsor" before "authorized". */
export function classifyQuestion(label: string): StandardKey | null {
  const l = label.toLowerCase();
  if (/sponsor/.test(l)) return 'sponsorship';
  if (/authori[sz]ed to work|work authori[sz]|eligible to work|right to work|legally (?:able|permitted) to work|legally eligible to (?:begin|start|accept)/.test(l)) return 'workAuthorized';
  if (/pronoun/.test(l)) return 'pronouns';
  if (/lgbt/.test(l)) return 'lgbtq';
  if (/veteran/.test(l)) return 'veteran';
  if (/disabilit/.test(l)) return 'disability';
  if (/hispanic|latin[oax]/.test(l) && !/\brace\b/.test(l)) return 'hispanic';
  if (/\brace\b|ethnicit/.test(l)) return 'race';
  if (/\bgender\b/.test(l) && !/transgender/.test(l)) return 'gender';
  return null;
}

const DECLINE = /decline|don'?t wish|do not wish|prefer not|not to (?:answer|disclose|say|identify)|choose not|rather not|not wish to/;
const n = (s: string) => s.toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();
const startsYes = (o: string) => /^yes\b/.test(o);
const startsNo = (o: string) => /^no\b/.test(o);

/** The single best option, or null when none fits or the best is a tie. */
function best(options: string[], score: (o: string) => number): string | null {
  const scored = options.map((o) => ({ o, s: score(n(o)) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  if (!scored.length) return null;
  if (scored.length > 1 && scored[1].s === scored[0].s) return null;
  return scored[0].o;
}

const yesNoDecline = (v: YesNoDecline) => (o: string) =>
  v === 'decline' ? (DECLINE.test(o) ? 10 : 0) : DECLINE.test(o) ? 0 : v === 'yes' ? (startsYes(o) ? 10 : 0) : (startsNo(o) ? 10 : 0);

/** Pick the option of a dropdown that answers `key`, or null to leave it for the candidate. */
export function chooseOption(key: StandardKey, a: StandardAnswers, options: string[]): string | null {
  const v = a[key];
  if (!v) return null;
  switch (key) {
    case 'workAuthorized': return best(options, (o) => (a.workAuthorized === 'yes' ? startsYes(o) : startsNo(o)) ? 10 : 0);
    case 'sponsorship': return best(options, (o) => {
      if (a.sponsorship === 'no') return startsNo(o) ? 10 : 0;
      if (!startsYes(o)) return 0;
      // "Yes, now" vs "Yes, in the future" on boards that split them; a plain "Yes" otherwise.
      const now = /\bnow\b|currently|immediately/.test(o), fut = /future|later/.test(o);
      if (a.sponsorship === 'now') return now ? 10 : fut ? 0 : 5;
      return fut ? 10 : now ? 0 : 5;
    });
    case 'pronouns': {
      const first = n(String(v)).split(/[\s/,]+/)[0];
      return best(options, (o) => (o === n(String(v)) ? 10 : first && o.split(/[\s/,]+/)[0] === first ? 8 : 0));
    }
    case 'gender': return best(options, (o) => {
      if (a.gender === 'decline') return DECLINE.test(o) ? 10 : 0;
      if (DECLINE.test(o)) return 0;
      if (a.gender === 'female') return /^(female|woman|women)\b/.test(o) ? 10 : /\b(female|woman)\b/.test(o) ? 6 : 0;
      if (a.gender === 'male') return /^(male|man|men)\b/.test(o) ? 10 : /\b(male|man)\b/.test(o) && !/female|woman/.test(o) ? 6 : 0;
      return /non.?binary|third gender/.test(o) ? 10 : 0;
    });
    case 'race': {
      if (n(String(v)) === 'decline') return best(options, (o) => (DECLINE.test(o) ? 10 : 0));
      const wants = [a.raceDetail, String(v)].filter(Boolean).map((x) => n(x as string));
      for (const w of wants) {
        const hit = best(options, (o) => (DECLINE.test(o) ? 0 : o === w ? 10 : o.startsWith(w) || w.startsWith(o) ? 6 : 0));
        if (hit) return hit;
      }
      return null;
    }
    case 'hispanic': case 'disability': case 'lgbtq':
      return best(options, yesNoDecline(v as YesNoDecline));
    case 'veteran': return best(options, (o) => {
      if (a.veteran === 'decline') return DECLINE.test(o) ? 10 : 0;
      if (DECLINE.test(o)) return 0;
      const not = /\bnot\b|^no\b/.test(o);
      return a.veteran === 'no' ? (not ? 10 : 0) : (!not && /veteran|^yes\b/.test(o) ? 10 : 0);
    });
  }
  return null;
}

/** The setup questionnaire: one entry per standard answer, in the order asked. */
export const SETUP_QUESTIONS: { key: keyof StandardAnswers; question: string; choices?: string[]; free?: boolean }[] = [
  { key: 'workAuthorized', question: 'Are you legally authorized to work in the United States?', choices: ['yes', 'no'] },
  { key: 'sponsorship', question: 'Will you now or in the future require visa sponsorship?', choices: ['no', 'now', 'future'] },
  { key: 'pronouns', question: 'Your pronouns (e.g. she/her), or leave blank to skip', free: true },
  { key: 'gender', question: 'Gender (voluntary EEO question)', choices: ['female', 'male', 'non-binary', 'decline'] },
  { key: 'hispanic', question: 'Are you Hispanic or Latino? (voluntary)', choices: ['yes', 'no', 'decline'] },
  { key: 'race', question: 'Race (voluntary)', choices: [...RACES, 'decline'] },
  { key: 'raceDetail', question: 'More specific, for boards with a detailed list (e.g. South Asian, East Asian), or blank', free: true },
  { key: 'veteran', question: 'Are you a protected veteran? (voluntary)', choices: ['no', 'yes', 'decline'] },
  { key: 'disability', question: 'Do you have a disability? (voluntary)', choices: ['no', 'yes', 'decline'] },
  { key: 'lgbtq', question: 'Do you identify as LGBTQ+? (voluntary)', choices: ['no', 'yes', 'decline'] },
];

/**
 * A one-line nudge when required questions were left only because the one-time answers are
 * missing (no LinkedIn URL saved, sponsorship never answered…). Null when setup would not help.
 */
export function setupHint(needsYou: string[], std: StandardAnswers | undefined, hasLinkedin: boolean): string | null {
  const missing = new Set<string>();
  for (const label of needsYou) {
    if (/linked ?in/i.test(label) && !hasLinkedin) missing.add('LinkedIn URL');
    const key = classifyQuestion(label);
    if (key && !std?.[key]) missing.add(SETUP_QUESTIONS.find((q) => q.key === key)?.question.replace(/ \(.*\)$/, '') ?? key);
  }
  if (!missing.size) return null;
  return `Answer these once and every form fills them: ${[...missing].join('; ')}. Run: node auto-apply.mjs --setup`;
}

// ---- facts the résumé already gives (no setup needed) ----
// Full name, current city/state, and from those "located in the US" / "country of residence".
// Citizenship, relocation and "willing to work from the office" are NOT derived: they are not
// on a résumé, so they stay with the candidate.

export type DerivedKey = 'legalName' | 'currentLocation' | 'locatedInUS' | 'residenceCountry';
export interface ApplicantFacts { fullName?: string; city?: string; state?: string; inUS: boolean }

export function classifyDerived(label: string): DerivedKey | null {
  const l = label.toLowerCase();
  if (/legal name/.test(l) && !/native|other language|characters/.test(l)) return 'legalName';
  if (/which country|country of residence|country (?:do|in which) you (?:currently )?(?:reside|live)/.test(l) && !/citizen/.test(l)) return 'residenceCountry';
  if (/\b(?:located|based|reside|residing|live|living) in\b.*\b(?:us|u\.s\.?|usa|united states)\b/.test(l) && !/willing|relocat|citizen/.test(l)) return 'locatedInUS';
  if (/^(?:your |current )?(?:current )?location\b|where are you (?:currently )?(?:located|based)/.test(l) && !/willing|relocat|office|preferred/.test(l)) return 'currentLocation';
  return null;
}

/** Value to type into a text box for a derived question, or undefined. */
export function derivedText(key: DerivedKey | null, f: ApplicantFacts): string | undefined {
  if (key === 'legalName') return f.fullName || undefined;
  if (key === 'currentLocation') return f.city ? [f.city, f.state].filter(Boolean).join(', ') : undefined;
  if (key === 'residenceCountry' && f.inUS) return 'United States';
  if (key === 'locatedInUS' && f.inUS) return 'Yes';
  return undefined;
}

/** Dropdown option for a derived question, or null. Only answered when the résumé's state is a US state. */
export function chooseDerived(key: DerivedKey, f: ApplicantFacts, options: string[]): string | null {
  if (!f.inUS) return null;
  if (key === 'locatedInUS') return best(options, (o) => (startsYes(o) ? 10 : 0));
  if (key === 'residenceCountry') return best(options, (o) => (/^(?:united states(?: of america)?|usa|us)$/.test(o) ? 10 : 0));
  return null;
}
