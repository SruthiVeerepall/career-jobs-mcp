/**
 * deloitte-dom.mjs
 * Extracts Deloitte job listings from the server-rendered HTML DOM.
 */
import puppeteer from 'puppeteer';

async function run() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36');

  // Intercept all JSON responses
  const jsonResponses = [];
  page.on('response', async resp => {
    const ct = resp.headers()['content-type'] || '';
    const url = resp.url();
    if (ct.includes('json') && !url.includes('analytics') && !url.includes('demdex') && !url.includes('clarity') && !url.includes('adobe')) {
      try {
        const text = await resp.text();
        jsonResponses.push({ url, status: resp.status(), body: text });
      } catch {}
    }
  });

  console.log('Loading...');
  await page.goto('https://apply.deloitte.com/en_US/careers/SearchJobs?sort=relevancy', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  }).catch(e => console.log(`Load: ${e.message}`));

  // Wait extra time for JS to run and make API calls
  await new Promise(r => setTimeout(r, 10000));

  console.log(`JSON responses captured: ${jsonResponses.length}`);
  for (const r of jsonResponses) {
    console.log(`  [${r.status}] ${r.url}`);
    console.log(`    ${r.body.substring(0, 300)}`);
  }

  // Extract job listings from DOM
  const jobs = await page.evaluate(() => {
    const results = [];

    // Try various Avature selectors
    const selectors = [
      '.article--result',
      '.job-result',
      '.search-result',
      '[data-ph-id]',
      '.result-item',
      'article.result',
      '.careers-results li',
      '.job-listing',
      'tr.data-row',
      '.listRow',
    ];

    for (const sel of selectors) {
      const items = document.querySelectorAll(sel);
      if (items.length > 0) {
        results.push({ selector: sel, count: items.length });
        items.forEach(item => {
          const title = item.querySelector('h2, h3, .title, [class*="title"], a')?.textContent?.trim();
          const location = item.querySelector('[class*="location"], [class*="city"]')?.textContent?.trim();
          const link = item.querySelector('a')?.href;
          if (title) results.push({ title, location, link });
        });
        break;
      }
    }

    // If no jobs found, check what's actually on the page
    if (results.length === 0) {
      const allText = document.body.innerText?.substring(0, 2000);
      results.push({ pageText: allText });

      // Check for any h2/h3 elements
      const headings = [...document.querySelectorAll('h2, h3')].map(h => h.textContent.trim()).slice(0, 20);
      results.push({ headings });
    }

    return results;
  });

  console.log('\nDOM extraction:');
  console.log(JSON.stringify(jobs, null, 2));

  // Also try to get the page HTML structure
  const html = await page.content();
  const relevantHtml = html.includes('Software') || html.includes('Engineer') ?
    html.match(/.{0,200}(Software|Engineer|Java).{0,200}/g)?.slice(0, 5)?.join('\n') :
    'No relevant content found';
  console.log('\nRelevant HTML snippets:');
  console.log(relevantHtml?.substring(0, 1000) || 'none');

  await browser.close();
}

run().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
