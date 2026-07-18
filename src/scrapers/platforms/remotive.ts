import axios from 'axios';
import type { JobListing, SearchFilters } from '../../types.js';
import { BaseScraper } from '../base-scraper.js';
import { loadProfile } from '../../profile/profile-manager.js';

interface RemotiveJob {
  id: number;
  title: string;
  company_name: string;
  candidate_required_location?: string;
  publication_date?: string;
  url: string;
  job_type?: string;
}

interface RemotiveResponse {
  jobs: RemotiveJob[];
}

/**
 * Remotive — public JSON API, no auth (personal/non-commercial use):
 *   GET https://remotive.com/api/remote-jobs?search={term}&limit=100
 * All jobs are remote; candidate_required_location says which regions may apply.
 * US-friendly regions are normalized to "Remote — …" so isUSJob() keeps them;
 * other regions pass through raw and get excluded downstream.
 */
export class RemotiveScraper extends BaseScraper {
  private static readonly HOST = 'remotive.com';

  async fetchJobs(filters: SearchFilters): Promise<JobListing[]> {
    const terms = filters.jobTitle ? [filters.jobTitle] : loadProfile().searchTerms;
    const seen = new Map<string, JobListing>();

    for (const term of terms) {
      const url = `https://${RemotiveScraper.HOST}/api/remote-jobs?search=${encodeURIComponent(term)}&limit=100`;
      const data = await this.rateLimitedFetch(RemotiveScraper.HOST, async () => {
        const res = await axios.get<RemotiveResponse>(url, {
          timeout: Number(process.env.SCRAPE_TIMEOUT_MS ?? 30000),
          headers: { 'User-Agent': 'career-jobs-mcp/0.1 (personal job search)' },
        });
        return res.data;
      });

      for (const j of data.jobs ?? []) {
        const id = `remotive-${j.id}`;
        if (seen.has(id) || !j.title) continue;
        seen.set(id, {
          id,
          companyName: j.company_name || 'Unknown',
          title: j.title,
          locations: [this.normalizeLocation(j.candidate_required_location)],
          level: this.normalizeJobLevel(j.title),
          applyUrl: j.url,
          postedDate: j.publication_date,
          sourceUrl: j.url,
          scrapedAt: new Date().toISOString(),
        });
      }
    }

    this.logProgress(`Remotive: ${seen.size} unique postings across ${terms.length} search terms`);
    return [...seen.values()].filter((j) => this.matchesFilters(j, filters));
  }

  private normalizeLocation(loc: string | undefined): string {
    const trimmed = (loc ?? '').trim();
    if (!trimmed || /worldwide|anywhere/i.test(trimmed)) return 'Remote — Worldwide';
    if (/usa|united states|americas|north america/i.test(trimmed)) return `Remote — ${trimmed}`;
    return trimmed; // e.g. "Europe" — excluded by isUSJob() downstream
  }
}
