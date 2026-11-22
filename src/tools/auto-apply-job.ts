import { z } from 'zod';
import { autoApply } from '../apply/auto-apply.js';

export const autoApplyJobSchema = {
  applyUrl: z.string().describe('The job\'s apply URL. Greenhouse (job-boards.greenhouse.io/<board>/jobs/<id>), Ashby (jobs.ashbyhq.com/<org>/<job id>), Lever (jobs.lever.co/<company>/<posting id>), Workable (jobs.workable.com/view/<id> or apply.workable.com/<company>/j/<code>) or Workday (<company>.wd<N>.myworkdayjobs.com/…/job/…_<req id>). Also a job board page (linkedin.com/jobs/view/<id>, builtin.com/job/…, simplyhired.com/job/…, himalayas.app, weworkremotely.com, jobicy.com, remoteok.com, remotive.com): it is looked up on the employer\'s own job site'),
  resumePath: z.string().describe('Absolute path to the résumé (.pdf/.docx). Its data fills the form and the file itself is uploaded.'),
};

export type AutoApplyJobArgs = { applyUrl: string; resumePath: string };

/** Fill the application in a visible Chrome window. Never submits. */
export async function autoApplyJob(args: AutoApplyJobArgs) {
  const r = await autoApply(args);
  const via = r.via?.outcome === 'matched' ? `Found this ${r.via.board} job on the employer's own site (${r.via.employerUrl}). `
    : r.via?.employerUrl ? `Followed ${r.via.board}'s Apply button to ${r.via.employerUrl}. ` : '';
  return {
    submitted: r.submitted,
    formUrl: r.formUrl,
    via: r.via ?? null,
    notFilled: r.notFilled ?? null,
    resumeUploaded: r.resumeUploaded,
    filledCount: r.filled.length,
    filled: r.filled,
    failed: r.failed,
    needsYou: r.needsYou,
    setupHint: r.setupHint ?? null,
    followsSteps: !!r.followsSteps,
    waitingForSignIn: !!r.waitingForSignIn,
    message: via + (r.notFilled ? r.notFilled : r.followsSteps ? workdayMessage(r) : `Filled ${r.filled.length} fields in Chrome${r.resumeUploaded ? ' and attached your résumé' : ''}. `
      + (r.needsYou.length ? `${r.needsYou.length} required question(s) still need you. ` : '')
      + (r.setupHint ? `${r.setupHint}. ` : '')
      + 'Review the form and press Submit yourself. Nothing was submitted.'),
  };
}

function workdayMessage(r: Awaited<ReturnType<typeof autoApply>>): string {
  const now = r.waitingForSignIn
    ? 'Opened the Workday application in Chrome. Sign in or create your account for this company there; each step then fills as it opens. '
    : `Filled ${r.filled.length} fields on the Workday step "${r.step ?? ''}"${r.resumeUploaded ? ' and attached your résumé' : ''}. `
      + (r.needsYou.length ? `${r.needsYou.length} required question(s) still need you. ` : '');
  return now + 'Check each step and press Save and Continue yourself; the next one fills itself. Nothing is submitted: Submit on the Review step is yours to press.';
}
