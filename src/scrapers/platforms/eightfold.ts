import axios from 'axios';
import type { JobListing, SearchFilters } from '../../types.js';
import { BaseScraper } from '../base-scraper.js';
import { hostFromUrl } from '../../utils/rate-limiter.js';
import { POSTED_SINCE_MS } from '../../utils/posted-date.js';

interface EightfoldPosition {
  id: number | string;
  name: string;
  location?: string;
  locations?: string[];
  department?: string;
  business_unit?: string;
  /** Epoch **seconds**, first publish — the true posting date. */
  t_create?: number;
  /** Epoch seconds, last edit. Deliberately unused: it bumps on any change. */
  t_update?: number;
  canonicalPositionUrl?: string;
  display_job_id?: string;
  job_description?: string;
  type?: string;
}

interface EightfoldResponse {
  count?: number;
  positions?: EightfoldPosition[];
}

/** The API silently caps a page at 10 however large `num` is, so paging is the only way through. */
const PAGE_SIZE = 10;
/** Ceiling on paging, so a board of thousands cannot turn into thousands of requests. */
const MAX_JOBS = 600;

/**
 * Eightfold AI talent-platform career sites.
 *
 * `platformIdentifier` is `host|domain`, e.g. `explore.jobs.netflix.net|netflix.com`
 * — Eightfold serves each customer on its own host but keys the query by the
 * customer's email domain.
 *
 *   GET https://{host}/api/apply/v2/jobs?domain={domain}&start=0&num=100&sort_by=timestamp
 *
 * Date field is `t_create` (epoch **seconds**), not `t_update`: as with
 * Greenhouse's `updated_at`, the update stamp bumps on any edit and would report
 * months-old postings as fresh.
 */
export class EightfoldScraper extends BaseScraper {
  async fetchJobs(filters: SearchFilters): Promise<JobListing[]> {
    const identifier = this.config.platformIdentifier ?? '';
    const [host, domain] = identifier.split('|');
    if (!host || !domain) {
      throw new Error(
        `Eightfold platformIdentifier must be "host|domain" (got "${identifier}") for ${this.config.name}`,
      );
    }

    this.logProgress(`Fetching Eightfold board: ${host} (${domain})`);
    const timeout = Number(process.env.SCRAPE_TIMEOUT_MS ?? 30000);
    const collected: EightfoldPosition[] = [];

    // sort_by=timestamp returns newest first, so once a page's oldest job falls
    // outside the requested window every later page does too and paging can stop.
    const windowMs = filters.postedSince ? POSTED_SINCE_MS[filters.postedSince] : undefined;
    const cutoff = windowMs ? Date.now() - windowMs : undefined;

    for (let start = 0; start < MAX_JOBS; start += PAGE_SIZE) {
      const url =
        `https://${host}/api/apply/v2/jobs?domain=${encodeURIComponent(domain)}` +
        `&start=${start}&num=${PAGE_SIZE}&sort_by=timestamp&triggerGoButton=false`;

      const data = await this.rateLimitedFetch(hostFromUrl(url), async () => {
        const res = await axios.get<EightfoldResponse>(url, {
          timeout,
          headers: {
            'User-Agent': 'career-jobs-mcp/0.1 (Mozilla/5.0)',
            Accept: 'application/json',
          },
        });
        return res.data;
      });

      const batch = data.positions ?? [];
      collected.push(...batch);
      if (batch.length < PAGE_SIZE) break;

      if (cutoff !== undefined) {
        const oldest = batch[batch.length - 1]?.t_create;
        if (oldest && oldest * 1000 < cutoff) break;
      }
    }

    const jobs = collected.map((p) => this.mapJob(p, host));
    return jobs.filter((j) => this.matchesFilters(j, filters));
  }

  private mapJob(p: EightfoldPosition, host: string): JobListing {
    const locations = p.locations?.length ? p.locations : p.location ? [p.location] : [];
    const applyUrl = p.canonicalPositionUrl ?? `https://${host}/careers/job/${p.id}`;

    return {
      id: String(p.display_job_id ?? p.id),
      companyName: this.config.name,
      title: p.name,
      department: p.department ?? p.business_unit,
      locations,
      level: this.normalizeJobLevel(p.name),
      description: p.job_description ? this.stripHtml(p.job_description) : undefined,
      applyUrl,
      // t_create is in seconds; JS wants milliseconds.
      postedDate: p.t_create ? new Date(p.t_create * 1000).toISOString() : undefined,
      sourceUrl: applyUrl,
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
