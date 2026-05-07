// Re-emit registry entries with the user-supplied careerUrl (not the redirect target),
// then splice them into src/scrapers/company-registry.ts before the "Custom" section.
import { promises as fs } from 'node:fs';

const data = JSON.parse(await fs.readFile('discovered-companies.json', 'utf8'));
const inputs = (await fs.readFile('companies-input.txt', 'utf8'))
  .split('\n').map(l => l.trim()).filter(Boolean)
  .map(l => l.split('|'))
  .reduce((acc, [n, u]) => { acc[n.trim()] = u.trim(); return acc; }, {});

// Existing slugs already in the registry — don't add duplicates.
const EXISTING = new Set([
  'stripe','airbnb','coinbase','discord','gitlab','reddit','twilio','pinterest','doordash','instacart',
  'anthropic','openai','robinhood','plaid','figma','snowflake','databricks',
  'netflix','quora','brex','mixpanel',
  'linear','posthog','replicate','ramp',
  'visa','bosch',
  'salesforce','adobe','jpmorgan','citi','goldman-sachs','vanguard','nvidia',
  'apple','google','microsoft','amazon','meta','tesla','uber','shopify',
]);

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Build entries grouped by platform
const byPlat = { greenhouse: [], lever: [], ashby: [], smartrecruiters: [], workday: [] };
for (const r of data.verified) {
  const slug = slugify(r.name);
  if (EXISTING.has(slug)) continue;
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
