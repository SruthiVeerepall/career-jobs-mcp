import type { ElementHandle, Page } from 'puppeteer';
import type { Applicant } from '../resume/applicant.js';
import type { ApplyAnswer } from './apply-profile.js';
import { STATE_NAMES, norm, sleep, type FillReport } from './common.js';
import { chooseDerived, chooseOption, classifyDerived, classifyQuestion, derivedText, type StandardAnswers } from './standard-answers.js';

// Fills an Ashby application (jobs.ashbyhq.com/<org>/<job id>/application) from résumé data.
//
// Every question is an `.ashby-application-form-field-entry` with a
// `.ashby-application-form-question-title` label, so fields are found by label:
//   - system fields have fixed ids: _systemfield_name, _systemfield_email, _systemfield_resume
//     (file), _systemfield_location (type-ahead: "Denver, Colorado, United States");
//   - custom questions have random ids: LinkedIn, phone, "current company"…;
//   - Yes/No questions are two buttons, `button[data-option="yes"|"no"]`;
//   - single-choice questions and the EEO section (`…_systemfield_eeoc_gender/race/veteran_status`)
//     are labelled radio groups.
// Consent / acknowledgement checkboxes and date pickers are never touched.
//
// It NEVER submits. The candidate reviews the form and presses Submit themselves.

const HOST = /^jobs(?:\.eu)?\.ashbyhq\.com$/i;
const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Any Ashby job URL (job page or its /application tab) -> the application form, or null. */
export function ashbyFormUrl(applyUrl: string): string | null {
  let u: URL;
  try { u = new URL(applyUrl); } catch { return null; }
  if (u.protocol !== 'https:' || !HOST.test(u.hostname)) return null;
  const [org, id] = u.pathname.split('/').filter(Boolean);
  if (!org || !id || !JOB_ID.test(id)) return null;
  return `https://${u.hostname.toLowerCase()}/${org}/${id.toLowerCase()}/application`;
}

type Kind = 'text' | 'yesno' | 'radio' | 'checkbox' | 'combobox' | 'file' | 'date' | 'other';
interface Entry { i: number; path: string; label: string; required: boolean; kind: Kind; inputType: string; options: string[] }

const ENTRY = '[data-jq-entry]';

/** Tag every question block with an index and describe it. */
async function readEntries(page: Page): Promise<Entry[]> {
  return page.evaluate(() => {
    const blocks = [...document.querySelectorAll('.ashby-application-form-field-entry, fieldset.ashby-application-form-input-radio-group')]
      .filter((b, _, all) => !all.some((o) => o !== b && o.contains(b)) && (b as HTMLElement).offsetParent !== null);
    return blocks.map((b, i) => {
      b.setAttribute('data-jq-entry', String(i));
      const title = b.querySelector('.ashby-application-form-question-title') as HTMLElement | null;
      const label = (title?.innerText ?? '').replace(/\*\s*$/, '').trim();
      const has = (s: string) => !!b.querySelector(s);
      const input = b.querySelector('input:not([type=hidden]), textarea') as HTMLInputElement | null;
      // A text box wins over the Yes/No buttons in the same block: Ramp's Phone question
      // carries an SMS-consent Yes/No, which is consent and stays with the candidate.
      const textBox = b.querySelector('input[type=text]:not([role=combobox]), input[type=tel], input[type=email], input[type=url], input[type=number], textarea') as HTMLInputElement | null;
      let kind: string = 'other';
      if (textBox && !/pick date/i.test(textBox.placeholder ?? '')) kind = 'text';
      else if (has('.ashby-application-form-input-yesno')) kind = 'yesno';
      else if (has('input[type=file]')) kind = 'file';
      else if (has('input[type=radio]')) kind = 'radio';
      else if (has('input[type=checkbox]')) kind = 'checkbox';
      else if (has('input[role=combobox]')) kind = 'combobox';
      else if (input && /pick date/i.test(input.placeholder ?? '')) kind = 'date';
      else if (input) kind = 'text';
      const options = [...b.querySelectorAll('input[type=radio], input[type=checkbox]')]
        .map((r) => (document.querySelector(`label[for="${CSS.escape(r.id)}"]`) as HTMLElement | null)?.innerText.trim() ?? '')
        .filter(Boolean);
      return {
        i, label, kind: kind as never, options,
        path: b.getAttribute('data-field-path') ?? title?.getAttribute('for') ?? '',
        required: !!title && /_required/.test(title.className),
        inputType: (textBox ?? input)?.type ?? '',
      };
    });
  });
}

