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
    let offset = 0;
    while (true) {
      const data = await this.rateLimitedFetch(hostFromUrl(apiUrl), async () => {
        const res = await axios.post<WorkdaySearchResponse>(
          apiUrl,
          {
            limit,
            offset,
            searchText: filters.jobTitle ?? '',
            appliedFacets: {},
          },
          {
            timeout: Number(process.env.SCRAPE_TIMEOUT_MS ?? 30000),
            headers: {
              'User-Agent': 'career-jobs-mcp/0.1',
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
          },
        );
        return res.data;
      });

      const batch = (data.jobPostings ?? []).map((p) =>
        this.mapJob(p, baseHost, tenant, site),
      );
      all.push(...batch);
      offset += limit;
      if (!data.jobPostings || data.jobPostings.length < limit || offset >= (data.total ?? 0)) break;
    }
    return all.filter((j) => this.matchesFilters(j, filters));
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
function parseWorkdayDate(raw: string | undefined): string | undefined {
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
