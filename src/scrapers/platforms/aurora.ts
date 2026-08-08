import axios from 'axios';
import type { JobListing, SearchFilters } from '../../types.js';
import { BaseScraper } from '../base-scraper.js';
import { hostFromUrl } from '../../utils/rate-limiter.js';

interface AuroraJob {
  /** Ashby posting id — the value the apply link needs. */
  id: string;
  /** Ashby internal job id. Not used for links. */
  jobId?: string;
  title: string;
  category?: string;
  locations?: string[];
  isRemote?: boolean;
  employmentType?: string;
  applyLink?: string;
  /** "YYYY-MM-DD" — first publish. */
  publishedDate?: string;
  /** Bumps on any edit; deliberately unused as a posting date. */
  updatedAt?: string;
  searchText?: string;
}

/**
 * Aurora Innovation (aurora.tech).
 *
 * Aurora runs Ashby underneath — apply links carry an `ashby_jid` — but its Ashby
 * board is not exposed through the public posting API (every org-name variant 404s),
 * so the board id cannot be used. Aurora does publish its own listing feed, which
 * includes a real `publishedDate`:
 *
 *   GET https://aurora.tech/api/jobs-index
 */
export class AuroraScraper extends BaseScraper {
  async fetchJobs(filters: SearchFilters): Promise<JobListing[]> {
    const url = 'https://aurora.tech/api/jobs-index';
    this.logProgress('Fetching Aurora jobs index');

    const data = await this.rateLimitedFetch(hostFromUrl(url), async () => {
      const res = await axios.get<{ jobs?: AuroraJob[] }>(url, {
        timeout: Number(process.env.SCRAPE_TIMEOUT_MS ?? 30000),
        headers: {
          'User-Agent': 'career-jobs-mcp/0.1 (Mozilla/5.0)',
          Accept: 'application/json',
        },
      });
      return res.data;
    });

    const jobs = (data.jobs ?? []).map((job) => this.mapJob(job));
    return jobs.filter((j) => this.matchesFilters(j, filters));
  }

  private mapJob(job: AuroraJob): JobListing {
    const applyUrl = job.applyLink ?? `https://aurora.tech/careers?ashby_jid=${job.id}`;
    const locations = job.locations?.length
      ? job.locations
      : job.isRemote
        ? ['Remote']
        : [];

    return {
      id: job.id,
      companyName: this.config.name,
      title: job.title,
      department: job.category,
      locations,
      level: this.normalizeJobLevel(job.title),
      description: job.searchText ? job.searchText.replace(/\s+/g, ' ').trim().slice(0, 2000) : undefined,
      applyUrl,
      // Date-only string; anchored to the start of that day by the shared date parser.
      postedDate: job.publishedDate ? new Date(`${job.publishedDate}T00:00:00Z`).toISOString() : undefined,
      sourceUrl: applyUrl,
      scrapedAt: new Date().toISOString(),
    };
  }
}
