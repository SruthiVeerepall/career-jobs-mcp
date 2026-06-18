/**
 * probe-uncertain.mjs
 *
 * Re-tests the "uncertain" (HTTP 422 / CSRF-protected) companies from
 * probe-results.json using the real WorkdayScraper, which performs the
 * CSRF-prefetch + retry dance. Reports which ones actually return jobs
 * at runtime vs. which are still broken.
 *
 * Usage: node probe-uncertain.mjs [--concurrency N]
 */

import { companyRegistry } from './dist/scrapers/company-registry.js';
import { WorkdayScraper } from './dist/scrapers/platforms/workday.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const CONCURRENCY = (() => {
  const i = args.indexOf('--concurrency');
  return i !== -1 ? parseInt(args[i + 1], 10) : 5;
})();

process.env.WORKDAY_MAX_PAGES = '1'; // just need to confirm the endpoint returns data

const RESULTS_FILE = path.join(__dirname, 'probe-results.json');
const report = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
const uncertain = report.uncertainCompanies;

console.log(`Re-testing ${uncertain.length} uncertain (CSRF/422) Workday companies via live scraper...\n`);

async function runPool(tasks, concurrency) {
  const results = new Array(tasks.length);
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

const working = [];
const stillBroken = [];
let done = 0;

const tasks = uncertain.map((entry) => async () => {
  const config = companyRegistry.companies.get(entry.slug);
  let result;
  try {
    const scraper = new WorkdayScraper(config);
    const jobs = await scraper.fetchJobs({});
    result = { ok: true, count: jobs.length };
  } catch (e) {
    result = { ok: false, error: e.message };
  }
  done++;
  if (done % 10 === 0 || done === uncertain.length) {
    process.stderr.write(`  Progress: ${done}/${uncertain.length}\n`);
  }
  if (result.ok) {
    working.push({ ...entry, jobCount: result.count });
  } else {
    stillBroken.push({ ...entry, error: result.error });
  }
});

await runPool(tasks, CONCURRENCY);

console.log(`\n${'─'.repeat(60)}`);
console.log(`RESULTS: ${working.length} now working / ${stillBroken.length} still broken\n`);

console.log(`Working (${working.length}):`);
for (const c of working.sort((a, b) => a.name.localeCompare(b.name))) {
  console.log(`  ${c.name.padEnd(30)} jobs=${c.jobCount}`);
}

console.log(`\nStill broken (${stillBroken.length}):`);
for (const c of stillBroken.sort((a, b) => a.name.localeCompare(b.name))) {
  console.log(`  ${c.name.padEnd(30)} ${c.error}`);
}

fs.writeFileSync(
  path.join(__dirname, 'probe-uncertain-results.json'),
  JSON.stringify({ timestamp: new Date().toISOString(), working, stillBroken }, null, 2),
);
console.log(`\nFull results saved to: probe-uncertain-results.json`);
