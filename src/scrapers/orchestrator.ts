import type { JobListing, ScrapeResult, SearchFilters } from '../types.js';
import { cacheManager } from '../cache/cache-manager.js';
import { companyRegistry } from './company-registry.js';
import { logger } from '../utils/logger.js';
import { withTimeout } from '../utils/retry.js';

const SCRAPE_TIMEOUT_MS = Number(process.env.SCRAPE_TIMEOUT_MS ?? 30000);

export async function scrapeCompany(
  companyNameOrSlug: string,
  filters: SearchFilters,
  options: { forceRefresh?: boolean } = {},
): Promise<ScrapeResult> {
  const config = companyRegistry.get(companyNameOrSlug);
  if (!config) {
    return {
      company: companyNameOrSlug,
      jobs: [],
      scrapedAt: new Date().toISOString(),
      fromCache: false,
      error: `Unknown company: "${companyNameOrSlug}". Use addCompanyCareerSite to register it, or call listCompanies for supported names.`,
    };
  }

  if (!options.forceRefresh) {
    const cached = cacheManager.getCompanyScrape(config.slug);
    if (cached) {
      const filtered = cached.jobs.filter((j) => matchesFilters(j, filters));
      return {
        company: config.name,
        jobs: filtered,
        scrapedAt: cached.scrapedAt,
        fromCache: true,
      };
    }
  }

  try {
    const scraper = companyRegistry.createScraper(config);
    // Fetch without title filter so the cache stores all jobs.
    // Title/level/dept filters are applied client-side below and on every cache read.
    const cacheFilters: SearchFilters = { postedSince: filters.postedSince, remoteOnly: filters.remoteOnly };
    const allJobs = await withTimeout(
      scraper.fetchJobs(cacheFilters),
      SCRAPE_TIMEOUT_MS * 4,
      `scrape ${config.name}`,
    );
    cacheManager.saveCompanyScrape(config.slug, allJobs);
    return {
      company: config.name,
      jobs: allJobs.filter((j) => matchesFilters(j, filters)),
      scrapedAt: new Date().toISOString(),
      fromCache: false,
    };
  } catch (err) {
    logger.error(`Scrape failed for ${config.name}`, err);
    return {
      company: config.name,
      jobs: [],
      scrapedAt: new Date().toISOString(),
      fromCache: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function scrapeMany(
  companies: string[],
  filters: SearchFilters,
): Promise<ScrapeResult[]> {
  const results = await Promise.allSettled(companies.map((c) => scrapeCompany(c, filters)));
  return results.map((r, idx) =>
    r.status === 'fulfilled'
      ? r.value
      : {
          company: companies[idx],
          jobs: [],
          scrapedAt: new Date().toISOString(),
          fromCache: false,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        },
  );
}

function matchesFilters(job: JobListing, filters: SearchFilters): boolean {
  if (filters.jobTitle && !job.title.toLowerCase().includes(filters.jobTitle.toLowerCase())) return false;
  if (filters.location) {
    const needle = filters.location.toLowerCase();
    if (!job.locations.some((l) => l.toLowerCase().includes(needle))) return false;
  }
  if (filters.level && job.level && filters.level !== job.level) return false;
  if (filters.department && job.department && !job.department.toLowerCase().includes(filters.department.toLowerCase())) return false;
  if (filters.remoteOnly && !job.locations.some((l) => /remote/i.test(l))) return false;
  if (filters.postedSince && job.postedDate) {
    const posted = new Date(job.postedDate).getTime();
    if (Number.isNaN(posted)) return true;
    const day = 86400000;
    const limits = { today: day, week: 7 * day, month: 30 * day } as const;
    if (Date.now() - posted > limits[filters.postedSince]) return false;
  }
  return true;
}
