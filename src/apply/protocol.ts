import { greenhouseFormUrl } from './greenhouse.js';

// The jobquest:// link type: lets an Excel cell, a local HTML page, or any browser start auto
// apply or a refresh without the Claude desktop app. `node install-auto-apply.mjs` registers
// the scheme for the current Windows user; a click runs `node jobquest-link.mjs "<the link>"`.
//
// Links carry as little as possible, because any website can fire one:
//   jobquest://apply?url=<Greenhouse job>  — the résumé path comes from apply-profile.json on
//     this machine, so a link can never choose which file is uploaded. The filler never submits.
//   jobquest://refresh?days=1|3|7|30       — reruns the last daily export (job-quest-outputs.json)
//     for that window. Only those four values are accepted; outputs are never named by a link.

export const SCHEME = 'jobquest';
export const REFRESH_DAYS = [1, 3, 7, 30] as const;

export type JobQuestLink = { action: 'apply'; url: string } | { action: 'refresh'; days: number };

/** Greenhouse apply URL -> jobquest://apply?url=…, or null for any other site. */
export function autoApplyLink(applyUrl: string): string | null {
  if (!greenhouseFormUrl(applyUrl)) return null;
  return `${SCHEME}://apply?url=${encodeURIComponent(applyUrl)}`;
}

/** Search window in days -> jobquest://refresh?days=N. */
export function refreshLink(days: number): string {
  if (!(REFRESH_DAYS as readonly number[]).includes(days)) throw new Error(`Refresh window must be one of ${REFRESH_DAYS.join(', ')} days`);
  return `${SCHEME}://refresh?days=${days}`;
}

/** Any jobquest:// link -> what it asks for. Throws on anything else. */
export function parseJobQuestLink(link: string): JobQuestLink {
  let u: URL;
  try { u = new URL(link.trim()); } catch { throw new Error(`Not a ${SCHEME}:// link: ${link}`); }
  if (u.protocol !== `${SCHEME}:`) throw new Error(`Not a ${SCHEME}:// link: ${link}`);
  // Browsers may hand the link over as jobquest://apply/?url=… or jobquest:apply?url=….
  const action = (u.hostname || u.pathname).replace(/^\/+|\/+$/g, '');
  if (action === 'apply') {
    const url = u.searchParams.get('url');
    if (!url || !greenhouseFormUrl(url)) throw new Error(`Auto apply supports Greenhouse jobs only. Got: ${url ?? '(no url)'}`);
    return { action, url };
  }
  if (action === 'refresh') {
    const days = Number(u.searchParams.get('days'));
    if (!(REFRESH_DAYS as readonly number[]).includes(days)) throw new Error(`Refresh window must be one of ${REFRESH_DAYS.join(', ')} days`);
    return { action, days };
  }
  throw new Error(`Unknown ${SCHEME}:// action "${action}"`);
}

/** jobquest://apply?url=… -> the Greenhouse apply URL. Throws on anything else. */
export function parseAutoApplyLink(link: string): string {
  const parsed = parseJobQuestLink(link);
  if (parsed.action !== 'apply') throw new Error(`Unknown ${SCHEME}:// action "${parsed.action}"`);
  return parsed.url;
}
