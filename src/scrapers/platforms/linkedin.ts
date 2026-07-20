import axios from 'axios';
import * as cheerio from 'cheerio';
import type { JobListing, SearchFilters } from '../../types.js';
import { BaseScraper } from '../base-scraper.js';
import { loadProfile } from '../../profile/profile-manager.js';

/**
 * LinkedIn public guest jobs search — no login or API key required.
 *   GET https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search
 * Returns HTML fragments of job cards (25 per page, paginated via `start`).
 *
 * Unlike company scrapers, LinkedIn is a cross-company job board, so a
 * no-keyword fetch is meaningless. When no jobTitle filter is given, we run
 * the profile search terms from CLAUDE.md (Java / Full Stack / Software
 * Engineer) and dedupe by posting id. Each result's companyName is the real
 * hiring company parsed from the card, and applyUrl is the direct
 * linkedin.com/jobs/view/{id} link.
 */
export class LinkedInScraper extends BaseScraper {
  private static readonly MAX_PER_TERM = 50; // page size varies (10–25), so paginate by count fetched
  private static readonly HOST = 'www.linkedin.com';

  async fetchJobs(filters: SearchFilters): Promise<JobListing[]> {
    const terms = filters.jobTitle ? [filters.jobTitle] : loadProfile().searchTerms;
    const seen = new Map<string, JobListing>();

    for (const term of terms) {
      for (let start = 0; start < LinkedInScraper.MAX_PER_TERM; ) {
        const jobs = await this.fetchPage(term, start, filters);
        if (jobs.length === 0) break; // no more results for this term
        for (const job of jobs) {
          if (!seen.has(job.id)) seen.set(job.id, job);
        }
        start += jobs.length;
      }
    }

    this.logProgress(`LinkedIn: ${seen.size} unique postings across ${terms.length} search terms`);
    return [...seen.values()].filter((j) => this.matchesFilters(j, filters));
  }

  private async fetchPage(keywords: string, start: number, filters: SearchFilters): Promise<JobListing[]> {
    const params = new URLSearchParams({
      keywords,
      location: filters.location ?? 'United States',
      f_TPR: this.timeParam(filters.postedSince),
      start: String(start),
    });
    if (filters.remoteOnly) params.set('f_WT', '2');
    const url = `https://${LinkedInScraper.HOST}/jobs-guest/jobs/api/seeMoreJobPostings/search?${params}`;

    const html = await this.rateLimitedFetch(LinkedInScraper.HOST, async () => {
      const res = await axios.get<string>(url, {
        timeout: Number(process.env.SCRAPE_TIMEOUT_MS ?? 30000),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        // LinkedIn returns 400 when `start` passes the end of results — not an error.
        validateStatus: (s) => s === 200 || s === 400,
      });
      return res.status === 200 ? res.data : '';
    });
    if (!html) return [];

    return this.parseCards(html);
  }

  private parseCards(html: string): JobListing[] {
    const $ = cheerio.load(html);
    const jobs: JobListing[] = [];

    $('div.base-search-card').each((_, el) => {
      const card = $(el);
      const urn = card.attr('data-entity-urn') ?? '';
      const id = urn.split(':').pop() ?? '';
      const title = card.find('h3.base-search-card__title').text().trim();
      const company = card.find('h4.base-search-card__subtitle').text().trim();
      const location = card.find('span.job-search-card__location').text().trim();
      const postedDate = card.find('time[datetime]').attr('datetime');
      if (!id || !title) return;

      const applyUrl = `https://www.linkedin.com/jobs/view/${id}/`;
      jobs.push({
        id: `linkedin-${id}`,
        companyName: company || 'Unknown',
        title,
        locations: location ? [location] : [],
        level: this.normalizeJobLevel(title),
        applyUrl,
        postedDate,
        sourceUrl: applyUrl,
        scrapedAt: new Date().toISOString(),
      });
    });

    return jobs;
  }

  private timeParam(postedSince: SearchFilters['postedSince']): string {
    switch (postedSince) {
      case 'today':
        return 'r86400';
      case 'month':
        return 'r2592000';
      case 'week':
      default:
        return 'r604800';
    }
  }
}
