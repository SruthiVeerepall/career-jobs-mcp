#!/usr/bin/env node
/**
 * find-jobs-for-resume.mjs
 * Resume in → ranked list of job apply links out.
 *
 * Unlike find-java-24h.mjs, nothing about the candidate is hard-coded here: the skills that
 * score, the role families allowed, the seniority band, the keywords the job boards are
 * queried with, and the country restriction are all read out of the resume file.
 *
 * Usage:
 *   node find-jobs-for-resume.mjs --resume ./resume.pdf
 *   node find-jobs-for-resume.mjs --resume ./resume.docx --today
 *   node find-jobs-for-resume.mjs --resume ./resume.txt --week --limit 50
 *   node find-jobs-for-resume.mjs --resume ./resume.pdf --profile-only
 *   node find-jobs-for-resume.mjs --resume ./resume.pdf --json > jobs.json
 *
 * Options:
 *   --resume <path>   Resume file (.pdf, .docx, .txt, .md, .html). Required.
 *   --today           24-hour window (default 3 days)
 *   --week            7-day window
 *   --days <n>        Custom window in days
 *   --limit <n>       Cap the number of results
 *   --years <n>       Override the years of experience read from the resume
 *   --country <code>  Override the country restriction (US, CA, ANY, …)
 *   --remote-only     Remote postings only
 *   --profile-only    Print the parsed profile and exit without searching
 *   --json            Emit JSON instead of the markdown table
 */
import { searchJobsForResume, profileFromResume } from './dist/resume/search.js';
import { renderSearchResult, renderProfile } from './dist/resume/render.js';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : fallback;
}
const has = (name) => process.argv.includes(`--${name}`);

const resumePath = arg('resume');
if (!resumePath) {
  console.error('Missing --resume <path>. Example: node find-jobs-for-resume.mjs --resume ./resume.pdf');
  process.exit(1);
}

const windowDays = has('today') ? 1 : has('week') ? 7 : Number(arg('days', 3));
const asJson = has('json');

const options = {
  resumePath,
  postedWithinDays: windowDays,
  limit: arg('limit') ? Number(arg('limit')) : undefined,
  yearsOfExperience: arg('years') ? Number(arg('years')) : undefined,
  country: arg('country'),
  remoteOnly: has('remote-only'),
};

async function run() {
  if (has('profile-only')) {
    const { profile, source, format } = await profileFromResume(options);
    if (asJson) {
      console.log(JSON.stringify({ source, format, profile }, null, 2));
    } else {
      console.log(`\nParsed ${source} (${format})\n`);
      console.log(renderProfile(profile));
      console.log();
    }
    return;
  }

  if (!asJson) {
    process.stderr.write(`Reading ${resumePath} …\n`);
  }

  const result = await searchJobsForResume({
    ...options,
    onProgress: asJson
      ? undefined
      : (done, total) => {
          if (done % 25 === 0 || done === total) process.stderr.write(`  ${done}/${total} sources done\n`);
        },
  });

  if (asJson) {
    console.log(JSON.stringify(
      { profile: result.profile, matches: result.matches, stats: result.stats, meta: result.meta },
      null,
      2,
    ));
    return;
  }

  console.log(`\n${renderSearchResult(result)}\n`);
}

run().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
