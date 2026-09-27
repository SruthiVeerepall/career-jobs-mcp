/**
 * health-check.mjs
 *
 * probe-registry.mjs only asks "does the endpoint answer 200". Three failure
 * modes are invisible to that question and were together ~17% of the registry:
 *
 *   empty     board answers, has no postings          -> probe passes
 *   dateless  postings exist, none carry a date, so   -> probe passes
 *             the strict window gate drops all of them
 *   error     the scraper itself fails                -> probe may pass
 *
 * This runs the REAL scraper for every company and classifies it
 * ok / empty / dateless / error. It never touches the registry.
 *
 * Usage: node health-check.mjs [--concurrency 8] [--only slug1,slug2]
 *                              [--platform workday] [--limit N]
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
const CONCURRENCY = parseInt(argVal('--concurrency', '8'), 10);
const ONLY = argVal('--only', null)?.split(',').map((s) => s.trim());
const PLATFORM = argVal('--platform', null);
const LIMIT = argVal('--limit', null) ? parseInt(argVal('--limit'), 10) : null;
const OUT_FILE = argVal('--out', 'health-results.json');

/** Boards that index every employer are keyword-driven; skipped like the probe does. */
const JOB_BOARD_PLATFORMS = new Set(['linkedin', 'simplyhired', 'builtin', 'remoteok', 'remotive', 'weworkremotely']);

async function main() {
  const { companyRegistry } = await import('./dist/scrapers/company-registry.js');
  let companies = companyRegistry.list();
  if (PLATFORM) companies = companies.filter((c) => c.platform === PLATFORM);
  if (ONLY) companies = companies.filter((c) => ONLY.includes(c.slug));
  else companies = companies.filter((c) => !JOB_BOARD_PLATFORMS.has(c.platform));
  if (LIMIT) companies = companies.slice(0, LIMIT);

  console.log(`Health-checking ${companies.length} companies with the real scrapers (concurrency ${CONCURRENCY})\n`);

  const results = new Array(companies.length);
  let i = 0;
  let done = 0;

  const worker = async () => {
    while (i < companies.length) {
      const idx = i++;
      const c = companies[idx];
      const started = Date.now();
      let row;
      try {
        const scraper = companyRegistry.createScraper(c);
        // No postedSince: ask for the whole board, so "dateless" means the
        // source really carries no dates rather than the window filtering them.
        const jobs = await scraper.fetchJobs({});
        const dated = jobs.filter((j) => j.postedDate).length;
        const status = jobs.length === 0 ? 'empty' : dated === 0 ? 'dateless' : 'ok';
        row = {
          slug: c.slug, name: c.name, platform: c.platform, platformIdentifier: c.platformIdentifier,
          status, jobs: jobs.length, dated,
          newest: jobs.map((j) => j.postedDate).filter(Boolean).sort().at(-1),
          sample: jobs[0]?.title,
          ms: Date.now() - started,
        };
      } catch (e) {
        row = {
          slug: c.slug, name: c.name, platform: c.platform, platformIdentifier: c.platformIdentifier,
          status: 'error', jobs: 0, dated: 0, error: (e.message || String(e)).slice(0, 200),
          ms: Date.now() - started,
        };
      }
      results[idx] = row;
      done++;
      const mark = { ok: '✅', empty: '⬜', dateless: '📅', error: '❌' }[row.status];
      console.log(
        `[${String(done).padStart(4)}/${companies.length}] ${mark} ${row.slug.padEnd(26)} ${row.platform.padEnd(16)} ` +
          `${String(row.jobs).padStart(5)} jobs ${String(row.dated).padStart(5)} dated ` +
          `${row.newest ? row.newest.slice(0, 10) : ''}${row.error ? '  ' + row.error.slice(0, 70) : ''}`,
      );
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, companies.length) }, worker));

  fs.writeFileSync(path.join(__dirname, OUT_FILE), JSON.stringify(results, null, 2));

  const by = (s) => results.filter((r) => r.status === s);
  console.log(`\n${'='.repeat(78)}`);
  console.log(`ok       ${by('ok').length}`);
  console.log(`empty    ${by('empty').length}   ${by('empty').map((r) => r.slug).join(', ')}`);
  console.log(`dateless ${by('dateless').length}   ${by('dateless').map((r) => r.slug).join(', ')}`);
  console.log(`error    ${by('error').length}   ${by('error').map((r) => r.slug).join(', ')}`);
  console.log(`\nWrote ${OUT_FILE}. The registry was not modified.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  // Close the shared headless Chrome, or an open browser keeps the process alive after
  // the results are printed.
  .finally(() => import('./dist/utils/browser.js').then((m) => m.closeSharedBrowser()));;
