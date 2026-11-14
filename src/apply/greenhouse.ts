import type { Page } from 'puppeteer';
import { MONTH_NAMES, type Applicant, type YearMonth } from '../resume/applicant.js';
import type { ApplyAnswer } from './apply-profile.js';
import { chooseDerived, chooseOption, classifyDerived, classifyQuestion, derivedText, type StandardAnswers } from './standard-answers.js';

// Fills a Greenhouse application (the job-boards.greenhouse.io React form) from résumé data.
//
// Field ids are Greenhouse's own and identical on every board: first_name, last_name, email,
// phone, country, candidate-location, resume, company-name-N / title-N / start-date-month-N…
// (employment), school--N / degree--N / discipline--N (education), question_NNN (the board's
// custom questions). Dropdowns are react-select comboboxes: they are filled by typing and
// clicking the matching option, never by setting .value, which React would ignore.
//
// It NEVER submits. The candidate reviews the filled form and presses Submit themselves.

const HOST = /^(?:job-boards|boards)(\.eu)?\.greenhouse\.io$/i;

/**
 * Any Greenhouse job URL -> its bare application form. The embed form answers for every
 * board, including the many whose job page redirects to the company's own careers site
 * (Coinbase, Airbnb), where the form is in an iframe or behind a bot wall.
 */
export function greenhouseFormUrl(applyUrl: string): string | null {
  let u: URL;
  try { u = new URL(applyUrl); } catch { return null; }
  const m = u.hostname.match(HOST);
  if (!m) return null;
  const host = `job-boards${m[1] ?? ''}.greenhouse.io`;
  if (u.pathname.startsWith('/embed/job_app')) {
    const board = u.searchParams.get('for'), token = u.searchParams.get('token');
    return board && token ? `https://${host}/embed/job_app?for=${encodeURIComponent(board)}&token=${encodeURIComponent(token)}` : null;
  }
  const p = u.pathname.match(/^\/([^/]+)\/jobs\/(\d+)/);
  if (!p) return null;
  return `https://${host}/embed/job_app?for=${encodeURIComponent(p[1])}&token=${p[2]}`;
}

export interface FillReport {
  filled: { field: string; value: string }[];
  /** Fields we had a value for but the form would not take (no matching dropdown option…). */
  failed: { field: string; value: string; reason: string }[];
  /** Required fields still empty after filling: the candidate must answer these. */
  needsYou: string[];
  resumeUploaded: boolean;
}

const sel = (id: string) => `[id="${id.replace(/"/g, '\\"')}"]`;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function exists(page: Page, id: string) {
  return !!(await page.$(sel(id)));
}

async function typeInto(page: Page, id: string, value: string): Promise<boolean> {
  const el = await page.$(sel(id));
  if (!el) return false;
  await el.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await el.type(value, { delay: 8 });
  return true;
}

/**
 * Open a react-select combobox, type `query`, and click the best option. `score` ranks the
 * offered option texts (higher wins); the default prefers an exact match, then a prefix.
 */
async function pick(page: Page, id: string, query: string, score?: (opt: string) => number): Promise<string | null> {
  const q = norm(query);
  const rank = score ?? ((o: string) => {
    const n = norm(o);
    return n === q ? 100 : n.startsWith(q) ? 60 - n.length / 100 : n.includes(q) ? 40 - n.length / 100 : q.includes(n) ? 20 : 1;
  });
  return pickBy(page, id, query, (options) => {
    let best = 0;
    options.forEach((o, i) => { if (rank(o) > rank(options[best])) best = i; });
    return rank(options[best]) > 0 ? options[best] : null;
  });
}

/**
 * Open a react-select combobox, type `query` (may be empty: just open the list), and click the
 * option `chooser` returns. A null choice closes the list and leaves the field empty.
 */
