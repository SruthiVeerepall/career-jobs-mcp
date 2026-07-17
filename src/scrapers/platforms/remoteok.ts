import axios from 'axios';
import type { JobListing, SearchFilters } from '../../types.js';
import { BaseScraper } from '../base-scraper.js';

interface RemoteOKJob {
  id?: string | number;
  position?: string;
  company?: string;
  location?: string;
  date?: string;
  url?: string;
  tags?: string[];
  legal?: string;
}

/**
 * RemoteOK — public JSON API, no auth: GET https://remoteok.com/api
 * Returns the ~100 latest remote jobs (element 0 is a legal notice).
 * The `tags` query param does not reliably filter, so we fetch the full feed
 * and rely on the caller's title/profile filtering. All jobs are remote;
 * non-US-friendly locations are passed through raw so isUSJob() excludes them.
 */
export class RemoteOKScraper extends BaseScraper {
  private static readonly HOST = 'remoteok.com';

  async fetchJobs(filters: SearchFilters): Promise<JobListing[]> {
    const url = `https://${RemoteOKScraper.HOST}/api`;
    const data = await this.rateLimitedFetch(RemoteOKScraper.HOST, async () => {
      const res = await axios.get<RemoteOKJob[]>(url, {
        timeout: Number(process.env.SCRAPE_TIMEOUT_MS ?? 30000),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        },
      });
      return res.data;
    });

    const jobs: JobListing[] = (Array.isArray(data) ? data : [])
      .filter((j) => !j.legal && j.id && j.position)
      .map((j) => {
        const applyUrl = (j.url ?? `https://remoteok.com/remote-jobs/${j.id}`).replace('remoteOK.com', 'remoteok.com');
        return {
          id: `remoteok-${j.id}`,
          companyName: j.company || 'Unknown',
          title: j.position!,
          locations: [this.normalizeLocation(j.location)],
          level: this.normalizeJobLevel(j.position!),
          applyUrl,
          postedDate: j.date,
          sourceUrl: applyUrl,
          scrapedAt: new Date().toISOString(),
          raw: { tags: j.tags },
        };
      });

    this.logProgress(`RemoteOK: ${jobs.length} postings in latest feed`);
    return jobs.filter((j) => this.matchesFilters(j, filters));
  }

  private normalizeLocation(loc: string | undefined): string {
    const trimmed = (loc ?? '').replace(/,\s*$/, '').trim();
    if (!trimmed || /worldwide|anywhere|americas|north america/i.test(trimmed)) return 'Remote — Worldwide';
    if (/remote|usa|united states/i.test(trimmed)) return trimmed;
    return trimmed; // non-US regions pass through raw so isUSJob() can exclude them
  }
}
