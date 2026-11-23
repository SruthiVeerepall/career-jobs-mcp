import type { Page } from 'puppeteer';
import type { Applicant } from '../resume/applicant.js';
import type { ApplyAnswer } from './apply-profile.js';
import { STATE_NAMES, sleep, norm, type FillReport } from './common.js';
import { chooseDerived, chooseOption, classifyDerived, classifyQuestion, derivedText, savedAnswer, type StandardAnswers } from './standard-answers.js';

// Eightfold (Lockheed Martin, Netflix, Microsoft, Qualcomm). One form at
// https://<site>/careers/apply?pid=<position id>. Seen live 2026-11-22:
//   - Netflix and Lockheed Martin show it to anyone; Microsoft asks for a Microsoft sign-in and
//     Qualcomm for an email sign-in first. The candidate signs in; the filler then fills the form
//     when it appears (auto-apply.ts). Credentials are never typed.
//   - Every question is <label id="<Q>_label" for="<Q>"> (or <legend id="<Q>_legend">) plus the
//     element with id <Q>: the text box itself, a wrapper around a dropdown, or a role=group of
//     checkboxes. Contact fields are Contact_Information_<firstname|lastname|email|phone|city>.
//   - Dropdowns are input[role=combobox][aria-controls=list-N]; a click opens button[role=option]
//     items in #list-N; clicking one sets the box's value. The phone's country code is a
//     combobox labelled "Country code" ("🇺🇸 (+1) UNITED STATES").
//   - Self-ID questions are checkbox groups ("select all that apply"); only gender and race are
//     answered from saved answers. Sexual orientation and transgender are never guessed.
//   - Consent boxes ("I agree", "Save my answers"), signatures and clearance questions are left.

/** Sites whose Eightfold application auto apply opens. Exact hosts: a jobquest:// link can carry one. */
const EIGHTFOLD_HOST = /^(?:[a-z0-9-]+\.eightfold\.ai|explore\.jobs\.netflix\.net|careers\.qualcomm\.com|apply\.careers\.microsoft\.com)$/i;

/** An Eightfold job (…/careers/job/<id> or …/careers/apply?pid=<id>) -> its application form, or null. */
export function eightfoldFormUrl(applyUrl: string): string | null {
  let u: URL;
  try { u = new URL(applyUrl); } catch { return null; }
  if (u.protocol !== 'https:' || !EIGHTFOLD_HOST.test(u.hostname)) return null;
  const id = u.pathname.match(/^\/careers\/job\/(\d{6,20})\/?$/)?.[1]
    ?? (/^\/careers\/apply\/?$/.test(u.pathname) ? u.searchParams.get('pid')?.match(/^\d{6,20}$/)?.[0] : undefined);
  return id ? `https://${u.hostname.toLowerCase()}/careers/apply?pid=${id}` : null;
}

/** The element that shows the form loaded (after any sign-in). */
export const EIGHTFOLD_READY = '[id^="Contact_Information_"]';

type Kind = 'text' | 'select' | 'checkbox' | 'radio' | 'file';
interface Question { i: number; id: string; label: string; kind: Kind; required: boolean; empty: boolean; options: string[] }

