/**
 * auto-apply.mjs: fill a Greenhouse, Ashby, Lever, Workable, Workday or Eightfold job application from your résumé in a visible Chrome.
 * A job board page (LinkedIn, BuiltIn, SimplyHired…) works too: it is looked up on the employer's own job site (no board sign-in).
 *
 *   node auto-apply.mjs --resume <path> <job url>
 *   node auto-apply.mjs --resume <path> --show-data      # print what would be filled, no browser
 *   node auto-apply.mjs --link "jobquest://apply?url=…"  # what an "Auto apply" link click runs
 *   node auto-apply.mjs --setup                          # answer the standard questions once
 *   node auto-apply.mjs --set sponsorship=no --set linkedin=https://…   # same, without prompts
 *
 * Fills name, email, phone, location, every job, education, LinkedIn (from apply-profile.json)
 * and attaches the résumé. It NEVER submits: review the form and press Submit yourself. The
 * script waits until you close the Chrome window.
 *
 * Workday: sign in to (or create) that company's Workday account in the Chrome window; each
 * step then fills as it opens. Check it and press "Save and Continue" yourself. It stops at the
 * Review step and never presses Submit.
 *
 * --link is started by Windows when a jobquest:// link is clicked (Excel, a local page, a
 * browser); see install-auto-apply.mjs. The résumé then comes from apply-profile.json
 * (`resumePath`), never from the link.
 */
import fs from 'node:fs';
import readline from 'node:readline';
import { APPLY_PROFILE_PATH } from './dist/apply/apply-profile.js';
import { SETUP_QUESTIONS } from './dist/apply/standard-answers.js';
import { autoApply } from './dist/apply/auto-apply.js';
import { loadApplyProfile } from './dist/apply/apply-profile.js';
import { parseAutoApplyLink } from './dist/apply/protocol.js';
import { buildApplicant } from './dist/resume/applicant.js';
import { extractResumeText } from './dist/resume/extract-text.js';
import { closeSharedBrowser, getVisibleBrowser } from './dist/utils/browser.js';

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const LINK = flag('--link');
const SHOW = args.includes('--show-data');

/** Opened by a link click, the console window would vanish with the error; keep it up. */
async function holdWindow() {
  if (!LINK || !process.stdin.isTTY) return;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((done) => rl.question('\nPress Enter to close this window.', () => { rl.close(); done(); }));
}

