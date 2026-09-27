/**
 * diagnose-ats.mjs — reconnaissance, not repair.
 *
 * For companies no discovery pass could place, load the careers site and dump
 * every third-party request the page makes. The point is to NAME the ATS so a
 * scraper can be written (or the company recorded as genuinely unreachable),
 * rather than to guess an identifier.
 *
 * Usage: node diagnose-ats.mjs --only slug1,slug2 [--in <repairs.json>]
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const argVal = (f, d) => {
  const i = args.indexOf(f);
  return i !== -1 ? args[i + 1] : d;
};
const IN_FILE = argVal('--in', 'registry-repairs-apis2.json');
const ONLY = argVal('--only', null)?.split(',').map((s) => s.trim());
const CONCURRENCY = parseInt(argVal('--concurrency', '3'), 10);
const OUT_FILE = argVal('--out', 'ats-diagnosis.json');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** Hosts that tell us nothing about the ATS. */
const NOISE =
  /google-analytics|googletagmanager|doubleclick|facebook|linkedin\.com\/px|twitter|hotjar|segment|cloudflare|cookielaw|onetrust|newrelic|datadog|sentry|adobedtm|demdex|gstatic|googleapis\/fonts|fontawesome|youtube|vimeo\.com\/api\/player|bing|clarity\.ms|qualtrics|munchkin|marketo|6sense|drift|intercom|zendesk/i;

const KNOWN = [
  [/myworkdayjobs\.com/i, 'Workday'],
  [/greenhouse\.io/i, 'Greenhouse'],
  [/lever\.co/i, 'Lever'],
  [/ashbyhq\.com/i, 'Ashby'],
  [/smartrecruiters\.com/i, 'SmartRecruiters'],
  [/\.icims\.com/i, 'iCIMS'],
  [/oraclecloud\.com/i, 'Oracle Recruiting'],
  [/\.sapsf\.|successfactors/i, 'SuccessFactors'],
  [/phenompeople|\/widgets\b/i, 'Phenom'],
  [/eightfold\.ai|\/api\/(?:apply\/v2|pcsx)\//i, 'Eightfold'],
  [/taleo\.net/i, 'Taleo'],
  [/avature\.net/i, 'Avature'],
  [/radancy|talentbrew|\/search-jobs\/results/i, 'Radancy'],
  [/jobvite\.com/i, 'Jobvite'],
  [/workable\.com/i, 'Workable'],
  [/recruitee\.com/i, 'Recruitee'],
  [/breezy\.hr/i, 'Breezy'],
  [/teamtailor/i, 'Teamtailor'],
  [/rippling\.com/i, 'Rippling'],
  [/pinpointhq\.com/i, 'Pinpoint'],
  [/gem\.com|gemhq/i, 'Gem'],
  [/paylocity/i, 'Paylocity'],
  [/dayforcehcm/i, 'Dayforce'],
  [/ultipro|\.ukg\./i, 'UKG'],
  [/bamboohr\.com/i, 'BambooHR'],
  [/jazzhr|applytojob\.com/i, 'JazzHR'],
  [/successfactors|sfsf/i, 'SuccessFactors'],
  [/brassring|kenexa/i, 'BrassRing'],
];

async function diagnose(browser, entry) {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  const urls = new Set();
  page.on('request', (r) => urls.add(r.url()));
  page.on('framenavigated', (f) => urls.add(f.url()));

  const visit = async (u) => {
    try {
      await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await new Promise((r) => setTimeout(r, 8000));
    } catch {}
  };

  try {
    await visit(entry.careerUrl);
    // Follow into the job list if the landing page is marketing.
    try {
      const links = await page.$$eval('a[href]', (as) =>
        as.map((a) => ({ href: a.href, t: (a.textContent || '').trim() })).filter((l) => l.href.startsWith('http')),
      );
      const t = links.find((l) => /search|view|all|open|browse|explore|find/i.test(l.t) && /job|role|opening|position|opportunit/i.test(l.t));
      if (t) await visit(t.href);
    } catch {}

    try {
      const html = await page.content();
      for (const m of html.match(/https?:\/\/[^\s"'<>()]{10,200}/g) || []) urls.add(m);
    } catch {}

    const ats = new Set();
    for (const u of urls) for (const [re, name] of KNOWN) if (re.test(u)) ats.add(name);

    const thirdParty = [...urls]
      .filter((u) => !NOISE.test(u))
      .filter((u) => /api|job|career|search|position|requisition|posting/i.test(u))
      .map((u) => u.slice(0, 150));

    return { ats: [...ats], finalUrl: page.url(), interesting: [...new Set(thirdParty)].slice(0, 25) };
  } finally {
    await page.close().catch(() => {});
  }
}

async function main() {
  const prior = JSON.parse(fs.readFileSync(path.join(__dirname, IN_FILE), 'utf8'));
  const { companyRegistry } = await import('./dist/scrapers/company-registry.js');
  const bySlug = new Map(companyRegistry.list().map((c) => [c.slug, c]));

  let targets = prior.filter((r) => !r.resolved);
  if (ONLY) targets = prior.filter((r) => ONLY.includes(r.slug));
  targets = targets.map((t) => ({ ...t, careerUrl: t.careerUrl ?? bySlug.get(t.slug)?.careerUrl }));

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  const out = [];
  let i = 0;
  const worker = async () => {
    while (i < targets.length) {
      const e = targets[i++];
      let r = { ats: [], interesting: [] };
      try {
        r = await diagnose(browser, e);
      } catch (err) {
        r.error = err.message;
      }
      console.log(`${e.slug.padEnd(20)} ${r.ats.join(', ') || '(unknown)'}   ${r.finalUrl ?? ''}`);
      if (!r.ats.length) for (const u of r.interesting.slice(0, 6)) console.log(`    ${u}`);
      out.push({ slug: e.slug, name: e.name, careerUrl: e.careerUrl, ...r });
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await browser.close();
  fs.writeFileSync(path.join(__dirname, OUT_FILE), JSON.stringify(out, null, 2));

  const tally = {};
  for (const r of out) for (const a of r.ats.length ? r.ats : ['(unknown)']) (tally[a] ||= []).push(r.slug);
  console.log('\n' + '='.repeat(70));
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1].length - a[1].length)) console.log(`${k} (${v.length}): ${v.join(', ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
