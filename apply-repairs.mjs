/**
 * apply-repairs.mjs
 *
 * Rewrites `platform` / `platformIdentifier` (and optionally `careerUrl`) in
 * src/scrapers/company-registry.ts for every resolved entry in a repairs file.
 *
 * It never adds or removes a company: the entry count before and after must
 * match, or the write is aborted.
 *
 * Usage: node apply-repairs.mjs --in registry-repairs.json [--dry-run]
 *                               [--only slug1,slug2] [--url] [--min-jobs 1]
 *
 *   --url        also update careerUrl when the repair carries a better one
 *   --min-jobs N only apply repairs whose evidence shows >= N jobs (default 1)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const argVal = (f, d) => {
  const i = args.indexOf(f);
  return i !== -1 ? args[i + 1] : d;
};
const IN_FILE = argVal('--in', 'registry-repairs.json');
const DRY = args.includes('--dry-run');
const WITH_URL = args.includes('--url');
const ONLY = argVal('--only', null)?.split(',').map((s) => s.trim());
const MIN_JOBS = parseInt(argVal('--min-jobs', '1'), 10);

const REGISTRY = path.join(__dirname, 'src', 'scrapers', 'company-registry.ts');

/** Count `slug:` occurrences — the invariant that must not change. */
const countEntries = (src) => (src.match(/\bslug:\s*['"`]/g) || []).length;

/** Escape a value for a single-quoted TS string literal. */
const q = (v) => `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/**
 * Find the registry object literal for `slug` and return [start, end) offsets.
 * Entries are one-per-line `{ ... }` literals, so we scan braces from the line
 * containing the slug rather than parsing TypeScript.
 */
function findEntry(src, slug) {
  const re = new RegExp(`slug:\\s*['"\`]${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`);
  const m = re.exec(src);
  if (!m) return null;
  // Walk back to the opening brace of this object literal.
  let start = src.lastIndexOf('{', m.index);
  if (start === -1) return null;
  // Walk forward matching braces.
  let depth = 0;
  let end = -1;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) return null;
  return [start, end];
}

/** Replace `key: <value>` inside an entry literal, or append it if absent. */
function setField(literal, key, value) {
  const re = new RegExp(`(\\b${key}:\\s*)(['"\`][^'"\`]*['"\`])`);
  if (re.test(literal)) return literal.replace(re, `$1${q(value)}`);
  return literal.replace(/\s*\}$/, `, ${key}: ${q(value)} }`);
}

function main() {
  const repairs = JSON.parse(fs.readFileSync(path.join(__dirname, IN_FILE), 'utf8'));
  let src = fs.readFileSync(REGISTRY, 'utf8');
  const before = countEntries(src);

  let applicable = repairs.filter((r) => r.resolved && r.platform && r.platformIdentifier);
  if (ONLY) applicable = applicable.filter((r) => ONLY.includes(r.slug));
  applicable = applicable.filter((r) => (r.evidence?.count ?? 0) >= MIN_JOBS);

  const applied = [];
  const missing = [];

  for (const r of applicable) {
    const span = findEntry(src, r.slug);
    if (!span) {
      missing.push(r.slug);
      continue;
    }
    const [s, e] = span;
    let lit = src.slice(s, e);
    const original = lit;
    lit = setField(lit, 'platform', r.platform);
    lit = setField(lit, 'platformIdentifier', r.platformIdentifier);
    if (WITH_URL && r.newCareerUrl) lit = setField(lit, 'careerUrl', r.newCareerUrl);
    if (lit === original) continue;
    src = src.slice(0, s) + lit + src.slice(e);
    applied.push({
      slug: r.slug,
      name: r.name,
      from: `${r.old.platform}:${r.old.platformIdentifier}`,
      to: `${r.platform}:${r.platformIdentifier}`,
      jobs: r.evidence?.total,
      via: r.via,
    });
  }

  const after = countEntries(src);
  if (after !== before) {
    console.error(`ABORT: entry count changed ${before} -> ${after}. Repairs must never add or remove a company.`);
    process.exit(1);
  }

  for (const a of applied) {
    console.log(`${a.slug.padEnd(26)} ${a.from}  ->  ${a.to}   (${a.jobs} jobs, ${a.via})`);
  }
  if (missing.length) console.log(`\nNot found in registry (skipped): ${missing.join(', ')}`);
  console.log(`\n${applied.length} entr${applied.length === 1 ? 'y' : 'ies'} rewritten. Entry count unchanged at ${before}.`);

  if (DRY) {
    console.log('(dry run — registry not written)');
    return;
  }
  fs.writeFileSync(REGISTRY, src);
  console.log(`Wrote ${path.relative(__dirname, REGISTRY)}. Run "npm run build".`);
}

main();
