// Re-emit registry entries with the user-supplied careerUrl (not the redirect target),
// then splice them into src/scrapers/company-registry.ts before the "Custom" section.
import { promises as fs } from 'node:fs';

const inputFile = process.argv[2] || 'companies-input.txt';
const outBase = inputFile.replace(/\.txt$/, '');
const data = JSON.parse(await fs.readFile(`discovered-${outBase}.json`, 'utf8'));
const inputs = (await fs.readFile(inputFile, 'utf8'))
  .split('\n').map(l => l.trim()).filter(Boolean)
  .map(l => l.split('|'))
  .reduce((acc, [n, u]) => { acc[n.trim()] = u.trim(); return acc; }, {});

// Existing slugs — read live from registry to avoid drift.
const EXISTING = new Set();
{
  const reg = await fs.readFile('src/scrapers/company-registry.ts', 'utf8');
  const re = /slug:\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(reg)) !== null) EXISTING.add(m[1]);
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Build entries grouped by platform
const byPlat = { greenhouse: [], lever: [], ashby: [], smartrecruiters: [], workday: [] };
let dupCount = 0;
for (const r of data.verified) {
  const slug = slugify(r.name);
  if (EXISTING.has(slug)) { dupCount++; continue; }
  const orig = inputs[r.name] || r.url;
  byPlat[r.platform].push({ name: r.name, slug, careerUrl: orig, platform: r.platform, platformIdentifier: r.identifier });
}

const fmt = (e) => `  { name: ${JSON.stringify(e.name)}, slug: '${e.slug}', careerUrl: ${JSON.stringify(e.careerUrl)}, platform: '${e.platform}', platformIdentifier: ${JSON.stringify(e.platformIdentifier)} },`;

const block = [
  '\n  // ── Auto-discovered (verified via ATS API) ─────────────────────────────',
  '  // ── Greenhouse ─────────────────────────────',
  ...byPlat.greenhouse.map(fmt),
  '  // ── Lever ──────────────────────────────────',
  ...byPlat.lever.map(fmt),
  '  // ── Ashby ──────────────────────────────────',
  ...byPlat.ashby.map(fmt),
  '  // ── Workday ────────────────────────────────',
  ...byPlat.workday.map(fmt),
].join('\n');

const regPath = 'src/scrapers/company-registry.ts';
let src = await fs.readFile(regPath, 'utf8');
const marker = '  // ── Custom (Puppeteer) - Big tech with bespoke career sites ─────────';
if (!src.includes(marker)) throw new Error('marker not found in registry');
src = src.replace(marker, block + '\n\n' + marker);
await fs.writeFile(regPath, src);

const total = byPlat.greenhouse.length + byPlat.lever.length + byPlat.ashby.length + byPlat.workday.length;
console.log(`Inserted ${total} new entries into ${regPath}`);
console.log(`  greenhouse=${byPlat.greenhouse.length}  lever=${byPlat.lever.length}  ashby=${byPlat.ashby.length}  workday=${byPlat.workday.length}`);
