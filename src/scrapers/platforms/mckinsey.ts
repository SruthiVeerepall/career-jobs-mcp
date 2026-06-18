import puppeteer, { type Browser } from 'puppeteer';
import type { JobListing, SearchFilters } from '../../types.js';
import { BaseScraper } from '../base-scraper.js';
import { hostFromUrl } from '../../utils/rate-limiter.js';
import { withTimeout } from '../../utils/retry.js';

let sharedBrowser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (sharedBrowser && sharedBrowser.connected) return sharedBrowser;
  sharedBrowser = await puppeteer.launch({
    headless: process.env.PUPPETEER_HEADLESS !== 'false',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  return sharedBrowser;
}

/**
 * McKinsey career scraper using Puppeteer.
 *
 * McKinsey uses Workday under the hood but their CSRF prefetch page is
 * unreachable via plain HTTP. Puppeteer loads the Workday-powered
 * search page at mckinsey.com/careers and extracts job listings from the DOM.
 *
 * platformIdentifier: not required.
 */
export class McKinseyScraper extends BaseScraper {
  async fetchJobs(filters: SearchFilters): Promise<JobListing[]> {
    const term = filters.jobTitle ?? 'software engineer';
    const url = `https://www.mckinsey.com/careers/search-jobs?query=${encodeURIComponent(term)}`;
    this.logProgress(`Fetching McKinsey via Puppeteer: ${term}`);

    const jobs = await this.rateLimitedFetch(hostFromUrl(url), () =>
      this.scrapeWithPuppeteer(url),
    );

    return jobs.filter((j) => this.matchesFilters(j, filters));
  }

  private async scrapeWithPuppeteer(url: string): Promise<JobListing[]> {
    const timeout = Number(process.env.SCRAPE_TIMEOUT_MS ?? 45000);
    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      );
      await withTimeout(
        page.goto(url, { waitUntil: 'networkidle2' }),
        timeout,
        `McKinsey goto ${url}`,
      );

      // Wait for job results to render (Workday SPA)
      await new Promise((r) => setTimeout(r, 3000));

      const raw = await page.evaluate((careerUrl) => {
        const JUNK = /^(apply now|read more|view all|see more|home|search|close|next|previous|sign in|log in)/i;
        const results: { id: string; title: string; location: string; applyUrl: string }[] = [];
        const seen = new Set<string>();

        const anchors = Array.from(
          document.querySelectorAll('a[href*="/job"], a[href*="myworkdayjobs"], a[class*="jobTitle"], [class*="job-result"] a, [class*="jobCard"] a'),
        ) as HTMLAnchorElement[];

        for (const a of anchors) {
          const href = a.href || '';
          const title = (a.textContent ?? '').trim();
          if (!href || !title || JUNK.test(title) || title.length < 4) continue;

          const id = href.split('/').filter(Boolean).pop() ?? '';
          if (!id || seen.has(id)) continue;
          seen.add(id);

          const row = a.closest('li, tr, [class*="row"], [class*="card"], [class*="result"]');
          const locEl = row?.querySelector('[class*="location"], [class*="city"]');
          const location = (locEl?.textContent ?? '').trim();

          results.push({ id, title, location, applyUrl: href });
        }
        return results;
      }, this.config.careerUrl);

      return raw.map((r): JobListing => ({
        id: r.id,
        companyName: this.config.name,
        title: r.title,
        locations: r.location ? [r.location] : [],
        level: this.normalizeJobLevel(r.title),
        applyUrl: r.applyUrl,
        sourceUrl: this.config.careerUrl,
        scrapedAt: new Date().toISOString(),
      }));
    } finally {
      await page.close();
    }
  }
}
