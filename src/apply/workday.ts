import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from 'puppeteer';
import type { Applicant, ApplicantEducation, ApplicantJob } from '../resume/applicant.js';
import type { ApplyAnswer } from './apply-profile.js';
import { STATE_NAMES, norm, sleep, type FillReport } from './common.js';
import { chooseDerived, chooseOption, classifyDerived, classifyQuestion, derivedText, savedAnswer, type QuestionKey, type StandardAnswers } from './standard-answers.js';

// Fills a Workday application (<tenant>.wd<N>.myworkdayjobs.com) from résumé data.
//
// Workday is different from the other boards in two ways:
//   1. Every company is its own Workday tenant with its own candidate account. The filler
//      NEVER signs in or creates an account: it opens the application at the Create Account /
//      Sign In step and waits for the candidate to do that in the Chrome window. The apply
//      Chrome profile (data/apply-chrome-profile/) keeps those sessions, so a tenant signed in
//      to once usually opens straight on the first step next time.
//   2. The application is a wizard (My Information → My Experience → Application Questions →
//      Voluntary Disclosures → Self Identify → Review), one step per page. The filler follows
//      the wizard: each time a new step appears it fills that step and waits. The candidate
//      checks it and presses "Save and Continue"; the filler never presses it, and never
//      presses Submit on the Review step.
//
// DOM (checked live 2026-11-20 up to the sign-in step; the steps after it need an account):
//   - "Apply" (a[data-automation-id=adventureButton]) opens a dialog with autofillWithResume /
//     applyManually / useMyLastApplication; the applyManually route is …/<job>/apply/applyManually.
//   - The flow lives in [data-automation-id=applyFlowPage]; the step bar is ol#progressBar with
//     li[data-automation-id=progressBarActiveStep] for the current step.
//   - Sign-in: [data-automation-id=signInContent] (email, password, createAccountSubmitButton).
//     input[data-automation-id=beecatcher] (name="website") is a bot honeypot: never touch it.
//   - Every question is a div[data-automation-id="formField-<id>"] with a <label>/<legend>;
//     a trailing * marks it required. Inside: text inputs / textarea; dropdowns are
//     button[aria-haspopup=listbox] whose options ([role=option]) render in a popup only while
//     open ("Select One" means empty); type-ahead "prompts" (How did you hear, Field of Study,
//     Skills) are a search input whose results are [data-automation-id=promptOption] and whose
//     picks show as [data-automation-id=selectedItem]; dates are spin inputs
//     [data-automation-id=dateSectionMonth-input] / dateSectionYear-input; plain radios and
//     checkboxes with <label for>.
//   - Repeating sections (Work Experience, Education, Websites) start empty with an "Add"
//     button; each entry is headed "Work Experience 1", "Education 1"….
//
// It NEVER submits, never ticks consent / terms boxes, and never answers a demographic or
// authorization question without a saved answer.

