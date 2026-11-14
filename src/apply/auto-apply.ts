import { resolve } from 'node:path';
import { extractResumeText } from '../resume/extract-text.js';
import { buildApplicant, type Applicant } from '../resume/applicant.js';
import { getVisibleBrowser } from '../utils/browser.js';
import { loadApplyProfile } from './apply-profile.js';
import { fillAshby } from './ashby.js';
import type { FillReport } from './common.js';
import { fillGreenhouse } from './greenhouse.js';
import { fillLever } from './lever.js';
import { applyFormFor, SUPPORTED_PLATFORMS, type ApplyPlatform } from './platforms.js';
import { setupHint } from './standard-answers.js';

export interface AutoApplyOptions {
  applyUrl: string;
  resumePath: string;
}

export interface AutoApplyResult extends FillReport {
  platform: ApplyPlatform;
  formUrl: string;
  applicant: Applicant;
  submitted: false;
  /** Set when unanswered questions could be answered once with `node auto-apply.mjs --setup`. */
  setupHint?: string;
}

/** The element that proves the application form loaded (a closed job shows none). */
const FORM_READY: Record<ApplyPlatform, string> = {
  greenhouse: '[id="first_name"]',
  ashby: '#_systemfield_name',
  lever: 'input[name="email"]',
};

/**
 * Open the job's application in a visible Chrome and fill it from the résumé. Returns once
 * the form is filled, leaving the tab open; the candidate reviews it and presses Submit.
 */
export async function autoApply({ applyUrl, resumePath }: AutoApplyOptions): Promise<AutoApplyResult> {
  const target = applyFormFor(applyUrl);
  if (!target) throw new Error(`Auto apply supports ${SUPPORTED_PLATFORMS} jobs only. Not supported: ${applyUrl}`);
  const { platform, formUrl } = target;

  const file = resolve(resumePath);
  const { text } = await extractResumeText({ resumePath: file });
  const applicant = buildApplicant(text);
  const extra = loadApplyProfile();

  const browser = await getVisibleBrowser();
  const page = await browser.newPage();
  await page.goto(formUrl, { waitUntil: 'networkidle2', timeout: 60_000 });
  // Ashby renders the form client-side after the page settles.
  const ready = await page.waitForSelector(FORM_READY[platform], { timeout: 15_000 }).catch(() => null);
  if (!ready) throw new Error('No application form on this page; the job has probably closed.');

  const fill = { greenhouse: fillGreenhouse, ashby: fillAshby, lever: fillLever }[platform];
  const report = await fill(page, applicant, file, extra.answers ?? [], extra);
  await page.bringToFront();
  // Leave the reviewer at the top of the form.
  await page.evaluate(() => window.scrollTo(0, 0));
  const hint = setupHint(report.needsYou, extra.standard, !!(extra.linkedin ?? applicant.linkedin));
  return { platform, formUrl, applicant, submitted: false, ...report, ...(hint ? { setupHint: hint } : {}) };
}
