/**
 * Writes the "Job Quest Board" web page: templates/job-quest.html with this run's jobs
 * embedded as JSON. Used by `export-jobs-xlsx.mjs --html` (a page to open in a browser)
 * and `--artifact` (the same page without a document skeleton, to publish on claude.ai).
 *
 * The page keys each "Applied" tick by the job's apply URL, so ticks carry over to the next
 * run's page wherever the same opening appears again.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'templates', 'job-quest.html');

// The same minimal skeleton claude.ai wraps a published page in, for opening the file locally.
const HEAD = '<!doctype html><html><head><meta charset=utf8>'
  + '<meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">'
  + '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
  + 'body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>';

/** Rows from export-jobs-xlsx.mjs → the compact shape the page reads. */
export function toPageJobs(jobs) {
  return jobs.map((j) => {
    const via = j.sourceName && j.sourceName !== j.company ? j.sourceName : undefined;
    return {
      title: j.title,
      company: j.company,
      via,
      group: j.source === 'job-board' ? 'board' : 'company',
      location: j.locations || 'N/A',
      posted: j.posted,
      postedAt: j.postedAt ?? null,
      repost: /\(repost\)/.test(j.posted ?? ''),
      score: j.score ?? 0,
      jd: typeof j.jdMatchPercent === 'number' ? j.jdMatchPercent : null,
      // Counts only: the skill lists themselves stay off the page, like the sheet.
      jdHit: j.jdMatchedSkills?.length ?? 0,
      jdOf: (j.jdMatchedSkills?.length ?? 0) + (j.jdMissingSkills?.length ?? 0),
      platform: j.platform,
      url: j.url || '',
    };
  });
}

export function renderJobsHtml(jobs, meta = {}) {
  const template = fs.readFileSync(TEMPLATE, 'utf8');
  const payload = {
    meta: { generatedAt: new Date().toISOString(), window: meta.window, matchedTo: meta.matchedTo, candidate: meta.candidate, resumePath: meta.resumePath },
    jobs: toPageJobs(jobs),
  };
  // `<` escaped so no job text can close the <script> it is embedded in.
  const json = JSON.stringify(payload).replace(/</g, '\u003c').replace(/\u2028/g, '\u2028').replace(/\u2029/g, '\u2029');
  const page = template.replace('__JOB_DATA__', () => json);
  return meta.standalone === false ? page : `${HEAD}${page}</body></html>\n`;
}

export async function writeJobsHtml(file, jobs, meta) {
  await fs.promises.writeFile(file, renderJobsHtml(jobs, meta), 'utf8');
}
