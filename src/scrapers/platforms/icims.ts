import puppeteer, { type Browser, type Frame } from 'puppeteer';
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

interface IcimsRawJob {
  href: string;
  title: string;
  location: string;
  postedDate: string;
}

/**
 * iCIMS scraper.
 *
 * platformIdentifier: "{tenant}" — e.g. "statefarm", "libertymutual"
 *
 * iCIMS sites are JS-rendered and use a self-loading iframe pattern. The actual
 * job postings live in an inner frame at `careers-{tenant}.icims.com/jobs/...?in_iframe=1`.
 * We navigate to the search URL, then walk into the inner frame to extract postings.
 */
export class IcimsScraper extends BaseScraper {
  async fetchJobs(filters: SearchFilters): Promise<JobListing[]> {
    const tenant = this.config.platformIdentifier;
    if (!tenant) throw new Error(`iCIMS scraper for ${this.config.name} missing platformIdentifier`);

    const baseHost = `https://careers-${tenant}.icims.com`;
    const all: JobListing[] = [];
    const maxPages = Number(process.env.ICIMS_MAX_PAGES ?? 5);
    const seenIds = new Set<string>();

    for (let page = 0; page < maxPages; page++) {
      const url = `${baseHost}/jobs/search?ss=1&pr=${page}${
        filters.jobTitle ? `&searchKeyword=${encodeURIComponent(filters.jobTitle)}` : ''
      }`;
      this.logProgress(`Fetching iCIMS: ${url}`);

      const raw = await this.rateLimitedFetch(hostFromUrl(url), () => this.fetchPage(url));
      let added = 0;
      for (const r of raw) {
        const idMatch = r.href.match(/\/jobs\/(\d+)\//);
        const id = idMatch ? idMatch[1] : r.href;
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        all.push({
          id,
          companyName: this.config.name,
          title: r.title,
          locations: r.location ? [r.location] : [],
          level: this.normalizeJobLevel(r.title),
          applyUrl: r.href.replace(/[?&]in_iframe=1/, ''),
          postedDate: r.postedDate || undefined,
          sourceUrl: this.config.careerUrl,
          scrapedAt: new Date().toISOString(),
        });
        added++;
      }
      if (added === 0) break;
    }

    return all.filter((j) => this.matchesFilters(j, filters));
  }

  private async fetchPage(url: string): Promise<IcimsRawJob[]> {
    const timeout = Number(process.env.SCRAPE_TIMEOUT_MS ?? 30000);
    const browser = await getBrowser();
    const p = await browser.newPage();
    try {
      await p.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      await p.setViewport({ width: 1280, height: 800 });
      await withTimeout(p.goto(url, { waitUntil: 'networkidle2' }), timeout, `goto ${url}`);
      // Give the inner frame time to render
      await new Promise((r) => setTimeout(r, 2500));

      // Find the inner content frame (the one not equal to main URL)
      let target: Frame | null = null;
      for (const f of p.frames()) {
        if (!f.url() || f.url() === 'about:blank') continue;
        if (f === p.mainFrame()) continue;
        target = f;
        break;
      }
      // Fall back to main frame if no inner frame is content-bearing
      const frame = target ?? p.mainFrame();

      const jobs = await frame.evaluate(() => {
        // Group anchors by job ID; pick the best title across all anchors for each ID.
        const JUNK_TITLES = /^(apply now|read more|view all|see more|click here|welcome|log\b|sign\b|skip|events?|jobs sign in|search|home|continue|next|previous|close|cancel)/i;
        const byId = new Map<string, { href: string; title: string; location: string; postedDate: string }>();
        const anchors = Array.from(document.querySelectorAll('a[href*="/jobs/"]')) as HTMLAnchorElement[];
        for (const a of anchors) {
          const href = a.href || '';
          const m = href.match(/\/jobs\/(\d+)/);
          if (!m) continue;
          const id = m[1];

          const raw = (a.textContent || '').trim();
          const lines = raw.split('\n').map((s) => s.trim()).filter(Boolean);
          let title = '', location = '', postedDate = '';
          if (lines[0] === 'Title' && lines[1]) title = lines[1];
          else title = lines[0] || '';
          for (const ln of lines) {
            if (/^Location\b/i.test(ln)) location = ln.replace(/^Location\s*/i, '').trim();
            else if (/^Posted/i.test(ln)) postedDate = ln.replace(/^Posted\s*Date?\s*/i, '').trim();
          }
          if (!location) {
            const tr = a.closest('tr');
            if (tr) {
              const cells = Array.from(tr.querySelectorAll('td'));
              for (const c of cells) {
                const txt = (c.textContent || '').trim();
                if (/US-|, [A-Z]{2}\b|Remote/.test(txt) && !/^Title/i.test(txt)) { location = txt; break; }
              }
            }
          }

          // Skip junk titles (we'll keep looking for the real one for this job ID)
          const isJunk = !title || JUNK_TITLES.test(title) || title.length < 4;

          const existing = byId.get(id);
          if (!existing) {
            byId.set(id, { href, title: isJunk ? '' : title, location, postedDate });
          } else {
            // Upgrade existing entry with better data
            if (!existing.title && !isJunk) existing.title = title;
            else if (!isJunk && title.length > existing.title.length) existing.title = title;
            if (!existing.location && location) existing.location = location;
            if (!existing.postedDate && postedDate) existing.postedDate = postedDate;
            // Prefer non-iCIMS apply URL when available (some companies redirect to their own domain)
            if (existing.href.includes('icims.com') && !href.includes('icims.com')) {
              existing.href = href;
            }
          }
        }
        // Drop entries whose title is still empty (no good text was found)
        return Array.from(byId.values()).filter((j) => j.title);
      });
      return jobs;
    } finally {
      await p.close();
    }
  }
}
