import axios from 'axios';
import type { JobListing, SearchFilters } from '../../types.js';
import { BaseScraper } from '../base-scraper.js';
import { hostFromUrl } from '../../utils/rate-limiter.js';

interface PhenomJob {
  jobId?: string;
  jobSeqNo?: string;
  reqId?: string;
  title?: string;
  /** ISO with offset, e.g. "2026-07-22T00:00:00.000+0000" — when the posting went live. */
  postedDate?: string;
  /** When the requisition was created; earlier than postedDate. Fallback only. */
  dateCreated?: string;
  city?: string;
  state?: string;
  country?: string;
  cityState?: string;
  cityStateCountry?: string;
  location?: string;
  multi_location?: string[];
  category?: string;
  multi_category?: string[];
  type?: string;
  applyUrl?: string;
  descriptionTeaser?: string;
}

interface PhenomResponse {
  refineSearch?: {
    status?: number;
    hits?: number;
    totalHits?: number;
    data?: { jobs?: PhenomJob[] };
  };
}

const PAGE_SIZE = 50;
const MAX_JOBS = 1000;

/**
 * Phenom People — the career-site platform behind a large share of Fortune-500
 * job portals (eBay, AppDynamics, Equifax and many more).
 *
 * `platformIdentifier` is the portal host, e.g. `jobs.ebayinc.com`. Every Phenom
 * site exposes the same widget endpoint that its own front end calls:
 *
 *   POST https://{host}/widgets      body: { ddoKey: 'refineSearch', ... }
 *
 * Two body fields are load-bearing and easy to miss: without `jobs: true` the
 * response carries facet counts and `hits: 0` — a 200 with no listings, which
 * reads as an empty board rather than a malformed request. `pageNumber` is
 * 1-based while `from` is a 0-based record offset, and both must agree or the
 * same page is returned forever.
 *
 * Date field is `postedDate` (when the posting went live), **not** `dateCreated`
 * (when the requisition was opened, typically days earlier) — the same
 * distinction that makes Greenhouse's `first_published` right and `updated_at`
 * wrong. `dateCreated` is only a fallback for postings that omit `postedDate`.
 */
export class PhenomScraper extends BaseScraper {
  async fetchJobs(filters: SearchFilters): Promise<JobListing[]> {
    const host = this.config.platformIdentifier;
    if (!host) throw new Error(`Phenom scraper for ${this.config.name} missing platformIdentifier`);

    const url = `https://${host}/widgets`;
    this.logProgress(`Fetching Phenom: ${host}`);

    const timeout = Number(process.env.SCRAPE_TIMEOUT_MS ?? 30000);
    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Origin: `https://${host}`,
      Referer: `https://${host}/search-results`,
    };

    const all: JobListing[] = [];
    const seen = new Set<string>();
    let from = 0;
    let total = Infinity;

    while (from < total && all.length < MAX_JOBS) {
      const body = {
        lang: 'en_us',
        deviceType: 'desktop',
        country: 'us',
        pageName: 'search-results',
        ddoKey: 'refineSearch',
        sortBy: 'Most recent',
        subsearch: '',
        from,
        jobs: true,
        counts: true,
        all_fields: ['category', 'country', 'state', 'city', 'type'],
        pageNumber: Math.floor(from / PAGE_SIZE) + 1,
        size: PAGE_SIZE,
        clearAll: false,
        jdsource: 'facets',
        isSliderEnable: false,
        pageId: 'page3',
        siteType: 'external',
        keywords: filters.jobTitle ?? '',
        global: true,
        selected_fields: {},
        locationData: {},
      };

      const page = await this.rateLimitedFetch(hostFromUrl(url), async () => {
        const res = await axios.post<PhenomResponse>(url, body, { timeout, headers });
        return res.data?.refineSearch;
      });

      const jobs = page?.data?.jobs ?? [];
      if (!jobs.length) break;
      total = page?.totalHits ?? jobs.length;

      for (const j of jobs) {
        const id = j.jobSeqNo ?? j.jobId ?? j.reqId;
        if (!id || seen.has(id) || !j.title) continue;
        seen.add(id);
        all.push(this.mapJob(j, id, host));
      }

      from += jobs.length;
    }

    return all.filter((j) => this.matchesFilters(j, filters));
  }

  private mapJob(j: PhenomJob, id: string, host: string): JobListing {
    const locations = j.multi_location?.length
      ? [...j.multi_location]
      : [j.cityStateCountry ?? j.cityState ?? j.location ?? [j.city, j.state, j.country].filter(Boolean).join(', ')].filter(
          (s): s is string => Boolean(s),
        );

    const posted = j.postedDate ?? j.dateCreated;

    return {
      id,
      companyName: this.config.name,
      title: j.title!,
      locations,
      department: j.category ?? j.multi_category?.[0],
      level: this.normalizeJobLevel(j.title!),
      // Phenom's own applyUrl often points straight at the underlying ATS
      // (Workday, Taleo…), which is the real apply page and what rule #5 wants.
      applyUrl: j.applyUrl ?? `https://${host}/job/${id}`,
      postedDate: posted ? new Date(posted).toISOString() : undefined,
      sourceUrl: this.config.careerUrl,
      scrapedAt: new Date().toISOString(),
    };
  }
}
