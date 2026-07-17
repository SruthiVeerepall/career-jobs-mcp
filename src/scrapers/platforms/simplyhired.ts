import axios from 'axios';
import type { JobListing, SearchFilters } from '../../types.js';
import { BaseScraper } from '../base-scraper.js';

interface SimplyHiredJob {
  jobKey: string;
  title: string;
  company: string;
  location?: string;
  dateOnIndeed?: number; // epoch millis
  remoteAttributes?: string[];
}

/**
 * SimplyHired (Indeed-owned) — server-rendered Next.js search page; the full
 * job list is embedded as JSON in the __NEXT_DATA__ script tag. No login.
 *   GET https://www.simplyhired.com/search?q={term}&l=United+States&t={days}
 * 20 jobs per page. applyUrl = https://www.simplyhired.com/job/{jobKey}.
 */
export class SimplyHiredScraper extends BaseScraper {
  private static readonly DEFAULT_TERMS = ['Java Developer', 'Full Stack Developer', 'Software Engineer'];
  private static readonly HOST = 'www.simplyhired.com';

  async fetchJobs(filters: SearchFilters): Promise<JobListing[]> {
    const terms = filters.jobTitle ? [filters.jobTitle] : SimplyHiredScraper.DEFAULT_TERMS;
    const seen = new Map<string, JobListing>();

    for (const term of terms) {
      const params = new URLSearchParams({
        q: term,
        l: filters.location ?? 'United States',
        t: this.daysParam(filters.postedSince),
      });
      const url = `https://${SimplyHiredScraper.HOST}/search?${params}`;

      const html = await this.rateLimitedFetch(SimplyHiredScraper.HOST, async () => {
        const res = await axios.get<string>(url, {
          timeout: Number(process.env.SCRAPE_TIMEOUT_MS ?? 30000),
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });
        return res.data;
      });

      for (const job of this.parseNextData(html)) {
        if (!seen.has(job.id)) seen.set(job.id, job);
      }
    }

    this.logProgress(`SimplyHired: ${seen.size} unique postings across ${terms.length} search terms`);
    return [...seen.values()].filter((j) => this.matchesFilters(j, filters));
  }

  private parseNextData(html: string): JobListing[] {
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!m) return [];
    let raw: SimplyHiredJob[];
    try {
      raw = JSON.parse(m[1])?.props?.pageProps?.jobs ?? [];
    } catch {
      return [];
    }

    return raw
      .filter((j) => j.jobKey && j.title)
      .map((j) => {
        const locations = [j.location].filter((v): v is string => Boolean(v));
        if (j.remoteAttributes?.some((a) => /remote/i.test(a))) locations.push('Remote');
        const applyUrl = `https://www.simplyhired.com/job/${j.jobKey}`;
        return {
          id: `simplyhired-${j.jobKey}`,
          companyName: j.company || 'Unknown',
          title: j.title,
          locations,
          level: this.normalizeJobLevel(j.title),
          applyUrl,
          postedDate: j.dateOnIndeed ? new Date(j.dateOnIndeed).toISOString() : undefined,
          sourceUrl: applyUrl,
          scrapedAt: new Date().toISOString(),
        };
      });
  }

  private daysParam(postedSince: SearchFilters['postedSince']): string {
    switch (postedSince) {
      case 'today':
        return '1';
      case 'month':
        return '30';
      case 'week':
      default:
        return '7';
    }
  }
}