/** Tag every visible question with data-jq-q="<i>" and describe it. */
async function readQuestions(page: Page): Promise<Question[]> {
  return page.evaluate(() => {
    const vis = (el: Element) => (el as HTMLElement).getClientRects().length > 0;
    const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').replace(/\s*\*\s*$/, '').trim();
    for (const old of document.querySelectorAll('[data-jq-q]')) old.removeAttribute('data-jq-q');
    const out: Question[] = [];
    const heads = [...document.querySelectorAll('label[id$="_label"][for], legend[id$="_legend"]')];
    for (const h of heads) {
      const id = h.id.replace(/_(?:label|legend)$/, '');
      const el = document.getElementById(id);
      if (!el || !vis(el) || el.hasAttribute('data-jq-q')) continue;
      const combo = (el.matches('input[role=combobox]') ? el : el.querySelector('input[role=combobox]')) as HTMLInputElement | null;
      const checks = [...el.querySelectorAll('input[type=checkbox]')] as HTMLInputElement[];
      const radios = [...el.querySelectorAll('input[type=radio]')] as HTMLInputElement[];
      const file = (el.matches('input[type=file]') ? el : el.querySelector('input[type=file]')) as HTMLInputElement | null;
      const box = (el.matches('input, textarea') ? el : el.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea')) as HTMLInputElement | null;
      const optLabel = (x: HTMLInputElement) => clean(x.getAttribute('aria-label') || (x.id && document.querySelector(`label[for="${CSS.escape(x.id)}"]`)?.textContent) || x.value);
      let kind: Question['kind'], empty: boolean, options: string[] = [], required: boolean;
      if (combo) { kind = 'select'; empty = !combo.value.trim(); required = combo.getAttribute('aria-required') === 'true'; }
      else if (checks.length) { kind = 'checkbox'; options = checks.map(optLabel); empty = !checks.some((x) => x.checked); required = checks.some((x) => x.getAttribute('aria-required') === 'true'); }
      else if (radios.length) { kind = 'radio'; options = radios.map(optLabel); empty = !radios.some((x) => x.checked); required = radios.some((x) => x.getAttribute('aria-required') === 'true'); }
      else if (file) { kind = 'file'; empty = !file.files?.length; required = file.getAttribute('aria-required') === 'true'; }
      else if (box) { kind = 'text'; empty = !box.value.trim(); required = box.getAttribute('aria-required') === 'true' || box.required; }
      else continue;
      const i = out.length;
      el.setAttribute('data-jq-q', String(i));
      out.push({ i, id, label: clean(h.textContent), kind, required, empty, options });
    }
    return out;
  });
}

const at = (i: number) => `[data-jq-q="${i}"]`;
// The question element is either the box itself or a wrapper around it.
const comboOf = (i: number) => `input[role=combobox]${at(i)}, ${at(i)} input[role=combobox]`;
const boxOf = (i: number) => `input${at(i)}:not([type=checkbox]):not([type=radio]):not([type=file]), textarea${at(i)}, ${at(i)} input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), ${at(i)} textarea`;

/** Replace a text box's value by typing (React-safe). */
async function typeInto(page: Page, sel: string, value: string): Promise<boolean> {
  const el = await page.$(sel);
  if (!el) return false;
  await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await el.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await el.type(value, { delay: 6 });
  return (await el.evaluate((e) => (e as HTMLInputElement).value)) === value;
}

/** The options of an open combobox (its aria-controls list). */
async function comboOptions(page: Page, combo: import('puppeteer').ElementHandle): Promise<string[]> {
  return combo.evaluate((c) => {
    const list = document.getElementById(c.getAttribute('aria-controls') ?? '');
    return list ? [...list.querySelectorAll('[role=option]')].map((o) => (o as HTMLElement).innerText.replace(/\s+/g, ' ').trim()).filter(Boolean) : [];
  });
}

/**
 * Open combobox `sel`, let `choose` pick from its options, click it; checked against the box's
 * value. `filter` is typed first when the list is long (countries).
 */
async function pickCombo(page: Page, sel: string, choose: (options: string[]) => string | null, filter?: string): Promise<{ pick: string | null; options: string[]; ok: boolean }> {
  const combo = await page.$(sel);
  if (!combo) return { pick: null, options: [], ok: false };
  await combo.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  let options: string[] = [];
  // A list can open empty and fill a moment later, or not open on the first click (Lockheed
  // Martin's authorization question showed none): wait, and try a second click.
  for (let attempt = 0; attempt < 2 && !options.length; attempt++) {
    if (attempt) { await page.keyboard.press('Escape'); await sleep(300); }
    await combo.click();
    for (let t = 0; t < 25 && !options.length; t++) { await sleep(200); options = await comboOptions(page, combo); }
  }
  let pick = choose(options);
  if (!pick && filter) {
    await combo.type(filter, { delay: 10 });
    await sleep(500);
    options = await comboOptions(page, combo);
    pick = choose(options);
  }
  if (!pick) { await page.keyboard.press('Escape'); return { pick: null, options, ok: false }; }
  const clicked = await combo.evaluate((c, text) => {
    const list = document.getElementById(c.getAttribute('aria-controls') ?? '');
    const o = list && [...list.querySelectorAll('[role=option]')].find((x) => (x as HTMLElement).innerText.replace(/\s+/g, ' ').trim() === text) as HTMLElement | undefined;
    if (!o) return false;
    o.scrollIntoView({ block: 'center' });
    o.click();
    return true;
  }, pick);
  await sleep(300);
  const value = await combo.evaluate((c) => (c as HTMLInputElement).value.replace(/\s+/g, ' ').trim());
  const ok = clicked && !!value && (norm(value) === norm(pick) || norm(pick).includes(norm(value)) || norm(value).includes(norm(pick)));
  return { pick, options, ok };
}

/** Tick the checkbox / radio labelled `text` in question `i`; confirmed checked. */
async function tick(page: Page, i: number, text: string): Promise<boolean> {
  return page.evaluate((sel, t) => {
    const box = document.querySelector(sel);
    const label = (x: HTMLInputElement) => (x.getAttribute('aria-label') || (x.id && document.querySelector(`label[for="${CSS.escape(x.id)}"]`)?.textContent) || x.value || '').replace(/\s+/g, ' ').trim();
    const x = box && ([...box.querySelectorAll('input[type=checkbox], input[type=radio]')] as HTMLInputElement[]).find((y) => label(y) === t);
    if (!x) return false;
    if (!x.checked) x.click();
    return x.checked;
  }, at(i), text);
}

/** A saved answer's option, exactly or as a prefix ("No" -> "NO"). */
function matchAnswer(answer: string, options: string[]): string | null {
  const a = norm(answer);
  return options.find((o) => norm(o) === a) ?? options.find((o) => norm(o).startsWith(a)) ?? null;
}

/** The US option of a phone country-code list ("🇺🇸 (+1) UNITED STATES"). */
export function usDialCode(options: string[]): string | null {
  return options.find((o) => /\(\+1\)\s*united states(?: of america)?\s*$/i.test(o.trim())) ?? null;
}
/** The US option of a country list. */
export function usCountry(options: string[]): string | null {
  return options.find((o) => /^(?:\S+\s+)?united states(?: of america)?$/i.test(o.trim())) ?? null;
}

/** Questions auto apply never answers, even when a saved answer seems to fit. */
const NEVER = /sexual orientation|transgender|signature|please sign|type your (?:full )?(?:legal )?name|i (?:have read|agree|acknowledge|certify|understand)|save my answers|clearance|security|how did you hear|referr/i;

export interface EightfoldExtra { linkedin?: string; github?: string; website?: string; phone?: string; city?: string; state?: string; standard?: StandardAnswers }

/** Fill the Eightfold application on screen. Never submits; consent boxes are never ticked. */
export async function fillEightfold(page: Page, a: Applicant, resumePath: string | undefined, answers: ApplyAnswer[], extra: EightfoldExtra): Promise<FillReport> {
  const report: FillReport = { filled: [], failed: [], needsYou: [], resumeUploaded: false };
  const ok = (field: string, value: string) => report.filled.push({ field, value });
  const bad = (field: string, value: string, reason: string) => report.failed.push({ field, value, reason });
  await page.waitForSelector(EIGHTFOLD_READY, { timeout: 30_000 });

  // Résumé first: Eightfold parses it and may pre-fill the contact fields, which ours replace.
  if (resumePath) {
    const file = await page.$('input[type=file]');
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
  const inUS = !!(state && STATE_NAMES[state.toUpperCase()]);
  const links = { linkedin: extra.linkedin ?? a.linkedin, github: extra.github ?? a.github, website: extra.website ?? a.website };
  const facts = { fullName: a.fullName, city, state, inUS, company: a.experience[0]?.company, title: a.experience[0]?.title };
  const phone = (extra.phone ?? a.phone ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  const customFor = (label: string) => answers.find((x) => label.toLowerCase().includes(x.question.toLowerCase()))?.answer;

  // The phone's country code has no label of its own ("Country code" aria-label).
  if (inUS) {
    for (const sel of ['input[role=combobox][aria-label="Country code"]', '[id="Contact_Information_phone-country-code-picker"]']) {
      if (!(await page.$(sel))) continue;
      if (await page.$eval(sel, (e) => !!(e as HTMLInputElement).value.trim()).catch(() => true)) break;
      const r = await pickCombo(page, sel, usDialCode, 'United States');
      if (r.ok && r.pick) ok('Phone country code', r.pick); else bad('Phone country code', '+1 United States', 'not in the list');
      break;
    }
  }

  const contact: Record<string, string | undefined> = {
    firstname: a.firstName, lastname: a.lastName, email: a.email, phone: phone || undefined, city,
  };
  const seen = new Set<string>();
  for (let pass = 0; pass < 3; pass++) {
    const qs = (await readQuestions(page)).filter((q) => !seen.has(q.id));
    if (!qs.length) break;
    for (const q of qs) {
      seen.add(q.id);
      const name = q.label || q.id;
      try {
        const field = q.id.match(/^Contact_Information_(firstname|lastname|email|phone|city)$/i)?.[1]?.toLowerCase();
        if (field) {
          const v = contact[field];
          if (v && await typeInto(page, boxOf(q.i), v)) ok(name, v); else if (v) bad(name, v, 'the field did not keep the value');
          continue;
        }
        if (NEVER.test(q.label) || q.kind === 'file' || !q.empty) continue;
        const custom = customFor(q.label);
        const key = classifyQuestion(q.label);
        const dkey = classifyDerived(q.label);

        if (q.kind === 'text') {
          const l = q.label.toLowerCase();
          const v = custom
            ?? (/preferred (?:first )?name/.test(l) ? undefined
              // "URL (LinkedIn, Github, Portfolio)": a box naming LinkedIn gets the LinkedIn profile.
              : /linked ?in/.test(l) ? links.linkedin
              : /github/.test(l) ? links.github
              : /website|portfolio|\burl\b/.test(l) ? links.website ?? links.linkedin
              : key === 'pronouns' ? std.pronouns
              : derivedText(dkey, facts));
          if (!v) continue;
          if (await typeInto(page, boxOf(q.i), v)) ok(name, v); else bad(name, v, 'the field did not keep the value');
        } else if (q.kind === 'select') {
          let choose: ((os: string[]) => string | null) | null = null;
          let filter: string | undefined;
          if (custom) choose = (os) => matchAnswer(custom, os);
          else if (key && savedAnswer(key, std)) choose = (os) => chooseOption(key, std, os);
          else if (/^country(?: of residence)?$/i.test(q.label) && inUS) { choose = usCountry; filter = 'United States'; }
          // Netflix shows "State" once Country is the US.
          else if (/^state(?: or province)?$|^province$/i.test(q.label) && inUS && state) {
            const full = STATE_NAMES[state.toUpperCase()];
            choose = (os) => os.find((o) => norm(o) === norm(full)) ?? os.find((o) => norm(o) === norm(state)) ?? null;
            filter = full;
          }
          else if (dkey === 'locatedInUS' || dkey === 'residenceCountry') choose = (os) => chooseDerived(dkey, facts, os);
          if (!choose) continue;
          const r = await pickCombo(page, comboOf(q.i), choose, filter);
          if (r.ok && r.pick) ok(name, r.pick);
          else bad(name, custom ?? String(key ? savedAnswer(key, std) : ''), r.pick ? 'the dropdown did not keep the choice' : `no option clearly matches (options: ${r.options.slice(0, 8).join(', ') || 'none shown'})`);
        } else if (q.kind === 'checkbox' || q.kind === 'radio') {
          // "Select all that apply" groups: gender and race only, one box each.
          const pick = custom ? matchAnswer(custom, q.options)
            : key && ['gender', 'race', 'veteran', 'disability', 'hispanic', 'workAuthorized', 'sponsorship', 'authorizedWithoutSponsorship'].includes(key) && savedAnswer(key, std)
              ? chooseOption(key, std, q.options) : null;
          if (!pick) continue;
          if (await tick(page, q.i, pick)) ok(name, pick); else bad(name, pick, 'option not found');
        }
      } catch (err) {
        bad(name, '', (err as Error).message.split('\n')[0]);
      }
    }
  }

  report.needsYou = (await readQuestions(page)).filter((q) => q.required && q.empty && q.kind !== 'file').map((q) => q.label);
  if (!report.resumeUploaded) {
    const resumeQ = (await readQuestions(page)).find((q) => q.kind === 'file' && q.required && q.empty);
    if (resumeQ) report.needsYou.unshift(resumeQ.label);
  }
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  return report;
}

/**
 * No form yet: is the site asking the candidate to sign in (true), or is the job gone (false)?
 * Microsoft sends the page to its sign-in; Qualcomm shows an email box and "sign in" text.
 */
export async function eightfoldWantsSignIn(page: Page, formUrl: string): Promise<boolean> {
  const here = (() => { try { return new URL(page.url()).hostname; } catch { return ''; } })();
  if (here && here !== new URL(formUrl).hostname) return true; // sent to a sign-in site
  return page.evaluate(() => {
    const text = (document.body?.innerText ?? '').slice(0, 6000);
    if (/no longer (?:available|accepting)|position (?:has been )?(?:closed|filled)|job (?:not found|is closed)|page not found/i.test(text)) return false;
    const box = [...document.querySelectorAll('input[type=email], input[type=password], input[name=email], input[id*=email]')].some((e) => (e as HTMLElement).getClientRects().length > 0);
    return box || /sign in|log in|verify your email|continue with (?:email|microsoft|google)|create (?:an )?account/i.test(text);
  }).catch(() => false);
}

/**
 * The form sits behind the company's own sign-in (Microsoft, Qualcomm): wait while the
 * candidate signs in, up to `maxMinutes`; true once the form shows. The filler types nothing.
 */
export async function waitForEightfoldForm(page: Page, maxMinutes = 30): Promise<boolean> {
  const deadline = Date.now() + maxMinutes * 60_000;
  while (Date.now() < deadline) {
    if (page.isClosed()) return false;
    if (await page.$(EIGHTFOLD_READY).catch(() => null)) { await sleep(1500); return true; }
    await sleep(2000);
  }
  return false;
}

// Exposed for tests.
export const _private = { matchAnswer };
