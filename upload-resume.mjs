/**
 * upload-resume.mjs — set the candidate profile from a resume file, no AI needed.
 *
 * Usage:
 *   node upload-resume.mjs "C:\path\to\resume.pdf"     Build profile from a resume (.pdf/.docx/.txt/.md)
 *   node upload-resume.mjs --show                       Print the active profile
 *   node upload-resume.mjs --reset                      Restore the built-in default profile
 *
 * The profile is saved to data/profile.json and used by all searches:
 *   node find-java-24h.mjs        terminal table
 *   node export-jobs-xlsx.mjs     Excel sheet with Applied? checkboxes
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parseResumeText, saveProfile, loadProfile, DEFAULT_PROFILE } from './dist/profile/profile-manager.js';

const require = createRequire(import.meta.url);

function printProfile(p) {
  console.log(`\nActive profile (source: ${p.source}${p.updatedAt ? ', updated ' + p.updatedAt.slice(0, 10) : ''})`);
  console.log(`  Headline:      ${p.headline}`);
  console.log(`  Experience:    ${p.yearsOfExperience} years`);
  console.log(`  Target roles:  ${p.targetRoles.join(', ')}`);
  console.log(`  Search terms:  ${p.searchTerms.join(' | ')}`);
  console.log(`  Skill weights:`);
  const tiers = { 10: [], 7: [], 5: [], 3: [] };
  for (const { skill, weight } of p.skillWeights) (tiers[weight] ??= []).push(skill);
  for (const [w, skills] of Object.entries(tiers).sort((a, b) => b[0] - a[0])) {
    if (skills.length) console.log(`    ${String(w).padStart(2)} pts: ${skills.join(', ')}`);
  }
  console.log(`  Excluded roles: ${p.excludeRoles.join(', ') || '(none)'}`);
  console.log(`  Match threshold: ${p.matchThreshold} points\n`);
}

async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(fs.readFileSync(filePath));
    return data.text;
  }
  if (ext === '.docx') {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }
  if (ext === '.doc') {
    throw new Error('Legacy .doc is not supported — save the resume as .docx, .pdf, or .txt and retry.');
  }
  return fs.readFileSync(filePath, 'utf8'); // .txt / .md / anything plain-text
}

const arg = process.argv[2];

if (!arg || arg === '--help' || arg === '-h') {
  console.log('Usage: node upload-resume.mjs <resume.pdf|.docx|.txt|.md> | --show | --reset');
  process.exit(arg ? 0 : 1);
}

if (arg === '--show') {
  printProfile(loadProfile());
  process.exit(0);
}

if (arg === '--reset') {
  saveProfile({ ...DEFAULT_PROFILE, updatedAt: new Date().toISOString() });
  console.log('Profile reset to the built-in default.');
  printProfile(loadProfile());
  process.exit(0);
}

if (!fs.existsSync(arg)) {
  console.error(`File not found: ${arg}`);
  process.exit(1);
}

const text = await extractText(arg);
if (!text || text.trim().length < 50) {
  console.error('Could not extract enough text from the file — is it a scanned image PDF? Save the resume as text and retry.');
  process.exit(1);
}

const profile = parseResumeText(text);
saveProfile(profile);
console.log(`\nResume parsed: ${path.basename(arg)} (${text.length} chars extracted)`);
printProfile(profile);
console.log('All searches now match against this profile. Next steps:');
console.log('  node find-java-24h.mjs        # terminal results (3-day window)');
console.log('  node export-jobs-xlsx.mjs     # Excel sheet with Applied? checkboxes');
