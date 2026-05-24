/**
 * deloitte-puppeteer.mjs
 * Uses Puppeteer to capture actual job listing API calls from Deloitte's Avature ATS.
 * Waits for network idle then searches and captures the JSON response.
 */
import puppeteer from 'puppeteer';

const OVER_5YR = /\bprincipal\b|\bstaff\b|\blead\b|\barchitect\b|\bdirector\b|\bvp\b|\bvice president\b|\bhead of\b|\bmanager\b|\bexecutive\b|\bdistinguished\b|\bfellow\b/i;
const EXCLUDE_ROLES = /\b(data scientist|machine learning|ml engineer|devops engineer|qa engineer|test engineer|security engineer|network engineer|dba|data engineer|product manager|scrum master|business analyst|data analyst|solution sales|sales expert|marketing|recruiter|solution advisor|category expert)\b/i;
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

async function run() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

  const capturedJobs = [];
  const capturedResponses = [];

  await page.setRequestInterception(true);
  page.on('request', req => req.continue());
  page.on('response', async resp => {
    const url = resp.url();
    if (!url.includes('SearchJobs') && !url.includes('jobs') && !url.includes('career')) return;
    const ct = resp.headers()['content-type'] || '';
    if (!ct.includes('json')) return;
    try {
      const text = await resp.text();
      capturedResponses.push({ url, status: resp.status(), body: text });
    } catch {}
  });

  console.log('Loading Deloitte careers page...');
  try {
    await page.goto('https://apply.deloitte.com/en_US/careers/SearchJobs?sort=relevancy', {
      waitUntil: 'networkidle0',
      timeout: 60000,
    });
  } catch (e) {
    console.log(`Page load: ${e.message}`);
  }

  // Check what loaded
  const title = await page.title();
  console.log(`Page title: ${title}`);

  // Try to find a search input and type "java"
  try {
    await page.waitForSelector('input[type="text"], input[type="search"], input[name="keyword"], .search-input', { timeout: 10000 });
    const input = await page.$('input[type="text"]') || await page.$('input[type="search"]');
    if (input) {
      console.log('Found input, typing "Java Software Engineer"...');
      await input.click({ clickCount: 3 });
      await input.type('Java Software Engineer');
      await page.keyboard.press('Enter');
      await page.waitForNetworkIdle({ timeout: 15000 }).catch(() => {});
    }
  } catch (e) {
    console.log(`Search input: ${e.message}`);
  }

  // Try executing XHR from page context
  console.log('\nAttempting in-page XHR...');
  const xhrResult = await page.evaluate(async () => {
    try {
      const resp = await fetch('/en_US/careers/SearchJobsJSON/?sort=relevancy&keyword=Java', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
        },
      });
      const text = await resp.text();
      return { status: resp.status, body: text.substring(0, 2000) };
    } catch (e) {
      return { status: 0, body: e.message };
    }
  });
  console.log(`In-page XHR: ${xhrResult.status} | ${xhrResult.body.substring(0, 500)}`);

  // Also try GET without keyword
  const xhrResult2 = await page.evaluate(async () => {
    try {
      const resp = await fetch('/en_US/careers/SearchJobsJSON/?sort=relevancy', {
        method: 'GET',
        credentials: 'include',
        headers: { 'Accept': 'application/json, */*', 'X-Requested-With': 'XMLHttpRequest' },
      });
      const text = await resp.text();
      return { status: resp.status, body: text.substring(0, 2000) };
    } catch (e) {
      return { status: 0, body: e.message };
    }
  });
  console.log(`In-page XHR (no keyword): ${xhrResult2.status} | ${xhrResult2.body.substring(0, 800)}`);

  // Check all captured responses
  console.log(`\nCaptured JSON responses: ${capturedResponses.length}`);
  for (const r of capturedResponses) {
    console.log(`  [${r.status}] ${r.url}`);
    console.log(`    ${r.body.substring(0, 400)}`);
  }

  // Also check current URL and page content
  const currentUrl = page.url();
  console.log(`\nCurrent URL: ${currentUrl}`);

  await browser.close();

  // Parse in-page XHR result if it worked
  if (xhrResult.status === 200 || xhrResult2.status === 200) {
    const body = xhrResult.status === 200 ? xhrResult.body : xhrResult2.body;
    try {
      const p = JSON.parse(body);
      const jobs = p.jobs || p.content || p.results || p.items || [];
      console.log(`\nDeloitte jobs found: ${jobs.length}`);
      for (const j of jobs) {
        console.log(`  ${j.title || j.name || JSON.stringify(j).substring(0, 100)}`);
      }
    } catch (e) {
      console.log(`Parse error: ${e.message}`);
    }
  }
}

run().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