async function pickBy(page: Page, id: string, query: string, chooser: (options: string[]) => string | null): Promise<string | null> {
  const el = await page.$(sel(id));
  if (!el) return null;
  await el.click();
  if (query) await el.type(query, { delay: 15 });
  // Async lists (school, location) fetch after typing; give them a few seconds.
  let options: string[] = [];
  for (let t = 0; t < 30; t++) {
    options = await page.evaluate((s) => {
      const input = document.querySelector(s) as HTMLInputElement | null;
      const listId = input?.getAttribute('aria-controls');
      const scope = (listId && document.getElementById(listId)) || document;
      return [...scope.querySelectorAll('[role="option"]')]
        .filter((o) => (o as HTMLElement).offsetParent !== null)
        .map((o) => (o as HTMLElement).innerText.trim());
    }, sel(id));
    const real = options.filter((o) => !/^(no options|loading|searching)/i.test(o));
    if (real.length) { options = real; break; }
    await sleep(200);
  }
  if (!options.length) {
    await page.keyboard.press('Escape');
    await typeClear(page, id);
    return null;
  }
  const chosen = chooser(options);
  if (!chosen) { await page.keyboard.press('Escape'); await typeClear(page, id); return null; }
  await page.evaluate((s, text) => {
    const input = document.querySelector(s) as HTMLInputElement | null;
    const listId = input?.getAttribute('aria-controls');
    const scope = (listId && document.getElementById(listId)) || document;
    const opt = [...scope.querySelectorAll('[role="option"]')]
      .find((o) => (o as HTMLElement).offsetParent !== null && (o as HTMLElement).innerText.trim() === text) as HTMLElement | undefined;
    opt?.click();
  }, sel(id), chosen);
  await sleep(150);
  return chosen;
}

async function typeClear(page: Page, id: string) {
  const el = await page.$(sel(id));
  if (!el) return;
  await el.click({ clickCount: 3 }).catch(() => {});
  await page.keyboard.press('Backspace').catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
}

/** Click the "Add another" button of the section that contains `#firstId`. */
async function addAnother(page: Page, firstId: string, nextId: string): Promise<boolean> {
  const clicked = await page.evaluate((s) => {
    const first = document.querySelector(s);
    if (!first) return false;
    let box: Element | null = first.parentElement;
    while (box) {
      const btn = [...box.querySelectorAll('button')].find((b) => /add another/i.test(b.innerText));
      if (btn) { (btn as HTMLButtonElement).click(); return true; }
      box = box.parentElement;
    }
    return false;
  }, sel(firstId));
  if (!clicked) return false;
  for (let t = 0; t < 15; t++) {
    if (await exists(page, nextId)) return true;
    await sleep(100);
  }
  return false;
}

/** The degree option for a résumé degree level. Greenhouse lists "Master's Degree", "Bachelor's Degree"… */
function degreeScorer(level: string | undefined, written: string | undefined) {
  const want = norm(level ?? written ?? '');
  return (opt: string) => {
    const o = norm(opt);
    if (level === 'MBA') return /business administration|mba/.test(o) ? 100 : /master/.test(o) ? 50 : 0;
    if (level === 'Doctorate') return /ph ?d|philosophy/.test(o) ? 100 : /doctor/.test(o) ? 60 : 0;
    if (level === 'High School') return /high school/.test(o) ? 100 : 0;
    const key = want.split(' ')[0]; // master / bachelor / associate
    if (!key) return 0;
    if (o.startsWith(key) && /degree/.test(o)) return 100;
    return o.startsWith(key) ? 70 : o.includes(key) ? 50 : 0;
  };
}