/** First element in question block `i` matching any of the comma-separated selectors. */
async function entryHandle(page: Page, i: number, sel: string): Promise<ElementHandle | null> {
  // Scope EVERY alternative: `[entry] a, b` would match `b` anywhere on the page.
  return page.$(sel.split(',').map((s) => `[data-jq-entry="${i}"] ${s.trim()}`).join(', '));
}

async function typeText(page: Page, i: number, value: string): Promise<boolean> {
  const el = await entryHandle(page, i, 'input[type=text]:not([role=combobox]), input[type=tel], input[type=email], input[type=url], input[type=number], textarea');
  if (!el) return false;
  await el.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await el.type(value, { delay: 8 });
  return true;
}

/** Click the radio (or Yes/No button) whose visible text is `text`. */
async function clickOption(page: Page, i: number, text: string, kind: 'radio' | 'yesno'): Promise<boolean> {
  return page.evaluate((idx, t, k) => {
    const b = document.querySelector(`[data-jq-entry="${idx}"]`);
    if (!b) return false;
    if (k === 'yesno') {
      const btn = b.querySelector(`button[data-option="${t.toLowerCase()}"]`) as HTMLButtonElement | null;
      btn?.click();
      return !!btn;
    }
    const label = [...b.querySelectorAll('label')].find((l) => (l as HTMLElement).innerText.trim() === t) as HTMLLabelElement | undefined;
    label?.click();
    return !!label;
  }, i, text, kind);
}

/** Type into the location type-ahead and click the option for this city and state. */
async function pickLocation(page: Page, i: number, city: string, state?: string): Promise<string | null> {
  const el = await entryHandle(page, i, 'input[role=combobox]');
  if (!el) return null;
  await el.click();
  await el.type(city, { delay: 20 });
  const stateName = norm(state ? STATE_NAMES[state.toUpperCase()] ?? state : '');
  for (let t = 0; t < 25; t++) {
    const options: string[] = await page.evaluate(() =>
      [...document.querySelectorAll('[role="option"]')].filter((o) => (o as HTMLElement).offsetParent !== null).map((o) => (o as HTMLElement).innerText.trim()));
    if (options.length) {
      const score = (o: string) => { const n = norm(o); return !n.startsWith(norm(city)) ? 0 : stateName && n.includes(stateName) ? 10 : 1; };
      const best = options.reduce((a, b) => (score(b) > score(a) ? b : a), options[0]);
      if (score(best) <= 0) break;
      await page.evaluate((text) => {
        const o = [...document.querySelectorAll('[role="option"]')].find((x) => (x as HTMLElement).innerText.trim() === text) as HTMLElement | undefined;
        o?.click();
      }, best);
      await sleep(200);
      return best;
    }
    await sleep(200);
  }
  await page.keyboard.press('Escape');
  return null;
}

/** The option of a single-choice question that matches a free-text answer. */
function matchAnswer(answer: string, options: string[]): string | null {
  const a = norm(answer);
  return options.find((o) => norm(o) === a) ?? options.find((o) => norm(o).startsWith(a)) ?? null;
}

