/**
 * install-auto-apply.mjs: one-time setup so "Auto apply" links work from anywhere: the Excel
 * sheet, a local job-quest.html, or the Job Quest Board in any browser.
 *
 *   node install-auto-apply.mjs --resume "C:\path\to\resume.docx"   # register + remember résumé
 *   node install-auto-apply.mjs --status                              # show what is registered
 *   node install-auto-apply.mjs --uninstall                           # remove the link type
 *
 * Registers the jobquest:// link type for the current Windows user (HKCU, no admin needed):
 * a click runs `node jobquest-link.mjs "<link>"`. An apply link fills the Greenhouse form in
 * Chrome and never submits; a refresh link (jobquest://refresh?days=N) reruns the daily export
 * and updates every output (see refresh-job-quest.mjs). The résumé path is saved in apply-profile.json; links never carry one.
 * Re-run after moving this folder or changing Node, since the registered command holds both paths.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PROFILE = process.env.APPLY_PROFILE_PATH ?? path.join(ROOT, 'apply-profile.json');
const KEY = 'HKCU\\Software\\Classes\\jobquest';
const args = process.argv.slice(2);

function reg(...a) {
  return execFileSync('reg', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

if (process.platform !== 'win32') {
  console.error('This installer registers a Windows link type. On macOS/Linux run auto-apply.mjs directly.');
  process.exit(1);
}

if (args.includes('--uninstall')) {
  try { reg('delete', KEY, '/f'); console.log('Removed the jobquest:// link type.'); }
  catch { console.log('jobquest:// was not registered.'); }
  process.exit(0);
}

if (args.includes('--status')) {
  try {
    console.log(reg('query', `${KEY}\\shell\\open\\command`, '/ve').trim());
  } catch { console.log('jobquest:// is not registered. Run: node install-auto-apply.mjs --resume <path>'); }
  const p = fs.existsSync(PROFILE) ? JSON.parse(fs.readFileSync(PROFILE, 'utf8')) : {};
  console.log(`Résumé for links: ${p.resumePath ?? '(not set)'}`);
  process.exit(0);
}

// ---- résumé: remembered in apply-profile.json (git-ignored) ----
const at = args.indexOf('--resume');
const profile = fs.existsSync(PROFILE) ? JSON.parse(fs.readFileSync(PROFILE, 'utf8')) : {};
if (at >= 0) {
  const resume = path.resolve(args[at + 1] ?? '');
  if (!fs.existsSync(resume)) { console.error(`Résumé not found: ${resume}`); process.exit(1); }
  profile.resumePath = resume;
  fs.writeFileSync(PROFILE, JSON.stringify(profile, null, 2) + '\n');
}
if (!profile.resumePath) {
  console.error('Tell me which résumé to use: node install-auto-apply.mjs --resume "C:\\path\\to\\resume.docx"');
  process.exit(1);
}
if (!fs.existsSync(path.join(ROOT, 'dist', 'apply', 'protocol.js'))) {
  console.error('Build first: npm run build');
  process.exit(1);
}

// ---- the link type ----
const command = `"${process.execPath}" "${path.join(ROOT, 'jobquest-link.mjs')}" "%1"`;
reg('add', KEY, '/ve', '/d', 'URL:Job Quest', '/f');
reg('add', KEY, '/v', 'URL Protocol', '/d', '', '/f');
reg('add', `${KEY}\\shell\\open\\command`, '/ve', '/d', command, '/f');

console.log('Job Quest links are ready (Auto apply and Run a new search).');
console.log(`  Link type: jobquest://  ->  ${command}`);
console.log(`  Résumé:    ${profile.resumePath}`);
console.log('\nClick "Auto apply", or a search window (Today / 3 days / Week / Month), in the Excel sheet,');
console.log('a local job-quest.html, or the Job Quest Board.');
console.log('The first click asks whether to open Node.js: allow it (browsers offer "always allow").');