export async function fillGreenhouse(page: Page, a: Applicant, resumePath: string | undefined, answers: ApplyAnswer[], extra: { linkedin?: string; github?: string; website?: string; phone?: string; city?: string; state?: string; standard?: StandardAnswers }): Promise<FillReport> {
  const report: FillReport = { filled: [], failed: [], needsYou: [], resumeUploaded: false };
  const ok = (field: string, value: string) => report.filled.push({ field, value });
  const bad = (field: string, value: string, reason: string) => report.failed.push({ field, value, reason });

  await page.waitForSelector(sel('first_name'), { timeout: 30_000 });

  // Résumé first: Greenhouse parses an upload and may pre-fill fields, which ours then overwrite.
  if (resumePath) {
    const file = await page.$(sel('resume'));
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

  const text = async (id: string, label: string, v: string | undefined) => {
    if (!v || !(await exists(page, id))) return;
    if (await typeInto(page, id, v)) ok(label, v); else bad(label, v, 'field not found');
  };
  const choose = async (id: string, label: string, v: string | undefined, score?: (o: string) => number) => {
    if (!v || !(await exists(page, id))) return;
    const got = await pick(page, id, v, score);
    if (got) ok(label, got); else bad(label, v, 'no matching option');
  };

  await text('first_name', 'First name', a.firstName);
  await text('last_name', 'Last name', a.lastName);
  await text('email', 'Email', a.email);
  await choose('country', 'Country', 'United States');
  await text('phone', 'Phone', extra.phone ?? a.phone);
  const city = extra.city ?? a.city, state = extra.state ?? a.state;
  if (city) {
    await choose('candidate-location', 'Location (city)', city, (o) => {
      const n = norm(o);
      return !n.startsWith(norm(city)) ? 0 : state && (n.includes(norm(state)) || n.includes(norm(STATE_NAMES[state] ?? '-'))) ? 100 : 50;
    });
  }

  // ---- employment ----
  const month = (ym: YearMonth | undefined) => (ym?.month ? MONTH_NAMES[ym.month - 1] : undefined);
  if (await exists(page, 'company-name-0')) {
    for (let i = 0; i < a.experience.length; i++) {
      if (i > 0 && !(await exists(page, `company-name-${i}`)) && !(await addAnother(page, 'company-name-0', `company-name-${i}`))) break;
      const j = a.experience[i], n = a.experience.length > 1 ? ` #${i + 1}` : '';
      await text(`company-name-${i}`, `Company${n}`, j.company);
      await text(`title-${i}`, `Title${n}`, j.title);
      await choose(`start-date-month-${i}`, `Start month${n}`, month(j.start));
      await text(`start-date-year-${i}`, `Start year${n}`, j.start ? String(j.start.year) : undefined);
      if (j.current) {
        const box = await page.$(`input[name="current-role-${i}"]`);
        if (box && !(await box.evaluate((e) => (e as HTMLInputElement).checked))) { await box.click(); ok(`Current role${n}`, 'Yes'); }
      } else {
        await choose(`end-date-month-${i}`, `End month${n}`, month(j.end));
        await text(`end-date-year-${i}`, `End year${n}`, j.end ? String(j.end.year) : undefined);
      }
    }
  }

  // ---- education ----
  if (await exists(page, 'school--0')) {
    for (let i = 0; i < a.education.length; i++) {
      if (i > 0 && !(await exists(page, `school--${i}`)) && !(await addAnother(page, 'school--0', `school--${i}`))) break;
      const e = a.education[i], n = a.education.length > 1 ? ` #${i + 1}` : '';
      await choose(`school--${i}`, `School${n}`, e.school);
      if (e.degreeLevel || e.degree) await choose(`degree--${i}`, `Degree${n}`, (e.degreeLevel ?? e.degree ?? '').replace(/'s$/, ''), degreeScorer(e.degreeLevel, e.degree));
      await choose(`discipline--${i}`, `Discipline${n}`, e.discipline);
      // Only some boards ask for education dates.
      await choose(`start-month--${i}`, `Education start month${n}`, month(e.start));
      await text(`start-year--${i}`, `Education start year${n}`, e.start ? String(e.start.year) : undefined);
      await choose(`end-month--${i}`, `Education end month${n}`, month(e.end));
      await text(`end-year--${i}`, `Education end year${n}`, e.end ? String(e.end.year) : undefined);
    }
  }

  // ---- the board's own questions, and the EEO / demographic ones ----
  // Every other visible field with a label: custom questions are question_NNN, but the
  // standard EEO fields are gender / hispanic_ethnicity / veteran_status / disability_status
  // and demographic surveys use bare numeric ids, so fields are matched by label, not id.
  const CORE = /^(?:first_name|last_name|preferred_name|email|phone|country|candidate-location|resume|cover_letter|company-name-\d+|title-\d+|(?:start|end)-date-(?:month|year)-\d+|current-role-\d+|school--\d+|degree--\d+|discipline--\d+|(?:start|end)-(?:month|year)--\d+|iti-.*|g-recaptcha.*)$/;
  const collect = async (): Promise<{ id: string; label: string; combo: boolean }[]> => (await page.evaluate(() =>
    [...document.querySelectorAll('input, textarea')].filter((el) => {
      const i = el as HTMLInputElement;
      return i.id && !['hidden', 'file', 'checkbox', 'radio', 'search'].includes(i.type) && i.offsetParent !== null;
    }).map((el) => ({
      id: el.id,
      label: (document.querySelector(`label[for="${el.id}"]`) as HTMLElement | null)?.innerText.replace(/\*\s*$/, '').trim() ?? '',
      combo: el.getAttribute('role') === 'combobox',
    })))).filter((q) => q.label && !CORE.test(q.id));
  const links = { linkedin: extra.linkedin ?? a.linkedin, github: extra.github ?? a.github, website: extra.website ?? a.website };
  const std = extra.standard ?? {};
  const facts = { fullName: a.fullName, city, state, inUS: !!(state && STATE_NAMES[state.toUpperCase()]) };
  // Some questions only appear after an earlier answer (Netlify's work-authorization one shows
  // once Country is set), so collect again after each pass until nothing new turns up.
  const seen = new Set<string>();
  for (let pass = 0; pass < 3; pass++) {
  const questions = (await collect()).filter((q) => !seen.has(q.id));
  if (!questions.length) break;
  questions.forEach((q) => seen.add(q.id));
  for (const q of questions) {
    const l = q.label.toLowerCase();
    // 1. The candidate's own answers for this board's wording win.
    const custom = answers.find((x) => l.includes(x.question.toLowerCase()));
    if (custom?.answer) {
      if (q.combo) await choose(q.id, q.label, custom.answer); else await text(q.id, q.label, custom.answer);
      continue;
    }
    // 2. Profile links in text boxes.
    if (!q.combo) {
      let v: string | undefined;
      if (/linked ?in/.test(l)) v = links.linkedin;
      else if (/github/.test(l)) v = links.github;
      else if (/website|portfolio|personal (site|url)/.test(l)) v = links.website ?? links.github;
      else if (classifyQuestion(q.label) === 'pronouns') v = std.pronouns;
      else v = derivedText(classifyDerived(q.label), facts);
      if (v) await text(q.id, q.label, v);
      continue;
    }
    // 3. Standard questions (authorization, sponsorship, pronouns, EEO) from the one-time setup.
    const key = classifyQuestion(q.label);
    if (key) {
      if (!std[key]) continue;
      const got = await pickBy(page, q.id, '', (opts) => chooseOption(key, std, opts));
      if (got) ok(q.label, got); else bad(q.label, String(std[key]), 'no option clearly matches your saved answer');
      continue;
    }
    // 4. Facts the résumé already gives: located in the US, country of residence.
    const dkey = classifyDerived(q.label);
    if (dkey === 'locatedInUS' || dkey === 'residenceCountry') {
      const got = await pickBy(page, q.id, '', (opts) => chooseDerived(dkey, facts, opts));
      if (got) ok(q.label, got);
    }
  }
  }

  const missing: { id: string; label: string }[] = await page.evaluate(() => {
    const out: { id: string; label: string }[] = [];
    const groups = new Set<string>();
    for (const el of document.querySelectorAll('input, textarea')) {
      const i = el as HTMLInputElement;
      if (!i.id || i.type === 'hidden' || i.type === 'file' || i.offsetParent === null) continue;
      if (!(i.required || i.getAttribute('aria-required') === 'true')) continue;
      // A "pick all that apply" checkbox group is ONE question: report its legend once, and
      // only when no box in it is ticked (not each option as its own line).
      if (i.type === 'checkbox' && i.name && /\[\]$/.test(i.name)) {
        if (groups.has(i.name)) continue;
        groups.add(i.name);
        const boxes = [...document.querySelectorAll(`input[type="checkbox"][name="${CSS.escape(i.name)}"]`)] as HTMLInputElement[];
        const legend = (i.closest('fieldset')?.querySelector('legend') as HTMLElement | null)?.innerText.replace(/\*\s*$/, '').trim();
        if (!boxes.some((b) => b.checked)) out.push({ id: i.name, label: legend || 'A checkbox question' });
        continue;
      }
      const label = (document.querySelector(`label[for="${i.id}"]`) as HTMLElement | null)?.innerText.replace(/\*\s*$/, '').trim();
      if (!label) continue;
      let empty: boolean;
      if (i.type === 'checkbox') empty = !i.checked;
      else if (i.getAttribute('role') === 'combobox') {
        // react-select keeps the chosen value in a sibling, not in the input.
        const ctl = i.closest('[class*="control"]') as HTMLElement | null;
        empty = !ctl?.querySelector('[class*="single-value"], [class*="multi-value"]');
      } else empty = !i.value.trim();
      if (empty) out.push({ id: i.id, label });
    }
    return out;
  });
  // "End date month" alone does not say which job; name the entry. (Greenhouse keeps a current
  // role's end date visible and required even with "Current role" ticked; it is left blank
  // rather than invented.)
  report.needsYou = [...new Set(missing.map(({ id, label }) => {
    const job = id.match(/^(?:company-name|title|(?:start|end)-date-(?:month|year))-(\d+)$/);
    if (job) {
      const j = a.experience[+job[1]];
      return `${label} (${j ? `${j.company}${j.current ? ', current role' : ''}` : `job #${+job[1] + 1}`})`;
    }
    const edu = id.match(/^[a-z-]+--(\d+)$/);
    if (edu) return `${label} (${a.education[+edu[1]]?.school ?? `education #${+edu[1] + 1}`})`;
    return label;
  }))];
  return report;
}

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};
