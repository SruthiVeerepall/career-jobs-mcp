/**
 * export-jobs-xlsx.mjs
 * Runs the same resume-match search as find-java-24h.mjs, then writes the results
 * to an Excel workbook (job-results.xlsx) with:
 *   - a clickable "Apply" hyperlink per row
 *   - an "Applied?" checkbox column (☐ / ☑) you can toggle to track applications
 *   - applied rows auto-strikethrough + greyed via conditional formatting
 *   - frozen header, autofilter, and sensible column widths
 *
 * Flags mirror find-java-24h.mjs:  --today (24h) | --week (7d) | default 3 days
 * Output path override:            --out <path>
 * Resume-driven search:            --resume <path to .pdf/.docx/.txt/.md>
 *
 * With --resume, every filter is derived from that resume instead of the profile baked
 * into job-filters.js, so the workbook can be produced for any candidate.
 *
 * With --resume, each job's DESCRIPTION is also scored against the resume's skills
 * ("JD Match %"). Company career sites still come first and job portals after; within
 * each group jobs are sorted best fit first, and those whose description could not be
 * read sit at the bottom of their group as "N/A".
 * Drop weak fits:                   --min-jd-match <percent>   (unscorable jobs are kept)
 */
import ExcelJS from 'exceljs';
import { companyRegistry } from './dist/scrapers/company-registry.js';
import { scrapeMany } from './dist/scrapers/orchestrator.js';
import { OVER_5YR, CLEARANCE, isUSJob, matchesProfile, resumeScore } from './dist/utils/job-filters.js';
import { parsePostedDate } from './dist/utils/posted-date.js';
import { searchJobsForResume } from './dist/resume/search.js';
import { byJdMatch } from './dist/resume/jd-match.js';
import { screenRequirements } from './dist/utils/requirement-screen.js';
import { JOB_BOARDS, bySourceThenScore, companySitesFirst, crossSourceKey, sourceOf } from './dist/utils/source-priority.js';

const ALL_SLUGS = [...companyRegistry.companies.values()]
  .filter(c => c.platform !== 'custom' && c.platform !== 'oracle-orc')
  .map(c => c.slug);

const DAY_MS = 86_400_000;
const WINDOW_DAYS = process.argv.includes('--today') ? 1
  : process.argv.includes('--week') ? 7
  : 3;
const WINDOW_LABEL = WINDOW_DAYS === 1 ? '24 hours' : `${WINDOW_DAYS} days`;
const API_SINCE = WINDOW_DAYS <= 1 ? 'today' : 'week';
const CONCURRENCY = Number(process.env.SCRAPE_CONCURRENCY ?? 24);

function flagValue(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : undefined;
}

const OUT = flagValue('out') ?? 'job-results.xlsx';
const RESUME = flagValue('resume');
const MIN_JD_MATCH = flagValue('min-jd-match') !== undefined ? Number(flagValue('min-jd-match')) : undefined;
if (MIN_JD_MATCH !== undefined && !Number.isFinite(MIN_JD_MATCH)) {
  console.error('--min-jd-match needs a number, e.g. --min-jd-match 50');
  process.exit(1);
}


function platformOf(u) {
  if (/greenhouse/.test(u)) return 'Greenhouse';
  if (/lever\.co/.test(u)) return 'Lever';
  if (/ashby/.test(u)) return 'Ashby';
  if (/myworkdayjobs|workday/.test(u)) return 'Workday';
  if (/smartrecruiters/.test(u)) return 'SmartRecruiters';
  if (/icims/.test(u)) return 'iCIMS';
  if (/amazon\.jobs/.test(u)) return 'Amazon';
  if (/apple\.com/.test(u)) return 'Apple';
  if (/linkedin\.com/.test(u)) return 'LinkedIn';
  if (/simplyhired\.com/.test(u)) return 'SimplyHired';
  if (/builtin\.com/.test(u)) return 'BuiltIn';
  if (/remoteok\.com/i.test(u)) return 'RemoteOK';
  if (/remotive\.com/.test(u)) return 'Remotive';
  if (/weworkremotely\.com/.test(u)) return 'WeWorkRemotely';
  return 'Other';
}

/**
 * Resume-driven collection. Returns rows in the same shape as the legacy path so the
 * workbook builder below is identical either way.
 */
