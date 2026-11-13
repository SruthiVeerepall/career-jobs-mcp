/**
 * publish-job-page.mjs
 * Publishes a Job Quest page (written by `export-jobs-xlsx.mjs --page <path>`) to the Job Quest
 * Board artifact on claude.ai, by running Claude Code unattended (`claude -p`). No script can
 * publish an artifact by itself; only a Claude session's Artifact tool can, so this hands
 * that one job to a short headless session.
 *
 *   node publish-job-page.mjs <page.html> [--url <artifact url>]
 *
 * export-jobs-xlsx.mjs calls this automatically after a `--page` run unless `--no-publish`.
 *
 * Which Claude binary: $CLAUDE_BIN if set, else the newest one bundled with the VS Code
 * extension, else `claude` on PATH. The Artifact tool needs a recent Claude Code: the npm
 * global 2.1.132 did not have it, while the extension's 2.1.322 did.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const DEFAULT_URL = process.env.JOB_QUEST_URL ?? 'https://claude.ai/artifact/KZy9NZwzNZSgLWaHUaq4TE';

export function findClaudeBinary() {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const extDir = path.join(os.homedir(), '.vscode', 'extensions');
  try {
    const versionOf = (d) => (d.match(/anthropic\.claude-code-(\d+)\.(\d+)\.(\d+)/) ?? []).slice(1).map(Number);
    const newer = (a, b) => { const x = versionOf(a), y = versionOf(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return y[i] - x[i]; return 0; };
    const exe = process.platform === 'win32' ? 'claude.exe' : 'claude';
    const found = fs.readdirSync(extDir)
      .filter((d) => /^anthropic\.claude-code-\d+\.\d+\.\d+/.test(d))
      .sort(newer)
      .map((d) => path.join(extDir, d, 'resources', 'native-binary', exe))
      .find((p) => fs.existsSync(p));
    if (found) return found;
  } catch { /* no VS Code extension */ }
  return 'claude';
}

/** Resolves true when Claude reports the publish; never throws (a failed publish must not fail the export). */
export function publishJobPage(file, url = DEFAULT_URL, { timeoutMs = 6 * 60_000 } = {}) {
  const page = path.resolve(file);
  if (!fs.existsSync(page)) {
    console.error(`  Publish skipped: ${page} does not exist.`);
    return Promise.resolve(false);
  }
  const prompt = [
    `Publish the local file "${page}" to the existing artifact ${url} with the Artifact tool.`,
    `Steps: 1) Artifact action "read" with url ${url}. 2) Read the local file.`,
    `3) Artifact publish with file_path "${page}", url ${url} and label "Daily update".`,
    'Do not pass capabilities, icon or title, and never create a new artifact.',
    'Reply with exactly one line: PUBLISHED <version> on success, or FAILED <reason>.',
  ].join(' ');
  const bin = findClaudeBinary();
  console.log(`\nPublishing the Job Quest page to ${url} ...`);
  return new Promise((resolve) => {
    let out = '';
    let child;
    try {
      // Claude Code only offers the Artifact tool when it believes it runs inside VS Code
      // (CLAUDE_CODE_ENTRYPOINT=claude-vscode). Launched from a plain terminal the variable is
      // unset and `-p` reports "no Artifact tool"; `cli` does not enable it either (verified
      // 2026-11-12, Claude Code 2.1.322). So always set it for this child.
      const env = { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'claude-vscode' };
      child = spawn(bin, ['-p', prompt, '--allowedTools', 'Artifact,Read'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env });
    } catch (err) {
      console.error(`  Publish failed: could not start Claude Code (${bin}): ${err.message}`);
      return resolve(false);
    }
    const timer = setTimeout(() => { child.kill(); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', (err) => {
      clearTimeout(timer);
      console.error(`  Publish failed: could not start Claude Code (${bin}): ${err.message}`);
      resolve(false);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const line = out.trim().split(/\r?\n/).filter(Boolean).pop() ?? '';
      if (/^PUBLISHED\b/i.test(line)) {
        console.log(`  Job Quest Board updated (${line.replace(/^PUBLISHED\s*/i, '')}): ${url}`);
        resolve(true);
      } else {
        console.error(`  Publish did not complete${code ? ` (exit ${code})` : ''}: ${line || 'no output'}`);
        console.error(`  Retry with: node publish-job-page.mjs "${page}"`);
        resolve(false);
      }
    });
  });
}

// CLI: node publish-job-page.mjs <page.html> [--url <artifact url>]
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--url');
  const urlIdx = args.indexOf('--url');
  if (!file) {
    console.error('Usage: node publish-job-page.mjs <page.html> [--url <artifact url>]');
    process.exit(1);
  }
  publishJobPage(file, urlIdx !== -1 ? args[urlIdx + 1] : DEFAULT_URL).then((ok) => { process.exitCode = ok ? 0 : 1; });
}
