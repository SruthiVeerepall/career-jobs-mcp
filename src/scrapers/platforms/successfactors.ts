import axios from 'axios';
import type { JobListing, SearchFilters } from '../../types.js';
import { BaseScraper } from '../base-scraper.js';
import { hostFromUrl } from '../../utils/rate-limiter.js';

interface SfJob {
  id: number | string;
  title?: string;
  /** Pre-joined, e.g. "Bend, OR, US, 97703". */
  location?: string;
  city?: string;
  state?: string;
  statename?: string;
  country?: string;
  department?: string;
  /** ISO with a bracketed zone suffix, e.g. "2026-07-31T07:00:00Z[UTC]". */
  referencedate?: string;
  /** Slug used to build the job detail URL. */
  urltitle?: string;
}

interface SfResponse {
  jobList?: SfJob[];
  facetCounts?: { country?: { count: number; name: string }[] };
}

const PAGE_SIZE = 100;
/**
 * Deliberately generous. `sortby: referencedate` is accepted but not actually
 * honoured — the rows come back in roughly arbitrary date order — so there is no
 * sound "stop once a page falls outside the window" shortcut, and a cap that
 * truncates the board would silently drop today's postings. At 100 rows a page
 * this is at most 20 requests.
 */
const MAX_JOBS = 2000;

/**
 * SAP SuccessFactors career sites built with Recruiting Marketing / Career Site
 * Builder — the portal behind a large share of big non-tech employers (EY,
 * Wipro, HCLTech, Qorvo, Seagate, L3Harris, SAP itself).
 *
 * `platformIdentifier` is the portal host, e.g. `careers.qorvo.com`. Every CSB
 * site exposes the same endpoint its own search page posts to:
 *
 *   POST https://{host}/services/jobs/search/
 *
 * Notes that cost time to rediscover:
 *  - The result array is `jobList`, not `jobs`. A response with `jobs` absent
 *    but HTTP 200 reads as an empty board unless you know that.
 *  - Country filtering is server-side via `filterquery.country` using lowercase
 *    ISO-2 codes, so rule #3 is satisfied before the rows are ever fetched.
 *  - `referencedate` is the posting date but carries a bracketed zone suffix
 *    (`...Z[UTC]`) that `new Date()` rejects; it must be stripped first.
 *  - Some hosts answer this path with HTML instead of JSON (they run an older
 *    template). That is treated as "no jobs" rather than a crash.
 */
export class SuccessFactorsScraper extends BaseScraper {
  async fetchJobs(filters: SearchFilters): Promise<JobListing[]> {
    const host = this.config.platformIdentifier;
    if (!host) throw new Error(`SuccessFactors scraper for ${this.config.name} missing platformIdentifier`);

    const url = `https://${host}/services/jobs/search/`;
    this.logProgress(`Fetching SuccessFactors: ${host}`);

    const timeout = Number(process.env.SCRAPE_TIMEOUT_MS ?? 30000);
    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Origin: `https://${host}`,
      Referer: `https://${host}/search/`,
    };

    const all: JobListing[] = [];
    let startrow = 0;

    while (startrow < MAX_JOBS) {
      const body = {
        keywords: filters.jobTitle ?? '',
        locationsearch: '',
        sortby: 'referencedate',
        sortdir: 'desc',
        recordsperpage: PAGE_SIZE,
        startrow,
        facetquery: { facet: true, limit: 100, fields: ['country'] },
        filterquery: { country: ['us'] },
      };

      const jobs = await this.rateLimitedFetch(hostFromUrl(url), async () => {
        const res = await axios.post<SfResponse>(url, body, { timeout, headers, validateStatus: () => true });
        if (res.status !== 200 || typeof res.data !== 'object' || res.data === null) return [];
        return res.data.jobList ?? [];
      });

      if (!jobs.length) break;
      for (const j of jobs) {
        if (!j.title) continue;
        all.push(this.mapJob(j, host));
      }
      if (jobs.length < PAGE_SIZE) break;
      startrow += jobs.length;
    }

    return all.filter((j) => this.matchesFilters(j, filters));
  }

  private mapJob(j: SfJob, host: string): JobListing {
    const location =
      j.location ?? [j.city, j.statename ?? j.state, j.country].filter(Boolean).join(', ');

    return {
      id: String(j.id),
      companyName: this.config.name,
      title: j.title!,
      locations: location ? [location] : [],
      department: j.department || undefined,
      level: this.normalizeJobLevel(j.title!),
      applyUrl: j.urltitle ? `https://${host}/job/${j.urltitle}/${j.id}/` : `https://${host}/job/${j.id}/`,
      postedDate: this.parseReferenceDate(j.referencedate),
      sourceUrl: this.config.careerUrl,
      scrapedAt: new Date().toISOString(),
    };
  }

  /** "2026-07-31T07:00:00Z[UTC]" — the bracketed zone must go before parsing. */
  private parseReferenceDate(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    const cleaned = raw.replace(/\[[^\]]*\]$/, '');
    const d = new Date(cleaned);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
}
