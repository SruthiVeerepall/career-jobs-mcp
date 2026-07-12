import '../utils/http-agent.js'; // side-effect: enable keep-alive on all axios calls
import type { CompanyConfig, JobListing, ScrapeResult, SearchFilters } from '../types.js';
import { cacheManager } from '../cache/cache-manager.js';
import { companyRegistry } from './company-registry.js';
import { logger } from '../utils/logger.js';
import { withTimeout } from '../utils/retry.js';

const SCRAPE_TIMEOUT_MS = Number(process.env.SCRAPE_TIMEOUT_MS ?? 30000);

// Max companies fetched from the network at once. A CONSTANT ceiling — the run time
// scales linearly with company count, but concurrent sockets never explode as the
// registry grows. Tune via SCRAPE_CONCURRENCY.
const SCRAPE_CONCURRENCY = Number(process.env.SCRAPE_CONCURRENCY ?? 24);

// In-flight coalescing: if two callers ask for the same company (same cache-relevant
// filters) while a fetch is already running, they share the one network fetch instead
// of stampeding the career site. Keyed on the filters that actually change the fetch
// (postedSince / remoteOnly) — jobTitle/level/etc. are applied client-side, so they
// don't affect what gets fetched or cached.
const inFlight = new Map<string, Promise<JobListing[]>>();

function fetchAndCache(config: CompanyConfig, cacheFilters: SearchFilters): Promise<JobListing[]> {
  const key = `${config.slug}|${cacheFilters.postedSince ?? ''}|${cacheFilters.remoteOnly ?? ''}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const scraper = companyRegistry.createScraper(config);
    const allJobs = await withTimeout(
      scraper.fetchJobs(cacheFilters),
      SCRAPE_TIMEOUT_MS * 4,
      `scrape ${config.name}`,
    );
    cacheManager.saveCompanyScrape(config.slug, allJobs);
    return allJobs;
  })().finally(() => inFlight.delete(key));

  inFlight.set(key, promise);
  return promise;
}

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
    // Fetch without title filter so the cache stores all jobs.
    // Title/level/dept filters are applied client-side below and on every cache read.
    // fetchAndCache coalesces concurrent identical fetches into one network call.
    const cacheFilters: SearchFilters = { postedSince: filters.postedSince, remoteOnly: filters.remoteOnly };
    const allJobs = await fetchAndCache(config, cacheFilters);
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

export interface ScrapeManyOptions {
  /** Max companies fetched concurrently. Defaults to SCRAPE_CONCURRENCY. */
  concurrency?: number;
  /** Called after each company finishes, for progress reporting. */
  onProgress?: (done: number, total: number) => void;
}

export async function scrapeMany(
  companies: string[],
  filters: SearchFilters,
  options: ScrapeManyOptions = {},
): Promise<ScrapeResult[]> {
  const concurrency = Math.max(1, options.concurrency ?? SCRAPE_CONCURRENCY);
  const results = new Array<ScrapeResult>(companies.length);
  let next = 0;
  let done = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const i = next++;
      if (i >= companies.length) return;
      try {
        results[i] = await scrapeCompany(companies[i], filters);
      } catch (err) {
        // scrapeCompany already catches internally, but guard the pool regardless.
        results[i] = {
          company: companies[i],
          jobs: [],
          scrapedAt: new Date().toISOString(),
          fromCache: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
      options.onProgress?.(++done, companies.length);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, companies.length) }, worker),
  );
  return results;
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
