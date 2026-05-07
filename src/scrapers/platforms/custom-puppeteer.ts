import * as cheerio from 'cheerio';
import puppeteer, { type Browser } from 'puppeteer';
import type { CompanyConfig, CustomSelectors, JobListing, SearchFilters } from '../../types.js';
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

export async function closeSharedBrowser(): Promise<void> {
  if (sharedBrowser) {
    try {
      await sharedBrowser.close();
    } catch {
      // ignore
    }
    sharedBrowser = null;
  }
}

/**
 * Generic scraper for custom career sites. Uses Puppeteer when JS rendering is required,
 * Cheerio otherwise. Selectors are configurable per company.
 */
export class CustomPuppeteerScraper extends BaseScraper {
  constructor(config: CompanyConfig) {
    super(config);
  }

  async fetchJobs(filters: SearchFilters): Promise<JobListing[]> {
    const url = this.config.careerUrl;
    const selectors = this.config.customSelectors ?? {};
    const requiresJs = this.config.requiresJavaScript !== false;

    this.logProgress(`Scraping custom site: ${url} (puppeteer=${requiresJs})`);

    const html = await this.rateLimitedFetch(hostFromUrl(url), () =>
      requiresJs ? this.fetchWithPuppeteer(url) : this.fetchWithAxios(url),
    );

    const jobs = this.parseHtml(html, selectors);
    return jobs.filter((j) => this.matchesFilters(j, filters));
  }

  private async fetchWithPuppeteer(url: string): Promise<string> {
    const timeout = Number(process.env.SCRAPE_TIMEOUT_MS ?? 30000);
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.setUserAgent('career-jobs-mcp/0.1 (Mozilla/5.0)');
      await withTimeout(page.goto(url, { waitUntil: 'networkidle2' }), timeout, `goto ${url}`);
      return await page.content();
    } finally {
      await page.close();
    }
  }

  private async fetchWithAxios(url: string): Promise<string> {
    const axios = (await import('axios')).default;
    const res = await axios.get<string>(url, {
      timeout: Number(process.env.SCRAPE_TIMEOUT_MS ?? 30000),
      headers: { 'User-Agent': 'career-jobs-mcp/0.1' },
      responseType: 'text',
    });
    return res.data;
  }

  private parseHtml(html: string, selectors: CustomSelectors): JobListing[] {
    const $ = cheerio.load(html);
    const listSel = selectors.jobListSelector ?? '[class*="job"], [class*="position"], [data-job], li a[href*="job"]';
    const items = $(listSel);
    const jobs: JobListing[] = [];

    items.each((idx, el) => {
      const $el = $(el);
      const titleEl = selectors.jobTitleSelector
        ? $el.find(selectors.jobTitleSelector).first()
        : $el.find('h2, h3, h4, [class*="title"]').first();
      const linkEl = selectors.jobLinkSelector
        ? $el.find(selectors.jobLinkSelector).first()
        : $el.is('a')
          ? $el
          : $el.find('a').first();
      const locEl = selectors.jobLocationSelector
        ? $el.find(selectors.jobLocationSelector).first()
        : $el.find('[class*="location"]').first();
      const deptEl = selectors.jobDepartmentSelector
        ? $el.find(selectors.jobDepartmentSelector).first()
        : $el.find('[class*="department"], [class*="team"]').first();

      const title = titleEl.text().trim();
      const href = linkEl.attr('href') ?? '';
      if (!title || !href) return;

      const applyUrl = href.startsWith('http')
        ? href
        : new URL(href, this.config.careerUrl).toString();
      const location = locEl.text().trim();
      const department = deptEl.text().trim();

      jobs.push({
        id: this.makeId(applyUrl, title, idx),
        companyName: this.config.name,
        title,
        department: department || undefined,
        locations: location ? [location] : [],
        level: this.normalizeJobLevel(title),
        applyUrl,
        sourceUrl: this.config.careerUrl,
        scrapedAt: new Date().toISOString(),
      });
    });
    return jobs;
  }

  private makeId(url: string, title: string, idx: number): string {
    try {
      const path = new URL(url).pathname;
      const last = path.split('/').filter(Boolean).pop();
      if (last) return last;
    } catch {
      // ignore
    }
    return `${this.config.slug}-${idx}-${title.toLowerCase().replace(/\W+/g, '-').slice(0, 40)}`;
  }
}