async function collectFromResume() {
  console.log(`\nExporting jobs matched against ${RESUME} — last ${WINDOW_LABEL}`);
  const start = Date.now();
  const result = await searchJobsForResume({
    resumePath: RESUME,
    postedWithinDays: WINDOW_DAYS,
    concurrency: CONCURRENCY,
    onProgress: (done, total) => {
      if (done % 100 === 0 || done === total) process.stderr.write(`  ${done}/${total} sources done\n`);
      if (done === total) process.stderr.write(`  Reading job descriptions for JD match — new LinkedIn postings are paced, up to ~2 min; already-seen ones come from the cache...\n`);
    },
    onDescriptionProgress: (done, total) => {
      if (done % 48 === 0 || done === total) process.stderr.write(`  ${done}/${total} job descriptions read\n`);
    },
  });

  const p = result.profile;
  console.log(`Profile: ${p.name ?? 'candidate'} — ${p.yearsOfExperience ?? '?'} yrs | ${p.families.join(', ')} | ${p.minLevel}–${p.maxLevel} | ${p.country}`);
  console.log(`Search terms: ${p.searchTerms.join(', ')}`);
  for (const note of p.notes) console.log(`  ! ${note}`);
  for (const f of result.meta.failedBoards) {
    console.log(`  !! ${f.company} FAILED — contributed 0 rows this run: ${f.error}`);
  }
  if (result.stats.droppedUndated > 0) {
    console.log(`Excluded ${result.stats.droppedUndated} postings whose source published no usable date (age unverifiable).`);
  }
  if (result.stats.droppedByRequirement > 0) {
    console.log(`Excluded ${result.stats.droppedByRequirement} postings whose description requires a security clearance or US citizenship.`);
  }
  if (result.stats.requirementUnverified > 0) {
    console.log(`${result.stats.requirementUnverified} kept postings had no readable description — clearance/citizenship unchecked.`);
  }

  let jobs = result.matches.map((m) => ({
    title: m.title,
    company: m.company,
    // The portal for a board listing, the employer for a direct career-site listing.
    sourceName: m.via ?? m.company,
    locations: m.locations,
    posted: m.postedDate,
    score: m.score,
    jdMatchPercent: m.jdMatchPercent ?? null,
    jdMatchStatus: m.jdMatchStatus,
    jdMatchedSkills: m.jdMatchedSkills ?? [],
    source: m.source,
    platform: platformOf(m.applyUrl),
    url: m.applyUrl,
  }));

  if (MIN_JD_MATCH !== undefined) {
    const before = jobs.length;
    jobs = jobs.filter((j) => j.jdMatchPercent === null || j.jdMatchPercent >= MIN_JD_MATCH);
    console.log(`Dropped ${before - jobs.length} jobs whose description matched the resume below ${MIN_JD_MATCH}%.`);
  }
  const unscored = jobs.filter((j) => j.jdMatchPercent === null).length;
  if (unscored > 0) {
    console.log(`${unscored} jobs had no readable description (or named no known skill) — kept at the bottom of their group as "N/A".`);
  }
  // Company career sites first, job portals after; best description fit first within each.
  jobs.sort((a, b) =>
    Number(a.source === 'job-board') - Number(b.source === 'job-board') || byJdMatch(a, b) || b.score - a.score);

  return { jobs, elapsed: ((Date.now() - start) / 1000).toFixed(1) };
}

