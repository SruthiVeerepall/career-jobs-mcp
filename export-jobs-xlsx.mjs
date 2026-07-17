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
 */
import ExcelJS from 'exceljs';
import { companyRegistry } from './dist/scrapers/company-registry.js';
import { scrapeMany } from './dist/scrapers/orchestrator.js';
import { OVER_5YR, CLEARANCE, isUSJob, matchesProfile, resumeScore } from './dist/utils/job-filters.js';

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

const outIdx = process.argv.indexOf('--out');
const OUT = outIdx !== -1 && process.argv[outIdx + 1] ? process.argv[outIdx + 1] : 'job-results.xlsx';

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
  return 'Other';
}

async function run() {
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

  const cutoff = Date.now() - WINDOW_DAYS * DAY_MS;
  const jobs = [];
  const seen = new Set();
  for (const company of results) {
    if (company.error || !company.jobs.length) continue;
    for (const job of company.jobs) {
      const title = job.title || '';
      if (OVER_5YR.test(title)) continue;
      if (CLEARANCE.test(title)) continue;
      if (!isUSJob(job.locations)) continue;
      if (!matchesProfile(title)) continue;
      if (job.postedDate) {
        const posted = new Date(job.postedDate).getTime();
        if (!isNaN(posted) && posted < cutoff) continue;
      }
      const url = job.applyUrl || '';
      const key = url || `${company.company}::${title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      jobs.push({
        title,
        // LinkedIn results carry the real hiring company in companyName
        company: company.company === 'LinkedIn' && job.companyName ? `${job.companyName} (via LinkedIn)` : company.company,
        locations: (job.locations || []).join(' | ') || 'N/A',
        posted: job.postedDate
          ? new Date(job.postedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : 'N/A',
        score: resumeScore(title),
        platform: platformOf(url),
        url,
      });
    }
  }
  jobs.sort((a, b) => b.score - a.score);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
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
    { header: 'Location', key: 'location', width: 34 },
    { header: 'Posted', key: 'posted', width: 9 },
    { header: 'Score', key: 'score', width: 7 },
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

  jobs.forEach((j, i) => {
    const row = ws.addRow({
      applied: '☐',
      num: i + 1,
      title: j.title,
      company: j.company,
      location: j.locations,
      posted: j.posted,
      score: j.score,
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
    if (j.url) row.getCell('apply').font = { color: { argb: 'FF4F46E5' }, underline: true };
  });

  const lastRow = jobs.length + 1;
  ws.autoFilter = `A1:J1`;

  // When Applied? = ☑, grey + strikethrough the whole row so done ones fade back
  ws.addConditionalFormatting({
    ref: `A2:J${lastRow}`,
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
  console.log(`  ${jobs.length} jobs  (${strong} strong, score ≥5)`);
  console.log(`  Toggle the "Applied?" cell (☐ → ☑) to mark a job done; the row greys out + strikes through.`);
}

run().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
