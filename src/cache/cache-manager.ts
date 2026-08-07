import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { JobListing } from '../types.js';
import { logger } from '../utils/logger.js';

const TTL_HOURS = Number(process.env.CACHE_TTL_HOURS ?? 24);
const DB_PATH = resolve(process.env.CACHE_DB_PATH ?? './data/cache.db');

const WINDOW_HOURS: Record<string, number> = { today: 24, week: 24 * 7, month: 24 * 30 };

/**
 * A cache row may not consume more than this fraction of the freshness window it was
 * scraped for.
 *
 * The flat 24h TTL was incompatible with the 24h `today` window: a row written 22h ago
 * still counted as valid, but every job inside it had aged 22h and no longer passed the
 * 24h cut — so `--today` served a "valid" cache row that yielded almost nothing (observed:
 * 127 cached LinkedIn jobs, 0 still in window). The cache entry outlived its own contents.
 *
 * Capping the served age at 5% of the window keeps decay negligible: `today` rows live
 * ~1.2h, `week` ~8.4h, `month` the full 24h. This also bounds the staleness that
 * `windowVerified` can introduce, since those jobs skip the client-side age check entirely
 * and would otherwise be trusted for as long as the row survived.
 */
const MAX_WINDOW_FRACTION = 0.05;

class CacheManager {
  private db: Database.Database;

  constructor() {
    const dir = dirname(DB_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS company_scrapes (
        company_slug TEXT PRIMARY KEY,
        scraped_at INTEGER NOT NULL,
        jobs_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS jobs (
        job_id TEXT NOT NULL,
        company_slug TEXT NOT NULL,
        title TEXT NOT NULL,
        location TEXT,
        scraped_at INTEGER NOT NULL,
        data_json TEXT NOT NULL,
        PRIMARY KEY (company_slug, job_id)
      );
      CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company_slug);
      CREATE INDEX IF NOT EXISTS idx_jobs_title ON jobs(title);
    `);
  }

  /**
   * Scrapers narrow their results server-side by `postedSince`, so what gets cached is
   * already window-specific. The cache row must therefore be keyed by window as well as
   * slug — otherwise a `today` scrape stores a near-empty set that a later `week` or
   * unfiltered request reads back as if it were the whole board.
   * The `jobs` table stays keyed on the true slug so getJob() is unaffected.
   */
  private scrapeKey(companySlug: string, window?: string): string {
    return window ? `${companySlug}|${window}` : companySlug;
  }

  /** Longest a row scraped for `window` may be served. See MAX_WINDOW_FRACTION. */
  effectiveTtlHours(window?: string): number {
    const windowHours = window ? WINDOW_HOURS[window] : undefined;
    if (!windowHours) return TTL_HOURS;
    return Math.min(TTL_HOURS, windowHours * MAX_WINDOW_FRACTION);
  }

  getCompanyScrape(companySlug: string, window?: string): { jobs: JobListing[]; scrapedAt: string } | null {
    const key = this.scrapeKey(companySlug, window);
    const row = this.db
      .prepare('SELECT scraped_at, jobs_json FROM company_scrapes WHERE company_slug = ?')
      .get(key) as { scraped_at: number; jobs_json: string } | undefined;
    if (!row) return null;
    const ageHours = (Date.now() - row.scraped_at) / 3_600_000;
    const ttl = this.effectiveTtlHours(window);
    if (ageHours > ttl) {
      logger.debug(`Cache miss (expired) for ${key}: ${ageHours.toFixed(1)}h old > ${ttl.toFixed(1)}h TTL`);
      return null;
    }
    try {
      return {
        jobs: JSON.parse(row.jobs_json) as JobListing[],
        scrapedAt: new Date(row.scraped_at).toISOString(),
      };
    } catch (err) {
      logger.warn(`Failed to parse cached jobs for ${companySlug}`, err);
      return null;
    }
  }

  saveCompanyScrape(companySlug: string, jobs: JobListing[], window?: string): void {
    const now = Date.now();
    const insertCompany = this.db.prepare(
      'INSERT OR REPLACE INTO company_scrapes (company_slug, scraped_at, jobs_json) VALUES (?, ?, ?)',
    );
    const insertJob = this.db.prepare(
      'INSERT OR REPLACE INTO jobs (job_id, company_slug, title, location, scraped_at, data_json) VALUES (?, ?, ?, ?, ?, ?)',
    );

    const tx = this.db.transaction(() => {
      insertCompany.run(this.scrapeKey(companySlug, window), now, JSON.stringify(jobs));
      for (const job of jobs) {
        insertJob.run(
          job.id,
          companySlug,
          job.title,
          job.locations.join('; '),
          now,
          JSON.stringify(job),
        );
      }
    });
    tx();
    logger.debug(`Cached ${jobs.length} jobs for ${companySlug}`);
  }

  getJob(jobId: string, companySlug: string): JobListing | null {
    const row = this.db
      .prepare('SELECT data_json FROM jobs WHERE job_id = ? AND company_slug = ?')
      .get(jobId, companySlug) as { data_json: string } | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.data_json) as JobListing;
    } catch {
      return null;
    }
  }

  getLastScrapedAt(companySlug: string): string | null {
    const row = this.db
      .prepare('SELECT scraped_at FROM company_scrapes WHERE company_slug = ?')
      .get(companySlug) as { scraped_at: number } | undefined;
    return row ? new Date(row.scraped_at).toISOString() : null;
  }

  close(): void {
    this.db.close();
  }
}

export const cacheManager = new CacheManager();
