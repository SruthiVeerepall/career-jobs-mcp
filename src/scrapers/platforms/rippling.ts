import axios from 'axios';
import type { JobListing, SearchFilters } from '../../types.js';
import { BaseScraper } from '../base-scraper.js';
import { hostFromUrl } from '../../utils/rate-limiter.js';

interface RipplingListItem {
  uuid: string;
  name: string;
  url: string;
  department?: { id?: string; label?: string };
  workLocation?: { id?: string; label?: string };
}

interface RipplingDetail {
  uuid: string;
  name: string;
  /** Not a string: a map of named HTML sections, e.g. { company, role, requirements }. */
  description?: Record<string, string>;
  department?: { label?: string };
  employmentType?: string;
  /** Plain strings, e.g. ["Remote (United States)"]. */
  workLocations?: string[];
  /** ISO-8601 with offset, e.g. "2026-07-20T20:23:18.833000-07:00". */
  createdOn?: string;
  url?: string;
}

const DETAIL_CONCURRENCY = 5;

/**
 * Rippling ATS public job boards:
 *   list   GET https://api.rippling.com/platform/api/ats/v1/board/{board}/jobs
 *   detail GET https://api.rippling.com/platform/api/ats/v1/board/{board}/jobs/{uuid}
 *
 * The list response carries **no date**, and rule #1 excludes undated jobs — so the
 * per-job detail call, which is the only place `createdOn` appears, is not optional
 * here. Boards are small (tens of jobs), so the fan-out is bounded and cheap; the
 * result is cached like every other source.
 */
export class RipplingScraper extends BaseScraper {
  async fetchJobs(filters: SearchFilters): Promise<JobListing[]> {
    const board = this.config.platformIdentifier ?? this.config.slug;
    const base = `https://api.rippling.com/platform/api/ats/v1/board/${board}/jobs`;
    this.logProgress(`Fetching Rippling board: ${board}`);

    const timeout = Number(process.env.SCRAPE_TIMEOUT_MS ?? 30000);
    const headers = {
      'User-Agent': 'career-jobs-mcp/0.1 (Mozilla/5.0)',
      Accept: 'application/json',
    };

    const list = await this.rateLimitedFetch(hostFromUrl(base), async () => {
      const res = await axios.get<RipplingListItem[]>(base, { timeout, headers });
      return Array.isArray(res.data) ? res.data : [];
    });

    const details = new Map<string, RipplingDetail>();
    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(DETAIL_CONCURRENCY, list.length) }, async () => {
        while (cursor < list.length) {
          const item = list[cursor++];
          try {
            const detail = await this.rateLimitedFetch(hostFromUrl(base), async () => {
              const res = await axios.get<RipplingDetail>(`${base}/${item.uuid}`, { timeout, headers });
              return res.data;
            });
            details.set(item.uuid, detail);
          } catch {
            // Leave it undated; the strict window gate drops it rather than guessing.
          }
        }
      }),
    );

    const jobs = list.map((item) => this.mapJob(item, details.get(item.uuid)));
    return jobs.filter((j) => this.matchesFilters(j, filters));
  }

  private mapJob(item: RipplingListItem, detail?: RipplingDetail): JobListing {
    const locations =
      detail?.workLocations?.filter((v): v is string => typeof v === 'string' && v.length > 0) ??
      (item.workLocation?.label ? [item.workLocation.label] : []);

    const createdOn = detail?.createdOn;
    const parsed = createdOn ? new Date(createdOn) : undefined;

    return {
      id: item.uuid,
      companyName: this.config.name,
      title: item.name,
      department: detail?.department?.label ?? item.department?.label,
      locations,
      level: this.normalizeJobLevel(item.name),
      description: this.flattenDescription(detail?.description),
      applyUrl: item.url,
      postedDate: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : undefined,
      sourceUrl: item.url,
      scrapedAt: new Date().toISOString(),
    };
  }

  /** Rippling splits the posting into named HTML sections; join them into one plain string. */
  private flattenDescription(description?: Record<string, string>): string | undefined {
    if (!description || typeof description !== 'object') return undefined;
    const text = Object.values(description)
      .filter((v): v is string => typeof v === 'string')
      .join(' ');
    const stripped = this.stripHtml(text);
    return stripped || undefined;
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
