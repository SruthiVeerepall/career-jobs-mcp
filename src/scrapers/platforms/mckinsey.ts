import axios from 'axios';
import type { JobListing, SearchFilters } from '../../types.js';
import { BaseScraper } from '../base-scraper.js';
import { hostFromUrl } from '../../utils/rate-limiter.js';

interface McKinseyDoc {
  jobID: string;
  title: string;
  cities?: string[];
  countries?: string[];
  functions?: string[];
  postedToLinkedInDate?: string;
  jobApplyURL?: string;
  friendlyURL?: string;
}

interface McKinseySearchResponse {
  numFound: number;
  docs?: McKinseyDoc[];
}

const API = 'https://gateway.mckinsey.com/apigw-x0cceuow60/v1/api/jobs/search';

/**
 * The API answers 422 to an empty query, so a keyword is always needed. Fixed rather than
 * per-résumé: company cache rows are not keyed by search terms (see orchestrator), so a
 * profile-specific fetch would be served to every other profile.
 */
const TERMS = ['software', 'engineer', 'developer', 'technology', 'data'];

/**
 * McKinsey careers scraper — the JSON gateway behind mckinsey.com/careers/search-jobs.
 *
 * Replaces a Puppeteer DOM scrape that returned no dates, so the strict window gate
 * dropped every job. The gateway is reachable over plain HTTP (mckinsey.com itself
 * is not), and each doc carries `postedToLinkedInDate` — the date the opening was
 * published — plus a direct Avature apply link.
 *
 * platformIdentifier: not required.
 */
export class McKinseyScraper extends BaseScraper {
  async fetchJobs(filters: SearchFilters): Promise<JobListing[]> {
    const byId = new Map<string, JobListing>();
    for (const term of TERMS) {
      for (const job of await this.searchTerm(term)) byId.set(job.id, job);
    }
    return [...byId.values()].filter((j) => this.matchesFilters(j, filters));
  }

  private async searchTerm(term: string): Promise<JobListing[]> {
    this.logProgress(`Fetching McKinsey: ${term}`);
    const timeout = Number(process.env.SCRAPE_TIMEOUT_MS ?? 30000);
    const pageSize = 100;
    const maxPages = 3;
    const jobs: JobListing[] = [];
    for (let page = 0; page < maxPages; page++) {
      // `start` is a 1-based PAGE number, not a row offset — a row offset 500s past page 1.
      const url = `${API}?pageSize=${pageSize}&start=${page + 1}&lang=en&q=${encodeURIComponent(term)}`;
      const res = await this.rateLimitedFetch(hostFromUrl(url), () =>
        axios.get<McKinseySearchResponse>(url, {
          timeout,
          // 422 is the API's "no results" answer, not a failure.
          validateStatus: (s) => s === 200 || s === 422,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Accept: 'application/json',
            Origin: 'https://www.mckinsey.com',
            Referer: 'https://www.mckinsey.com/',
          },
        }),
      );
      const docs = res.status === 200 ? (res.data.docs ?? []) : [];
      jobs.push(...docs.filter((d) => d.jobID && d.title).map((d) => this.mapJob(d)));
      if (docs.length < pageSize || jobs.length >= (res.data.numFound ?? 0)) break;
    }
    return jobs;
  }

  private mapJob(d: McKinseyDoc): JobListing {
    const detailUrl = d.friendlyURL
      ? `https://www.mckinsey.com/careers/search-jobs/jobs/${d.friendlyURL}`
      : this.config.careerUrl;
    const cities = d.cities ?? [];
    const countries = d.countries ?? [];
    const locations = cities.length
      ? cities.map((c, i) => [c, countries[i] ?? countries[0]].filter(Boolean).join(', '))
      : countries;
    return {
      id: d.jobID,
      companyName: this.config.name,
      title: d.title.trim(),
      locations,
      department: d.functions?.[0],
      level: this.normalizeJobLevel(d.title),
      applyUrl: d.jobApplyURL || detailUrl,
      postedDate: d.postedToLinkedInDate && /^\d{4}-\d{2}-\d{2}/.test(d.postedToLinkedInDate) ? d.postedToLinkedInDate : undefined,
      sourceUrl: detailUrl,
      scrapedAt: new Date().toISOString(),
    };
  }
}
