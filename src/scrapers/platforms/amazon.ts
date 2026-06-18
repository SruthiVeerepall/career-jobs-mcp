import axios from 'axios';
import type { JobListing, SearchFilters } from '../../types.js';
import { BaseScraper } from '../base-scraper.js';
import { hostFromUrl } from '../../utils/rate-limiter.js';

interface AmazonJob {
  id_icims: string;
  title: string;
  job_path: string;
  location: string;
  country_code: string;
  posted_date: string;
  job_category: string;
  is_manager: boolean | null;
  is_intern: boolean | null;
}

interface AmazonResponse {
  hits: number;
  jobs: AmazonJob[];
}

/**
 * Amazon career scraper using amazon.jobs JSON search API.
 *
 * platformIdentifier: not required (Amazon has one global portal).
 *
 * Endpoint: GET https://www.amazon.jobs/en/search.json
 *   ?base_query={term}&normalized_country_code=US
 *   &category[]=software-development&result_limit=100&offset=N
 */
export class AmazonScraper extends BaseScraper {
  async fetchJobs(filters: SearchFilters): Promise<JobListing[]> {
    const all: JobListing[] = [];
    const pageSize = 100;
    let offset = 0;

    this.logProgress(`Fetching Amazon: ${filters.jobTitle ?? 'software engineer'}`);

    while (true) {
      const params = new URLSearchParams({
        base_query: filters.jobTitle ?? 'software engineer',
        normalized_country_code: 'US',
        result_limit: String(pageSize),
        offset: String(offset),
      });
      params.append('category[]', 'software-development');
      params.append('category[]', 'systems-quality-assurance-engineering');

      const url = `https://www.amazon.jobs/en/search.json?${params}`;

      const data = await this.rateLimitedFetch(hostFromUrl(url), async () => {
        const res = await axios.get<AmazonResponse>(url, {
          timeout: Number(process.env.SCRAPE_TIMEOUT_MS ?? 30000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Accept: 'application/json',
          },
        });
        return res.data;
      });

      if (!data.jobs?.length) break;

      for (const j of data.jobs) {
        if (!j.title || !j.job_path) continue;
        if (j.is_manager) continue;
        if (j.is_intern) continue;
        if (j.country_code !== 'USA') continue;

        all.push({
          id: j.id_icims || j.job_path.split('/').filter(Boolean).pop() || `amazon-${offset}`,
          companyName: this.config.name,
          title: j.title,
          locations: j.location ? [j.location] : [],
          level: this.normalizeJobLevel(j.title),
          applyUrl: `https://www.amazon.jobs${j.job_path}`,
          postedDate: this.parseDate(j.posted_date),
          department: j.job_category,
          sourceUrl: this.config.careerUrl,
          scrapedAt: new Date().toISOString(),
        });
      }

      offset += data.jobs.length;
      if (offset >= data.hits || data.jobs.length < pageSize) break;
    }

    return all.filter((j) => this.matchesFilters(j, filters));
  }

  private parseDate(raw: string): string | undefined {
    if (!raw) return undefined;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  }
}