export async function fillAshby(page: Page, a: Applicant, resumePath: string | undefined, answers: ApplyAnswer[], extra: { linkedin?: string; github?: string; website?: string; phone?: string; city?: string; state?: string; standard?: StandardAnswers }): Promise<FillReport> {
  const report: FillReport = { filled: [], failed: [], needsYou: [], resumeUploaded: false };
  const ok = (field: string, value: string) => report.filled.push({ field, value });
  const bad = (field: string, value: string, reason: string) => report.failed.push({ field, value, reason });

  await page.waitForSelector('#_systemfield_name', { timeout: 30_000 });

  if (resumePath) {
    const file = await page.$('#_systemfield_resume');
    if (file) {
      try {
        await (file as unknown as { uploadFile(p: string): Promise<void> }).uploadFile(resumePath);
        report.resumeUploaded = true;
        await sleep(2500);
      } catch (err) {
        bad('Résumé', resumePath, (err as Error).message);
      }
    }
  }

  const std = extra.standard ?? {};
  const city = extra.city ?? a.city, state = extra.state ?? a.state;
  const links = { linkedin: extra.linkedin ?? a.linkedin, github: extra.github ?? a.github, website: extra.website ?? a.website };
  const facts = {
    fullName: a.fullName, city, state, inUS: !!(state && STATE_NAMES[state.toUpperCase()]),
    company: a.experience[0]?.company, title: a.experience[0]?.title,
  };

  /** A text answer for a text box, from the system field, saved answers, links or résumé facts. */
  const textFor = (e: Entry): string | undefined => {
    const l = e.label.toLowerCase();
    if (e.path === '_systemfield_name') return a.fullName;
    if (e.path === '_systemfield_email' || e.inputType === 'email') return a.email;
    if (e.inputType === 'tel' || /\bphone\b/.test(l)) return extra.phone ?? a.phone;
    if (/preferred (?:first )?name/.test(l)) return undefined;
    if (/linked ?in/.test(l)) return links.linkedin;
    if (/github/.test(l)) return links.github;
    if (/website|portfolio|personal (?:site|url)/.test(l)) return links.website ?? links.github;
    if (classifyQuestion(e.label) === 'pronouns') return std.pronouns;
    return derivedText(classifyDerived(e.label), facts);
  };

  /** The option to pick for a Yes/No or single-choice question, or null. */
  const choiceFor = (e: Entry, options: string[]): string | null => {
    const custom = answers.find((x) => e.label.toLowerCase().includes(x.question.toLowerCase()));
    if (custom?.answer) return matchAnswer(custom.answer, options);
    const key = classifyQuestion(e.label); // the EEO section's labels are "Gender", "Race", "Veteran Status"
    if (key) return std[key] ? chooseOption(key, std, options) : null;
    const dkey = classifyDerived(e.label);
    if (dkey === 'locatedInUS' || dkey === 'residenceCountry') return chooseDerived(dkey, facts, options);
    return null;
  };

  // Some questions appear only after an earlier answer: read the form again until nothing new shows up.
  const seen = new Set<string>();
  for (let pass = 0; pass < 3; pass++) {
    const entries = (await readEntries(page)).filter((e) => !seen.has(`${e.path}|${e.label}`));
    if (!entries.length) break;
    for (const e of entries) {
      seen.add(`${e.path}|${e.label}`);
      const name = e.label || e.path;
      if (e.kind === 'text') {
        const custom = answers.find((x) => e.label.toLowerCase().includes(x.question.toLowerCase()));
        const v = custom?.answer ?? textFor(e);
        if (!v) continue;
        if (await typeText(page, e.i, v)) ok(name, v); else bad(name, v, 'field not found');
      } else if (e.kind === 'combobox') {
        if (!city || !(e.path === '_systemfield_location' || /location|where .* (?:located|based|live)/i.test(e.label))) continue;
        const got = await pickLocation(page, e.i, city, state);
        if (got) ok(name, got); else bad(name, [city, state].filter(Boolean).join(', '), 'no matching location');
      } else if (e.kind === 'yesno' || e.kind === 'radio') {
        const options = e.kind === 'yesno' ? ['Yes', 'No'] : e.options;
        const pick = choiceFor(e, options);
        if (!pick) {
          const key = classifyQuestion(e.label);
          if (key && std[key]) bad(name, String(std[key]), 'no option clearly matches your saved answer');
          continue;
        }
        if (await clickOption(page, e.i, pick, e.kind)) ok(name, pick); else bad(name, pick, 'option not found');
        await sleep(150);
      }
      // file (the résumé is uploaded above), checkbox (consent), date and other: left alone.
    }
  }

  // Required questions still unanswered.
  report.needsYou = await page.evaluate(() => {
    const out: string[] = [];
    for (const b of document.querySelectorAll('[data-jq-entry]')) {
      const title = b.querySelector('.ashby-application-form-question-title') as HTMLElement | null;
      if (!title || !/_required/.test(title.className) || (b as HTMLElement).offsetParent === null) continue;
      let empty: boolean;
      const textBox = b.querySelector('input[type=text]:not([role=combobox]), input[type=tel], input[type=email], input[type=url], input[type=number], textarea') as HTMLInputElement | null;
      if (textBox) empty = !textBox.value.trim();
      else if (b.querySelector('.ashby-application-form-input-yesno')) empty = !b.querySelector('button[aria-pressed="true"]');
      else if (b.querySelector('input[type=file]')) empty = ![...b.querySelectorAll('input[type=file]')].some((f) => ((f as HTMLInputElement).files?.length ?? 0) > 0) && !/\.(pdf|docx?|txt)\b/i.test((b as HTMLElement).innerText);
      else if (b.querySelector('input[type=radio], input[type=checkbox]')) empty = ![...b.querySelectorAll('input[type=radio], input[type=checkbox]')].some((x) => (x as HTMLInputElement).checked);
      else {
        const i = b.querySelector('input:not([type=hidden]), textarea') as HTMLInputElement | null;
        empty = !i || !i.value.trim();
      }
      if (empty) out.push(title.innerText.replace(/\*\s*$/, '').trim());
    }
    return [...new Set(out)];
  });
  return report;
}

// Exposed for tests.
export const _private = { matchAnswer };
