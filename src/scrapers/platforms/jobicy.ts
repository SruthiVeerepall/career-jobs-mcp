import axios from 'axios';
import type { JobListing, SearchFilters } from '../../types.js';
import { BaseScraper } from '../base-scraper.js';

interface JobicyJob {
  id: number;
  url: string;
  jobTitle: string;
  companyName?: string;
  jobGeo?: string;
  jobDescription?: string;
  pubDate?: string;
}

interface JobicyResponse {
  jobs?: JobicyJob[];
}

/**
 * Jobicy — remote-job board, public JSON API, no auth (asks that listings credit Jobicy
 * and link to the original job URL, which `applyUrl` does):
 *   GET https://jobicy.com/api/v2/remote-jobs?count=100&geo=usa&tag={term}
 * `tag` is a loose keyword match; the title filter downstream does the real narrowing.
 * No date parameter — the window is applied client-side on `pubDate`.
 */
export class JobicyScraper extends BaseScraper {
  private static readonly DEFAULT_TERMS = ['Java', 'Full Stack', 'Software Engineer'];
  private static readonly HOST = 'jobicy.com';

  async fetchJobs(filters: SearchFilters): Promise<JobListing[]> {
    const terms = this.resolveSearchTerms(filters, JobicyScraper.DEFAULT_TERMS);
    const seen = new Map<string, JobListing>();

    for (const term of terms) {
      const params = new URLSearchParams({ count: '100', geo: 'usa', tag: term });
      const url = `https://${JobicyScraper.HOST}/api/v2/remote-jobs?${params}`;
      const data = await this.rateLimitedFetch(JobicyScraper.HOST, async () => {
        const res = await axios.get<JobicyResponse>(url, {
          timeout: Number(process.env.SCRAPE_TIMEOUT_MS ?? 30000),
          headers: { 'User-Agent': 'career-jobs-mcp/0.1 (personal job search)', Accept: 'application/json' },
        });
        return res.data;
      });

      for (const j of data.jobs ?? []) {
        const id = `jobicy-${j.id}`;
        if (seen.has(id) || !j.jobTitle) continue;
        seen.set(id, {
          id,
          companyName: decodeEntities(j.companyName || 'Unknown'),
          title: decodeEntities(j.jobTitle),
          locations: [this.normalizeLocation(j.jobGeo)],
          level: this.normalizeJobLevel(j.jobTitle),
          description: j.jobDescription ? stripHtml(j.jobDescription) : undefined,
          applyUrl: j.url,
          postedDate: j.pubDate,
          sourceUrl: j.url,
          scrapedAt: new Date().toISOString(),
        });
      }
    }

    this.logProgress(`Jobicy: ${seen.size} unique postings across ${terms.length} search terms`);
    return [...seen.values()].filter((j) => this.matchesFilters(j, filters));
  }

  private normalizeLocation(geo: string | undefined): string {
    const g = (geo ?? '').trim();
    if (!g || /anywhere|worldwide/i.test(g)) return 'Remote — Worldwide';
    if (/usa|united states|americas|north america/i.test(g)) return `Remote — ${g}`;
    return g; // e.g. "EMEA" — excluded by isUSJob() downstream
  }
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&#039;|&#39;/g, "'").replace(/&quot;/g, '"');
}

function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')).replace(/\s+/g, ' ').trim();
}
