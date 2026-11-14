import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';

// dist/tools/refresh-job-quest.js -> the repo root, where refresh-job-quest.mjs lives. Resolved
// from the module, not the cwd: the Claude desktop app runs this server in C:\Windows\System32.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const refreshJobQuestSchema = {
  postedWithinDays: z.union([z.literal(1), z.literal(3), z.literal(7), z.literal(30)])
    .describe('Search window: 1 (24 hours), 3, 7 or 30 days.'),
};

export type RefreshJobQuestArgs = { postedWithinDays: 1 | 3 | 7 | 30 };

/**
 * Rerun the last daily export for a new window, in the background, updating every output it
 * wrote: the Excel sheet, the Job Quest page(s) and the published board. Returns immediately;
 * the run takes from seconds (warm cache) to a few minutes plus ~30s to publish.
 */
export async function refreshJobQuest(args: RefreshJobQuestArgs) {
  const mod = await import(pathToFileURL(path.join(ROOT, 'refresh-job-quest.mjs')).href);
  const r = mod.startRefreshDetached(args.postedWithinDays);
  const label = args.postedWithinDays === 1 ? '24 hours' : `${args.postedWithinDays} days`;
  return {
    status: r.status as 'started' | 'queued',
    postedWithinDays: args.postedWithinDays,
    excel: r.outputs.xlsx ?? null,
    page: r.outputs.page ?? null,
    localPage: r.outputs.localPage ?? null,
    publishes: r.outputs.publish !== false,
    log: r.log,
    message: r.status === 'queued'
      ? `A refresh (${r.runningDays} days) is running; the ${label} refresh runs right after it.`
      : `Updating the Excel sheet, the page and the board for the last ${label} in the background. Usually 1–3 minutes, then about 30s to publish.`,
  };
}
