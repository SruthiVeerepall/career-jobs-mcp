import axios from 'axios';
import * as cheerio from 'cheerio';
import type { JobListing, SearchFilters } from '../../types.js';
import { BaseScraper } from '../base-scraper.js';
import { hostFromUrl } from '../../utils/rate-limiter.js';
import { POSTED_SINCE_MS } from '../../utils/posted-date.js';

interface RadancyResponse {
  results?: string;
  hasJobs?: boolean;
}

const PAGE_SIZE = 100;
const MAX_JOBS = 1000;
/** Cap on detail fetches used to recover dates the list view omits. */
const DETAIL_MAX = 80;
const DETAIL_CONCURRENCY = 6;

/**
 * Radancy (TalentBrew) career portals — Comcast, Disney, Intuit, UnitedHealth,
 * Moody's, Charles Schwab and many other large employers.
 *
 * `platformIdentifier` is the portal host, e.g. `jobs.comcast.com`. The search
 * page fetches an HTML fragment from its own site:
 *
 *   GET https://{host}/search-jobs/results?...&CurrentPage=N
 *
 * Two things make this workable despite being HTML rather than JSON:
 *
 *  - `SortCriteria=1&SortDirection=1` is date-descending (verified against the
 *    rendered dates; SortDirection=0 is the same sort ascending, which returns
 *    2024 postings first). Newest-first is what lets paging stop early and lets
 *    a bounded detail fan-out cover the jobs that actually matter.
 *  - Roughly half of these portals omit `.job-date-posted` from the list markup
 *    (Comcast, Disney and Moody's render it; Intuit, UnitedHealth and Schwab do
 *    not). Undated jobs die at the strict window gate, so for those the date is
 *    recovered from the job's own page, which carries `"PostedDate":"<ISO>"`.
 *    Same precedent as WorkdayScraper.backfillMissingDates and the Rippling
 *    scraper, and bounded the same way.
 *
 * The full query string is not decoration: dropping the ModuleName/FacetType
 * parameters makes the endpoint answer 200 with an empty `results` string.
 */
export class RadancyScraper extends BaseScraper {
  async fetchJobs(filters: SearchFilters): Promise<JobListing[]> {
    const host = this.config.platformIdentifier;
    if (!host) throw new Error(`Radancy scraper for ${this.config.name} missing platformIdentifier`);

    this.logProgress(`Fetching Radancy: ${host}`);
    const timeout = Number(process.env.SCRAPE_TIMEOUT_MS ?? 30000);
    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: `https://${host}/search-jobs`,
    };

    const windowMs = filters.postedSince ? POSTED_SINCE_MS[filters.postedSince] : undefined;
    const cutoff = windowMs ? Date.now() - windowMs : undefined;

    const all: JobListing[] = [];
    for (let page = 1; all.length < MAX_JOBS; page++) {
      const url = this.searchUrl(host, page, filters.jobTitle);
      const html = await this.rateLimitedFetch(hostFromUrl(url), async () => {
        const res = await axios.get<RadancyResponse>(url, { timeout, headers, validateStatus: () => true });
        return res.status === 200 ? (res.data?.results ?? '') : '';
      });
      if (!html) break;

      const batch = this.parseList(html, host);
      if (!batch.length) break;
      all.push(...batch);

      // Newest-first, so once a dated page falls outside the window the rest do too.
      if (cutoff !== undefined) {
        const last = batch[batch.length - 1]?.postedDate;
        if (last && new Date(last).getTime() < cutoff) break;
      }
      // On a portal that renders no dates at all, only the first DETAIL_MAX jobs
      // can be dated by the backfill, and everything past that is dropped by the
      // window gate anyway. Paging further is pure cost — and because the sort is
      // date-descending, the jobs we do keep are the newest ones.
      if (!all.some((j) => j.postedDate) && all.length >= DETAIL_MAX) break;
      if (batch.length < PAGE_SIZE) break;
    }

