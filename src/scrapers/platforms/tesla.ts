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
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ],
  });
  return sharedBrowser;
}

interface TeslaApiJob {
  id?: string;
  title?: string;
  location?: string;
  department?: string;
  postedDate?: string;
  applyUrl?: string;
}

interface TeslaRawJob {
  id: string;
  title: string;
  location: string;
  applyUrl: string;
  postedDate?: string;
  department?: string;
}

/**
 * Tesla career scraper using Puppeteer.
 *
 * Tesla's career site (www.tesla.com/careers/search) is Cloudflare-protected
 * and server-side-renders job data. We intercept the internal job API response
 * via Puppeteer's request interception, falling back to DOM parsing.
 *
 * platformIdentifier: not required.
 */
export class TeslaScraper extends BaseScraper {
  async fetchJobs(filters: SearchFilters): Promise<JobListing[]> {
    const term = filters.jobTitle ?? 'software engineer';
    const url = `https://www.tesla.com/careers/search?query=${encodeURIComponent(term)}&site=US`;
    this.logProgress(`Fetching Tesla via Puppeteer: ${term}`);

    const jobs = await this.rateLimitedFetch(hostFromUrl(url), () =>
      this.scrapeWithPuppeteer(url, term),
    );

    return jobs.filter((j) => this.matchesFilters(j, filters));
  }

  private async scrapeWithPuppeteer(url: string, term: string): Promise<JobListing[]> {
    const timeout = Number(process.env.SCRAPE_TIMEOUT_MS ?? 45000);
    const browser = await getBrowser();
    const page = await browser.newPage();
    const capturedJobs: TeslaApiJob[] = [];

    try {
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      );
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      });

      // Intercept API responses that look like job data
      await page.setRequestInterception(true);
      page.on('request', (req) => req.continue());
      page.on('response', async (resp) => {
        const respUrl = resp.url();
        if (
          respUrl.includes('/api/') &&
          (respUrl.includes('job') || respUrl.includes('requisition') || respUrl.includes('career'))
        ) {
          try {
            const ct = resp.headers()['content-type'] ?? '';
            if (ct.includes('application/json')) {
              const data = await resp.json() as unknown;
              const extracted = this.parseApiResponse(data);
              capturedJobs.push(...extracted);
            }
          } catch {
            // ignore parse errors
          }
        }
      });

      await withTimeout(
        page.goto(url, { waitUntil: 'networkidle2' }),
        timeout,
        `Tesla goto ${url}`,
      );

      // If API interception captured jobs, use those
      if (capturedJobs.length > 0) {
        return capturedJobs.map((j, idx) => this.mapApiJob(j, idx));
      }

      // Fall back to DOM parsing — returns plain serializable objects, mapped to JobListing below
      const raw = await page.evaluate((careerUrl) => {
        const JUNK = /^(apply now|read more|view all|see more|home|search|close|next|previous)/i;
        const results: { id: string; title: string; location: string; applyUrl: string }[] = [];

        const candidates: Element[] = [
          ...Array.from(document.querySelectorAll('a[href*="/careers/job"]')),
          ...Array.from(document.querySelectorAll('[class*="job-card"], [class*="jobCard"], [data-job-id]')),
          ...Array.from(document.querySelectorAll('tr[role="row"] a, li.job-result a')),
        ];

        const seen = new Set<string>();
        for (const el of candidates) {
          const href = (el as HTMLAnchorElement).href || el.getAttribute('data-href') || '';
          const text = (el.textContent ?? '').trim();
          if (!href || JUNK.test(text) || text.length < 4) continue;

          const idMatch = href.match(/\/job[s]?\/?(\d+)/i);
          const id = idMatch?.[1] ?? href.split('/').filter(Boolean).pop() ?? '';
          if (!id || seen.has(id)) continue;
          seen.add(id);

          const titleEl = el.querySelector('h2,h3,h4,[class*="title"]') ?? el;
          const title = (titleEl.textContent ?? '').trim();
          if (!title || JUNK.test(title)) continue;

          const locEl = el.querySelector('[class*="location"],[class*="city"]');
          const location = (locEl?.textContent ?? '').trim();

          results.push({
            id,
            title,
            location,
            applyUrl: href.startsWith('http') ? href : new URL(href, careerUrl).toString(),
          });
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

  private parseApiResponse(data: unknown): TeslaApiJob[] {
    if (!data || typeof data !== 'object') return [];
    const obj = data as Record<string, unknown>;

    // Try common response shapes
    const list =
      (Array.isArray(obj) ? obj : null) ??
      (Array.isArray(obj['jobs']) ? obj['jobs'] : null) ??
      (Array.isArray(obj['results']) ? obj['results'] : null) ??
      (Array.isArray(obj['data']) ? obj['data'] : null) ??
      [];

    return (list as Record<string, unknown>[]).map((j) => ({
      id: String(j['id'] ?? j['req_id'] ?? j['requisitionId'] ?? ''),
      title: String(j['title'] ?? j['jobTitle'] ?? j['name'] ?? ''),
      location: String(j['location'] ?? j['city'] ?? j['primaryLocation'] ?? ''),
      department: String(j['department'] ?? j['team'] ?? ''),
      postedDate: String(j['postedDate'] ?? j['posted_date'] ?? j['datePosted'] ?? ''),
      applyUrl: String(j['url'] ?? j['applyUrl'] ?? j['jobUrl'] ?? ''),
    })).filter((j) => j.title);
  }

  private mapApiJob(j: TeslaApiJob, idx: number): JobListing {
    const id = j.id || `tesla-${idx}`;
    const applyUrl = j.applyUrl?.startsWith('http')
      ? j.applyUrl
      : `https://www.tesla.com/careers/job/${id}`;
    return {
      id,
      companyName: this.config.name,
      title: j.title ?? '',
      locations: j.location ? [j.location] : [],
      level: this.normalizeJobLevel(j.title),
      department: j.department || undefined,
      applyUrl,
      postedDate: j.postedDate ? new Date(j.postedDate).toISOString() : undefined,
      sourceUrl: this.config.careerUrl,
      scrapedAt: new Date().toISOString(),
    };
  }
}
