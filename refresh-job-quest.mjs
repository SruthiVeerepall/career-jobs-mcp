/**
 * refresh-job-quest.mjs: rerun the last daily export for a new window and update EVERY output
 * it wrote: the Excel sheet, the Job Quest page(s), and the published Job Quest Board.
 *
 *   node refresh-job-quest.mjs --days 7          # 1 | 3 | 7 | 30; progress in this console
 *   node refresh-job-quest.mjs --days 7 --detach # start in the background, log to data/refresh.log
 *   node refresh-job-quest.mjs --status          # show the saved outputs and whether one is running
 *
 * Where the outputs are comes from job-quest-outputs.json, saved by every
 * `export-jobs-xlsx.mjs --resume … --page …` run. The board's search buttons (refreshJobQuest
 * MCP tool in the Claude app, jobquest://refresh links elsewhere) and the sheet's refresh links
 * all end up here.
 *
 * One refresh at a time: a second request while one runs is queued (the latest window wins)
 * and runs straight after, so clicking Today then Week ends with the Week results everywhere.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, OUTPUTS_PATH, exportArgs, loadOutputs } from './job-quest-outputs.mjs';

const DATA = path.join(ROOT, 'data');
const LOCK = path.join(DATA, 'refresh.lock');
const PENDING = path.join(DATA, 'refresh.pending');
export const REFRESH_LOG = path.join(DATA, 'refresh.log');
const ALLOWED = [1, 3, 7, 30];

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
function readLock() {
  try { const l = JSON.parse(fs.readFileSync(LOCK, 'utf8')); return alive(l.pid) ? l : null; } catch { return null; }
}

/** Start a refresh in the background (used by the MCP tool). Returns what was started or queued. */
export function startRefreshDetached(days) {
  if (!ALLOWED.includes(days)) throw new Error(`Window must be one of ${ALLOWED.join(', ')} days`);
  const outputs = loadOutputs();
  exportArgs(outputs, days); // throws a clear message when nothing has been saved yet
  fs.mkdirSync(DATA, { recursive: true });
  const running = readLock();
  if (running) {
    fs.writeFileSync(PENDING, String(days));
    return { status: 'queued', days, runningDays: running.days, outputs, log: REFRESH_LOG };
  }
  const log = fs.openSync(REFRESH_LOG, 'w');
  const child = spawn(process.execPath, [path.join(ROOT, 'refresh-job-quest.mjs'), '--days', String(days)],
    { cwd: ROOT, detached: true, stdio: ['ignore', log, log], windowsHide: true, env: process.env });
  child.unref();
  fs.closeSync(log);
  // Take the lock for the child now, so a second click a moment later queues instead of racing.
  if (child.pid) fs.writeFileSync(LOCK, JSON.stringify({ pid: child.pid, days, startedAt: new Date().toISOString() }));
  return { status: 'started', days, outputs, log: REFRESH_LOG };
}

function runExport(outputs, days) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'export-jobs-xlsx.mjs'), ...exportArgs(outputs, days)],
      { cwd: ROOT, stdio: 'inherit', env: process.env });
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

/** Run a refresh in this process, then any window queued meanwhile. Returns the exit code. */
export async function runRefresh(days) {
  const outputs = loadOutputs();
  exportArgs(outputs, days);
  fs.mkdirSync(DATA, { recursive: true });
  const running = readLock();
  if (running && running.pid !== process.pid) {
    fs.writeFileSync(PENDING, String(days));
    console.log(`A refresh (${running.days} days) is already running. Yours (${days} days) runs right after it.`);
    return 0;
  }
  let code = 0;
  try {
    for (let next = days; next;) {
      fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, days: next, startedAt: new Date().toISOString() }));
      console.log(`\n=== Refreshing every output for the last ${next === 1 ? '24 hours' : `${next} days`} ===`);
      console.log(`  Excel: ${outputs.xlsx ?? '(none)'}`);
      console.log(`  Page:  ${outputs.page ?? '(none)'}${outputs.localPage ? `\n  Local: ${outputs.localPage}` : ''}`);
      console.log(`  Board: ${outputs.publish === false ? 'not published (--no-publish)' : outputs.publishUrl ?? 'the Job Quest Board'}`);
      code = await runExport(outputs, next);
      next = 0;
      try { next = Number(fs.readFileSync(PENDING, 'utf8')); fs.unlinkSync(PENDING); } catch { /* nothing queued */ }
      if (!ALLOWED.includes(next)) next = 0;
    }
  } finally {
    try { fs.unlinkSync(LOCK); } catch { /* already gone */ }
  }
  console.log(code === 0 ? '\nRefresh done. Reload the board or page to see the new list.' : `\nRefresh failed (exit ${code}).`);
  return code;
}

// ---- CLI ----
if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === path.join(ROOT, 'refresh-job-quest.mjs').toLowerCase()) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--days');
  const days = at >= 0 ? Number(args[at + 1]) : NaN;
  if (args.includes('--status')) {
    const o = loadOutputs();
    console.log(o ? `Saved outputs (${OUTPUTS_PATH}):\n${JSON.stringify(o, null, 2)}` : 'No saved outputs yet. Run the daily export with --resume and --page once.');
    const l = readLock();
    console.log(l ? `Running now: ${l.days} days, since ${l.startedAt}` : 'No refresh running.');
  } else if (!ALLOWED.includes(days)) {
    console.error('Usage: node refresh-job-quest.mjs --days 1|3|7|30 [--detach]\n       node refresh-job-quest.mjs --status');
    process.exitCode = 1;
  } else if (args.includes('--detach')) {
    try { const r = startRefreshDetached(days); console.log(`${r.status === 'queued' ? 'Queued' : 'Started'} (${days} days). Log: ${r.log}`); }
    catch (e) { console.error(e.message); process.exitCode = 1; }
  } else {
    runRefresh(days).then((c) => { process.exitCode = c; }, (e) => { console.error(e.message); process.exitCode = 1; });
  }
}
