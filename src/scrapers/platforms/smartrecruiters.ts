import axios from 'axios';
import type { JobListing, SearchFilters } from '../../types.js';
import { BaseScraper } from '../base-scraper.js';
import { hostFromUrl } from '../../utils/rate-limiter.js';

interface SmartRecruitersListItem {
  id: string;
  name: string;
  uuid: string;
  jobAdId?: string;
  refNumber?: string;
  location: { city?: string; region?: string; country?: string; remote?: boolean };
  department?: { label?: string };
  releasedDate?: string;
  ref?: string;
}

interface SmartRecruitersResponse {
  totalFound: number;
  content: SmartRecruitersListItem[];
}

/**
 * SmartRecruiters public API:
 *   https://api.smartrecruiters.com/v1/companies/{company}/postings?limit=100&offset=N
 * Used by Bosch, Visa, IKEA, McDonald's, and many others.
 */
export class SmartRecruitersScraper extends BaseScraper {
  async fetchJobs(filters: SearchFilters): Promise<JobListing[]> {
    const slug = this.config.platformIdentifier ?? this.config.slug;
    const baseUrl = `https://api.smartrecruiters.com/v1/companies/${slug}/postings`;
    this.logProgress(`Fetching SmartRecruiters postings: ${slug}`);

    const all: JobListing[] = [];
    const limit = 100;
    let offset = 0;
    while (true) {
      const url = `${baseUrl}?limit=${limit}&offset=${offset}`;
      const data = await this.rateLimitedFetch(hostFromUrl(url), async () => {
        const res = await axios.get<SmartRecruitersResponse>(url, {
          timeout: Number(process.env.SCRAPE_TIMEOUT_MS ?? 30000),
          headers: { 'User-Agent': 'career-jobs-mcp/0.1' },
        });
        return res.data;
      });
      const batch = (data.content ?? []).map((j) => this.mapJob(j, slug));
      all.push(...batch);
      offset += limit;
      if (!data.content || data.content.length < limit || offset >= (data.totalFound ?? 0)) break;
    }
    return all.filter((j) => this.matchesFilters(j, filters));
  }

  private mapJob(job: SmartRecruitersListItem, slug: string): JobListing {
    const locParts = [job.location?.city, job.location?.region, job.location?.country].filter(Boolean);
    const locations = job.location?.remote ? ['Remote', ...(locParts.length ? [locParts.join(', ')] : [])] : locParts.length ? [locParts.join(', ')] : [];
    const applyUrl = `https://jobs.smartrecruiters.com/${slug}/${job.id}`;
    return {
      id: job.id,
      companyName: this.config.name,
      title: job.name,
      department: job.department?.label,
      locations,
      level: this.normalizeJobLevel(job.name),
      applyUrl,
      postedDate: job.releasedDate,
      sourceUrl: applyUrl,
      scrapedAt: new Date().toISOString(),
    };
  }
}
