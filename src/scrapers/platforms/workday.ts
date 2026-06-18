import axios from 'axios';
import type { JobListing, SearchFilters } from '../../types.js';
import { BaseScraper } from '../base-scraper.js';
import { hostFromUrl } from '../../utils/rate-limiter.js';

interface WorkdayJobPosting {
  title: string;
  externalPath: string;
  locationsText: string;
  postedOn: string;
  bulletFields?: string[];
}

interface WorkdaySearchResponse {
  total: number;
  jobPostings: WorkdayJobPosting[];
}

/**
 * Workday hosts career sites at:
 *   https://{tenant}.wd{N}.myworkdayjobs.com/{site}
 * Each has a JSON search endpoint:
 *   POST https://{tenant}.wd{N}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs
 *
 * Configure via platformIdentifier as: "{tenant}|wd{N}|{site}"
 *   e.g. for Salesforce: "salesforce|wd1|External_Career_Site"
 */
export class WorkdayScraper extends BaseScraper {
  // Cached per-scrape session headers for CSRF-protected tenants
  private sessionHeaders: Record<string, string> = {};

  async fetchJobs(filters: SearchFilters): Promise<JobListing[]> {
    const ident = this.config.platformIdentifier;
    if (!ident) throw new Error(`Workday scraper for ${this.config.name} missing platformIdentifier`);
    const [tenant, wd, site] = ident.split('|');
    if (!tenant || !wd || !site) {
      throw new Error(
        `Workday platformIdentifier must be "tenant|wdN|site" (got "${ident}" for ${this.config.name})`,
      );
    }
    const baseHost = `https://${tenant}.${wd}.myworkdayjobs.com`;
    const apiUrl = `${baseHost}/wday/cxs/${tenant}/${site}/jobs`;
    this.logProgress(`Fetching Workday: ${tenant}/${site}`);

    const all: JobListing[] = [];
    const limit = 20;
    // Cap pages to avoid fetching thousands of jobs when searchText is empty.
    // Workday returns most-recently-posted jobs first, so the first N pages cover recent postings.
    const maxPages = Number(process.env.WORKDAY_MAX_PAGES ?? 15); // 300 jobs max per company
    let offset = 0;
    let page = 0;
    while (page < maxPages) {
      const data = await this.rateLimitedFetch(hostFromUrl(apiUrl), () =>
        this.postJobs(apiUrl, baseHost, site, {
          limit,
          offset,
          searchText: filters.jobTitle ?? '',
          appliedFacets: {},
        }),
      );

      const batch = (data.jobPostings ?? []).map((p) =>
        this.mapJob(p, baseHost, tenant, site),
      );
      all.push(...batch);
      offset += limit;
      page++;
      if (!data.jobPostings || data.jobPostings.length < limit || offset >= (data.total ?? 0)) break;
    }
    return all.filter((j) => this.matchesFilters(j, filters));
  }

  private async postJobs(
    apiUrl: string,
    baseHost: string,
    site: string,
    body: object,
  ): Promise<WorkdaySearchResponse> {
    const timeout = Number(process.env.SCRAPE_TIMEOUT_MS ?? 30000);
    const makeHeaders = (): Record<string, string> => ({
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...this.sessionHeaders,
    });

    const res = await axios.post<WorkdaySearchResponse>(apiUrl, body, {
      timeout,
      headers: makeHeaders(),
      validateStatus: () => true,
    });

    if (res.status === 200) return res.data;

    // 422 = CSRF/session required. Prefetch cookies + CSRF token once, then retry.
    if (res.status === 422 && Object.keys(this.sessionHeaders).length === 0) {
      this.logProgress(`CSRF required for ${this.config.name}, fetching session…`);
      this.sessionHeaders = await this.fetchCSRFHeaders(baseHost, site);
      const retry = await axios.post<WorkdaySearchResponse>(apiUrl, body, {
        timeout,
        headers: makeHeaders(),
        validateStatus: () => true,
      });
      if (retry.status === 200) return retry.data;
      throw new Error(
        `Workday HTTP ${retry.status} for ${this.config.name} (after CSRF retry)`,
      );
    }

    throw new Error(`Workday HTTP ${res.status} for ${this.config.name}`);
  }

  // GET the careers page to harvest session cookies + CALYPSO_CSRF_TOKEN.
  private async fetchCSRFHeaders(baseHost: string, site: string): Promise<Record<string, string>> {
    const pageUrl = `${baseHost}/en-US/${site}/jobs`;
    try {
      const res = await axios.get(pageUrl, {
        timeout: 15000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        validateStatus: () => true,
      });

      const cookies: string[] = (res.headers['set-cookie'] as string[] | undefined) ?? [];
      const cookieStr = cookies.map((c) => c.split(';')[0]).join('; ');

      const headers: Record<string, string> = { Referer: pageUrl };
      if (cookieStr) headers['Cookie'] = cookieStr;

      for (const c of cookies) {
        const m = c.match(/CALYPSO_CSRF_TOKEN=([^;]+)/i);
        if (m) {
          headers['X-Calypso-CSRF-Token'] = m[1];
          break;
        }
      }
      return headers;
    } catch {
      return {};
    }
  }

  private mapJob(p: WorkdayJobPosting, baseHost: string, tenant: string, site: string): JobListing {
    const externalPath = p.externalPath ?? '';
    const applyUrl = externalPath ? `${baseHost}/en-US/${site}${externalPath}` : this.config.careerUrl;
    const id = externalPath.split('/').pop() || `${tenant}-${p.title}`;
    return {
      id,
      companyName: this.config.name,
      title: p.title,
      locations: p.locationsText ? [p.locationsText] : [],
      level: this.normalizeJobLevel(p.title),
      applyUrl,
      postedDate: parseWorkdayDate(p.postedOn),
      sourceUrl: applyUrl,
      scrapedAt: new Date().toISOString(),
    };
  }
}

// Converts Workday relative date strings to ISO-8601.
// Examples: "Posted Today", "Posted Yesterday", "Posted 4 Days Ago", "Posted 30+ Days Ago"
export function parseWorkdayDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  const now = Date.now();
  const day = 86_400_000;
  if (s.includes('today') || s === 'posted today') return new Date(now).toISOString();
  if (s.includes('yesterday')) return new Date(now - day).toISOString();
  // "posted N days ago" or "N+ days ago"
  const m = s.match(/(\d+)\+?\s+days?\s+ago/);
  if (m) return new Date(now - parseInt(m[1], 10) * day).toISOString();
  // Fallback: return the raw string so it's visible but won't parse as a valid date
  return raw;
}
