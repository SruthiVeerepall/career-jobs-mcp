import axios from 'axios';
import type { JobListing, SearchFilters } from '../../types.js';
import { BaseScraper } from '../base-scraper.js';

interface WorkableJob {
  id: string;
  title: string;
  state?: string;
  description?: string;
  url: string;
  locations?: string[];
  location?: { city?: string; subregion?: string; countryName?: string };
  created?: string; // ISO timestamp — the posting date the site's day_range filter uses
  company?: { title?: string };
  workplace?: string; // 'remote' | 'hybrid' | 'on_site'
}

interface WorkableResponse {
  totalSize?: number;
  nextPageToken?: string;
  jobs?: WorkableJob[];
}

/**
 * Workable job search (jobs.workable.com) — every employer that hires through Workable,
 * searched in one place. Public JSON, no auth:
 *   GET https://jobs.workable.com/api/v1/jobs?query={term}&location=United States&day_range={1|7|30}
 * 20 jobs per page, continued with `pageToken`. `created` is the posting time and is what
 * `day_range` filters on (verified: day_range=7 returned nothing older than 7 days).
 * Descriptions come in the payload, so JD match needs no second fetch.
 */
export class WorkableJobsScraper extends BaseScraper {
  private static readonly DEFAULT_TERMS = ['Java Developer', 'Full Stack Developer', 'Software Engineer'];
  private static readonly HOST = 'jobs.workable.com';
  /** 20 jobs a page; caps one term at 200 postings so a broad term can't run unbounded. */
  private static readonly MAX_PAGES = 10;

  async fetchJobs(filters: SearchFilters): Promise<JobListing[]> {
    const terms = this.resolveSearchTerms(filters, WorkableJobsScraper.DEFAULT_TERMS);
    const seen = new Map<string, JobListing>();

    for (const term of terms) {
      let pageToken: string | undefined;
      for (let page = 0; page < WorkableJobsScraper.MAX_PAGES; page++) {
        const params = new URLSearchParams({
          query: term,
          location: filters.location ?? 'United States',
          day_range: this.dayRange(filters.postedSince),
        });
        if (pageToken) params.set('pageToken', pageToken);
        const url = `https://${WorkableJobsScraper.HOST}/api/v1/jobs?${params}`;

        const data = await this.rateLimitedFetch(WorkableJobsScraper.HOST, async () => {
          const res = await axios.get<WorkableResponse>(url, {
            timeout: Number(process.env.SCRAPE_TIMEOUT_MS ?? 30000),
            headers: { 'User-Agent': 'career-jobs-mcp/0.1 (personal job search)', Accept: 'application/json' },
          });
          return res.data;
        });

        for (const j of data.jobs ?? []) {
          const id = `workable-${j.id}`;
          if (seen.has(id) || !j.title || (j.state && j.state !== 'published')) continue;
          seen.set(id, this.mapJob(id, j));
        }
        pageToken = data.nextPageToken;
        if (!pageToken || !data.jobs?.length) break;
      }
    }

    this.logProgress(`Workable: ${seen.size} unique postings across ${terms.length} search terms`);
    return [...seen.values()].filter((j) => this.matchesFilters(j, filters));
  }

  private mapJob(id: string, j: WorkableJob): JobListing {
    const loc = j.location;
    const place = [loc?.city, loc?.subregion, loc?.countryName].filter(Boolean).join(', ');
    const locations = place ? [place] : [];
    // Country stays in the label so a non-US remote role is still rejected by isUSJob().
    if (j.workplace === 'remote') locations.push(`Remote — ${loc?.countryName ?? 'Unspecified'}`);
    return {
      id,
      companyName: j.company?.title || 'Unknown',
      title: j.title,
      locations,
      level: this.normalizeJobLevel(j.title),
      description: j.description ? stripHtml(j.description) : undefined,
      applyUrl: j.url,
      postedDate: j.created,
      sourceUrl: j.url,
      scrapedAt: new Date().toISOString(),
    };
  }

  private dayRange(postedSince: SearchFilters['postedSince']): string {
    switch (postedSince) {
      case 'today':
        return '1';
      case 'month':
        return '30';
      case 'week':
      default:
        return '7';
    }
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}
