import type { Page } from 'puppeteer';
import type { Applicant } from '../resume/applicant.js';
import type { ApplyAnswer } from './apply-profile.js';
import { STATE_NAMES, norm, sleep, type FillReport } from './common.js';
import { savedAnswer, chooseDerived, chooseOption, classifyDerived, classifyQuestion, derivedText, type StandardAnswers } from './standard-answers.js';

// Fills a Workable application from résumé data. Two entry points, one form:
//   jobs.workable.com/view/<id>/…        the Workable job board (what the workable-jobs scraper
//                                        returns): the form opens in place after "Apply now".
//   apply.workable.com/<account>/j/<code> a company's own Workable careers page: the form is at
//                                        …/j/<code>/apply/.
// No account or login is needed; any captcha runs only on Submit, which the candidate presses.
//
// Every field carries a data-ui hook and is labelled through aria-labelledby:
//   text      input[name] / textarea[name]: firstname, lastname, email, phone (intl-tel-input,
//             country picker in front), address (plain text, pre-filled with a city guessed
//             from the visitor's IP, so always overwritten), headline, summary, cover_letter,
//             and custom questions CA_<n> / QA_<n>.
//   dropdown  div[data-input-type=select][data-ui=<name>]: a read-only combobox
//             #input_<name>_input whose options (#input_<name>_listbox [role=option]) exist only
//             while it is open; the choice lands in a hidden input[name=<name>].
//   yes/no    fieldset[role=radiogroup][data-ui=<name>]: radios valued true/false, labelled YES/NO.
//   multi     div[role=group][data-ui=<name>]: checkboxes.
//   file      input[type=file][data-ui=resume] (others, e.g. references, are left alone).
// Education / Experience are optional "+ Add" sections and are not filled.
//
// It NEVER submits.

const VIEW_ID = /^[A-Za-z0-9-]{8,40}$/;
const SHORTCODE = /^[A-Za-z0-9]{6,16}$/;
const ACCOUNT = /^[a-z0-9][a-z0-9_-]*$/i;

/** Any Workable job URL -> the page that holds its application form, or null. */
export function workableFormUrl(applyUrl: string): string | null {
  let u: URL;
  try { u = new URL(applyUrl); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean);
  if (host === 'jobs.workable.com') {
    const [view, id] = parts;
    return view === 'view' && id && VIEW_ID.test(id) ? `https://jobs.workable.com/view/${id}` : null;
  }
  // apply.workable.com/<account>/j/<code>[/apply] and the older <account>.workable.com/j/<code>.
  let account: string | undefined, j: string | undefined, code: string | undefined;
  if (host === 'apply.workable.com') [account, j, code] = parts;
  else if (/^[a-z0-9-]+\.workable\.com$/.test(host) && !/^(?:www|jobs|apply)\./.test(host)) {
    account = host.split('.')[0];
    [j, code] = parts;
  } else return null;
  if (!account || !ACCOUNT.test(account) || j !== 'j' || !code || !SHORTCODE.test(code)) return null;
  return `https://apply.workable.com/${account}/j/${code.toUpperCase()}/apply/`;
}

/**
 * Bring the form up: dismiss the cookie banner (it sits over the page and swallows the first
 * click) and, on the job board, press "Apply now". Optional cookies are declined.
 */
export async function openWorkableForm(page: Page): Promise<void> {
  await page.evaluate(() => {
    const decline = [...document.querySelectorAll('button')].find((b) => /^\s*decline all\s*$/i.test(b.innerText));
    decline?.click();
  });
  await sleep(500);
  if (await page.$('form input[name="email"]')) return;
  const apply = await page.$('[data-ui="overview-apply-now"], [data-ui="sticky-apply-now"]');
  if (apply) await apply.click();
}

type Kind = 'text' | 'select' | 'radio' | 'group' | 'file';
interface Field { i: number; name: string; label: string; required: boolean; kind: Kind; options: string[] }

