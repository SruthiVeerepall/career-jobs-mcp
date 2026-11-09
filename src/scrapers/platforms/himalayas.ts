import axios from 'axios';
import type { JobListing, SearchFilters } from '../../types.js';
import { BaseScraper } from '../base-scraper.js';
import { POSTED_SINCE_MS } from '../../utils/posted-date.js';
import { rateLimiter } from '../../utils/rate-limiter.js';

interface HimalayasJob {
  title: string;
  companyName?: string;
  description?: string;
  locationRestrictions?: string[];
  pubDate?: number; // epoch SECONDS
  applicationLink?: string;
  guid: string;
}

interface HimalayasResponse {
  jobs?: HimalayasJob[];
}

/**
 * Himalayas — remote-job board (~120k listings), public JSON API, no auth:
 *   GET https://himalayas.app/jobs/api/search?q={term}&country=US&sort=recent&page={n}
 * 20 per page. With sort=recent a couple of featured posts come first, then newest-first,
 * so paging stops once a whole page is older than the window. `pubDate` is epoch seconds.
 * The API throttles bursts, hence the wider per-host gap.
 */
export class HimalayasScraper extends BaseScraper {
  private static readonly DEFAULT_TERMS = ['Java', 'Full Stack', 'Software Engineer'];
  private static readonly HOST = 'himalayas.app';
  private static readonly MAX_PAGES = 5;
  private static readonly GAP_MS = 1000;

  async fetchJobs(filters: SearchFilters): Promise<JobListing[]> {
    const terms = this.resolveSearchTerms(filters, HimalayasScraper.DEFAULT_TERMS);
    const seen = new Map<string, JobListing>();
    const cutoff = filters.postedSince ? Date.now() - POSTED_SINCE_MS[filters.postedSince] : 0;

    for (const term of terms) {
      for (let page = 1; page <= HimalayasScraper.MAX_PAGES; page++) {
        const params = new URLSearchParams({ q: term, country: 'US', sort: 'recent', page: String(page) });
        const url = `https://${HimalayasScraper.HOST}/jobs/api/search?${params}`;

        await rateLimiter.wait(HimalayasScraper.HOST, HimalayasScraper.GAP_MS);
        const data = await this.rateLimitedFetch(HimalayasScraper.HOST, async () => {
          const res = await axios.get<HimalayasResponse>(url, {
            timeout: Number(process.env.SCRAPE_TIMEOUT_MS ?? 30000),
            headers: { 'User-Agent': 'career-jobs-mcp/0.1 (personal job search)', Accept: 'application/json' },
          });
          return res.data;
        });

        const jobs = data.jobs ?? [];
        for (const j of jobs) {
          const id = `himalayas-${j.guid}`;
          if (seen.has(id) || !j.title) continue;
          seen.set(id, this.mapJob(id, j));
        }
        const allOld = jobs.every((j) => (j.pubDate ?? 0) * 1000 < cutoff);
        if (jobs.length < 20 || allOld) break;
      }
    }

    this.logProgress(`Himalayas: ${seen.size} unique postings across ${terms.length} search terms`);
    return [...seen.values()].filter((j) => this.matchesFilters(j, filters));
  }

  private mapJob(id: string, j: HimalayasJob): JobListing {
    const url = j.applicationLink || j.guid;
    return {
      id,
      companyName: j.companyName || 'Unknown',
      title: j.title,
      locations: [this.normalizeLocation(j.locationRestrictions)],
      level: this.normalizeJobLevel(j.title),
      description: j.description ? stripHtml(j.description) : undefined,
      applyUrl: url,
      postedDate: j.pubDate ? new Date(j.pubDate * 1000).toISOString() : undefined,
      sourceUrl: j.guid,
      scrapedAt: new Date().toISOString(),
    };
  }

  /** Same convention as the other remote boards: US-eligible → "Remote — …", else raw. */
  private normalizeLocation(restrictions: string[] | undefined): string {
    if (!restrictions || restrictions.length === 0) return 'Remote — Worldwide';
    if (restrictions.includes('United States')) return 'Remote — United States';
    return restrictions.join(', ');
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}
