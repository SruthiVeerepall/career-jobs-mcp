import type { Page } from 'puppeteer';
import type { Applicant } from '../resume/applicant.js';
import type { ApplyAnswer } from './apply-profile.js';
import { STATE_NAMES, TEXT_BOX, entryHandle, norm, sleep, typeInEntry, type FillReport } from './common.js';
import { savedAnswer, chooseDerived, chooseOption, classifyDerived, classifyQuestion, derivedText, type StandardAnswers } from './standard-answers.js';

// Fills a Lever application (jobs.lever.co/<company>/<posting id>/apply) from résumé data.
//
// A plain HTML form. Every question is an `.application-question` with an
// `.application-label`; the standard fields have fixed names:
//   resume (file), name (full name), email, phone, location (type-ahead: "Denver, CO, USA"),
//   org (current company), urls[LinkedIn] / urls[GitHub] / urls[Portfolio] / urls[Other],
//   pronouns (checkboxes), eeo[gender|race|veteran|disability] (selects).
// Custom questions are cards[<id>][fieldN] (text, select, radio or checkbox) and optional
// demographic surveys are surveysResponses[…]; both are matched by label.
// Consent checkboxes ("I agree") are never ticked. hCaptcha runs on Submit, which the
// candidate presses.
//
// It NEVER submits.

const HOST = /^jobs(?:\.eu)?\.lever\.co$/i;
const POSTING_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Any Lever job URL (posting or its /apply page) -> the application form, or null. */
export function leverFormUrl(applyUrl: string): string | null {
  let u: URL;
  try { u = new URL(applyUrl); } catch { return null; }
  if (u.protocol !== 'https:' || !HOST.test(u.hostname)) return null;
  const [company, id] = u.pathname.split('/').filter(Boolean);
  if (!company || !id || !POSTING_ID.test(id)) return null;
  return `https://${u.hostname.toLowerCase()}/${company}/${id.toLowerCase()}/apply`;
}

type Kind = 'text' | 'select' | 'radio' | 'checkbox' | 'file' | 'other';
interface Entry { i: number; name: string; label: string; required: boolean; kind: Kind; inputType: string; options: string[] }

async function readEntries(page: Page): Promise<Entry[]> {
  return page.evaluate((textBox) => {
    const blocks = [...document.querySelectorAll('.application-question:not(.awli-application-row)')]
      .filter((b, _, all) => !all.some((o) => o !== b && b.contains(o)) && (b as HTMLElement).offsetParent !== null);
    return blocks.map((b, i) => {
      b.setAttribute('data-jq-entry', String(i));
      const labelEl = b.querySelector('.application-label') as HTMLElement | null;
      const label = (labelEl?.innerText ?? '').replace(/✱/g, '').replace(/\s+/g, ' ').trim();
      const field = b.querySelector('input:not([type=hidden]), textarea, select') as HTMLInputElement | null;
      const text = b.querySelector(textBox) as HTMLInputElement | null;
      let kind = 'other';
      if (b.querySelector('input[type=file]')) kind = 'file';
      else if (b.querySelector('select')) kind = 'select';
      else if (b.querySelector('input[type=radio]')) kind = 'radio';
      else if (b.querySelector('input[type=checkbox]')) kind = 'checkbox';
      else if (text) kind = 'text';
      const options = kind === 'select'
        ? [...(b.querySelector('select') as HTMLSelectElement).options].filter((o) => o.value).map((o) => o.text.trim())
        : [...b.querySelectorAll('input[type=radio], input[type=checkbox]')].map((x) => (x as HTMLInputElement).value.trim()).filter(Boolean);
      return {
        i, label, kind: kind as never, options,
        name: field?.name ?? '',
        required: !!b.querySelector('.required') || !!b.querySelector('[required]'),
        inputType: text?.type ?? '',
      };
    });
  }, TEXT_BOX);
}

