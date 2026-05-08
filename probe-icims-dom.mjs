import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36');
await page.goto('https://careers-sutterhealth.icims.com/jobs/search?in_iframe=1&pr=0', {
  waitUntil: 'networkidle2',
  timeout: 30000,
});

// What classes contain "Job"?
const classes = await page.evaluate(() => {
  const set = new Set();
  document.querySelectorAll('*').forEach((el) => {
    const cls = el.className || '';
    if (typeof cls === 'string' && /job/i.test(cls)) {
      cls.split(/\s+/).forEach((c) => { if (c) set.add(c); });
    }
  });
  return [...set].slice(0, 60);
});
console.log('Classes containing "job":');
console.log(classes.join('\n'));

// Try multiple selectors and count matches
const sels = [
  'tr.iCIMS_JobListingRow',
  '.iCIMS_JobsTable tr',
  '.iCIMS_JobsTable',
  '.iCIMS_JobListing',
  'a[href*="/jobs/"]',
  '.job-listing',
  '.job-item',
  '.search-result',
  '[data-job-id]',
  'a[data-job-id]',
];
console.log('\nSelector counts:');
for (const s of sels) {
  const n = await page.evaluate((sel) => document.querySelectorAll(sel).length, s);
  console.log(`  ${s.padEnd(40)} ${n}`);
}

// Dump first 3 anchors that look job-like
const anchors = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('a'))
    .filter((a) => /\/jobs\/\d+/.test(a.href || ''))
    .slice(0, 5)
    .map((a) => ({ href: a.href, text: a.textContent?.trim().slice(0, 80), parent: a.parentElement?.tagName + '.' + (a.parentElement?.className || '') }));
});
console.log('\nFirst 5 job-like anchors:');
console.log(JSON.stringify(anchors, null, 2));

// Also dump the body's first 3000 chars
const html = await page.content();
console.log('\nHTML length:', html.length);
console.log('Sample (search for jobs):');
const idx = html.toLowerCase().search(/iframe|job|<table/);
console.log(html.slice(Math.max(0, idx - 100), idx + 1500));

await browser.close();