/** Tag every visible field with data-jq-field="<i>" and describe it. Dropdown options are read later, when opened. */
async function readFields(page: Page): Promise<Field[]> {
  return page.evaluate(() => {
    // Visible text of a [role=radio] / [role=checkbox] option. Workable draws two layouts: the
    // text inside the option element (YES / NO buttons), or in a sibling span named by the last
    // id of the option's aria-labelledby (custom-attribute radios: the option holds only the input
    // and an icon). Stored on the option as data-jq-text, which tick() matches on.
    const optionText = (o: Element) => {
      const ids = (o.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean);
      const own = ids.length > 1 ? document.getElementById(ids[ids.length - 1]) : null;
      const text = (own?.innerText || (o.closest('label') as HTMLElement | null)?.innerText || (o as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim();
      o.setAttribute('data-jq-text', text);
      return text;
    };
    const form = document.querySelector('form');
    if (!form) return [];
    const labelOf = (el: Element, name: string) => {
      const id = (el.getAttribute('aria-labelledby') ?? '').split(/\s+/)[0];
      const lab = (id && document.getElementById(id)) || document.getElementById(`${name}_label`);
      return ((lab as HTMLElement | null)?.innerText ?? '').replace(/\s+/g, ' ').trim();
    };
    const visible = (el: Element) => (el as HTMLElement).offsetParent !== null || !!(el.closest('[data-ui]') as HTMLElement | null)?.offsetParent;
    const out: { el: Element; name: string; kind: string; label: string; required: boolean; options: string[] }[] = [];
    for (const el of form.querySelectorAll('[data-input-type=select][data-ui]')) {
      const name = el.getAttribute('data-ui')!;
      const combo = el.querySelector('[role=combobox]');
      out.push({ el, name, kind: 'select', label: labelOf(combo ?? el, name), required: !!el.querySelector('input[required]'), options: [] });
    }
    for (const el of form.querySelectorAll('fieldset[role=radiogroup][data-ui]')) {
      const name = el.getAttribute('data-ui')!;
      const options = [...el.querySelectorAll('[role=radio]')].map(optionText).filter(Boolean);
      out.push({ el, name, kind: 'radio', label: labelOf(el, name), required: !!el.querySelector('input[required]'), options });
    }
    for (const el of form.querySelectorAll('[role=group][data-ui]')) {
      const name = el.getAttribute('data-ui')!;
      const options = [...el.querySelectorAll('[role=checkbox]')].map(optionText).filter(Boolean);
      out.push({ el, name, kind: 'group', label: labelOf(el, name), required: !!el.querySelector('input[required]'), options });
    }
    for (const el of form.querySelectorAll('input[type=file][data-ui]')) {
      const name = el.getAttribute('data-ui')!;
      out.push({ el, name, kind: 'file', label: labelOf(el, name), required: (el as HTMLInputElement).required, options: [] });
    }
    // Text boxes: everything else with a name, minus the hidden inputs behind dropdowns and the
    // radios / checkboxes counted above.
    for (const el of form.querySelectorAll('input[name], textarea[name]')) {
      const x = el as HTMLInputElement;
      if (['hidden', 'radio', 'checkbox', 'file'].includes(x.type) || x.getAttribute('aria-hidden') === 'true' || x.closest('[data-input-type=select]')) continue;
      out.push({ el, name: x.name, kind: 'text', label: labelOf(el, x.name), required: x.required || x.getAttribute('aria-required') === 'true', options: [] });
    }
    return out.filter((f) => visible(f.el)).map((f, i) => {
      f.el.setAttribute('data-jq-field', String(i));
      return { i, name: f.name, kind: f.kind as never, label: f.label, required: f.required, options: f.options };
    });
  });
}

const at = (i: number) => `[data-jq-field="${i}"]`;

/** Replace a text box's value by typing (React-safe). */
async function typeText(page: Page, i: number, value: string): Promise<boolean> {
  const el = await page.$(at(i));
  if (!el) return false;
  await el.click({ clickCount: 3 });
  await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await el.type(value, { delay: 8 });
  return page.evaluate((s, v) => (document.querySelector(s) as HTMLInputElement | null)?.value === v, at(i), value);
}

/** Open dropdown `name`, return its option texts (left open). */
async function openDropdown(page: Page, name: string): Promise<string[]> {
  const combo = await page.$(`[id="input_${name}_input"]`);
  if (!combo) return [];
  await combo.click();
  const list = `[id="input_${name}_listbox"] [role=option]`;
  await page.waitForSelector(list, { timeout: 3000 }).catch(() => null);
  return page.$$eval(list, (os) => os.map((o) => (o as HTMLElement).innerText.trim()).filter(Boolean));
}

/** Click option `text` in the open dropdown `name` and confirm the hidden value was set. */
async function pickDropdown(page: Page, name: string, text: string): Promise<boolean> {
  const handles = await page.$$(`[id="input_${name}_listbox"] [role=option]`);
  for (const h of handles) {
    if ((await h.evaluate((o) => (o as HTMLElement).innerText.trim())) !== text) continue;
    await h.click();
    await sleep(250);
    return page.evaluate((n) => !!(document.querySelector(`form input[name="${n}"][aria-hidden="true"]`) as HTMLInputElement | null)?.value, name);
  }
  return false;
}

/**
 * Close dropdown `name` by clicking its box again, only while it is open. Never press Escape:
 * on jobs.workable.com, Escape with no list open closes the whole application and drops
 * everything typed so far.
 */
async function closeDropdown(page: Page, name: string): Promise<void> {
  const combo = await page.$(`[id="input_${name}_input"]`);
  if (combo && (await combo.evaluate((e) => e.getAttribute('aria-expanded'))) === 'true') await combo.click();
  await sleep(150);
}

/** Tick the radio / checkbox labelled `text` in field `i` and confirm it stuck. */
async function tick(page: Page, i: number, text: string): Promise<boolean> {
  const find = (s: string, t: string, act: boolean) => {
    const box = document.querySelector(s);
    const opt = box && [...box.querySelectorAll('[data-jq-text]')].find((o) => o.getAttribute('data-jq-text') === t) as HTMLElement | undefined;
    if (!opt) return false;
    const input = opt.querySelector('input') as HTMLInputElement | null;
    const checked = opt.getAttribute('aria-checked') === 'true' || !!input?.checked;
    if (act) { if (!checked) (input ?? opt).click(); return true; }
    return checked;
  };
  if (!(await page.evaluate(find, at(i), text, true))) return false;
  await sleep(150);
  return page.evaluate(find, at(i), text, false);
}

/** Make sure the phone's country picker shows the United States before typing a US number. */
async function phoneCountryUS(page: Page): Promise<void> {
  const btn = await page.$('form [data-ui="phone"] button[aria-controls]');
  if (!btn) return;
  if (/united states/i.test((await btn.evaluate((b) => b.getAttribute('title') ?? '')))) return;
  await btn.click();
  const us = await page.waitForSelector('form [data-ui="phone"] li[data-iso2="us"]', { timeout: 3000 }).catch(() => null);
  // No Escape to back out (it can close the whole application): click the button again.
  if (us) await us.click(); else if ((await btn.evaluate((b) => b.getAttribute('aria-expanded'))) === 'true') await btn.click();
  await sleep(200);
}

/**
 * Does a (lower-cased) question that names LinkedIn / GitHub / a website ask for the profile
 * link itself? Workable questions are long sentences: "Share 2–3 of your open-source
 * contributions with links (GitHub PRs…)" names GitHub but wants specific work. An explicit
 * "profile" or "URL" wins, so "…GitHub profile…, for example, https://github.com/yourname" is
 * still a profile question.
 */
function wantsProfileLink(l: string): boolean {
  if (/\bprofile\b|\burl\b/.test(l)) return true;
  return !/contribution|example|project|describe|references?\b|share \d/.test(l);
}

/** The option matching a free-text answer, exactly or as a prefix. */
function matchAnswer(answer: string, options: string[]): string | null {
  const a = norm(answer);
  return options.find((o) => norm(o) === a) ?? options.find((o) => norm(o).startsWith(a)) ?? null;
}

export async function fillWorkable(page: Page, a: Applicant, resumePath: string | undefined, answers: ApplyAnswer[], extra: { linkedin?: string; github?: string; website?: string; phone?: string; city?: string; state?: string; standard?: StandardAnswers }): Promise<FillReport> {
  const report: FillReport = { filled: [], failed: [], needsYou: [], resumeUploaded: false };
  const ok = (field: string, value: string) => report.filled.push({ field, value });
  const bad = (field: string, value: string, reason: string) => report.failed.push({ field, value, reason });

  await page.waitForSelector('form input[name="email"]', { timeout: 30_000 });

  if (resumePath) {
    const file = await page.$('form input[type=file][data-ui="resume"]');
    if (file) {
      try {
        await (file as unknown as { uploadFile(p: string): Promise<void> }).uploadFile(resumePath);
        report.resumeUploaded = true;
        await sleep(2000);
      } catch (err) {
        bad('Résumé', resumePath, (err as Error).message);
      }
    }
  }

  const std = extra.standard ?? {};
  const city = extra.city ?? a.city, state = extra.state ?? a.state;
  const inUS = !!(state && STATE_NAMES[state.toUpperCase()]);
  const links = { linkedin: extra.linkedin ?? a.linkedin, github: extra.github ?? a.github, website: extra.website ?? a.website };
  const facts = { fullName: a.fullName, city, state, inUS, company: a.experience[0]?.company, title: a.experience[0]?.title };
  const customFor = (label: string) => answers.find((x) => label.toLowerCase().includes(x.question.toLowerCase()))?.answer;

  const textFor = (f: Field): string | undefined => {
    switch (f.name) {
      case 'firstname': return a.firstName;
      case 'lastname': return a.lastName;
      case 'email': return a.email;
      case 'phone': return extra.phone ?? a.phone;
      case 'address': return city ? [city, state].filter(Boolean).join(', ') : undefined;
      case 'headline': return facts.title;
      case 'summary': case 'cover_letter': return undefined;
    }
    const l = f.label.toLowerCase();
    if (/preferred (?:first )?name/.test(l)) return undefined;
    if (classifyQuestion(f.label) === 'pronouns') return std.pronouns;
    if (wantsProfileLink(l)) {
      if (/linked ?in/.test(l)) return links.linkedin;
      if (/github/.test(l)) return links.github;
      if (/website|portfolio|personal (?:site|url)/.test(l)) return links.website ?? links.github;
    }
    return derivedText(classifyDerived(f.label), facts);
  };

  const choiceFor = (f: Field, options: string[]): string | null => {
    const custom = customFor(f.label);
    if (custom) return matchAnswer(custom, options);
    const key = classifyQuestion(f.label);
    if (key) return savedAnswer(key, std) ? chooseOption(key, std, options) : null;
    const dkey = classifyDerived(f.label);
    if (dkey === 'locatedInUS' || dkey === 'residenceCountry') return chooseDerived(dkey, facts, options);
    return null;
  };

  const seen = new Set<string>();
  for (let pass = 0; pass < 3; pass++) {
    const fields = (await readFields(page)).filter((f) => !seen.has(`${f.name}|${f.label}`));
    if (!fields.length) break;
    for (const f of fields) {
      seen.add(`${f.name}|${f.label}`);
      const name = f.label || f.name;
      if (f.kind === 'text') {
        const v = customFor(f.label) ?? textFor(f);
        if (!v) continue;
        if (f.name === 'phone' && inUS) await phoneCountryUS(page);
        if (await typeText(page, f.i, v)) ok(name, v); else bad(name, v, 'the field did not keep the value');
      } else if (f.kind === 'select') {
        // Decide from the label first, so dropdowns we can't answer are never opened.
        const custom = customFor(f.label), key = classifyQuestion(f.label), dkey = classifyDerived(f.label);
        if (!custom && !(key && savedAnswer(key, std)) && dkey !== 'locatedInUS' && dkey !== 'residenceCountry') continue;
        const options = await openDropdown(page, f.name);
        const pick = choiceFor(f, options);
        if (!pick) {
          await closeDropdown(page, f.name);
          if (key && savedAnswer(key, std)) bad(name, String(savedAnswer(key, std)), 'no option clearly matches your saved answer');
          continue;
        }
        if (await pickDropdown(page, f.name, pick)) ok(name, pick);
        else { await closeDropdown(page, f.name); bad(name, pick, 'option not found'); }
      } else if (f.kind === 'radio') {
        const pick = choiceFor(f, f.options);
        if (!pick) {
          const key = classifyQuestion(f.label);
          if (key && savedAnswer(key, std)) bad(name, String(savedAnswer(key, std)), 'no option clearly matches your saved answer');
          continue;
        }
        if (await tick(page, f.i, pick)) ok(name, pick); else bad(name, pick, 'option not found');
      } else if (f.kind === 'group') {
        // Only pronouns and the candidate's own answers; consent boxes are never ticked.
        const custom = customFor(f.label);
        const pick = custom ? matchAnswer(custom, f.options)
          : classifyQuestion(f.label) === 'pronouns' && std.pronouns ? chooseOption('pronouns', std, f.options) : null;
        if (pick && await tick(page, f.i, pick)) ok(name, pick);
      }
      // file: only the résumé, uploaded above.
    }
  }

  report.needsYou = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll('[data-jq-field]')) {
      const box = el as HTMLElement;
      const required = !!box.querySelector('[required]') || (box as HTMLInputElement).required || box.getAttribute('aria-required') === 'true';
      if (!required) continue;
      const id = (box.getAttribute('aria-labelledby') ?? box.querySelector('[aria-labelledby]')?.getAttribute('aria-labelledby') ?? '').split(/\s+/)[0];
      const nm = box.getAttribute('name') ?? box.getAttribute('data-ui') ?? '';
      const label = (((id && document.getElementById(id)) || document.getElementById(`${nm}_label`))?.innerText ?? '').replace(/\s+/g, ' ').trim();
      if (!label) continue;
      let empty: boolean;
      if (box.matches('input[type=file]')) empty = !((box as HTMLInputElement).files?.length) && !/\.(pdf|docx?|odt|rtf)\b/i.test(box.closest('[data-role=dropzone]')?.textContent ?? '');
      else if (box.matches('[data-input-type=select]')) empty = !(box.querySelector('input[aria-hidden="true"]') as HTMLInputElement | null)?.value;
      else if (box.matches('[role=radiogroup], [role=group]')) empty = ![...box.querySelectorAll('input')].some((x) => (x as HTMLInputElement).checked);
      else empty = !(box as HTMLInputElement).value?.trim();
      if (empty) out.push(label);
    }
    return [...new Set(out)];
  });
  return report;
}

// Exposed for tests.
export const _private = { matchAnswer, wantsProfileLink };
