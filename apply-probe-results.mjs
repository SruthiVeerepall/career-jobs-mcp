/**
 * apply-probe-results.mjs
 * Reads probe-results.json and removes broken entries from the registry source.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_FILE = path.join(__dirname, 'probe-results.json');
const REGISTRY_SRC = path.join(__dirname, 'src', 'scrapers', 'company-registry.ts');

const results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
const slugsToRemove = new Set(results.brokenCompanies.map(c => c.slug));

console.log(`Removing ${slugsToRemove.size} broken entries from registry…`);

const src = fs.readFileSync(REGISTRY_SRC, 'utf8');
const lines = src.split('\n');
let removed = 0;

for (let i = 0; i < lines.length; i++) {
  if (lines[i] === null) continue;
  const slugMatch = lines[i].match(/\bslug:\s*['"]([^'"]+)['"]/);
  if (!slugMatch || !slugsToRemove.has(slugMatch[1])) continue;

  const trimmed = lines[i].trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('},')) {
    lines[i] = null;
    removed++;
  } else {
    let start = i;
    while (start > 0 && !lines[start].trim().startsWith('{')) start--;
    let end = i;
    while (end < lines.length - 1 && !/^\s*\},/.test(lines[end])) end++;
    for (let j = start; j <= end; j++) lines[j] = null;
    removed++;
  }
}

const final = lines.filter(l => l !== null).join('\n');
fs.writeFileSync(REGISTRY_SRC, final, 'utf8');
console.log(`Done. Removed ${removed} entries. Run: npm run build`);
