import axios from 'axios';
import type { CompanyConfig, JobListing, SearchFilters } from '../../types.js';
import { BaseScraper } from '../base-scraper.js';
import { hostFromUrl } from '../../utils/rate-limiter.js';

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location: { name: string };
  departments?: { name: string }[];
  updated_at?: string;
  content?: string;
  metadata?: { name: string; value: unknown }[];
}

interface GreenhouseResponse {
  jobs: GreenhouseJob[];
}

/**
 * Greenhouse exposes a public JSON API at:
 *   https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true
 * Used by Stripe, Airbnb, Coinbase, Discord, GitLab, Reddit, and many others.
 */
export class GreenhouseScraper extends BaseScraper {
  async fetchJobs(filters: SearchFilters): Promise<JobListing[]> {
    const token = this.config.platformIdentifier ?? this.config.slug;
    const url = `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`;
    this.logProgress(`Fetching Greenhouse board: ${token}`);

    const data = await this.rateLimitedFetch(hostFromUrl(url), async () => {
      const res = await axios.get<GreenhouseResponse>(url, {
        timeout: Number(process.env.SCRAPE_TIMEOUT_MS ?? 30000),
        headers: { 'User-Agent': 'career-jobs-mcp/0.1' },
      });
      return res.data;
    });

    const jobs: JobListing[] = (data.jobs ?? []).map((job) => this.mapJob(job));
    return jobs.filter((j) => this.matchesFilters(j, filters));
  }

  private mapJob(job: GreenhouseJob): JobListing {
    const description = job.content
      ? this.stripHtml(decodeHtmlEntities(job.content))
      : undefined;
    return {
      id: String(job.id),
      companyName: this.config.name,
      title: job.title,
      department: job.departments?.[0]?.name,
      locations: [job.location?.name].filter((v): v is string => Boolean(v)),
      level: this.normalizeJobLevel(job.title),
      description,
      applyUrl: job.absolute_url,
      postedDate: job.updated_at,
      sourceUrl: job.absolute_url,
      scrapedAt: new Date().toISOString(),
      raw: { metadata: job.metadata },
    };
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}
