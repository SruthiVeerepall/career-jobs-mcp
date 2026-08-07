import type { CompanyConfig, JobListing, SearchFilters } from '../types.js';
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { rateLimiter } from '../utils/rate-limiter.js';
import { withinPostedWindowOrUndated } from '../utils/posted-date.js';

export abstract class BaseScraper {
  constructor(protected readonly config: CompanyConfig) {}

  abstract fetchJobs(filters: SearchFilters): Promise<JobListing[]>;

  protected async rateLimitedFetch<T>(host: string, fn: () => Promise<T>): Promise<T> {
    await rateLimiter.wait(host);
    return withRetry(fn, { context: `${this.config.name}:${host}` });
  }

  protected normalizeJobLevel(text: string | undefined): JobListing['level'] {
    if (!text) return 'Unknown';
    const t = text.toLowerCase();
    if (t.includes('intern')) return 'Intern';
    if (t.includes('principal')) return 'Principal';
    if (t.includes('staff') || t.includes('lead')) return 'Lead';
    if (t.includes('director')) return 'Director';
    if (t.includes('executive') || t.includes('vp ') || t.includes('chief')) return 'Executive';
    if (t.includes('manager')) return 'Manager';
    if (t.includes('senior') || t.includes('sr.') || t.includes('sr ')) return 'Senior';
    if (t.includes('junior') || t.includes('jr.') || t.includes('entry') || t.includes('associate')) return 'Entry';
    return 'Mid';
  }

  protected matchesFilters(job: JobListing, filters: SearchFilters): boolean {
    if (filters.jobTitle) {
      const needle = filters.jobTitle.toLowerCase();
      if (!(job.title ?? '').toLowerCase().includes(needle)) return false;
    }
    if (filters.location) {
      const needle = filters.location.toLowerCase();
      const matchesAny = job.locations.some((loc) => loc.toLowerCase().includes(needle));
      const isRemoteSearch = needle.includes('remote');
      if (!matchesAny && !(isRemoteSearch && job.locations.some((l) => /remote/i.test(l)))) {
        return false;
      }
    }
    if (filters.level && job.level && filters.level !== job.level) return false;
    if (filters.department && job.department) {
      if (!job.department.toLowerCase().includes(filters.department.toLowerCase())) return false;
    }
    if (filters.remoteOnly && !job.locations.some((l) => /remote/i.test(l))) return false;
    // Lenient here by design: scraper output is what gets cached, so undated jobs are
    // kept. The orchestrator applies the strict window to the response after caching.
    // Jobs the source already window-filtered by real timestamp are left alone.
    if (!job.windowVerified && !withinPostedWindowOrUndated(job.postedDate, filters.postedSince)) {
      return false;
    }
    return true;
  }

  protected logProgress(message: string): void {
    logger.info(`[${this.config.name}] ${message}`);
  }

  protected logError(message: string, err?: unknown): void {
    logger.error(`[${this.config.name}] ${message}`, err);
  }
}
