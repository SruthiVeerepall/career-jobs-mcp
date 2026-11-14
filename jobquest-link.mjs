/**
 * jobquest-link.mjs: what Windows runs when a jobquest:// link is clicked in Excel, a local
 * page, or a browser (registered by install-auto-apply.mjs).
 *
 *   node jobquest-link.mjs "jobquest://apply?url=<greenhouse job>"   # fill the form, never submit
 *   node jobquest-link.mjs "jobquest://refresh?days=7"               # update every Job Quest output
 *
 * The link is validated by parseJobQuestLink(): apply accepts only Greenhouse URLs, refresh only
 * 1/3/7/30 days. Nothing else a link says is used.
 */
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseJobQuestLink } from './dist/apply/protocol.js';
import { runRefresh } from './refresh-job-quest.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const link = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '';

async function holdWindow(prompt = '\nPress Enter to close this window.') {
  if (!process.stdin.isTTY) return;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((done) => rl.question(prompt, () => { rl.close(); done(); }));
}

async function run() {
  const parsed = parseJobQuestLink(link);
  if (parsed.action === 'apply') {
    // auto-apply.mjs keeps its own window handling (it waits for Chrome to close).
    const code = await new Promise((resolve) => {
      const child = spawn(process.execPath, [path.join(ROOT, 'auto-apply.mjs'), '--link', link], { cwd: ROOT, stdio: 'inherit' });
      child.on('close', (c) => resolve(c ?? 1));
    });
    process.exitCode = code;
    return;
  }
  const code = await runRefresh(parsed.days);
  process.exitCode = code;
  if (code !== 0) await holdWindow();
  else await new Promise((r) => setTimeout(r, 8000)); // leave "Refresh done" on screen briefly
}

run().catch(async (err) => {
  console.error(`\nJob Quest link failed: ${err.message}`);
  process.exitCode = 1;
  await holdWindow();
});
