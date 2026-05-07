import axios from 'axios';
import type { JobListing, SearchFilters } from '../../types.js';
import { BaseScraper } from '../base-scraper.js';
import { hostFromUrl } from '../../utils/rate-limiter.js';

interface AshbyJob {
  id: string;
  title: string;
  jobUrl: string;
  applyUrl?: string;
  location: string;
  secondaryLocations?: { location: string }[];
  department: string;
  team: string;
  employmentType?: string;
  publishedAt?: string;
  descriptionHtml?: string;
}

interface AshbyResponse {
  apiVersion: string;
  jobs: AshbyJob[];
}

/**
 * Ashby public job board API:
 *   https://api.ashbyhq.com/posting-api/job-board/{org}?includeCompensation=true
 * Used by Linear, Posthog, Replicate, and many others.
 */
export class AshbyScraper extends BaseScraper {
  async fetchJobs(filters: SearchFilters): Promise<JobListing[]> {
    const slug = this.config.platformIdentifier ?? this.config.slug;
    const url = `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`;
    this.logProgress(`Fetching Ashby board: ${slug}`);

    const data = await this.rateLimitedFetch(hostFromUrl(url), async () => {
      const res = await axios.get<AshbyResponse>(url, {
        timeout: Number(process.env.SCRAPE_TIMEOUT_MS ?? 30000),
        headers: { 'User-Agent': 'career-jobs-mcp/0.1' },
      });
      return res.data;
    });

    const jobs = (data.jobs ?? []).map((job) => this.mapJob(job));
    return jobs.filter((j) => this.matchesFilters(j, filters));
  }

  private mapJob(job: AshbyJob): JobListing {
    const locations = [job.location, ...(job.secondaryLocations?.map((l) => l.location) ?? [])].filter(
      (v): v is string => Boolean(v),
    );
    return {
      id: job.id,
      companyName: this.config.name,
      title: job.title,
      department: job.department ?? job.team,
      locations,
      level: this.normalizeJobLevel(job.title),
      description: job.descriptionHtml ? this.stripHtml(job.descriptionHtml) : undefined,
      applyUrl: job.applyUrl ?? job.jobUrl,
      postedDate: job.publishedAt,
      sourceUrl: job.jobUrl,
      scrapedAt: new Date().toISOString(),
    };
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
