import axios from 'axios';
import type { JobListing, SearchFilters } from '../../types.js';
import { BaseScraper } from '../base-scraper.js';
import { hostFromUrl } from '../../utils/rate-limiter.js';

interface JraJob {
  data: {
    req_id: string;
    title: string;
    city?: string;
    state?: string;
    country?: string;
    location_name?: string;
    posted_date?: string;
    apply_url?: string;
    department?: string;
    categories?: { name: string }[];
  };
}

interface JraResponse {
  jobs: JraJob[];
  totalCount: number;
  count?: number;
}

/**
 * iCIMS JRA (Job Routing Application) scraper — white-label REST API platform.
 *
 * Used by companies that host a custom-domain iCIMS SPA (e.g. jobs.statefarm.com).
 *
 * platformIdentifier: "{host}" — e.g. "jobs.statefarm.com"
 *
 * The REST endpoint is:
 *   GET https://{host}/api/jobs?limit=N&offset=M[&keyword=...]
 */
export class IcimsJraScraper extends BaseScraper {
  async fetchJobs(filters: SearchFilters): Promise<JobListing[]> {
    const host = this.config.platformIdentifier;
    if (!host) throw new Error(`iCIMS JRA scraper for ${this.config.name} missing platformIdentifier`);

    const baseUrl = `https://${host}/api/jobs`;
    this.logProgress(`Fetching iCIMS JRA: ${host}`);

    const all: JobListing[] = [];
    const limit = 50;
    let offset = 0;
    let total = Infinity;
    const maxJobs = 2000;

    while (offset < total && offset < maxJobs) {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (filters.jobTitle) params.set('keyword', filters.jobTitle);
      const url = `${baseUrl}?${params}`;

      const data = await this.rateLimitedFetch(hostFromUrl(url), async () => {
        const res = await axios.get<JraResponse>(url, {
          timeout: Number(process.env.SCRAPE_TIMEOUT_MS ?? 30000),
          headers: { 'User-Agent': 'career-jobs-mcp/0.1', Accept: 'application/json' },
        });
        return res.data;
      });

      if (!data.jobs?.length) break;

      total = data.totalCount ?? data.count ?? data.jobs.length;

      for (const { data: d } of data.jobs) {
        const locations: string[] = [];
        if (d.location_name) locations.push(d.location_name);
        else if (d.city || d.state) locations.push([d.city, d.state].filter(Boolean).join(', '));

        const dept = d.department || d.categories?.[0]?.name;

        all.push({
          id: d.req_id,
          companyName: this.config.name,
          title: d.title,
          locations,
          department: dept,
          level: this.normalizeJobLevel(d.title),
          applyUrl: d.apply_url ?? `https://${host}/main/jobs/detail/${d.req_id}`,
          postedDate: d.posted_date,
          sourceUrl: this.config.careerUrl,
          scrapedAt: new Date().toISOString(),
        });
      }

      offset += data.jobs.length;
    }

    return all.filter((j) => this.matchesFilters(j, filters));
  }
}