const HOST = /^[a-z0-9][a-z0-9-]*\.wd\d{1,3}\.myworkdayjobs\.com$/;
const LOCALE = /^[a-z]{2}(?:-[A-Za-z]{2})?$/;
const SEGMENT = /^[A-Za-z0-9%._~,()'+-]+$/;
/** The last path segment of a Workday job: "<title slug>_<requisition id>". */
const JOB_SLUG = /_[A-Za-z0-9-]+$/;

/** Any Workday job URL -> its "Apply Manually" application, or null. */
export function workdayFormUrl(applyUrl: string): string | null {
  let u: URL;
  try { u = new URL(applyUrl); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase();
  if (!HOST.test(host)) return null;
  const parts = u.pathname.split('/').filter(Boolean);
  let i = 0;
  const locale = LOCALE.test(parts[0] ?? '') && parts[1] && (parts[2] === 'job' || parts[2] === 'details') ? parts[i++] : undefined;
  const site = parts[i++];
  if (!site || !SEGMENT.test(site)) return null;
  const kind = parts[i++];
  if (kind !== 'job' && kind !== 'details') return null;
  let rest = parts.slice(i);
  const apply = rest.indexOf('apply');
  if (apply >= 0) rest = rest.slice(0, apply);
  if (!rest.length || rest.length > 3 || !rest.every((s) => SEGMENT.test(s))) return null;
  if (!JOB_SLUG.test(rest[rest.length - 1])) return null;
  return `https://${host}/${locale ? `${locale}/` : ''}${site}/${kind}/${rest.join('/')}/apply/applyManually`;
}

/** Decline the cookie banner and, if the job page shows instead of the flow, go Apply → Apply Manually. */
export async function openWorkdayForm(page: Page): Promise<void> {
  // The flow renders client-side a few seconds after load.
  await page.waitForSelector('[data-automation-id="applyFlowPage"], [data-automation-id="adventureButton"], [data-automation-id="jobPostingPage"]', { timeout: 20_000 }).catch(() => null);
  const decline = await page.$('[data-automation-id="legalNoticeDeclineButton"]');
  if (decline) { await decline.click().catch(() => {}); await sleep(300); }
  if (await page.$('[data-automation-id="applyFlowPage"]')) return;
  const apply = await page.$('[data-automation-id="adventureButton"]');
  if (!apply) return;
  await apply.click();
  const manual = await page.waitForSelector('[data-automation-id="applyManually"]', { timeout: 8000 }).catch(() => null);
  if (manual) await manual.click();
  await page.waitForSelector('[data-automation-id="applyFlowPage"]', { timeout: 15_000 }).catch(() => null);
}

export type WorkdayState = 'sign-in' | 'step' | 'review' | 'other';

/** Where the flow is: waiting for the candidate to sign in, on a fillable step, or on Review. */
export async function workdayState(page: Page): Promise<{ state: WorkdayState; step: string }> {
  return page.evaluate(() => {
    const vis = (el: Element | null) => !!el && ((el as HTMLElement).offsetParent !== null || el.getClientRects().length > 0);
    const active = document.querySelector('[data-automation-id="progressBarActiveStep"]') as HTMLElement | null;
    const step = (active?.innerText ?? '').replace(/\s+/g, ' ').replace(/^current step \d+ of \d+\s*/i, '').trim();
    if (!document.querySelector('[data-automation-id="applyFlowPage"]')) return { state: 'other' as const, step };
    if (vis(document.querySelector('[data-automation-id="signInContent"]'))) return { state: 'sign-in' as const, step };
    const buttons = [...document.querySelectorAll('button')].filter(vis).map((b) => b.innerText.trim());
    if (/^review$/i.test(step) || buttons.some((t) => /^submit$/i.test(t))) return { state: 'review' as const, step };
    const fields = [...document.querySelectorAll('[data-automation-id^="formField-"]')].filter(vis);
    return { state: fields.length ? 'step' as const : 'other' as const, step };
  });
}

type Kind = 'text' | 'select' | 'multi' | 'radio' | 'checkbox' | 'date' | 'file';
interface Field {
  i: number;
  id: string;
  label: string;
  required: boolean;
  kind: Kind;
  options: string[];
  /** Nearest heading above the field: "Work Experience 2", "Education 1", "Voluntary Disclosures"… */
  section: string;
  empty: boolean;
  /** Current text / dropdown choice / first picked prompt item ('' when empty). */
  value: string;
}

/** Tag every visible question with data-jq-field="<i>" and describe it. */
async function readFields(page: Page): Promise<Field[]> {
  return page.evaluate(() => {
    const vis = (el: Element) => (el as HTMLElement).offsetParent !== null || el.getClientRects().length > 0;
    const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').replace(/\s*\*\s*$/, '').trim();
    const root = document.querySelector('[data-automation-id="applyFlowPage"]') ?? document.body;
    // Tags from an earlier read stay on fields hidden since ("I currently work here" hides the
    // To date) and would shadow the new numbering.
    for (const old of document.querySelectorAll('[data-jq-field]')) old.removeAttribute('data-jq-field');
    // Section headings only: a <legend> or heading inside a question is that question's label
    // (date fields are fieldsets with legend "From" / "To"), and counting it made the next field
    // and the "Add Another" button look like they belonged to a section called "To".
    const headings = [...root.querySelectorAll('h2, h3, h4, h5, [role=heading]')]
      .filter(vis)
      .filter((h) => !h.closest('[data-automation-id^="formField-"]'));
    // An entry's own group label ("Work Experience 2") wins over the nearest heading.
    const ENTRY = /^(?:work experience|education)\s*\d+/i;
    const groupLabel = (el: Element) => {
      for (let a = el.parentElement; a && a !== root.parentElement; a = a.parentElement) {
        const ids = (a.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean);
        if (!ids.length) continue;
        const t = clean(ids.map((id) => document.getElementById(id)?.innerText ?? '').join(' '));
        if (ENTRY.test(t)) return t;
      }
      return '';
    };
    const sectionOf = (el: Element) => {
      const group = groupLabel(el);
      if (group) return group;
      let best = '';
      for (const h of headings) {
        if (h.contains(el) || el.contains(h)) continue;
        if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) best = clean((h as HTMLElement).innerText);
      }
      return best;
    };
    const optionLabel = (input: Element) => clean(
      (input.id && (document.querySelector(`label[for="${CSS.escape(input.id)}"]`) as HTMLElement | null)?.innerText)
      || (input.closest('label') as HTMLElement | null)?.innerText
      || input.getAttribute('aria-label'),
    );
    const boxes = [...root.querySelectorAll('[data-automation-id^="formField-"]')]
      .filter(vis)
      .filter((el) => !el.closest('[data-automation-id="signInContent"]'))
      // A field that wraps other fields (a fieldset of sub-fields) is described by its parts.
      .filter((el) => !el.querySelector('[data-automation-id^="formField-"]'));
    return boxes.map((el, i) => {
      el.setAttribute('data-jq-field', String(i));
      const id = el.getAttribute('data-automation-id')!.slice('formField-'.length);
      const labelEl = el.querySelector('legend, label') as HTMLElement | null;
      const rawLabel = labelEl?.innerText ?? el.getAttribute('aria-label') ?? '';
      const required = /\*\s*$/.test(rawLabel.trim()) || !!el.querySelector('[aria-required="true"], [required]');
      const label = clean(rawLabel);
      const section = sectionOf(el);
      const radios = [...el.querySelectorAll('input[type=radio]')];
      const checks = [...el.querySelectorAll('input[type=checkbox]')];
      const text = el.querySelector('input:not([type=hidden]):not([type=radio]):not([type=checkbox]):not([type=file]), textarea') as HTMLInputElement | null;
      let kind: string, options: string[] = [], empty: boolean, value = '';
      if (el.querySelector('input[type=file]')) {
        kind = 'file';
        empty = !el.querySelector('[data-automation-id*="file-upload-item"], [data-automation-id="file-upload-successful"]') && !/\.(pdf|docx?|rtf|txt)\b/i.test((el as HTMLElement).innerText);
      } else if (el.querySelector('[data-automation-id="dateSectionMonth-input"], [data-automation-id="dateSectionYear-input"]')) {
        kind = 'date';
        empty = [...el.querySelectorAll('[data-automation-id$="-input"]')].every((x) => !(x as HTMLInputElement).value && !/\d/.test(x.getAttribute('aria-valuetext') ?? ''));
      } else if (el.querySelector('button[aria-haspopup="listbox"]')) {
        kind = 'select';
        const shown = clean((el.querySelector('button[aria-haspopup="listbox"]') as HTMLElement).innerText);
        empty = !shown || /^select one$/i.test(shown);
        if (!empty) value = shown;
      } else if (el.querySelector('[data-automation-id="multiselectInputContainer"], [data-uxi-widget-type="selectinput"], [data-automation-id="searchBox"]')) {
        kind = 'multi';
        const picked = el.querySelector('[data-automation-id="selectedItem"], [data-automation-id="selectedItemList"] li') as HTMLElement | null;
        empty = !picked;
        value = clean(picked?.innerText);
      } else if (radios.length) {
        kind = 'radio';
        options = radios.map(optionLabel);
        empty = !radios.some((r) => (r as HTMLInputElement).checked);
      } else if (checks.length) {
        kind = 'checkbox';
        options = checks.map(optionLabel);
        empty = !checks.some((c) => (c as HTMLInputElement).checked);
      } else {
        kind = 'text';
        value = text?.value?.trim() ?? '';
        empty = !value;
      }
      return { i, id, label, required, kind: kind as never, options, section, empty, value };
    });
  });
}

const at = (i: number) => `[data-jq-field="${i}"]`;

/** Replace a text box's value by typing (React-safe), then blur so Workday commits it. */
async function typeText(page: Page, i: number, value: string): Promise<boolean> {
  const el = await page.$(`${at(i)} input:not([type=hidden]):not([type=radio]):not([type=checkbox]):not([type=file]), ${at(i)} textarea`);
  if (!el) return false;
  await focusBox(page, el);
  await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  // Role descriptions run to hundreds of characters: no per-key delay for long text.
  await page.keyboard.type(value, { delay: value.length > 120 ? 0 : 6 });
  await el.evaluate((e) => (e as HTMLElement).blur());
  const flat = (s: string) => s.replace(/\s+/g, ' ').trim();
  return flat(await el.evaluate((e) => (e as HTMLInputElement).value)) === flat(value);
}

/**
 * Put the caret in a box. Workday overlays some inputs (date parts, prompt searches) with a
 * display element, so a mouse click can fail with "not clickable"; focusing it from the page
 * works the same for typing, since keys go to the focused element.
 */
async function focusBox(page: Page, el: import('puppeteer').ElementHandle): Promise<void> {
  await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  try { await el.click(); } catch { /* covered by an overlay */ }
  await el.evaluate((e) => (e as HTMLElement).focus());
}

const OPEN_OPTIONS = '[role="listbox"] [role="option"]';

/** Open dropdown `i`, let `choose` pick from its options, click it. Returns the pick, or null. */
async function selectOption(page: Page, i: number, choose: (options: string[]) => string | null): Promise<{ pick: string | null; options: string[]; ok: boolean }> {
  const btn = await page.$(`${at(i)} button[aria-haspopup="listbox"]`);
  if (!btn) return { pick: null, options: [], ok: false };
  await btn.click();
  await page.waitForSelector(OPEN_OPTIONS, { visible: true, timeout: 4000 }).catch(() => null);
  const options = await page.$$eval(OPEN_OPTIONS, (os) => os.map((o) => (o as HTMLElement).innerText.replace(/\s+/g, ' ').trim()).filter(Boolean));
  const pick = choose(options);
  if (!pick) { await page.keyboard.press('Escape'); await sleep(150); return { pick: null, options, ok: false }; }
  const clicked = await page.evaluate((sel, text) => {
    const o = [...document.querySelectorAll(sel)].find((x) => (x as HTMLElement).innerText.replace(/\s+/g, ' ').trim() === text) as HTMLElement | undefined;
    if (!o) return false;
    o.scrollIntoView({ block: 'center' });
    o.click();
    return true;
  }, OPEN_OPTIONS, pick);
  if (!clicked) { await page.keyboard.press('Escape'); return { pick, options, ok: false }; }
  await sleep(400);
  const shown = await btn.evaluate((b) => (b as HTMLElement).innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
  return { pick, options, ok: shown === pick || shown.includes(pick) };
}

/** Type `text` into type-ahead `i`, press Enter, pick the result that matches exactly. */
async function promptPick(page: Page, i: number, text: string, accept: (option: string) => boolean = (o) => norm(o) === norm(text)): Promise<string | null> {
  const input = await page.$(`${at(i)} input:not([type=hidden])`);
  if (!input) return null;
  await focusBox(page, input);
  await page.keyboard.type(text, { delay: 6 });
  await page.keyboard.press('Enter');
  const results = '[data-automation-id="promptOption"]';
  await page.waitForSelector(results, { visible: true, timeout: 5000 }).catch(() => null);
  const shown = await page.$$eval(results, (os) => os.filter((o) => (o as HTMLElement).offsetParent !== null).map((o) => (o as HTMLElement).innerText.replace(/\s+/g, ' ').trim())).catch(() => [] as string[]);
  const want = shown.find(accept) ?? null;
  const hit = want && await page.evaluate((sel, t) => {
    const o = [...document.querySelectorAll(sel)].find((x) => (x as HTMLElement).offsetParent !== null && (x as HTMLElement).innerText.replace(/\s+/g, ' ').trim() === t) as HTMLElement | undefined;
    o?.click();
    return o ? t : null;
  }, results, want).catch(() => null);
  if (!hit) {
    await page.keyboard.press('Escape');
    // Leave no half-typed search behind.
    await focusBox(page, input).catch(() => {});
    await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    return null;
  }
  await sleep(400);
  const picked = !!(await page.$(`${at(i)} [data-automation-id="selectedItem"]`));
  // Prompts are multi-selects: Workday keeps the results list open after a pick, over the
  // fields below it, and a click elsewhere only closes it. Left open, it swallowed the next
  // clicks, so after the school was picked the Degree, Field of Study and years were all
  // missed (BlackRock, 2026-11-22). Escape closes it and keeps the pick.
  await page.keyboard.press('Escape');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.()).catch(() => {});
  await sleep(200);
  return picked && (await page.$(`${at(i)} [data-automation-id="selectedItem"]`)) ? hit : null;
}

/** Tick the radio / checkbox labelled `text` in field `i` (DOM click) and confirm it stuck. */
async function tick(page: Page, i: number, text: string): Promise<boolean> {
  const act = (sel: string, t: string, click: boolean) => {
    const box = document.querySelector(sel);
    if (!box) return false;
    for (const input of box.querySelectorAll('input[type=radio], input[type=checkbox]')) {
      const x = input as HTMLInputElement;
      const label = ((x.id && (document.querySelector(`label[for="${CSS.escape(x.id)}"]`) as HTMLElement | null)?.innerText) || (x.closest('label') as HTMLElement | null)?.innerText || x.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
      if (label !== t) continue;
      if (click && !x.checked) x.click();
      return click || x.checked;
    }
    return false;
  };
  if (!(await page.evaluate(act, at(i), text, true))) return false;
  await sleep(200);
  return page.evaluate(act, at(i), text, false);
}

/** Tick the single checkbox in field `i` (e.g. "I currently work here"). */
async function checkOnly(page: Page, i: number): Promise<boolean> {
  return page.evaluate((sel) => {
    const x = document.querySelector(`${sel} input[type=checkbox]`) as HTMLInputElement | null;
    if (!x) return false;
    if (!x.checked) x.click();
    return x.checked;
  }, at(i));
}

/**
 * Fill a Workday month/year date field. A year-only field ignores the month. Each part is a
 * spin input under a display overlay (`dateSection<Part>-display`), so it is focused, not
 * clicked, and checked through either the input or the display.
 */
async function setDate(page: Page, i: number, d: { year: number; month?: number }): Promise<boolean> {
  const part = (p: string) => page.$(`${at(i)} [data-automation-id="dateSection${p}-input"]`);
  const month = await part('Month');
  const year = await part('Year');
  if (!year) return false;
  if (month) {
    if (!d.month) return false;
    await focusBox(page, month);
    await page.keyboard.type(String(d.month).padStart(2, '0'), { delay: 40 });
  }
  // Typing the month usually moves the caret to the year; focus it anyway.
  await focusBox(page, year);
  await page.keyboard.type(String(d.year), { delay: 40 });
  await year.evaluate((e) => (e as HTMLElement).blur());
  await sleep(200);
  return page.evaluate((sel, y) => {
    const box = document.querySelector(sel);
    const input = box?.querySelector('[data-automation-id="dateSectionYear-input"]') as HTMLInputElement | null;
    const display = box?.querySelector('[data-automation-id="dateSectionYear-display"]') as HTMLElement | null;
    return input?.value === y || (input?.getAttribute('aria-valuetext') ?? '').includes(y) || (input?.getAttribute('aria-valuenow') ?? '') === y || (display?.innerText ?? '').includes(y);
  }, at(i), String(d.year));
}

/** "03/2023" / "2023" for a text-box date (tenants without the date widget). */
const dateText = (d: { year: number; month?: number }) => (d.month ? `${String(d.month).padStart(2, '0')}/${d.year}` : String(d.year));

/**
 * Click the "Add" / "Add Another" button of a repeating section (Work Experience, Education…).
 * The section is the button's labelled group (aria-labelledby) or, failing that, the nearest
 * section heading above it. Question labels (<legend>s of date fields…) never count.
 */
async function clickAdd(page: Page, section: RegExp, dom = false): Promise<boolean> {
  const handle = await page.evaluateHandle((src) => {
    const re = new RegExp(src, 'i');
    const vis = (el: Element) => (el as HTMLElement).offsetParent !== null;
    const root = document.querySelector('[data-automation-id="applyFlowPage"]') ?? document.body;
    const headings = [...root.querySelectorAll('h2, h3, h4, h5, [role=heading]')]
      .filter(vis)
      .filter((h) => !h.closest('[data-automation-id^="formField-"]'));
    const before = (el: Element) => {
      let best = '';
      for (const h of headings) if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) best = (h as HTMLElement).innerText.trim();
      return best;
    };
    const groupOf = (el: Element) => {
      for (let a = el.parentElement; a && a !== root.parentElement; a = a.parentElement) {
        const ids = (a.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean);
        const t = ids.map((id) => document.getElementById(id)?.innerText ?? '').join(' ').trim();
        if (t) return t;
      }
      return '';
    };
    const buttons = [...root.querySelectorAll('button')].filter(vis)
      .filter((b) => b.getAttribute('data-automation-id') === 'add-button' || /^add(?: another)?$/i.test(b.innerText.trim()));
    return buttons.find((b) => re.test(b.getAttribute('aria-label') ?? '') || re.test(groupOf(b)) || re.test(before(b))) ?? null;
  }, section.source);
  const el = handle.asElement();
  if (!el) return false;
  // Workday's fixed footer (Back / Save and Continue) can cover a button that counts as "in
  // view", so a mouse click there lands on the footer and nothing is added (Education's Add,
  // right under the last job, was missed this way). Centre it first; `dom` clicks it directly.
  await el.evaluate((b) => (b as HTMLElement).scrollIntoView({ block: 'center', inline: 'nearest' }));
  await sleep(200);
  if (dom) await el.evaluate((b) => (b as HTMLElement).click());
  else await (el as unknown as { click(): Promise<void> }).click();
  return true;
}

const entryNo = (section: string, re: RegExp) => Number(section.match(re)?.[1] ?? 0);
const WORK = /^work experience\s*(\d+)/i;
const EDU = /^education\s*(\d+)/i;
const isEntry = (f: Field) => WORK.test(f.section) || EDU.test(f.section);

type Report = { ok: (field: string, value: string) => void; bad: (field: string, value: string, reason: string) => void };

/** Fields of each entry ("Work Experience 2" -> 2) on the page. */
function entries(fields: Field[], re: RegExp): Map<number, Field[]> {
  const m = new Map<number, Field[]>();
  for (const f of fields) {
    const n = entryNo(f.section, re);
    if (n) m.set(n, [...(m.get(n) ?? []), f]);
  }
  return m;
}

/** Same company / school, allowing "General Motors" vs "General Motors Company". */
function sameName(a: string, b: string): boolean {
  const x = norm(a), y = norm(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
}

/**
 * The entry to fill for one résumé item: an entry already holding it (Workday parsed the résumé,
 * or kept the last application), else an untouched blank entry, else a new one via Add.
 */
async function entryFor(page: Page, re: RegExp, section: RegExp, key: RegExp, name: string, used: Set<number>): Promise<number> {
  const all = entries(await readFields(page), re);
  const keyField = (fs: Field[]) => fs.find((f) => key.test(`${f.id} ${f.label}`.toLowerCase()));
  for (const [n, fs] of all) if (!used.has(n) && sameName(keyField(fs)?.value ?? '', name)) return n;
  for (const [n, fs] of all) if (!used.has(n) && fs.every((f) => f.kind === 'checkbox' || f.empty)) return n;
  const before = Math.max(0, ...all.keys());
  // A mouse click first; if no entry appears, click the button through the DOM (a click that
  // landed on an overlay or the footer did nothing).
  for (const dom of [false, true]) {
    if (!(await clickAdd(page, section, dom))) return 0;
    for (let t = 0; t < 8; t++) {
      await sleep(500);
      const after = Math.max(0, ...entries(await readFields(page), re).keys());
      if (after > before) return after;
    }
  }
  return 0;
}

/**
 * Run one field's fill so a failure is reported and the rest of the step still runs. (One
 * date box that would not take a click used to abort the whole step: no Add Another, no dates,
 * no Education.)
 */
async function attempt(r: Report, field: string, value: string, fn: () => Promise<boolean | void>, reason = 'the field did not keep the value'): Promise<void> {
  try {
    const ok = await fn();
    if (ok === false) r.bad(field, value, reason); else r.ok(field, value);
  } catch (err) {
    r.bad(field, value, (err as Error).message.split('\n')[0]);
  }
}

/**
 * One Work Experience entry per résumé job: existing entries are completed (empty fields only),
 * missing jobs are added. Nothing a candidate or Workday already typed is overwritten.
 */
async function fillWork(page: Page, jobs: ApplicantJob[], r: Report): Promise<void> {
  const used = new Set<number>();
  for (const job of jobs) {
    const n = await entryFor(page, WORK, /work experience/, /company/, job.company, used).catch(() => 0);
    if (!n) { r.bad('Work Experience', `${job.title} at ${job.company}`, 'could not add an entry (no Add / Add Another button found)'); continue; }
    used.add(n);
    const tag = `Work Experience ${n}`;
    for (const f of entries(await readFields(page), WORK).get(n) ?? []) {
      const l = `${f.id} ${f.label}`.toLowerCase();
      if (f.kind === 'checkbox' && /currently ?work/.test(l)) {
        if (job.current && f.empty) await attempt(r, `${tag}: ${f.label}`, 'Yes', () => checkOnly(page, f.i));
        continue;
      }
      if (f.kind !== 'text' || !f.empty) continue;
      const isDate = /startdate|enddate|\bfrom\b|\bto\b/.test(l) && !/description/.test(l);
      if (isDate) continue; // text-box dates are done with the date widgets below
      const v = /jobtitle|job title/.test(l) ? job.title
        : /company/.test(l) ? job.company
        : /\blocation\b/.test(l) ? job.location
        : /description|responsibilit|summary|duties/.test(l) ? job.description
        : undefined;
      if (!v) continue;
      await attempt(r, `${tag}: ${f.label}`, v.length > 80 ? `${v.slice(0, 77)}…` : v, () => typeText(page, f.i, v));
    }
    // "I currently work here" hides the To date, so read again before the dates.
    for (const f of (entries(await readFields(page), WORK).get(n) ?? []).filter((x) => (x.kind === 'date' || x.kind === 'text') && x.empty)) {
      const l = `${f.id} ${f.label}`.toLowerCase();
      if (/description/.test(l)) continue;
      const d = /startdate|\bfrom\b|\bstart\b/.test(l) ? job.start : /enddate|\bto\b|\bend\b/.test(l) && !job.current ? job.end : undefined;
      if (!d) continue;
      await attempt(r, `${tag}: ${f.label}`, dateText(d), () => (f.kind === 'date' ? setDate(page, f.i, d) : typeText(page, f.i, dateText(d))), 'the date did not take');
    }
  }
}

const GENERIC_DEGREE = /^(?:masters?|master s|bachelors?|bachelor s|associates?|associate s|doctorate|doctoral)(?: degree)?(?: or equivalent)?$/;

/**
 * The degree option for a résumé degree. Workday tenants list either one generic option
 * ("Master's Degree") or several specific ones ("Master of Science (MS)", "Master of Arts (MA)",
 * "Master of Business Administration (MBA)"): the exact degree wins, then a single generic
 * option, then the science / arts option that fits the field of study. Otherwise null.
 */
export function chooseDegree(edu: Pick<ApplicantEducation, 'degree' | 'degreeLevel' | 'discipline'>, options: string[]): string | null {
  const level = norm(edu.degreeLevel ?? edu.degree ?? '');
  if (!level) return null;
  const exact = edu.degree ? options.find((o) => norm(o) === norm(edu.degree!)) : undefined;
  if (exact) return exact;
  const word: Record<string, RegExp> = {
    'bachelor s': /\bbachelor|\bb ?s\b|\bb ?sc\b|\bb ?a\b|\bb ?tech\b|\bb ?e\b/,
    'master s': /\bmaster|\bm ?s\b|\bm ?sc\b|\bm ?tech\b/,
    doctorate: /\bdoctor|\bph ?d\b/,
    'associate s': /\bassociate/,
    mba: /\bmba\b|master of business/,
    'high school': /high school|secondary|ged\b/,
  };
  const re = word[level] ?? new RegExp(`\\b${level.split(' ')[0]}`);
  let hits = options.filter((o) => re.test(norm(o)));
  if (level === 'master s') hits = hits.filter((o) => !/\bmba\b|business admin/.test(norm(o)));
  if (hits.length <= 1) return hits[0] ?? null;
  const generic = hits.filter((o) => GENERIC_DEGREE.test(norm(o)));
  if (generic.length === 1) return generic[0];
  const subject = norm(`${edu.degree ?? ''} ${edu.discipline ?? ''}`);
  const science = /science|computer|engineering|technology|math|physics|chemistry|data|information/.test(subject);
  const arts = /\barts?\b|humanities|english|history|literature|communication/.test(subject);
  const byField = hits.filter((o) => {
    const n = norm(o);
    if (science) return /\bscience\b|\b[mb] ?sc?\b|\b[mb] ?tech\b|engineering/.test(n);
    if (arts) return /\barts?\b|\b[mb] ?a\b/.test(n);
    return false;
  });
  return byField.length === 1 ? byField[0] : null;
}

/** One Education entry per résumé school: existing entries are completed, missing ones added. */
async function fillEducation(page: Page, schools: ApplicantEducation[], r: Report): Promise<void> {
  const used = new Set<number>();
  for (const edu of schools) {
    const n = await entryFor(page, EDU, /education/, /school|university|institution|college/, edu.school, used).catch(() => 0);
    if (!n) { r.bad('Education', edu.school, 'could not add an entry (no Add / Add Another button found)'); continue; }
    used.add(n);
    const tag = `Education ${n}`;
    for (const f of entries(await readFields(page), EDU).get(n) ?? []) {
      if (!f.empty) continue;
      const l = `${f.id} ${f.label}`.toLowerCase();
      const name = `${tag}: ${f.label}`;
      if (/school|university|institution|college/.test(l)) {
        // Workday's school list may add a campus ("… - Main Campus"): a name that starts with ours counts.
        if (f.kind === 'text') await attempt(r, name, edu.school, () => typeText(page, f.i, edu.school));
        else if (f.kind === 'multi') await attempt(r, name, edu.school, async () => !!(await promptPick(page, f.i, edu.school, (o) => norm(o) === norm(edu.school) || norm(o).startsWith(`${norm(edu.school)} `))), 'no matching school in the list');
        else if (f.kind === 'select') await attempt(r, name, edu.school, async () => (await selectOption(page, f.i, (os) => os.find((o) => norm(o) === norm(edu.school)) ?? null)).ok, 'no matching school in the list');
      } else if (/degree/.test(l) && f.kind === 'select') {
        const want = edu.degree ?? edu.degreeLevel ?? '';
        if (!want) continue;
        try {
          const res = await selectOption(page, f.i, (os) => chooseDegree(edu, os));
          if (res.pick && res.ok) r.ok(name, res.pick);
          else r.bad(name, want, res.pick ? 'the dropdown did not keep the choice' : `no option clearly matches (options: ${res.options.slice(0, 8).join(', ')})`);
        } catch (err) {
          r.bad(name, want, (err as Error).message.split('\n')[0]);
        }
      } else if (/field ?of ?study|major|discipline|area of study/.test(l) && edu.discipline) {
        const d = edu.discipline;
        if (f.kind === 'multi') await attempt(r, name, d, async () => !!(await promptPick(page, f.i, d, (o) => norm(o) === norm(d) || norm(o).startsWith(`${norm(d)} `))), 'no matching option in the list');
        else if (f.kind === 'text') await attempt(r, name, d, () => typeText(page, f.i, d));
        else if (f.kind === 'select') await attempt(r, name, d, async () => (await selectOption(page, f.i, (os) => os.find((o) => norm(o) === norm(d)) ?? null)).ok, 'no option clearly matches');
      } else if (f.kind === 'date' || (f.kind === 'text' && /year|\bfrom\b|\bto\b|graduat/.test(l))) {
        const d = /first|\bfrom\b|start/.test(l) ? edu.start : /last|\bto\b|\bend\b|graduat/.test(l) ? edu.end : undefined;
        if (!d) continue;
        // Year-only widgets (First / Last Year Attended) take just the year.
        const yearOnly = f.kind === 'date' && !(await page.$(`${at(f.i)} [data-automation-id="dateSectionMonth-input"]`));
        const shown = yearOnly ? String(d.year) : dateText(d);
        await attempt(r, name, shown, () => (f.kind === 'date' ? setDate(page, f.i, d) : typeText(page, f.i, shown)), 'the date did not take');
      }
    }
  }
}

/** The option matching a free-text answer, exactly or as a prefix. */
function matchAnswer(answer: string, options: string[]): string | null {
  const a = norm(answer);
  return options.find((o) => norm(o) === a) ?? options.find((o) => norm(o).startsWith(a)) ?? null;
}

/** Workday lists the US as "United States of America". */
function pickUS(options: string[]): string | null {
  return options.find((o) => /^united states(?: of america)?$/i.test(o.trim())) ?? null;
}

/** Digits of a US number without the country code ("+1 (555) 014-2233" -> "5550142233"). */
export function nationalNumber(phone: string): string {
  const d = phone.replace(/\D/g, '');
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
}

/** Saved answer key for a Workday question, by field id first (Self Identify has a bare "Please check one" label). */
function questionKey(f: Field): QuestionKey | null {
  if (/disability/i.test(f.id)) return 'disability';
  if (/veteran/i.test(f.id)) return 'veteran';
  if (/gender/i.test(f.id)) return 'gender';
  if (/ethnicity|race/i.test(f.id)) return 'race';
  if (/hispanic/i.test(f.id)) return 'hispanic';
  return classifyQuestion(f.label);
}

export interface WorkdayExtra { linkedin?: string; github?: string; website?: string; phone?: string; city?: string; state?: string; standard?: StandardAnswers }

/**
 * Fill the step currently on screen. Safe to call on any step: it only touches fields it has
 * an answer for, and never presses Save and Continue or Submit.
 */
export async function fillWorkdayStep(page: Page, a: Applicant, resumePath: string | undefined, answers: ApplyAnswer[], extra: WorkdayExtra): Promise<FillReport> {
  const report: FillReport = { filled: [], failed: [], needsYou: [], resumeUploaded: false };
  const r: Report = {
    ok: (field, value) => report.filled.push({ field, value }),
    bad: (field, value, reason) => report.failed.push({ field, value, reason }),
  };
  const std = extra.standard ?? {};
  const city = extra.city ?? a.city, state = extra.state ?? a.state;
  const stateName = state ? STATE_NAMES[state.toUpperCase()] : undefined;
  const inUS = !!stateName;
  const links = { linkedin: extra.linkedin ?? a.linkedin, github: extra.github ?? a.github, website: extra.website ?? a.website };
  const facts = { fullName: a.fullName, city, state, inUS, company: a.experience[0]?.company, title: a.experience[0]?.title };
  const phone = extra.phone ?? a.phone;
  const customFor = (label: string) => answers.find((x) => label.toLowerCase().includes(x.question.toLowerCase()))?.answer;

  let fields = await readFields(page);

  // My Experience: the résumé first (some tenants parse it into the sections below), then every
  // job and school: entries already there are completed, missing ones added.
  // The upload box is often not a formField, so fall back to Workday's own file input.
  const file = fields.find((f) => f.kind === 'file' && /resume|cv|attach|upload/i.test(`${f.id} ${f.label} ${f.section}`)) ?? fields.find((f) => f.kind === 'file');
  const input = file ? await page.$(`${at(file.i)} input[type=file]`) : await page.$('input[type=file][data-automation-id="file-upload-input-ref"], [data-automation-id*="attachments"] input[type=file]');
  const uploaded = async () => !!(await page.$('[data-automation-id*="file-upload-item"], [data-automation-id="file-upload-successful"]'));
  if (input && resumePath && (file ? file.empty : !(await uploaded()))) {
    try {
      await (input as unknown as { uploadFile(p: string): Promise<void> }).uploadFile(resumePath);
      report.resumeUploaded = true;
      // Wait for the upload to land, then give a résumé parse time to fill the sections, so
      // the entries below are matched to what it made instead of duplicated.
      for (let t = 0; t < 20 && !(await uploaded()); t++) await sleep(500);
      await sleep(3000);
    } catch (err) {
      r.bad('Résumé', resumePath, (err as Error).message);
    }
  }
  const experienceStep = await page.evaluate(() => /experience/i.test((document.querySelector('[data-automation-id="progressBarActiveStep"]') as HTMLElement | null)?.innerText ?? '')
    || [...document.querySelectorAll('h2, h3, h4, h5, [role=heading], [aria-labelledby]')]
      .some((h) => (h as HTMLElement).offsetParent !== null && /^(?:work experience|education)\b/i.test(((h.tagName === 'DIV' || h.tagName === 'SECTION') && h.getAttribute('aria-labelledby')
        ? (h.getAttribute('aria-labelledby') ?? '').split(/\s+/).map((id) => document.getElementById(id)?.innerText ?? '').join(' ')
        : (h as HTMLElement).innerText).trim())));
  if (experienceStep) {
    // Each section on its own: an error in Work Experience must not skip Education.
    await fillWork(page, a.experience, r).catch((err) => r.bad('Work Experience', '', (err as Error).message.split('\n')[0]));
    await fillEducation(page, a.education, r).catch((err) => r.bad('Education', '', (err as Error).message.split('\n')[0]));
  }

  // Everything else, by field id and label. Country first: it re-renders the address fields.
  const done = new Set<string>();
  for (let pass = 0; pass < 3; pass++) {
    fields = (await readFields(page)).filter((f) => !isEntry(f) && f.kind !== 'file' && !done.has(`${f.id}|${f.label}`));
    if (!fields.length) break;
    fields.sort((x, y) => Number(/country/i.test(y.id)) - Number(/country/i.test(x.id)));
    for (const f of fields) {
      done.add(`${f.id}|${f.label}`);
      try {
        if (!f.empty && f.kind !== 'text') continue; // a choice already made (by the candidate or a saved application) stays
        const id = f.id.toLowerCase();
        const name = f.label || f.id;
        const custom = customFor(f.label);

        if (f.kind === 'text') {
          let v: string | undefined = custom;
          if (!v) {
            if (/firstname/.test(id)) v = a.firstName;
            else if (/lastname/.test(id)) v = a.lastName;
            else if (/middlename|preferred|addressline|postalcode|extension/.test(id)) v = undefined;
            else if (/(?:^|--|_)city$|^city/.test(id)) v = city;
            else if (/^email$|--email$/.test(id)) v = a.email;
            else if (/phonenumber|phone-number/.test(id)) v = phone ? nationalNumber(phone) : undefined;
            else if (/linkedin/.test(id) || /linked ?in/i.test(f.label)) v = links.linkedin;
            else if (/github/i.test(f.label)) v = links.github;
            else if (classifyQuestion(f.label) === 'pronouns') v = std.pronouns;
            else v = derivedText(classifyDerived(f.label), facts);
          }
          if (!v) continue;
          if (!f.empty) {
            const current = await page.$eval(`${at(f.i)} input, ${at(f.i)} textarea`, (e) => (e as HTMLInputElement).value).catch(() => '');
            if (current.trim()) continue; // never overwrite what is already there
          }
          if (await typeText(page, f.i, v)) r.ok(name, v); else r.bad(name, v, 'the field did not keep the value');
        } else if (f.kind === 'select') {
          let choose: ((os: string[]) => string | null) | null = null;
          let wanted = custom ?? '';
          const key = questionKey(f);
          if (custom) choose = (os) => matchAnswer(custom, os);
          else if (/country$/.test(id) && !/phone/.test(id)) { if (inUS) { wanted = 'United States of America'; choose = pickUS; } }
          else if (/countryregion|(?:^|--)state$|region$/.test(id) || /^state\b/i.test(f.label)) { if (stateName) { wanted = stateName; choose = (os) => os.find((o) => o.trim() === stateName) ?? null; } }
          else if (/phonetype|device-type|devicetype/.test(id)) { wanted = 'Mobile'; choose = (os) => os.find((o) => /^mobile|^cell/i.test(o)) ?? null; }
          else if (key && savedAnswer(key, std)) { wanted = String(savedAnswer(key, std)); choose = (os) => chooseOption(key, std, os); }
          else {
            const dkey = classifyDerived(f.label);
            if (dkey === 'locatedInUS' || dkey === 'residenceCountry') choose = (os) => chooseDerived(dkey, facts, os);
          }
          if (!choose) continue;
          const res = await selectOption(page, f.i, choose);
          if (res.pick && res.ok) r.ok(name, res.pick);
          else if (wanted) r.bad(name, wanted, res.pick ? 'the dropdown did not keep the choice' : 'no option clearly matches');
          await sleep(300);
        } else if (f.kind === 'radio' || f.kind === 'checkbox') {
          // Checkboxes: only a choice the candidate saved (pronouns, Self Identify's disability
          // boxes). Terms / consent / acknowledgement boxes are never ticked.
          if (f.kind === 'checkbox' && f.options.length < 2) continue;
          const key = questionKey(f);
          const pick = custom ? matchAnswer(custom, f.options)
            : key && savedAnswer(key, std) ? chooseOption(key, std, f.options)
            : f.kind === 'radio' && (classifyDerived(f.label) === 'locatedInUS') ? chooseDerived('locatedInUS', facts, f.options)
            : null;
          if (!pick) {
            if (key && savedAnswer(key, std)) r.bad(name, String(savedAnswer(key, std)), 'no option clearly matches your saved answer');
            continue;
          }
          if (await tick(page, f.i, pick)) r.ok(name, pick); else r.bad(name, pick, 'option not found');
        } else if (f.kind === 'multi' && custom) {
          const hit = await promptPick(page, f.i, custom, (o) => norm(o) === norm(custom) || norm(o).endsWith(norm(custom)));
          if (hit) r.ok(name, hit); else r.bad(name, custom, 'no matching option in the list');
        }
      } catch (err) {
        // One field failing (an overlay, a re-render) must not stop the rest of the step.
        r.bad(f.label || f.id, '', (err as Error).message.split('\n')[0]);
      }
    }
  }

  report.needsYou = [...new Set((await readFields(page)).filter((f) => f.required && f.empty).map((f) => (isEntry(f) ? `${f.section}: ${f.label}` : f.label || f.id)))];
  return report;
}

/** Where step snapshots go: data/workday-debug/ (git-ignored, on this PC only). */
export const WORKDAY_DEBUG_DIR = process.env.WORKDAY_DEBUG_DIR
  ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'workday-debug');

/**
 * Save the step's markup (scripts, styles, icons and every value attribute stripped) to
 * data/workday-debug/<step>.html, one file per step, overwritten each time. Each tenant's
 * Workday differs a little; this shows which selectors a missed field needs.
 */
export async function saveWorkdaySnapshot(page: Page, step: string): Promise<string | null> {
  const html = await page.evaluate(() => {
    const root = document.querySelector('[data-automation-id="applyFlowPage"]');
    if (!root) return null;
    const copy = root.cloneNode(true) as Element;
    copy.querySelectorAll('script, style, svg, img').forEach((x) => x.remove());
    copy.querySelectorAll('[value]').forEach((x) => x.removeAttribute('value'));
    return copy.outerHTML;
  }).catch(() => null);
  if (!html) return null;
  mkdirSync(WORKDAY_DEBUG_DIR, { recursive: true });
  const file = path.join(WORKDAY_DEBUG_DIR, `${(step || 'step').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'step'}.html`);
  writeFileSync(file, `<!-- ${new URL(page.url()).hostname} ${new Date().toISOString()} -->\n${html}\n`);
  return file;
}

export interface WorkdayStepReport extends FillReport { step: string }

/**
 * Follow the wizard in the background: whenever a step that has not been filled yet appears,
 * fill it and report it. Stops at Review, when the tab closes, or after `maxMinutes`.
 * Sign-in / account creation is left entirely to the candidate.
 */
export async function followWorkday(
  page: Page,
  fill: () => Promise<FillReport>,
  onStep: (r: WorkdayStepReport) => void,
  opts: { maxMinutes?: number; alreadyFilled?: string[]; onDone?: (why: 'review' | 'closed' | 'timeout') => void } = {},
): Promise<void> {
  const filled = new Set(opts.alreadyFilled ?? []);
  const deadline = Date.now() + (opts.maxMinutes ?? 90) * 60_000;
  while (Date.now() < deadline) {
    if (page.isClosed()) { opts.onDone?.('closed'); return; }
    const s = await workdayState(page).catch(() => null);
    if (s?.state === 'review') { opts.onDone?.('review'); return; }
    if (s?.state === 'step' && !filled.has(s.step)) {
      await sleep(1500); // let the step finish rendering
      const again = await workdayState(page).catch(() => null);
      if (again?.state === 'step' && again.step === s.step) {
        filled.add(s.step);
        try { onStep({ step: s.step, ...(await fill()) }); } catch (err) {
          if (page.isClosed()) { opts.onDone?.('closed'); return; }
          onStep({ step: s.step, filled: [], failed: [{ field: s.step, value: '', reason: (err as Error).message }], needsYou: [], resumeUploaded: false });
        }
      }
    }
    await sleep(1500);
  }
  opts.onDone?.('timeout');
}

// Exposed for tests.
export const _private = { matchAnswer, pickUS, questionKey };
