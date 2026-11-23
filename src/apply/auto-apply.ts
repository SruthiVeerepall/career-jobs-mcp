import { resolve } from 'node:path';
import { extractResumeText } from '../resume/extract-text.js';
import { buildApplicant, type Applicant } from '../resume/applicant.js';
import { getVisibleBrowser } from '../utils/browser.js';
import { loadApplyProfile } from './apply-profile.js';
import { fillAshby } from './ashby.js';
import type { FillReport } from './common.js';
import { fillGreenhouse } from './greenhouse.js';
import { fillLever } from './lever.js';
import { fillWorkable, openWorkableForm } from './workable.js';
import { fillWorkdayStep, followWorkday, openWorkdayForm, saveWorkdayReport, saveWorkdaySnapshot, workdayState, type WorkdayStepReport } from './workday.js';
import { logger } from '../utils/logger.js';
import type { Page } from 'puppeteer';
import { applyFormFor, SUPPORTED_PLATFORMS, type ApplyPlatform } from './platforms.js';
import { setupHint } from './standard-answers.js';
import { BOARD_NAMES, boardJobFor, boardMessage, followBoardApply, followsWithoutAccount, type BoardOutcome, type JobBoard } from './board-link.js';
import { employerUrlFor } from './employer-match.js';
import { EIGHTFOLD_READY, eightfoldWantsSignIn, fillEightfold, waitForEightfoldForm } from './eightfold.js';

export interface AutoApplyOptions {
  applyUrl: string;
  resumePath: string;
  /** Workday only: called for every later wizard step the filler fills (default: logged). */
  onStep?: (report: WorkdayStepReport) => void;
  /** Workday only: called when following the wizard ends (Review reached, tab closed, timeout). */
  onStepsDone?: (why: 'review' | 'closed' | 'timeout') => void;
}

export interface AutoApplyResult extends FillReport {
  /** null when a board job led to a page auto apply doesn't fill (see `notFilled`). */
  platform: ApplyPlatform | null;
  formUrl: string;
  /** Board jobs: the board, and what its Apply button led to. */
  via?: { board: JobBoard; outcome: BoardOutcome | 'matched' | 'no-match'; employerUrl: string };
  /** Board jobs that were not filled: why, for the candidate. The page is left open in Chrome. */
  notFilled?: string;
  applicant: Applicant;
  submitted: false;
  /** Set when unanswered questions could be answered once with `node auto-apply.mjs --setup`. */
  setupHint?: string;
  /** Workday: the application is a wizard; later steps are filled as they appear. */
  followsSteps?: boolean;
  /** Workday: the tenant asked the candidate to sign in or create an account first. */
  waitingForSignIn?: boolean;
  /** Workday: the step that was filled now ("My Information"), if any. */
  step?: string;
}

/** The element that proves the application form loaded (a closed job shows none). */
const FORM_READY: Record<ApplyPlatform, string> = {
  greenhouse: '[id="first_name"]',
  ashby: '#_systemfield_name',
  lever: 'input[name="email"]',
  workable: 'form input[name="email"]',
  workday: '[data-automation-id="applyFlowPage"]',
  eightfold: EIGHTFOLD_READY,
};

/** Steps some platforms need before the form shows (Workable: cookie banner, "Apply now"). */
const OPEN_FORM: Partial<Record<ApplyPlatform, (page: Page) => Promise<void>>> = {
  workable: openWorkableForm,
  workday: openWorkdayForm,
};

/**
 * Open the job's application in a visible Chrome and fill it from the résumé. Returns once
 * the form is filled, leaving the tab open; the candidate reviews it and presses Submit.
 * Workday returns after the first step (or at once, if the candidate must sign in first) and
 * keeps filling later steps in the background (`followsSteps`).
 */
