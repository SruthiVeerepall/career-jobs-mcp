/**
 * intercept-career-apis.mjs
 * Uses Puppeteer to intercept the actual AJAX/XHR requests made by SAP, Deloitte, and Infosys
 * career portals when searching for jobs. Captures request URL, method, headers, and body.
 */
import puppeteer from 'puppeteer';

const TIMEOUT = 45000;

async function interceptSite(label, url, searchAction) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${label}] Opening: ${url}`);
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

  const captured = [];

  // Intercept all network requests
  await page.setRequestInterception(true);
  page.on('request', req => {
    const u = req.url();
    const method = req.method();
    const postData = req.postData();
    // Capture XHR/fetch (not images/fonts/css)
    const rt = req.resourceType();
    if (['xhr', 'fetch', 'document'].includes(rt)) {
      captured.push({ phase: 'request', url: u, method, postData: postData || null, headers: req.headers() });
      if (['xhr', 'fetch'].includes(rt)) {
        console.log(`  [REQ ${method}] ${u}`);
        if (postData) console.log(`    body: ${postData.substring(0, 400)}`);
      }
    }
    req.continue();
  });

  page.on('response', async resp => {
    const u = resp.url();
    const status = resp.status();
    const ct = resp.headers()['content-type'] || '';
    if (ct.includes('json') && !u.includes('google') && !u.includes('analytics') && !u.includes('segment')) {
      try {
        const text = await resp.text();
        const snippet = text.substring(0, 600);
        captured.push({ phase: 'response', url: u, status, snippet });
        console.log(`  [RESP ${status}] ${u}`);
        console.log(`    preview: ${snippet}`);
      } catch {}
    }
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: TIMEOUT });
    if (searchAction) {
      console.log(`  [${label}] Running search action...`);
      await searchAction(page);
      await new Promise(r => setTimeout(r, 8000));
    }
  } catch (err) {
    console.log(`  [${label}] Navigation error: ${err.message}`);
  }

  await browser.close();
  return captured;
}

async function run() {
  // --- SAP ---
  await interceptSite('SAP', 'https://jobs.sap.com/search/', async (page) => {
    try {
      // Try to find and fill the search box
      await page.waitForSelector('input[type="text"], input[name*="keyword"], input[placeholder*="Search"], #keyword', { timeout: 10000 });
      const inputSel = await page.$('input[name="keyword"]') || await page.$('input[type="text"]');
      if (inputSel) {
        await inputSel.click({ clickCount: 3 });
        await inputSel.type('Java Software Engineer');
      }
      // Try to select country filter
      const countrySelectors = ['select[name="country"]', '#country', 'select[id*="country"]'];
      for (const sel of countrySelectors) {
        try {
          await page.select(sel, 'USA');
          break;
        } catch {}
      }
      // Submit
      const btnSel = 'button[type="submit"], input[type="submit"], .search-button, [data-action="search"]';
      const btn = await page.$(btnSel);
      if (btn) await btn.click();
      else await page.keyboard.press('Enter');
    } catch (e) {
      console.log(`  [SAP] search action error: ${e.message}`);
    }
  });

  // --- Deloitte ---
  await interceptSite('Deloitte', 'https://apply.deloitte.com/en_US/careers/SearchJobs?sort=relevancy', async (page) => {
    try {
      // Wait for results to load, then try search
      await page.waitForSelector('input, .search-field', { timeout: 12000 });
      // Try keyword search
      const kw = await page.$('input[name*="keyword"], input[placeholder*="keyword"], input[placeholder*="search"], #keyword-input');
      if (kw) {
        await kw.click({ clickCount: 3 });
        await kw.type('Java Software Engineer');
        await page.keyboard.press('Enter');
      }
    } catch (e) {
      console.log(`  [Deloitte] search action error: ${e.message}`);
    }
  });

  // --- Infosys ---
  await interceptSite('Infosys', 'https://career.infosys.com/joblist', async (page) => {
    try {
      await page.waitForSelector('input, .search-box', { timeout: 12000 });
      const kw = await page.$('input[type="text"], input[name*="keyword"], input[placeholder*="Search"]');
      if (kw) {
        await kw.click({ clickCount: 3 });
        await kw.type('Java');
      }
      // Location filter
      const loc = await page.$('input[placeholder*="location"], input[name*="location"], select[name*="location"]');
      if (loc) {
        const tag = await loc.evaluate(el => el.tagName.toLowerCase());
        if (tag === 'select') await page.select('select[name*="location"]', 'United States');
        else { await loc.click({ clickCount: 3 }); await loc.type('United States'); }
      }
      const btn = await page.$('button[type="submit"], .search-btn, [class*="search"]');
      if (btn) await btn.click();
      else await page.keyboard.press('Enter');
    } catch (e) {
      console.log(`  [Infosys] search action error: ${e.message}`);
    }
  });

  console.log('\nDone. Review the captured requests above to find the correct API endpoints and POST bodies.');
}

run().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
