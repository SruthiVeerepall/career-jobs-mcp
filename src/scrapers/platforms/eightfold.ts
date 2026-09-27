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

/** PCSX renames every field; only the shape of the data is shared with v2. */
interface PcsxPosition {
  id: number | string;
  displayJobId?: string;
  name: string;
  locations?: string[];
  department?: string;
  /** Epoch seconds, when the posting went live. Results are sorted by this. */
  postedTs?: number;
  /** Epoch seconds, when the requisition was opened. Earlier than postedTs. */
  creationTs?: number;
  /** Site-relative, e.g. "/careers/job/1970393556978233". */
  positionUrl?: string;
}

interface PcsxResponse {
  status?: number;
  data?: { positions?: PcsxPosition[]; count?: number };
}

/** The API silently caps a page at 10 however large `num` is, so paging is the only way through. */
const PAGE_SIZE = 10;
/** Ceiling on paging, so a board of thousands cannot turn into thousands of requests. */
const MAX_JOBS = 600;
/** PCSX caps a page at 10 too, whatever `num` asks for. */
const PCSX_PAGE_SIZE = 10;
/** Base backoff after a PCSX 429; multiplied by the attempt number. */
const PCSX_BACKOFF_MS = 1500;

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

    // Newer tenants serve /api/pcsx/search and answer the v2 endpoint with
    // 403 {"message":"Not authorized for PCSX"}. That message reads like a
    // permission wall but is not one — the board is public, the API just moved.
    //
    // The detection is one request, and Eightfold throttles with intermittent 403s
    // on either API, so a wrong guess is possible. If the chosen API fails outright,
    // the other one is tried before the company is reported as failed.
    const pcsx = await this.usesPcsx(host, domain, timeout);
    const primary = () =>
      pcsx ? this.fetchViaPcsx(host, domain, timeout, filters) : this.fetchViaV2(host, domain, timeout, filters);
    const fallback = () =>
      pcsx ? this.fetchViaV2(host, domain, timeout, filters) : this.fetchViaPcsx(host, domain, timeout, filters);
    try {
      return await primary();
    } catch (err) {
      this.logProgress(`${pcsx ? 'PCSX' : 'v2'} API failed (${err instanceof Error ? err.message : err}); trying the other API`);
      try {
        return await fallback();
      } catch {
        throw err;
      }
    }
  }

  private async fetchViaV2(
    host: string,
    domain: string,
    timeout: number,
    filters: SearchFilters,
  ): Promise<JobListing[]> {
    const collected: EightfoldPosition[] = [];

    // sort_by=timestamp returns newest first, so once a page's oldest job falls
    // outside the requested window every later page does too and paging can stop.
    const windowMs = filters.postedSince ? POSTED_SINCE_MS[filters.postedSince] : undefined;
    const cutoff = windowMs ? Date.now() - windowMs : undefined;

    for (let start = 0; start < MAX_JOBS; start += PAGE_SIZE) {
      const url =
        `https://${host}/api/apply/v2/jobs?domain=${encodeURIComponent(domain)}` +
        `&start=${start}&num=${PAGE_SIZE}&sort_by=timestamp&triggerGoButton=false`;

      let data: EightfoldResponse;
      try {
        data = await this.rateLimitedFetch(hostFromUrl(url), async () => {
          const res = await axios.get<EightfoldResponse>(url, {
            timeout,
            headers: {
              'User-Agent': 'career-jobs-mcp/0.1 (Mozilla/5.0)',
              Accept: 'application/json',
            },
          });
          return res.data;
        });
      } catch (err) {
        // Same rule as PCSX: newest-first paging means collected pages are the ones a
        // window needs, so only a refused first page fails the company.
        if (collected.length === 0) throw err;
        this.logProgress(`Eightfold refused offset ${start}; keeping ${collected.length} jobs`);
        break;
      }

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

  /** One cheap probe of the v2 endpoint; a 403 there means the tenant has moved to PCSX. */
  private async usesPcsx(host: string, domain: string, timeout: number): Promise<boolean> {
    const url = `https://${host}/api/apply/v2/jobs?domain=${encodeURIComponent(domain)}&start=0&num=1`;
    try {
      const res = await axios.get(url, {
        timeout,
        validateStatus: () => true,
        headers: { 'User-Agent': 'career-jobs-mcp/0.1 (Mozilla/5.0)', Accept: 'application/json' },
      });
      // Any 403, not only the "Not authorized for PCSX" body: under load the v2 endpoint
      // of a PCSX tenant has answered 403 with other bodies, and routing those to v2
      // failed the whole company. A true v2 tenant answers 200 here.
      return res.status === 403;
    } catch {
      return false;
    }
  }

  private async fetchViaPcsx(
    host: string,
    domain: string,
    timeout: number,
    filters: SearchFilters,
  ): Promise<JobListing[]> {
    this.logProgress(`Eightfold ${host} uses the PCSX API`);
    const windowMs = filters.postedSince ? POSTED_SINCE_MS[filters.postedSince] : undefined;
    const cutoff = windowMs ? Date.now() - windowMs : undefined;
    const out: JobListing[] = [];

    // `query` is deliberately left empty even when a jobTitle was asked for.
    // PCSX matches semantically, so query=Java returns "Software Engineer II"
    // rows whose titles never contain "Java" — and the client-side title filter
    // then drops every one of them, turning a 458-hit search into zero results.
    // Like every other company scraper this fetches the board and filters here.
    //
    // Paging is newest-first: PCSX orders by postedTs descending (verified by
    // reading the timestamps back across pages), so the same early-break v2 uses
    // is sound. It is keyed on postedTs, which is >= creationTs, so a page that
    // falls outside the window cannot hide a newer job behind it.
    for (let start = 0; start < MAX_JOBS; start += PCSX_PAGE_SIZE) {
      const url =
        `https://${host}/api/pcsx/search?domain=${encodeURIComponent(domain)}` +
        `&query=&location=&start=${start}&num=${PCSX_PAGE_SIZE}&sort_by=timestamp`;

      let batch: PcsxPosition[] | null;
      try {
        batch = await this.rateLimitedFetch(hostFromUrl(url), () => this.getPcsxPage(url, timeout));
      } catch (err) {
        // Deep pages can be refused outright (Lockheed Martin answers 403 at offset 280).
        // Paging is newest-first, so what is already collected is the part any date
        // window needs — only a refusal of the FIRST page is a real failure.
        if (out.length === 0) throw err;
        this.logProgress(`PCSX refused offset ${start}; keeping ${out.length} jobs`);
        break;
      }

      // A page cap of 10 means a large board is dozens of rapid requests and
      // PCSX starts answering 429. Keep what has already been collected rather
      // than failing the whole company over the tail of the board.
      if (batch === null) {
        // Refused before a single page arrived: throw rather than return [], or the
        // empty result is cached and the board reads as having no jobs for hours.
        if (out.length === 0) throw new Error(`PCSX rate-limited on the first page for ${host}`);
        this.logProgress(`PCSX rate-limited at offset ${start}; keeping ${out.length} jobs`);
        break;
      }
      if (!batch.length) break;
      for (const p of batch) out.push(this.mapPcsxJob(p, host));
      if (batch.length < PCSX_PAGE_SIZE) break;

      if (cutoff !== undefined) {
        const oldest = batch[batch.length - 1]?.postedTs;
        if (oldest && oldest * 1000 < cutoff) break;
      }
    }

    return out.filter((j) => this.matchesFilters(j, filters));
  }

  /** One PCSX page, backing off on 429. Returns null once it keeps refusing. */
  private async getPcsxPage(url: string, timeout: number): Promise<PcsxPosition[] | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await axios.get<PcsxResponse>(url, {
        timeout,
        validateStatus: () => true,
        headers: { 'User-Agent': 'career-jobs-mcp/0.1 (Mozilla/5.0)', Accept: 'application/json' },
      });
      if (res.status === 200) return res.data?.data?.positions ?? [];
      if (res.status !== 429) throw new Error(`PCSX ${res.status} for ${url}`);
      await new Promise((r) => setTimeout(r, PCSX_BACKOFF_MS * (attempt + 1)));
    }
    return null;
  }

  private mapPcsxJob(p: PcsxPosition, host: string): JobListing {
    // postedTs is when the job went live — the analogue of Greenhouse's
    // `first_published`, and the field the board itself sorts and displays by.
    // creationTs is when the requisition was opened internally, often days
    // earlier, so using it would age a genuinely new posting out of the window.
    // Neither is an "updated" stamp; the t_update trap does not apply here.
    const ts = p.postedTs ?? p.creationTs;
    const url = p.positionUrl?.startsWith('http')
      ? p.positionUrl
      : `https://${host}${p.positionUrl ?? `/careers/job/${p.id}`}`;

    return {
      id: String(p.displayJobId ?? p.id),
      companyName: this.config.name,
      title: p.name,
      department: p.department,
      locations: p.locations ?? [],
      level: this.normalizeJobLevel(p.name),
      applyUrl: url,
      postedDate: ts ? new Date(ts * 1000).toISOString() : undefined,
      sourceUrl: url,
      scrapedAt: new Date().toISOString(),
    };
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