/** Choose a <select> option by its text; fires change like a user would. */
async function selectOption(page: Page, i: number, text: string): Promise<boolean> {
  return page.evaluate((idx, t) => {
    const s = document.querySelector(`[data-jq-entry="${idx}"] select`) as HTMLSelectElement | null;
    const o = s && [...s.options].find((x) => x.text.trim() === t);
    if (!s || !o) return false;
    s.value = o.value;
    s.dispatchEvent(new Event('input', { bubbles: true }));
    s.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, i, text);
}

/**
 * Tick the radio / checkbox whose value is `value`, and confirm it stuck. A DOM click, not a
 * mouse click: a mouse click lands on whatever is drawn at that point, and on TrueML's form it
 * silently missed the sponsorship radio.
 */
async function tick(page: Page, i: number, value: string): Promise<boolean> {
  return page.evaluate((idx, v) => {
    const x = [...document.querySelectorAll(`[data-jq-entry="${idx}"] input[type=radio], [data-jq-entry="${idx}"] input[type=checkbox]`)]
      .find((el) => (el as HTMLInputElement).value.trim() === v) as HTMLInputElement | undefined;
    if (!x) return false;
    if (!x.checked) x.click();
    return x.checked;
  }, i, value);
}

/** Type a city into Lever's location type-ahead and click "City, ST, USA". */
async function pickLocation(page: Page, i: number, city: string, state?: string): Promise<string | null> {
  const el = await entryHandle(page, i, 'input[name=location]');
  if (!el) return null;
  await el.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await el.type(city, { delay: 30 });
  const st = norm(state ?? ''), stName = norm(state ? STATE_NAMES[state.toUpperCase()] ?? '' : '');
  // The list fills in over a few hundred ms, and briefly shows another state's "Austin" first;
  // picking the first result chose "Austin, MN". So wait for a result in the candidate's own
  // state (or, with no state known, for the list to stop changing) and never settle for less.
  const score = (o: string) => {
    const parts = o.split(',').map((x) => norm(x));
    if (parts[0] !== norm(city)) return 0;
    if (!st) return 1;
    return parts[1] === st || parts[1] === stName ? 10 : 0;
  };
  let last = '';
  for (let t = 0; t < 30; t++) {
    await sleep(250);
    const options: string[] = await page.evaluate((idx) =>
      [...document.querySelectorAll(`[data-jq-entry="${idx}"] .dropdown-results > div`)].map((o) => (o as HTMLElement).innerText.trim()).filter(Boolean), i);
    const best = options.find((o) => score(o) > 0);
    const stable = options.join('|') === last;
    last = options.join('|');
    if (!best || (!st && !stable)) continue;
    // Choose with the keyboard: Lever ignores a DOM .click() on a result, and a mouse click
    // misses when the list is drawn off-screen. Arrow down to the result, then Enter.
    const k = options.indexOf(best);
    await el.focus();
    for (let n = 0; n <= k; n++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    for (let w = 0; w < 10; w++) {
      await sleep(200);
      const chosen = await page.evaluate((idx) => (document.querySelector(`[data-jq-entry="${idx}"] input[name=selectedLocation]`) as HTMLInputElement | null)?.value ?? '', i);
      if (chosen.includes(best)) return best;
    }
    return null;
  }
  return null;
}

/** The option matching a free-text answer, exactly or as a prefix. */
function matchAnswer(answer: string, options: string[]): string | null {
  const a = norm(answer);
  return options.find((o) => norm(o) === a) ?? options.find((o) => norm(o).startsWith(a)) ?? null;
}

/** "She" / "she/her" -> the pronoun checkbox it names. */
function pronounOption(pronouns: string, options: string[]): string | null {
  const first = norm(pronouns).split(' ')[0];
  return options.find((o) => norm(o) === norm(pronouns)) ?? options.find((o) => norm(o).split(' ')[0] === first) ?? null;
}

export async function fillLever(page: Page, a: Applicant, resumePath: string | undefined, answers: ApplyAnswer[], extra: { linkedin?: string; github?: string; website?: string; phone?: string; city?: string; state?: string; standard?: StandardAnswers }): Promise<FillReport> {
  const report: FillReport = { filled: [], failed: [], needsYou: [], resumeUploaded: false };
  const ok = (field: string, value: string) => report.filled.push({ field, value });
  const bad = (field: string, value: string, reason: string) => report.failed.push({ field, value, reason });

  await page.waitForSelector('input[name="email"]', { timeout: 30_000 });

  // Résumé first: Lever parses it and pre-fills name / email / phone / company, which ours overwrite.
  if (resumePath) {
    const file = await page.$('input[type=file][name="resume"]');
    if (file) {
      try {
        await (file as unknown as { uploadFile(p: string): Promise<void> }).uploadFile(resumePath);
        report.resumeUploaded = true;
        await sleep(3000);
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
  const customFor = (label: string) => answers.find((x) => label.toLowerCase().includes(x.question.toLowerCase()))?.answer;

  const textFor = (e: Entry): string | undefined => {
    const l = e.label.toLowerCase();
    switch (e.name) {
      case 'name': return a.fullName;
      case 'email': return a.email;
      case 'phone': return extra.phone ?? a.phone;
      case 'org': return facts.company;
      case 'urls[LinkedIn]': return links.linkedin;
      case 'urls[GitHub]': return links.github;
      case 'urls[Portfolio]': case 'urls[Other]': return links.website ?? links.github;
    }
    if (/preferred (?:first )?name/.test(l)) return undefined;
    if (/linked ?in/.test(l)) return links.linkedin;
    if (/github/.test(l)) return links.github;
    if (/website|portfolio|personal (?:site|url)/.test(l)) return links.website ?? links.github;
    if (classifyQuestion(e.label) === 'pronouns') return std.pronouns;
    return derivedText(classifyDerived(e.label), facts);
  };

  const choiceFor = (e: Entry): string | null => {
    const custom = customFor(e.label);
    if (custom) return matchAnswer(custom, e.options);
    const key = classifyQuestion(e.label);
    if (key) return savedAnswer(key, std) ? chooseOption(key, std, e.options) : null;
    const dkey = classifyDerived(e.label);
    if (dkey === 'locatedInUS' || dkey === 'residenceCountry') return chooseDerived(dkey, facts, e.options);
    return null;
  };

  const seen = new Set<string>();
  for (let pass = 0; pass < 3; pass++) {
    const entries = (await readEntries(page)).filter((e) => !seen.has(`${e.name}|${e.label}`));
    if (!entries.length) break;
    for (const e of entries) {
      seen.add(`${e.name}|${e.label}`);
      const name = e.label || e.name;
      if (e.kind === 'text') {
        if (e.name === 'location') {
          if (!city) continue;
          const got = await pickLocation(page, e.i, city, state);
          if (got) ok(name, got); else bad(name, [city, state].filter(Boolean).join(', '), 'no matching location');
          continue;
        }
        const v = customFor(e.label) ?? textFor(e);
        if (!v) continue;
        if (await typeInEntry(page, e.i, TEXT_BOX, v)) ok(name, v); else bad(name, v, 'field not found');
      } else if (e.kind === 'select' || e.kind === 'radio') {
        const pick = choiceFor(e);
        if (!pick) {
          const key = classifyQuestion(e.label);
          if (key && savedAnswer(key, std)) bad(name, String(savedAnswer(key, std)), 'no option clearly matches your saved answer');
          continue;
        }
        const done = e.kind === 'select' ? await selectOption(page, e.i, pick) : await tick(page, e.i, pick);
        if (done) ok(name, pick); else bad(name, pick, 'option not found');
      } else if (e.kind === 'checkbox') {
        // Only pronouns and the candidate's own answers; consent boxes are never ticked.
        const pick = e.name === 'pronouns' || classifyQuestion(e.label) === 'pronouns'
          ? (std.pronouns ? pronounOption(std.pronouns, e.options) : null)
          : (customFor(e.label) ? matchAnswer(customFor(e.label)!, e.options) : null);
        if (pick && await tick(page, e.i, pick)) ok(name, pick);
      }
      // file (uploaded above) and other: left alone.
    }
  }

  report.needsYou = await page.evaluate(() => {
    const out: string[] = [];
    for (const b of document.querySelectorAll('[data-jq-entry]')) {
      if ((b as HTMLElement).offsetParent === null) continue;
      if (!b.querySelector('.required') && !b.querySelector('[required]')) continue;
      const label = ((b.querySelector('.application-label') as HTMLElement | null)?.innerText ?? '').replace(/✱/g, '').replace(/\s+/g, ' ').trim();
      if (!label) continue;
      let empty: boolean;
      const file = b.querySelector('input[type=file]') as HTMLInputElement | null;
      if (file) empty = !(file.files?.length) && !/\.(pdf|docx?|txt)\b/i.test((b as HTMLElement).innerText);
      else if (b.querySelector('select')) empty = !(b.querySelector('select') as HTMLSelectElement).value;
      else if (b.querySelector('input[type=radio], input[type=checkbox]')) empty = ![...b.querySelectorAll('input[type=radio], input[type=checkbox]')].some((x) => (x as HTMLInputElement).checked);
      else {
        const t = b.querySelector('input:not([type=hidden]), textarea') as HTMLInputElement | null;
        empty = !t || !t.value.trim();
      }
      if (empty) out.push(label);
    }
    return [...new Set(out)];
  });
  return report;
}

// Exposed for tests.
export const _private = { matchAnswer, pronounOption };