// ---- one-time answers: LinkedIn, authorization, sponsorship, pronouns, EEO ----
const LINK_KEYS = ['linkedin', 'github', 'website'];
function readProfileFile() {
  return fs.existsSync(APPLY_PROFILE_PATH) ? JSON.parse(fs.readFileSync(APPLY_PROFILE_PATH, 'utf8')) : {};
}
function writeProfileFile(p) {
  fs.writeFileSync(APPLY_PROFILE_PATH, JSON.stringify(p, null, 2) + '\n');
}
/** Validate one answer: the value to store, '' to clear, or throws. */
function checkAnswer(key, raw) {
  const v = String(raw ?? '').trim();
  if (!v) return '';
  if (LINK_KEYS.includes(key)) {
    if (!/^https?:\/\//i.test(v)) throw new Error(`${key} must be a full URL starting with https://`);
    return v;
  }
  const q = SETUP_QUESTIONS.find((x) => x.key === key);
  if (!q) throw new Error(`Unknown answer "${key}". Known: ${[...LINK_KEYS, ...SETUP_QUESTIONS.map((x) => x.key)].join(', ')}`);
  if (q.free) return v;
  const hit = q.choices.find((c) => c.toLowerCase() === v.toLowerCase());
  if (!hit) throw new Error(`${key} must be one of: ${q.choices.join(' | ')}`);
  return hit;
}
function store(p, key, value) {
  if (LINK_KEYS.includes(key)) { if (value) p[key] = value; else delete p[key]; return; }
  p.standard ??= {};
  if (value) p.standard[key] = value; else delete p.standard[key];
}

async function setup() {
  const p = readProfileFile();
  const sets = args.flatMap((a, i) => (a === '--set' ? [args[i + 1]] : [])).filter(Boolean);
  if (sets.length) {
    for (const s of sets) {
      const [key, ...rest] = s.split('=');
      store(p, key.trim(), checkAnswer(key.trim(), rest.join('=')));
    }
    writeProfileFile(p);
    console.log(`Saved to ${APPLY_PROFILE_PATH}`);
    return;
  }
  if (!process.stdin.isTTY) throw new Error('--setup asks questions in a terminal. Without one, use --set key=value.');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((done) => rl.question(q, done));
  console.log('One-time answers for auto apply. They stay on this PC in apply-profile.json.');
  console.log('Press Enter to keep the current answer, or type - to clear it. Voluntary questions accept "decline".\n');
  const items = [{ key: 'linkedin', question: 'LinkedIn profile URL', free: true }, ...SETUP_QUESTIONS];
  for (const q of items) {
    const current = LINK_KEYS.includes(q.key) ? p[q.key] : p.standard?.[q.key];
    for (;;) {
      if (q.choices) q.choices.forEach((c, i) => console.log(`    ${i + 1}) ${c}`));
      const raw = String(await ask(`${q.question}${current ? ` [${current}]` : ''}: `)).trim();
      if (!raw) break;
      if (raw === '-') { store(p, q.key, ''); break; }
      const byNumber = q.choices && /^\d+$/.test(raw) ? q.choices[Number(raw) - 1] : undefined;
      try { store(p, q.key, checkAnswer(q.key, byNumber ?? raw)); break; } catch (e) { console.log(`  ${e.message}`); }
    }
  }
  rl.close();
  writeProfileFile(p);
  console.log(`\nSaved to ${APPLY_PROFILE_PATH}. Every auto apply now uses these answers.`);
}

async function run() {
  if (args.includes('--setup') || args.includes('--set')) { await setup(); return; }
  let url = args.find((a) => /^https?:\/\//.test(a));
  let resumePath = flag('--resume');
  if (LINK) {
    url = parseAutoApplyLink(LINK);
    resumePath ??= loadApplyProfile().resumePath;
    if (!resumePath) throw new Error('No résumé set for auto apply links. Run: node install-auto-apply.mjs --resume "<path>"');
  }
  if (!resumePath || (!url && !SHOW)) {
    console.error('Usage: node auto-apply.mjs --resume <path> <job url>\n       node auto-apply.mjs --resume <path> --show-data\n       node auto-apply.mjs --link "jobquest://apply?url=…"');
    process.exitCode = 1;
    return;
  }
  if (SHOW) {
    const { text } = await extractResumeText({ resumePath });
    console.log(JSON.stringify(buildApplicant(text), null, 2));
    return;
  }
  console.log(`Auto apply: ${url}\nRésumé: ${resumePath}\nOpening Chrome and filling the form…`);
  const r = await autoApply({
    applyUrl: url, resumePath, onStep: printReport,
    onStepsDone: (why) => { if (why === 'review') console.log('\nReview it all in Chrome, press Submit yourself, then close the Chrome window.'); },
  });
  if (r.via?.outcome === 'matched') console.log(`\nFound this ${r.via.board} job on the employer's own site: ${r.via.employerUrl}`);
  else if (r.via?.employerUrl) console.log(`\n${r.via.board}: the Apply button led to ${r.via.employerUrl}`);
  if (r.via?.outcome === 'no-match') {
    // Nothing was opened: say why and keep the window up long enough to read it.
    console.log(`\n${r.notFilled}`);
    await holdWindow();
    return;
  }
  if (r.notFilled) {
    console.log(`\n${r.notFilled}\nClose the Chrome window when done.`);
    const browser = await getVisibleBrowser();
    await new Promise((done) => browser.once('disconnected', done));
    return;
  }
  console.log(`\nForm: ${r.formUrl}`);
  if (r.followsSteps && r.platform === 'eightfold') {
    // Microsoft / Qualcomm: the application shows after you sign in on the company's site.
    console.log('\nSign in on this company\'s careers site in the Chrome window. The application fills itself as soon as it opens; review it and press Submit yourself. Close the Chrome window when done.');
    const browser = await getVisibleBrowser();
    await new Promise((done) => browser.once('disconnected', done));
    return;
  }
  if (r.followsSteps) {
    if (r.waitingForSignIn) console.log('\nWorkday: sign in or create your account for this company in the Chrome window. Each step fills as it opens.');
    if (r.step) printReport(r);
    if (r.setupHint) console.log(`\n${r.setupHint}`);
    console.log('\nWorkday: check each step and press "Save and Continue" yourself; the next step fills itself. Nothing is submitted. Close the Chrome window when done.');
    const browser = await getVisibleBrowser();
    await new Promise((done) => browser.once('disconnected', done));
    return;
  }
  console.log(`Résumé attached: ${r.resumeUploaded ? 'yes' : 'no'}`);
  console.log(`\nFilled (${r.filled.length}):`);
  for (const f of r.filled) console.log(`  ✓ ${f.field}: ${f.value}`);
  if (r.failed.length) {
    console.log(`\nCould not fill (${r.failed.length}):`);
    for (const f of r.failed) console.log(`  ✗ ${f.field}: ${f.value} (${f.reason})`);
  }
  if (r.needsYou.length) {
    console.log(`\nStill required, answer these yourself (${r.needsYou.length}):`);
    for (const q of r.needsYou) console.log(`  • ${q}`);
  }
  if (r.setupHint) console.log(`\n${r.setupHint}`);
  console.log('\nNothing was submitted. Review the form in Chrome, press Submit, then close the Chrome window.');
  const browser = await getVisibleBrowser();
  await new Promise((done) => browser.once('disconnected', done));
}

/** One Workday step (or an Eightfold application after sign-in): what went in, what didn't, what is left. */
function printReport(r) {
  console.log(`\n── ${r.step === 'Application' ? 'Application' : `Workday step: ${r.step}`} ──`);
  if (r.resumeUploaded) console.log('Résumé attached: yes');
  console.log(`Filled (${r.filled.length}):`);
  for (const f of r.filled) console.log(`  ✓ ${f.field}: ${f.value}`);
  if (r.failed.length) {
    console.log(`Could not fill (${r.failed.length}):`);
    for (const f of r.failed) console.log(`  ✗ ${f.field}: ${f.value} (${f.reason})`);
  }
  if (r.needsYou.length) {
    console.log(`Still required, answer these yourself (${r.needsYou.length}):`);
    for (const q of r.needsYou) console.log(`  • ${q}`);
  }
}

run()
  .catch(async (err) => { console.error(`\nAuto apply failed: ${err.message}`); process.exitCode = 1; await holdWindow(); })
  .finally(() => closeSharedBrowser());
