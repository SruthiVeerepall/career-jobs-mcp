/**
 * deloitte-scrape.mjs
 * Scrapes Deloitte job listings via DOM. Searches for Java/Full Stack/Software Engineer.
 * Pages through results and applies CLAUDE.md profile filters.
 */
import puppeteer from 'puppeteer';

const OVER_5YR = /\bprincipal\b|\bstaff\b|\blead\b|\barchitect\b|\bdirector\b|\bvp\b|\bvice president\b|\bhead of\b|\bmanager\b|\bexecutive\b|\bdistinguished\b|\bfellow\b/i;
const EXCLUDE_ROLES = /\b(data scientist|machine learning|ml engineer|devops engineer|qa engineer|test engineer|security engineer|network engineer|dba|data engineer|product manager|scrum master|business analyst|data analyst|solution sales|sales expert|marketing associate|recruiter|solution advisor|category expert|specialist manager|delivery manager|project lead|project manager|tax|audit|consulting|advisory|accounting|finance)\b/i;
const TARGET_ROLES = /\b(java|full.?stack|fullstack|software engineer|software developer|backend|back.end|application developer)\b/i;
const RESUME_WEIGHTS = [
  { p: /\bjava\b/i, w: 10 }, { p: /\bspring boot\b/i, w: 10 },
  { p: /\bspring\b/i, w: 7 }, { p: /\bmicroservices?\b/i, w: 7 }, { p: /\bfull.?stack\b/i, w: 7 },
  { p: /\bangular\b/i, w: 5 }, { p: /\breact\b/i, w: 5 }, { p: /\baws\b/i, w: 5 },
  { p: /\brest(ful)?\b/i, w: 5 }, { p: /\bcloud\b/i, w: 5 },
  { p: /\bdocker\b/i, w: 3 }, { p: /\bkubernetes\b/i, w: 3 },
];
function scoreJob(title) { return RESUME_WEIGHTS.reduce((s, {p, w}) => s + (p.test(title) ? w : 0), 0); }
function matches(title) {
  if (OVER_5YR.test(title) || EXCLUDE_ROLES.test(title)) return false;
  const s = scoreJob(title);
  return s >= 5 || (s === 0 && TARGET_ROLES.test(title));
}

function extractJobs(page) {
  return page.evaluate(() => {
    const jobs = [];
    const items = document.querySelectorAll('.article--result');
    items.forEach(item => {
      const titleEl = item.querySelector('h2 a, h3 a, .title a, a.link, a[href*="JobDetail"]');
      const locEl = item.querySelector('[class*="location"], [class*="city"], .location, .city, dd, .article__body p');
      const dateEl = item.querySelector('[class*="date"], [class*="posted"], time');
      const title = titleEl?.textContent?.trim() || '';
      const link = titleEl?.href || item.querySelector('a')?.href || '';
      const location = locEl?.textContent?.trim() || '';
      const posted = dateEl?.textContent?.trim() || '';
      if (title) jobs.push({ title, location, link, posted });
    });
    return jobs;
  });
}

async function scrapeDeloitteSearch(browser, searchUrl, label) {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36');

  const allFound = [];
  let url = searchUrl;
  let pageNum = 1;

  while (true) {
    console.error(`  [${label}] Page ${pageNum}: ${url}`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      console.error(`  [${label}] Load error: ${e.message}`);
      break;
    }

    const jobs = await extractJobs(page);
    console.error(`  [${label}] Found ${jobs.length} jobs on page ${pageNum}`);
    if (jobs.length === 0) break;

    allFound.push(...jobs);

    // Check for next page link
    const nextUrl = await page.evaluate(() => {
      const nextLink = document.querySelector('a[rel="next"], .next a, [class*="next"] a, a[class*="next"]');
      return nextLink?.href || null;
    });
    if (!nextUrl || pageNum >= 10) break; // max 10 pages
    url = nextUrl;
    pageNum++;
  }

  await page.close();
  return allFound;
}

async function run() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const allRaw = [];
  const searchTerms = [
    { label: 'java', url: 'https://apply.deloitte.com/en_US/careers/SearchJobs/java?sort=relevancy' },
    { label: 'fullstack', url: 'https://apply.deloitte.com/en_US/careers/SearchJobs/full-stack?sort=relevancy' },
    { label: 'software-engineer', url: 'https://apply.deloitte.com/en_US/careers/SearchJobs/software-engineer?sort=relevancy' },
    { label: 'backend', url: 'https://apply.deloitte.com/en_US/careers/SearchJobs/backend-developer?sort=relevancy' },
  ];

  for (const { label, url } of searchTerms) {
    const jobs = await scrapeDeloitteSearch(browser, url, label);
    allRaw.push(...jobs);
  }

  await browser.close();

  // Dedup and filter
  const seen = new Set();
  const matched = [];
  for (const job of allRaw) {
    const key = job.link || job.title;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!matches(job.title)) continue;
    matched.push({ ...job, score: scoreJob(job.title) });
  }

  matched.sort((a, b) => b.score - a.score);

  console.log(`\nDeloitte matching jobs: ${matched.length} (raw: ${allRaw.length})`);
  if (matched.length === 0) {
    console.log('| # | Title | Location | Posted | Score | Apply |');
    console.log('|---|-------|----------|--------|-------|-------|');
    console.log('| - | No matching jobs found | - | - | - | - |');
    // Show what WAS found for debugging
    console.log('\nRaw unfiltered titles (first 20):');
    allRaw.slice(0, 20).forEach(j => console.log(`  [${matches(j.title) ? 'MATCH' : 'skip'}] ${j.title}`));
  } else {
    console.log('| # | Title | Location | Posted | Score | Apply |');
    console.log('|---|-------|----------|--------|-------|-------|');
    matched.forEach((j, i) => {
      const t = j.title.replace(/\|/g, '-').substring(0, 65);
      const l = (j.location || 'US').replace(/\|/g, '/').substring(0, 45);
      const url = j.link ? `[Apply](${j.link})` : 'N/A';
      console.log(`| ${i+1} | ${t} | ${l} | ${j.posted || 'N/A'} | ${j.score} | ${url} |`);
    });
  }
}

run().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
