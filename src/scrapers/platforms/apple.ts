import axios from 'axios';
import type { JobListing, SearchFilters } from '../../types.js';
import { BaseScraper } from '../base-scraper.js';
import { hostFromUrl } from '../../utils/rate-limiter.js';

interface AppleLocation {
  name: string;
  city: string;
  stateProvince: string;
  countryName: string;
  countryID: string; // 'iso-country-USA' for US jobs
}

interface AppleJob {
  reqId: string;
  positionId: number;
  postingTitle: string;
  transformedPostingTitle: string;
  locations: AppleLocation[];
  postingDate: string; // "Jun 08, 2026"
  jobSummary: string;
  team: { teamName: string };
  homeOffice: boolean;
}

interface AppleLoaderData {
  search: {
    searchResults: AppleJob[];
    totalRecords: number;
  };
}

/**
 * Apple career scraper — parses SSR hydration data from jobs.apple.com.
 *
 * Apple's search page embeds all job data in a window.__staticRouterHydrationData
 * JSON.parse() call. No Puppeteer required.
 *
 * platformIdentifier: not required.
 * Search URL: https://jobs.apple.com/en-us/search?page={N}&sort=newest&query={term}
 */
export class AppleScraper extends BaseScraper {
  private static readonly PAGE_SIZE = 20;
  private static readonly MAX_PAGES = Number(process.env.APPLE_MAX_PAGES ?? 20);

  async fetchJobs(filters: SearchFilters): Promise<JobListing[]> {
    const all: JobListing[] = [];
    const query = encodeURIComponent(filters.jobTitle ?? 'software engineer');
    let page = 1;
    let total = Infinity;

    this.logProgress(`Fetching Apple: ${filters.jobTitle ?? 'software engineer'}`);

    while (all.length < total && page <= AppleScraper.MAX_PAGES) {
      const url = `https://jobs.apple.com/en-us/search?page=${page}&sort=newest&query=${query}`;

      const html = await this.rateLimitedFetch(hostFromUrl(url), async () => {
        const res = await axios.get<string>(url, {
          timeout: Number(process.env.SCRAPE_TIMEOUT_MS ?? 30000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Accept: 'text/html,application/xhtml+xml',
          },
          responseType: 'text',
        });
        return res.data;
      });

      const loaderData = this.extractLoaderData(html);
      if (!loaderData?.search?.searchResults?.length) break;

      total = loaderData.search.totalRecords;

      for (const j of loaderData.search.searchResults) {
        if (!j.postingTitle || !j.positionId) continue;

        // Skip non-US jobs (all locations must be non-US to exclude)
        if (
          j.locations.length > 0 &&
          j.locations.every((l) => l.countryID && l.countryID !== 'iso-country-USA')
        ) {
          continue;
        }

        const locationStrings = j.locations.map((l) =>
          [l.city, l.stateProvince, l.countryName].filter(Boolean).join(', ') || l.name,
        );
        if (j.homeOffice) locationStrings.push('Remote');

        all.push({
          id: j.reqId || String(j.positionId),
          companyName: this.config.name,
          title: j.postingTitle,
          department: j.team?.teamName,
          locations: locationStrings,
          level: this.normalizeJobLevel(j.postingTitle),
          applyUrl: `https://jobs.apple.com/en-us/details/${j.positionId}/${j.transformedPostingTitle}`,
          postedDate: this.parseDate(j.postingDate),
          description: j.jobSummary,
          sourceUrl: this.config.careerUrl,
          scrapedAt: new Date().toISOString(),
        });
      }

      page++;
      if (loaderData.search.searchResults.length < AppleScraper.PAGE_SIZE) break;
    }

    return all.filter((j) => this.matchesFilters(j, filters));
  }

  private extractLoaderData(html: string): AppleLoaderData | undefined {
    const m = html.match(
      /window\.__staticRouterHydrationData\s*=\s*JSON\.parse\(([\s\S]*?)\);<\/script>/,
    );
    if (!m) return undefined;
    try {
      // m[1] is a JSON-encoded string: '"{\\"loaderData\\":...}"'
      // First parse unwraps the string value, second parse gets the object.
      const jsonStr = JSON.parse(m[1]) as string;
      const data = JSON.parse(jsonStr) as { loaderData: AppleLoaderData };
      return data?.loaderData;
    } catch {
      return undefined;
    }
  }

  private parseDate(raw: string): string | undefined {
    if (!raw) return undefined;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  }
}
