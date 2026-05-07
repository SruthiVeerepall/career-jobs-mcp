import axios from 'axios';
import type { JobListing, SearchFilters } from '../../types.js';
import { BaseScraper } from '../base-scraper.js';
import { hostFromUrl } from '../../utils/rate-limiter.js';

interface LeverJob {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl: string;
  categories: {
    location?: string;
    allLocations?: string[];
    team?: string;
    department?: string;
    commitment?: string;
  };
  createdAt?: number;
  descriptionPlain?: string;
  lists?: { text: string; content: string }[];
}

/**
 * Lever's public API:
 *   https://api.lever.co/v0/postings/{company}?mode=json
 * Used by Netflix, Quora, Github, Shopify (some divisions), and many others.
 */
export class LeverScraper extends BaseScraper {
  async fetchJobs(filters: SearchFilters): Promise<JobListing[]> {
    const slug = this.config.platformIdentifier ?? this.config.slug;
    const url = `https://api.lever.co/v0/postings/${slug}?mode=json`;
    this.logProgress(`Fetching Lever postings: ${slug}`);

    const data = await this.rateLimitedFetch(hostFromUrl(url), async () => {
      const res = await axios.get<LeverJob[]>(url, {
        timeout: Number(process.env.SCRAPE_TIMEOUT_MS ?? 30000),
        headers: { 'User-Agent': 'career-jobs-mcp/0.1' },
      });
      return res.data;
    });

    const jobs = (data ?? []).map((job) => this.mapJob(job));
    return jobs.filter((j) => this.matchesFilters(j, filters));
  }

  private mapJob(job: LeverJob): JobListing {
    const locations = job.categories.allLocations?.length
      ? job.categories.allLocations
      : job.categories.location
        ? [job.categories.location]
        : [];
    return {
      id: job.id,
      companyName: this.config.name,
      title: job.text,
      department: job.categories.department ?? job.categories.team,
      locations,
      level: this.normalizeJobLevel(job.text),
      description: job.descriptionPlain,
      requirements: job.lists?.find((l) => /requirement|qualif/i.test(l.text))
        ? this.extractListItems(job.lists.find((l) => /requirement|qualif/i.test(l.text))!.content)
        : undefined,
      benefits: job.lists?.find((l) => /benefit|perk/i.test(l.text))
        ? this.extractListItems(job.lists.find((l) => /benefit|perk/i.test(l.text))!.content)
        : undefined,
      applyUrl: job.applyUrl ?? job.hostedUrl,
      postedDate: job.createdAt ? new Date(job.createdAt).toISOString() : undefined,
      sourceUrl: job.hostedUrl,
      scrapedAt: new Date().toISOString(),
    };
  }

  private extractListItems(html: string): string[] {
    const items: string[] = [];
    const regex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
      items.push(
        match[1]
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
      );
    }
    return items;
  }
}
