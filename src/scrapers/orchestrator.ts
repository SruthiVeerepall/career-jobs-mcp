import '../utils/http-agent.js'; // side-effect: enable keep-alive on all axios calls
import type { CompanyConfig, JobListing, ScrapeResult, SearchFilters } from '../types.js';
import { cacheManager } from '../cache/cache-manager.js';
import { companyRegistry } from './company-registry.js';
import { logger } from '../utils/logger.js';
import { withTimeout } from '../utils/retry.js';
import { countUndated, jobWithinWindow } from '../utils/posted-date.js';

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

/**
 * Boards that index every employer and therefore need keywords — a no-keyword fetch there
 * is meaningless. Only these see `filters.searchTerms`, and only their cache rows are keyed
 * by it; company scrapers fetch their whole board regardless, so keying them by terms would
 * fragment the cache and force needless re-scrapes.
 */
const KEYWORD_DRIVEN_PLATFORMS = new Set(['linkedin', 'simplyhired', 'builtin', 'remotive']);

/** Cache/in-flight discriminator for the search terms a keyword-driven board was fetched with. */
function termVariant(config: CompanyConfig, filters: SearchFilters): string | undefined {
  if (!KEYWORD_DRIVEN_PLATFORMS.has(config.platform)) return undefined;
  const terms = filters.searchTerms?.filter((t) => t.trim().length > 0);
  if (!terms || terms.length === 0) return undefined;
  return terms.map((t) => t.trim().toLowerCase()).sort().join(',');
}

function fetchAndCache(config: CompanyConfig, cacheFilters: SearchFilters): Promise<JobListing[]> {
  const variant = termVariant(config, cacheFilters);
  const key = `${config.slug}|${cacheFilters.postedSince ?? ''}|${cacheFilters.remoteOnly ?? ''}|${variant ?? ''}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const scraper = companyRegistry.createScraper(config);
    const allJobs = await withTimeout(
      scraper.fetchJobs(cacheFilters),
      SCRAPE_TIMEOUT_MS * 4,
      `scrape ${config.name}`,
    );
    cacheManager.saveCompanyScrape(config.slug, allJobs, cacheFilters.postedSince, variant);
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
    // Keyed by window too: a `today` scrape caches a narrow set that must not be served
    // back to a later `week` / unfiltered request.
    const cached = cacheManager.getCompanyScrape(config.slug, filters.postedSince, termVariant(config, filters));
    if (cached) {
      const filtered = cached.jobs.filter((j) => matchesFilters(j, filters));
      return {
        company: config.name,
        jobs: filtered,
        scrapedAt: cached.scrapedAt,
        fromCache: true,
        undatedExcluded: filters.postedSince ? countUndated(cached.jobs) : 0,
      };
    }
  }

  try {
    // Fetch without title filter so the cache stores all jobs.
    // Title/level/dept filters are applied client-side below and on every cache read.
    // fetchAndCache coalesces concurrent identical fetches into one network call.
    const cacheFilters: SearchFilters = {
      postedSince: filters.postedSince,
      remoteOnly: filters.remoteOnly,
      // Keyword-driven boards need terms at fetch time — unlike jobTitle, this cannot be
      // deferred to the client-side pass, because a board never returns an unfiltered feed.
      searchTerms: filters.searchTerms,
    };
    const allJobs = await fetchAndCache(config, cacheFilters);
    return {
      company: config.name,
      jobs: allJobs.filter((j) => matchesFilters(j, filters)),
      scrapedAt: new Date().toISOString(),
      fromCache: false,
      undatedExcluded: filters.postedSince ? countUndated(allJobs) : 0,
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
  // Strict: missing/unparseable dates are excluded, not passed through. Previously an
  // undated job bypassed the window entirely and a NaN date explicitly returned true.
  // Exception: sources that already filtered by the window with a real timestamp.
  if (!jobWithinWindow(job, filters.postedSince)) return false;
  return true;
}