async function collectFromRegistryProfile() {
  console.log(`\nExporting resume-match jobs — last ${WINDOW_LABEL} | Junior–Senior | US | No clearance | ≥60% match`);
  console.log(`Fetch-once: ${ALL_SLUGS.length} companies | ${CONCURRENCY} concurrent | window=${API_SINCE}\n`);

  const start = Date.now();
  const results = await scrapeMany(
    ALL_SLUGS,
    { postedSince: API_SINCE },
    {
      concurrency: CONCURRENCY,
      onProgress: (done, total) => {
        if (done % 100 === 0 || done === total) process.stderr.write(`  ${done}/${total} companies done\n`);
      },
    },
  );

  // Name the job boards when they fail — they supply most rows, so a silent LinkedIn 429
  // is indistinguishable from "nothing matched" unless it is called out.
  for (const f of results.filter(r => r.error && JOB_BOARDS.has(r.company))) {
    console.log(`  !! ${f.company} FAILED — contributed 0 rows this run: ${f.error}`);
  }

  const cutoff = Date.now() - WINDOW_DAYS * DAY_MS;
  const jobs = [];
  const seen = new Set();
  const seenOpening = new Set();
  // The orchestrator drops undated postings before we see them, so take its count.
  let undatedDropped = results.reduce((n, r) => n + (r.undatedExcluded ?? 0), 0);
  // Company sites first, so a board repost of an opening already found on the employer's
  // own site is the copy dropped by the cross-source dedupe below.
  for (const company of companySitesFirst(results)) {
    if (company.error || !company.jobs.length) continue;
    for (const job of company.jobs) {
      const title = job.title || '';
      if (OVER_5YR.test(title)) continue;
      if (CLEARANCE.test(title)) continue;
      if (!isUSJob(job.locations)) continue;
      if (!matchesProfile(title)) continue;
      // Strict: undated/unparseable postings cannot be shown to be inside the window.
      // `windowVerified` sources already applied the window with a real timestamp.
      const posted = parsePostedDate(job.postedDate);
      if (!job.windowVerified) {
        if (posted === null) {
          undatedDropped++;
          continue;
        }
        if (posted < cutoff) continue;
      }
      const url = job.applyUrl || '';
      const key = url || `${company.company}::${title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Job-board results carry the real hiring company in companyName
      const employer = JOB_BOARDS.has(company.company) && job.companyName && job.companyName !== company.company
        ? job.companyName
        : company.company;
      const opening = crossSourceKey(employer, title);
      if (seenOpening.has(opening)) continue;
      seenOpening.add(opening);
      jobs.push({
        title,
        company: employer,
        sourceName: JOB_BOARDS.has(company.company) ? company.company : employer,
        source: sourceOf(company.company),
        locations: (job.locations || []).join(' | ') || 'N/A',
        // "(repost)" marks a republished listing — date is the repost time, opening may
        // be older. See JobListing.isRepost.
        // UTC on purpose — see find-java-24h.mjs: local formatting shifted date-only
        // sources a day earlier and made in-window jobs look stale.
        posted:
          (posted === null
            ? 'within window'
            : new Date(posted).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                timeZone: 'UTC',
              })) + (job.isRepost ? ' (repost)' : ''),
        score: resumeScore(title),
        listing: job,
        platform: platformOf(url),
        url,
      });
    }
  }
  // Company career sites first (direct employer postings are the priority), boards after.
  jobs.sort(bySourceThenScore);
  // CLAUDE.md rule #4 on the DESCRIPTION: the title check above only catches titles like
  // "Engineer (TS/SCI)"; "Must be a U.S. citizen" / "Secret clearance required" live in the body.
  const screened = await screenRequirements(jobs, (j) => j.listing);
  jobs.splice(0, jobs.length, ...screened.kept);
  if (screened.blocked.length > 0) {
    console.log(`Excluded ${screened.blocked.length} postings whose description requires a security clearance or US citizenship.`);
  }
  if (screened.unverified > 0) {
    console.log(`${screened.unverified} kept postings had no readable description — clearance/citizenship unchecked.`);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  if (undatedDropped > 0) {
    console.log(`Excluded ${undatedDropped} postings whose source published no usable date (age unverifiable).`);
  }
  return { jobs, elapsed };
}

async function run() {
  const { jobs, elapsed } = RESUME ? await collectFromResume() : await collectFromRegistryProfile();

  console.log(`\nFound ${jobs.length} jobs in ${elapsed}s. Writing ${OUT}...`);

  // ---- Build the workbook -------------------------------------------------
  const wb = new ExcelJS.Workbook();
  wb.creator = 'career-jobs-mcp';
  wb.created = new Date();
  const ws = wb.addWorksheet('Jobs', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  ws.columns = [
    { header: 'Applied?', key: 'applied', width: 10 },
    { header: '#', key: 'num', width: 5 },
    { header: 'Title', key: 'title', width: 52 },
    { header: 'Company', key: 'company', width: 20 },
    { header: 'Source', key: 'source', width: 20 },
    { header: 'Location', key: 'location', width: 34 },
    { header: 'Posted', key: 'posted', width: 9 },
    { header: 'Score', key: 'score', width: 7 },
    { header: 'JD Match %', key: 'jdMatch', width: 11 },
    { header: 'Platform', key: 'platform', width: 15 },
    { header: 'Apply', key: 'apply', width: 12 },
    { header: 'Apply URL', key: 'url', width: 60 },
  ];

  // Header styling
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.alignment = { vertical: 'middle' };
  header.height = 20;
  header.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    c.alignment = { vertical: 'middle', horizontal: 'left' };
  });

  const scoreFill = s => s >= 20 ? 'FFD1FAE5' : s >= 10 ? 'FFCFF5FB' : s >= 7 ? 'FFE8E7FD' : s >= 5 ? 'FFFCEBCF' : 'FFEEF1F6';
  const scoreFont = s => s >= 20 ? 'FF059669' : s >= 10 ? 'FF0891B2' : s >= 7 ? 'FF4F46E5' : s >= 5 ? 'FFB45309' : 'FF64748B';

  // Green = strong description fit, amber = partial, red = weak, grey = could not score.
  const jdFill = p => p === null || p === undefined ? 'FFEEF1F6' : p >= 70 ? 'FFD1FAE5' : p >= 40 ? 'FFFCEBCF' : 'FFFDE2E2';
  const jdFont = p => p === null || p === undefined ? 'FF64748B' : p >= 70 ? 'FF059669' : p >= 40 ? 'FFB45309' : 'FFDC2626';

  jobs.forEach((j, i) => {
    const hasJd = typeof j.jdMatchPercent === 'number';
    const row = ws.addRow({
      applied: '☐',
      num: i + 1,
      title: j.title,
      company: j.company,
      source: j.sourceName,
      location: j.locations,
      posted: j.posted,
      score: j.score,
      // A real number so the column sorts/filters numerically in Excel.
      jdMatch: hasJd ? j.jdMatchPercent / 100 : (RESUME ? 'N/A' : ''),
      platform: j.platform,
      apply: j.url ? { text: 'Apply ↗', hyperlink: j.url } : '',
      url: j.url,
    });
    row.getCell('applied').alignment = { horizontal: 'center' };
    row.getCell('applied').font = { size: 13 };
    // checkbox-style dropdown: pick ☐ (not applied) or ☑ (applied)
    row.getCell('applied').dataValidation = {
      type: 'list', allowBlank: false, formulae: ['"☐,☑"'],
      showErrorMessage: true, errorTitle: 'Pick one', error: 'Choose ☐ or ☑',
    };
    const sc = row.getCell('score');
    sc.alignment = { horizontal: 'center' };
    sc.font = { bold: true, color: { argb: scoreFont(j.score) } };
    sc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: scoreFill(j.score) } };
    if (RESUME) {
      const jc = row.getCell('jdMatch');
      jc.numFmt = '0%';
      jc.alignment = { horizontal: 'center' };
      jc.font = { bold: true, color: { argb: jdFont(j.jdMatchPercent) } };
      jc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: jdFill(j.jdMatchPercent) } };
    }
    if (j.url) row.getCell('apply').font = { color: { argb: 'FF4F46E5' }, underline: true };
  });

  const lastRow = jobs.length + 1;
  const lastCol = ws.getColumn(ws.columns.length).letter;
  ws.autoFilter = `A1:${lastCol}1`;

  // When Applied? = ☑, grey + strikethrough the whole row so done ones fade back
  ws.addConditionalFormatting({
    ref: `A2:${lastCol}${lastRow}`,
    rules: [{
      type: 'expression',
      formulae: ['$A2="☑"'],
      style: { font: { strike: true, color: { argb: 'FF9AA0A6' } } },
      priority: 1,
    }],
  });

  await wb.xlsx.writeFile(OUT);
  const strong = jobs.filter(j => j.score >= 5).length;
  console.log(`\nDone. ${OUT}`);
  const fromCompanies = jobs.filter(j => j.source !== 'job-board').length;
  console.log(`  ${jobs.length} jobs  (${strong} strong, score ≥5)`);
  if (RESUME) {
    const jd70 = jobs.filter(j => (j.jdMatchPercent ?? -1) >= 70).length;
    const jd40 = jobs.filter(j => (j.jdMatchPercent ?? -1) >= 40 && j.jdMatchPercent < 70).length;
    console.log(`  JD match: ${jd70} strong (≥70%), ${jd40} partial (40–69%) — best fit first within each group`);
  }
  console.log(`  ${fromCompanies} from company career sites (listed first), ${jobs.length - fromCompanies} from job boards`);
  console.log(`  Toggle the "Applied?" cell (☐ → ☑) to mark a job done; the row greys out + strikes through.`);
}

run()
  .catch(err => { console.error('Fatal:', err.message); process.exitCode = 1; })
  // Close the shared headless Chrome, or an open browser keeps the process alive after
  // the results are printed.
  .finally(() => import('./dist/utils/browser.js').then((m) => m.closeSharedBrowser()));
