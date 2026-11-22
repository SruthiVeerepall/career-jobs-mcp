import { ashbyFormUrl } from './ashby.js';
import { greenhouseFormUrl } from './greenhouse.js';
import { leverFormUrl } from './lever.js';
import { workableFormUrl } from './workable.js';
import { workdayFormUrl } from './workday.js';

// Which application forms auto apply can fill. Every entry point (CLI, MCP tool, jobquest://
// links, the Excel "Auto Apply" column, the Job Quest Board) asks here, so adding a platform
// means adding it once.

export type ApplyPlatform = 'greenhouse' | 'ashby' | 'lever' | 'workable' | 'workday';
export const SUPPORTED_PLATFORMS = 'Greenhouse, Ashby, Lever, Workable and Workday';

/** Job URL -> its platform and the bare application form to open, or null if unsupported. */
export function applyFormFor(applyUrl: string): { platform: ApplyPlatform; formUrl: string } | null {
  const gh = greenhouseFormUrl(applyUrl);
  if (gh) return { platform: 'greenhouse', formUrl: gh };
  const ashby = ashbyFormUrl(applyUrl);
  if (ashby) return { platform: 'ashby', formUrl: ashby };
  const lever = leverFormUrl(applyUrl);
  if (lever) return { platform: 'lever', formUrl: lever };
  const workable = workableFormUrl(applyUrl);
  if (workable) return { platform: 'workable', formUrl: workable };
  const workday = workdayFormUrl(applyUrl);
  if (workday) return { platform: 'workday', formUrl: workday };
  return null;
}

export function canAutoApply(applyUrl: string): boolean {
  return applyFormFor(applyUrl) !== null;
}
