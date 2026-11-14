/**
 * job-quest-outputs.mjs: remembers where the daily export writes, so a refresh started from
 * anywhere (a board button, an Excel link, the terminal) updates every one of those places.
 *
 * Every `export-jobs-xlsx.mjs --resume … --page …` run saves its outputs here:
 *   { resumePath, xlsx, page, localPage?, publishUrl?, minJdMatch?, savedAt }
 * in job-quest-outputs.json at the project root (git-ignored). refresh-job-quest.mjs reads it
 * back and reruns that export with only the window changed.
 *
 * Paths resolve from this module, not the cwd: the Claude desktop app starts the MCP server
 * in C:\Windows\System32.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const OUTPUTS_PATH = process.env.JOB_QUEST_OUTPUTS_PATH ?? path.join(ROOT, 'job-quest-outputs.json');

export function loadOutputs(file = OUTPUTS_PATH) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

export function saveOutputs(outputs, file = OUTPUTS_PATH) {
  const abs = (p) => (p ? path.resolve(p) : undefined);
  const data = {
    resumePath: abs(outputs.resumePath),
    xlsx: abs(outputs.xlsx),
    page: abs(outputs.page),
    localPage: abs(outputs.localPage),
    publishUrl: outputs.publishUrl || undefined,
    minJdMatch: outputs.minJdMatch,
    publish: outputs.publish === false ? false : undefined,
    savedAt: new Date().toISOString(),
  };
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  return data;
}

/** The export-jobs-xlsx.mjs arguments that rewrite every saved output for a `days` window. */
export function exportArgs(outputs, days) {
  if (!outputs?.resumePath) throw new Error('No saved outputs yet. Run the daily export once with --resume and --page.');
  const args = ['--resume', outputs.resumePath, '--days', String(days)];
  if (outputs.xlsx) args.push('--out', outputs.xlsx);
  if (outputs.page) args.push('--page', outputs.page);
  if (outputs.localPage) args.push('--local-page', outputs.localPage);
  if (outputs.publishUrl) args.push('--publish-url', outputs.publishUrl);
  if (outputs.minJdMatch !== undefined && outputs.minJdMatch !== null) args.push('--min-jd-match', String(outputs.minJdMatch));
  if (outputs.publish === false) args.push('--no-publish');
  return args;
}