    await this.backfillMissingDates(all, host, timeout, headers);
    return all.filter((j) => this.matchesFilters(j, filters));
  }

  private searchUrl(host: string, page: number, keywords?: string): string {
    const params = new URLSearchParams({
      ActiveFacetID: '0',
      CurrentPage: String(page),
      RecordsPerPage: String(PAGE_SIZE),
      Distance: '50',
      RadiusUnitType: '0',
      Keywords: keywords ?? '',
      Location: '',
      ShowRadius: 'False',
      IsPagination: 'True',
      CustomFacetName: '',
      FacetTerm: '',
      FacetType: '0',
      SearchResultsModuleName: 'Search Results',
      SearchFiltersModuleName: 'Search Filters',
      SortCriteria: '1',
      SortDirection: '1',
      SearchType: '5',
    });
    return `https://${host}/search-jobs/results?${params}`;
  }

  private parseList(html: string, host: string): JobListing[] {
    const $ = cheerio.load(html);
    const out: JobListing[] = [];

    // Two layouts are in use: a <ul><li> list where location and date sit
    // INSIDE the anchor (Comcast, UnitedHealth), and a <table> where they are
    // sibling <td>s of the anchor's cell (Disney). Reading them off the whole
    // row rather than the anchor covers both.
    $('#search-results-list a[data-job-id]').each((_i, el) => {
      const a = $(el);
      const id = a.attr('data-job-id');
      const href = a.attr('href');
      const title = a.find('h2').first().text().trim() || a.text().trim();
      if (!id || !href || !title) return;

      const row = a.closest('li, tr');
      const scope = row.length ? row : a;
      const location = scope.find('.job-location').first().text().trim();
      const dateText = scope.find('.job-date-posted').first().text().trim();

      out.push({
        id,
        companyName: this.config.name,
        title,
        locations: location ? [location] : [],
        department: scope.find('.job-category span').first().text().trim() || undefined,
        level: this.normalizeJobLevel(title),
        applyUrl: href.startsWith('http') ? href : `https://${host}${href}`,
        postedDate: this.parseListDate(dateText),
        sourceUrl: this.config.careerUrl,
        scrapedAt: new Date().toISOString(),
      });
    });

    return out;
  }

  /** Portals render either "08/17/2026" or "Aug. 19, 2026". */
  private parseListDate(text: string): string | undefined {
    if (!text) return undefined;
    const mdy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mdy) {
      const [, m, d, y] = mdy;
      return new Date(Date.UTC(+y, +m - 1, +d)).toISOString();
    }
    const parsed = new Date(text.replace(/\./g, ''));
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  }

  /**
   * For portals whose list markup has no date, read it off each job's own page.
   * Bounded, and only ever reached by those portals — a list that carries dates
   * pays nothing here.
   */
  private async backfillMissingDates(
    jobs: JobListing[],
    host: string,
    timeout: number,
    headers: Record<string, string>,
  ): Promise<void> {
    const undated = jobs.filter((j) => !j.postedDate).slice(0, DETAIL_MAX);
    if (!undated.length) return;
    this.logProgress(`Radancy ${host}: backfilling dates for ${undated.length} postings`);

    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(DETAIL_CONCURRENCY, undated.length) }, async () => {
        while (cursor < undated.length) {
          const job = undated[cursor++];
          try {
            const detail = await this.rateLimitedFetch(hostFromUrl(job.applyUrl), async () => {
              const res = await axios.get<string>(job.applyUrl, {
                timeout,
                headers,
                validateStatus: () => true,
                responseType: 'text',
              });
              return res.status === 200 ? String(res.data) : '';
            });
            // Prefer the full ISO stamp over the schema.org "YYYY-M-D" form,
            // which is zero-padded inconsistently across portals.
            const iso = detail.match(/"PostedDate"\s*:\s*"([^"]+)"/);
            const jsonLd = detail.match(/"datePosted"\s*:\s*"([^"]+)"/);
            const raw = iso?.[1] ?? jsonLd?.[1];
            if (!raw) continue;
            const d = new Date(raw);
            if (!Number.isNaN(d.getTime())) job.postedDate = d.toISOString();
          } catch {
            // A failed detail leaves the job undated; the window gate drops it.
          }
        }
      }),
    );
  }
}
