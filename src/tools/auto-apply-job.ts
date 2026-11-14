import { z } from 'zod';
import { autoApply } from '../apply/auto-apply.js';

export const autoApplyJobSchema = {
  applyUrl: z.string().describe('The job\'s apply URL. Greenhouse only: job-boards.greenhouse.io/<board>/jobs/<id> or boards.greenhouse.io/…'),
  resumePath: z.string().describe('Absolute path to the résumé (.pdf/.docx). Its data fills the form and the file itself is uploaded.'),
};

export type AutoApplyJobArgs = { applyUrl: string; resumePath: string };

/** Fill the application in a visible Chrome window. Never submits. */
export async function autoApplyJob(args: AutoApplyJobArgs) {
  const r = await autoApply(args);
  return {
    submitted: r.submitted,
    formUrl: r.formUrl,
    resumeUploaded: r.resumeUploaded,
    filledCount: r.filled.length,
    filled: r.filled,
    failed: r.failed,
    needsYou: r.needsYou,
    setupHint: r.setupHint ?? null,
    message: `Filled ${r.filled.length} fields in Chrome${r.resumeUploaded ? ' and attached your résumé' : ''}. `
      + (r.needsYou.length ? `${r.needsYou.length} required question(s) still need you. ` : '')
      + (r.setupHint ? `${r.setupHint}. ` : '')
      + 'Review the form and press Submit yourself. Nothing was submitted.',
  };
}