export async function autoApply({ applyUrl, resumePath, onStep, onStepsDone }: AutoApplyOptions): Promise<AutoApplyResult> {
  let target = applyFormFor(applyUrl);
  const board = target ? null : boardJobFor(applyUrl);
  if (!target && !board) throw new Error(`Auto apply supports ${SUPPORTED_PLATFORMS} jobs, and ${BOARD_NAMES} jobs that lead to one. Not supported: ${applyUrl}`);

  const file = resolve(resumePath);
  const { text } = await extractResumeText({ resumePath: file });
  const applicant = buildApplicant(text);
  const extra = loadApplyProfile();

  let via: AutoApplyResult['via'];
  if (board) {
    // A board job: its posting on the employer's own site, found without opening the board.
    const employer = await employerUrlFor(applyUrl);
    const form = employer ? applyFormFor(employer) : null;
    if (form) {
      via = { board: board.board, outcome: 'matched', employerUrl: employer! };
      target = form;
    } else if (!followsWithoutAccount(board.board)) {
      // The board shows the employer's link only after sign-in: nothing is opened.
      const notFilled = `Couldn't find this job on the employer's own job site, and ${board.board} shows the employer's application link only to signed-in members, so auto apply can't fill it. Use Apply ↗ to apply on ${board.board}.`;
      return { platform: null, formUrl: applyUrl, applicant, submitted: false, filled: [], failed: [], needsYou: [], resumeUploaded: false,
        via: { board: board.board, outcome: 'no-match', employerUrl: '' }, notFilled };
    }
  }

  const browser = await getVisibleBrowser();
  let page = await browser.newPage();
  if (board && !target) {
    // Remotive / We Work Remotely: follow the board's Apply button to the employer's form.
    const f = await followBoardApply(page, board.url);
    via = { board: f.board, outcome: f.outcome, employerUrl: f.url };
    if (f.page !== page) { await page.close().catch(() => {}); page = f.page; }
    if (!f.formUrl || !f.platform) {
      await page.bringToFront();
      return { platform: null, formUrl: f.url, applicant, submitted: false, filled: [], failed: [], needsYou: [], resumeUploaded: false, via, notFilled: boardMessage(f) };
    }
    target = { platform: f.platform, formUrl: f.formUrl };
  }
  const { platform, formUrl } = target!;
  await page.goto(formUrl, { waitUntil: 'networkidle2', timeout: 60_000 });
  await OPEN_FORM[platform]?.(page);
  // Ashby renders the form client-side after the page settles.
  const ready = await page.waitForSelector(FORM_READY[platform], { timeout: 15_000 }).catch(() => null);
  if (!ready && platform === 'eightfold' && await eightfoldWantsSignIn(page, formUrl)) {
    // Microsoft / Qualcomm: the form shows after the candidate signs in to the company's own
    // site. Wait for that in the background and fill the form when it appears.
    void (async () => {
      const shown = await waitForEightfoldForm(page);
      if (!shown) { onStepsDone?.(page.isClosed() ? 'closed' : 'timeout'); return; }
      const report = await fillEightfold(page, applicant, file, extra.answers ?? [], extra);
      await page.bringToFront().catch(() => {});
      (onStep ?? ((r: WorkdayStepReport) => logger.info(`Eightfold application: filled ${r.filled.length}, ${r.needsYou.length} left for you`)))({ step: 'Application', ...report });
      onStepsDone?.('review');
    })().catch((err) => logger.warn('Eightfold sign-in wait stopped', err));
    await page.bringToFront();
    return { platform, formUrl, applicant, submitted: false, ...(via ? { via } : {}), filled: [], failed: [], needsYou: [], resumeUploaded: false, followsSteps: true, waitingForSignIn: true };
  }
  if (!ready) throw new Error('No application form on this page; the job has probably closed.');

  if (platform === 'workday') {
    return { platform, formUrl, applicant, submitted: false, ...(via ? { via } : {}), ...(await startWorkday(page, applicant, file, extra, onStep, onStepsDone)) };
  }

  const fill = { greenhouse: fillGreenhouse, ashby: fillAshby, lever: fillLever, workable: fillWorkable, eightfold: fillEightfold }[platform];
  const report = await fill(page, applicant, file, extra.answers ?? [], extra);
  await page.bringToFront();
  // Leave the reviewer at the top of the form.
  await page.evaluate(() => window.scrollTo(0, 0));
  const hint = setupHint(report.needsYou, extra.standard, !!(extra.linkedin ?? applicant.linkedin));
  return { platform, formUrl, applicant, submitted: false, ...(via ? { via } : {}), ...report,...(hint ? { setupHint: hint } : {}) };
}

/**
 * Workday: fill the step on screen now (if the tenant session is already signed in), then keep
 * following the wizard in the background, filling each new step as the candidate moves on.
 * Signing in / creating the tenant account is left to the candidate.
 */
async function startWorkday(
  page: Page, applicant: Applicant, file: string, extra: ReturnType<typeof loadApplyProfile>,
  onStep: AutoApplyOptions['onStep'], onStepsDone: AutoApplyOptions['onStepsDone'],
): Promise<FillReport & Pick<AutoApplyResult, 'followsSteps' | 'waitingForSignIn' | 'step' | 'setupHint'>> {
  // The step's markup, for fixing a field this tenant lays out differently (data/workday-debug/):
  // saved before filling, so a step that fails still leaves its layout, and again after.
  const snapshot = async (suffix: string) => {
    const { step } = await workdayState(page).catch(() => ({ step: '' }));
    await saveWorkdaySnapshot(page, `${step}${suffix}`).catch((err) => logger.warn('Could not save the Workday step snapshot', err));
  };
  const fillStep = async () => {
    await snapshot(' before');
    try {
      const report = await fillWorkdayStep(page, applicant, file, extra.answers ?? [], extra);
      const { step } = await workdayState(page).catch(() => ({ step: '' }));
      saveWorkdayReport(step, report);
      return report;
    } finally {
      await snapshot('');
    }
  };
  // A signed-in session goes from the flow page to step 1 on its own; give it a moment.
  let s = await workdayState(page);
  for (let t = 0; s.state === 'other' && t < 8; t++) { await new Promise((r) => setTimeout(r, 1000)); s = await workdayState(page); }
  let report: FillReport = { filled: [], failed: [], needsYou: [], resumeUploaded: false };
  const done: string[] = [];
  if (s.state === 'step') { report = await fillStep(); done.push(s.step); }
  await page.bringToFront();
  const log = onStep ?? ((r: WorkdayStepReport) => logger.info(`Workday step "${r.step}": filled ${r.filled.length}, ${r.needsYou.length} left for you`));
  void followWorkday(page, fillStep, log, { alreadyFilled: done, onDone: onStepsDone }).catch((err) => logger.warn('Workday step follower stopped', err));
  const hint = setupHint(report.needsYou, extra.standard, !!(extra.linkedin ?? applicant.linkedin));
  return { ...report, followsSteps: true, waitingForSignIn: s.state === 'sign-in', ...(s.state === 'step' ? { step: s.step } : {}), ...(hint ? { setupHint: hint } : {}) };
}
