import type { Page } from 'puppeteer';
import { sleep } from './common.js';
import { applyFormFor, type ApplyPlatform } from './platforms.js';

// Auto apply from a job board. A board (LinkedIn, BuiltIn, SimplyHired…) lists the job, but
// its Apply button sends the candidate to the employer's own application (Greenhouse, Lever,
// Workday…). followBoardApply() opens the board's job page in the visible Chrome, follows that
// button to the employer, and hands back the employer's form, so the usual filler runs on it.
//
// The board's own apply flow is never automated: LinkedIn Easy Apply needs the candidate signed
// in and LinkedIn's terms forbid automating it; Indeed-hosted apply sits behind a bot wall. Those
// pages are left open for the candidate.

export type JobBoard = 'LinkedIn' | 'BuiltIn' | 'SimplyHired' | 'Himalayas' | 'We Work Remotely' | 'Jobicy' | 'RemoteOK' | 'Remotive';

/** Job pages auto apply may open on each board. Exact https hosts: a jobquest:// link can carry one. */
const BOARD_JOB: [JobBoard, RegExp][] = [
  ['LinkedIn', /^https:\/\/(?:www\.|[a-z]{2}\.)?linkedin\.com\/jobs\/view\/(?:[^\/?#]*-)?(\d{6,})(?:[\/?#]|$)/i],
  ['BuiltIn', /^https:\/\/(?:www\.)?builtin\.com\/job\/[^\/?#]+\/\d+(?:[\/?#]|$)/i],
  ['SimplyHired', /^https:\/\/www\.simplyhired\.com\/job\/[A-Za-z0-9_-]{10,}(?:[\/?#]|$)/i],
  ['Himalayas', /^https:\/\/himalayas\.app\/companies\/[^\/?#]+\/jobs\/[^\/?#]+(?:[\/?#]|$)/i],
  ['We Work Remotely', /^https:\/\/weworkremotely\.com\/remote-jobs\/[^\/?#]+(?:[\/?#]|$)/i],
  ['Jobicy', /^https:\/\/jobicy\.com\/jobs\/\d+[^\/?#]*(?:[\/?#]|$)/i],
  ['RemoteOK', /^https:\/\/remoteok\.com\/remote-jobs\/[^\/?#]+(?:[\/?#]|$)/i],
  ['Remotive', /^https:\/\/remotive\.com\/remote-jobs\/[^\/?#]+\/[^\/?#]+(?:[\/?#]|$)/i],
];

/**
 * Boards whose Apply button reaches the employer without an account. Seen live 2026-11-22,
 * signed out: LinkedIn (authwall / sign-in dialog), BuiltIn (?applyRequired=true), Jobicy
 * (registration gate) and Himalayas (sign-up page) all need one; SimplyHired is behind
 * Cloudflare and hands over to Indeed; RemoteOK's /l/<id> bounced back. Remotive reached
 * employer sites. Jobs from the other boards are matched to the employer's own posting
 * instead (employer-match.ts) and their board is never opened.
 */
const FOLLOW_WITHOUT_ACCOUNT: JobBoard[] = ['Remotive', 'We Work Remotely'];
export const followsWithoutAccount = (board: JobBoard) => FOLLOW_WITHOUT_ACCOUNT.includes(board);

export const BOARD_NAMES ='LinkedIn, BuiltIn, SimplyHired, Himalayas, We Work Remotely, Jobicy, RemoteOK and Remotive';

/** Hosts that are still "the board" (or a board-hosted apply) while following the Apply button. */
const BOARD_HOST = /(?:^|\.)(?:linkedin\.com|builtin\.com|simplyhired\.com|himalayas\.app|weworkremotely\.com|jobicy\.com|remoteok\.com|remotive\.com|lnkd\.in)$/i;
/** Apply flows hosted by a board we don't automate (Indeed's apply behind SimplyHired). */
const BOARD_HOSTED_APPLY = /(?:^|\.)(?:indeed\.com|ziprecruiter\.com|glassdoor\.com|dice\.com)$/i;

/** A board job URL -> its board, or null. LinkedIn URLs are reduced to the bare job page. */
export function boardJobFor(url: string): { board: JobBoard; url: string } | null {
  for (const [board, re] of BOARD_JOB) {
    const m = url.match(re);
    if (!m) continue;
    return { board, url: board === 'LinkedIn' ? `https://www.linkedin.com/jobs/view/${m[1]}/` : url };
  }
  return null;
}

export type BoardOutcome =
  /** The employer's form is one auto apply fills (`platform`, `formUrl`). */
  | 'form'
  /** Reached the employer's site, but its form isn't one auto apply fills. */
  | 'employer'
  /** The board's own apply (LinkedIn Easy Apply, Indeed apply): left for the candidate. */
  | 'board-apply'
  /** The board asked the candidate to sign in before showing the employer link. */
  | 'sign-in'
  /** The board answered with a bot check (Cloudflare "Just a moment…") that was not passed. */
  | 'blocked'
  /** Could not get from the board to the employer (no Apply button, the job closed, a dialog). */
  | 'stuck';

export interface BoardFollow {
  board: JobBoard;
  outcome: BoardOutcome;
  /** The tab now showing the result (the employer may open in a new tab). */
  page: Page;
  /** Where the Apply button led (the board page itself for board-apply / sign-in / blocked / stuck). */
  url: string;
  platform?: ApplyPlatform;
  formUrl?: string;
}

/** Host of a URL, or '' if it isn't one. */
const hostOf = (u: string) => { try { return new URL(u).hostname; } catch { return ''; } };
const offBoard = (u: string) => /^https?:/i.test(u) && !!hostOf(u) && !BOARD_HOST.test(hostOf(u));

/**
 * A redirect link that names its destination (LinkedIn's externalApply?url=…, a board's
 * /redirect?url=…): the destination. Anything else unchanged.
 */
export function unwrapRedirect(href: string): string {
  try {
    const u = new URL(href);
    if (!BOARD_HOST.test(u.hostname)) return href;
    for (const key of ['url', 'u', 'dest', 'destination', 'target', 'redirect']) {
      const v = u.searchParams.get(key);
      if (v && /^https?:\/\//i.test(v)) return v;
    }
  } catch { /* not a URL */ }
  return href;
}

/** What the board page offers: a link to follow, a button to click, or the board's own apply. */
type ApplyControl = { kind: 'href'; href: string } | { kind: 'click' } | { kind: 'board-apply'; text: string } | { kind: 'sign-in' } | { kind: 'none' };

async function findApplyControl(page: Page): Promise<ApplyControl> {
  return page.evaluate(() => {
    // LinkedIn's public (signed-out) job page shows the employer link to nobody: its Apply opens
    // a sign-in dialog. The tracking names tell Easy Apply ("onsite") from a company-site job
    // ("offsite", which needs the candidate signed in). Seen live on 2026-11-22.
    if (/(?:^|\.)linkedin\.com$/i.test(location.hostname)) {
      const tracks = [...document.querySelectorAll('[data-tracking-control-name]')].map((e) => e.getAttribute('data-tracking-control-name') ?? '');
      if (tracks.some((t) => /^public_jobs_apply-link-onsite/.test(t))) return { kind: 'board-apply' as const, text: 'Easy Apply' };
      if (tracks.some((t) => /^public_jobs_apply-link-offsite/.test(t))) return { kind: 'sign-in' as const };
    }

    const vis = (el: Element) => (el as HTMLElement).offsetParent !== null || el.getClientRects().length > 0;
    const text = (el: Element) => ((el as HTMLElement).innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
    const all = [...document.querySelectorAll('a, button, [role=button], input[type=submit], input[type=button]')].filter(vis);
    const named = all.map((el) => ({ el, t: text(el) || (el as HTMLInputElement).value || '' }));
    // The board's own apply: never automated (LinkedIn "Easy Apply", BuiltIn "Log in to Easy Apply").
    const own = named.find(({ t }) => t.length <= 60 && /easy apply|quick apply|apply with indeed|apply now on indeed/i.test(t));
    const apply = named.filter(({ t }) => t.length <= 60 && /\bapply\b/i.test(t)
      && !/easy apply|quick apply|with indeed|save|alert|similar|sign ?in|log ?in|join|share|referr|how to apply/i.test(t));
    if (!apply.length) {
      if (own) return { kind: 'board-apply' as const, text: own.t };
      if (document.querySelector('form[action*="login"], form[action*="signin"], .authwall, [data-test-id="authwall"]')) return { kind: 'sign-in' as const };
      return { kind: 'none' as const };
    }
    if (own && !apply.some(({ t }) => /company|employer|external/i.test(t))) return { kind: 'board-apply' as const, text: own.t };
    // Prefer the button with the strongest wording, then one that is a real link.
    const rank = (t: string) => (/company|employer|external|website|site/i.test(t) ? 0 : /^apply(?: now)?$/i.test(t) ? 1 : 2);
    apply.sort((a, b) => rank(a.t) - rank(b.t));
    const best = apply[0].el;
    const href = best.closest('a')?.getAttribute('href') ?? '';
    if (/^https?:/i.test(href) || href.startsWith('/')) return { kind: 'href' as const, href: new URL(href, location.href).href };
    best.setAttribute('data-jq-apply', '1');
    return { kind: 'click' as const };
  });
}

/**
 * Wait until a tab shows a page off the board (the Apply button may open a new tab or go
 * through redirects), then until its address stops changing. null if nothing left the board.
 */
async function waitForEmployer(page: Page, popups: Page[], timeoutMs: number): Promise<{ page: Page; url: string } | null> {
  const deadline = Date.now() + timeoutMs;
  let last = '', since = 0, where: Page | null = null;
  while (Date.now() < deadline) {
    const tab = [...popups].reverse().find((p) => !p.isClosed() && offBoard(p.url())) ?? (offBoard(page.url()) ? page : null);
    if (tab) {
      const u = tab.url();
      if (u !== last || tab !== where) { last = u; where = tab; since = Date.now(); }
      else if (Date.now() - since >= 1500) return { page: tab, url: u };
    }
    await sleep(300);
  }
  return where && !where.isClosed() && offBoard(where.url()) ? { page: where, url: where.url() } : null;
}

/**
 * The employer's site may be a careers page that embeds the real form (a Greenhouse iframe, a
 * link to jobs.lever.co…): the first embedded or linked form auto apply fills.
 */
async function embeddedForm(page: Page): Promise<string | null> {
  const urls = await page.evaluate(() => [
    ...[...document.querySelectorAll('iframe[src]')].map((f) => (f as HTMLIFrameElement).src),
    ...[...document.querySelectorAll('a[href]')].map((a) => (a as HTMLAnchorElement).href),
  ]).catch(() => [] as string[]);
  return urls.find((u) => applyFormFor(u)) ?? null;
}

/**
 * Open the board's job page in `page`, follow its Apply button to the employer, and report
 * where it led. Never presses the board's own apply (Easy Apply) and never signs in.
 */
export async function followBoardApply(page: Page, jobUrl: string, opts: { timeoutMs?: number; botCheckMs?: number } = {}): Promise<BoardFollow> {
  const job = boardJobFor(jobUrl);
  if (!job) throw new Error(`Not a job board page auto apply knows: ${jobUrl}`);
  const { board } = job;
  const timeoutMs = opts.timeoutMs ?? 25_000;
  const result = (outcome: BoardOutcome, tab: Page, url: string): BoardFollow => {
    const form = outcome === 'employer' || outcome === 'form' ? applyFormFor(url) : null;
    return form ? { board, outcome: 'form', page: tab, url, platform: form.platform, formUrl: form.formUrl } : { board, outcome, page: tab, url };
  };

  await page.goto(job.url, { waitUntil: 'networkidle2', timeout: 60_000 });
  // SimplyHired, Himalayas and We Work Remotely answer automated Chrome with Cloudflare's check.
  // In the visible window the candidate can pass it; give them the time to.
  if (!(await passedBotCheck(page, opts.botCheckMs ?? 45_000))) return result('blocked', page, page.url());
  // A board may send the job straight on to the employer.
  if (offBoard(page.url())) return result('employer', page, page.url());
  await sleep(800);

  const control = await findApplyControl(page);
  if (control.kind === 'board-apply') return result('board-apply', page, page.url());
  if (control.kind === 'sign-in') return result('sign-in', page, page.url());
  if (control.kind === 'none') return result('stuck', page, page.url());

  const popups: Page[] = [];
  const onPopup = (p: Page | null) => { if (p) popups.push(p); };
  page.on('popup', onPopup);
  try {
    if (control.kind === 'href') {
      const dest = unwrapRedirect(control.href);
      // A link straight to a form we fill: no need to load it twice.
      if (applyFormFor(dest)) return result('form', page, dest);
      await page.goto(dest, { waitUntil: 'networkidle2', timeout: 60_000 }).catch(() => null);
    } else {
      await page.click('[data-jq-apply]').catch(() => page.$eval('[data-jq-apply]', (b) => (b as HTMLElement).click()));
    }
    const landed = await waitForEmployer(page, popups, timeoutMs);
    if (!landed) {
      // Still on the board: a sign-in wall (LinkedIn asks guests to join) or a dead button.
      const signIn = await page.evaluate(() => /sign in|join now|log in|create (?:an )?account/i.test(document.body?.innerText.slice(0, 4000) ?? '')
        && !!document.querySelector('input[type=password], input[name*="session_key"], [data-tracking-control-name*="sign-in"], .modal, [role=dialog]')).catch(() => false);
      return result(signIn ? 'sign-in' : 'stuck', page, page.url());
    }
    if (BOARD_HOSTED_APPLY.test(hostOf(landed.url))) return result('board-apply', landed.page, landed.url);
    if (applyFormFor(landed.url)) return result('form', landed.page, landed.url);
    const embedded = await embeddedForm(landed.page);
    if (embedded) return result('form', landed.page, embedded);
    return result('employer', landed.page, landed.url);
  } finally {
    page.off('popup', onPopup);
  }
}

/** A Cloudflare-style bot check on the page. */
const BOT_CHECK = () => /^(?:just a moment|attention required|verify you are human|checking your browser)/i.test(document.title.trim())
  || !!document.querySelector('#challenge-form, #cf-challenge-running, iframe[src*="challenges.cloudflare.com"]');

/** true once the page shows no bot check (at once, if it never had one); false if it stayed. */
async function passedBotCheck(page: Page, waitMs: number): Promise<boolean> {
  const deadline = Date.now() + waitMs;
  while (await page.evaluate(BOT_CHECK).catch(() => false)) {
    if (Date.now() > deadline) return false;
    await sleep(1000);
  }
  await page.waitForNetworkIdle({ idleTime: 500, timeout: 10_000 }).catch(() => null);
  return true;
}

/** One line for the candidate about a board job that was not filled. */
export function boardMessage(f: Pick<BoardFollow, 'board' | 'outcome' | 'url'>): string {
  switch (f.outcome) {
    case 'board-apply': return `${f.board} takes this application itself (${/indeed/i.test(f.url) ? 'Indeed apply' : 'Easy Apply'}), which auto apply never automates. It is open in Chrome for you to apply there.`;
    case 'sign-in': return f.board === 'LinkedIn'
      ? "LinkedIn shows the employer's application link only to signed-in members. Sign in to LinkedIn once in the auto apply Chrome window (it stays signed in), then click Auto apply again."
      : `${f.board} asks you to sign in or sign up before it shows the employer's link. It is open in Chrome: sign in there once, then click Auto apply again.`;
    case 'blocked': return `${f.board} showed a bot check that was not passed. Complete it in the Chrome window, then click Auto apply again.`;
    case 'stuck': return `Could not get from the ${f.board} page to the employer's site (the job may have closed). It is open in Chrome.`;
    case 'employer': return `${f.board} sent this job to the employer's site (${hostOf(f.url)}), whose form auto apply doesn't fill yet. It is open in Chrome for you to apply there.`;
    default: return '';
  }
}
