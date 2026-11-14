import { ashbyFormUrl } from './ashby.js';
import { greenhouseFormUrl } from './greenhouse.js';

// Which application forms auto apply can fill. Every entry point (CLI, MCP tool, jobquest://
// links, the Excel "Auto Apply" column, the Job Quest Board) asks here, so adding a platform
// means adding it once.

export type ApplyPlatform = 'greenhouse' | 'ashby';
export const SUPPORTED_PLATFORMS = 'Greenhouse and Ashby';

/** Job URL -> its platform and the bare application form to open, or null if unsupported. */
export function applyFormFor(applyUrl: string): { platform: ApplyPlatform; formUrl: string } | null {
  const gh = greenhouseFormUrl(applyUrl);
  if (gh) return { platform: 'greenhouse', formUrl: gh };
  const ashby = ashbyFormUrl(applyUrl);
  if (ashby) return { platform: 'ashby', formUrl: ashby };
  return null;
}

export function canAutoApply(applyUrl: string): boolean {
  return applyFormFor(applyUrl) !== null;
}
