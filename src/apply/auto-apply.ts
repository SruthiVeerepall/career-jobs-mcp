import { resolve } from 'node:path';
import { extractResumeText } from '../resume/extract-text.js';
import { buildApplicant, type Applicant } from '../resume/applicant.js';
import { getVisibleBrowser } from '../utils/browser.js';
import { loadApplyProfile } from './apply-profile.js';
import { fillGreenhouse, greenhouseFormUrl, type FillReport } from './greenhouse.js';
import { setupHint } from './standard-answers.js';

export interface AutoApplyOptions {
  applyUrl: string;
  resumePath: string;
}

export interface AutoApplyResult extends FillReport {
  platform: 'greenhouse';
  formUrl: string;
  applicant: Applicant;
  submitted: false;
  /** Set when unanswered questions could be answered once with `node auto-apply.mjs --setup`. */
  setupHint?: string;
}

/**
 * Open the job's application in a visible Chrome and fill it from the résumé. Returns once
 * the form is filled, leaving the tab open; the candidate reviews it and presses Submit.
 */
export async function autoApply({ applyUrl, resumePath }: AutoApplyOptions): Promise<AutoApplyResult> {
  const formUrl = greenhouseFormUrl(applyUrl);
  if (!formUrl) throw new Error(`Auto apply supports Greenhouse jobs only (job-boards.greenhouse.io / boards.greenhouse.io). Not supported: ${applyUrl}`);

  const file = resolve(resumePath);
  const { text } = await extractResumeText({ resumePath: file });
  const applicant = buildApplicant(text);
  const extra = loadApplyProfile();

  const browser = await getVisibleBrowser();
  const page = await browser.newPage();
  await page.goto(formUrl, { waitUntil: 'networkidle2', timeout: 60_000 });
  if (!(await page.$('[id="first_name"]'))) {
    throw new Error('No application form on this page; the job has probably closed.');
  }
  const report = await fillGreenhouse(page, applicant, file, extra.answers ?? [], extra);
  await page.bringToFront();
  // Leave the reviewer at the top of the form.
  await page.evaluate(() => window.scrollTo(0, 0));
  const hint = setupHint(report.needsYou, extra.standard, !!(extra.linkedin ?? applicant.linkedin));
  return { platform: 'greenhouse', formUrl, applicant, submitted: false, ...report, ...(hint ? { setupHint: hint } : {}) };
}
