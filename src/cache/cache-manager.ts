import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { JobListing } from '../types.js';
import { logger } from '../utils/logger.js';

const TTL_HOURS = Number(process.env.CACHE_TTL_HOURS ?? 24);
const DB_PATH = resolve(process.env.CACHE_DB_PATH ?? './data/cache.db');

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

  getCompanyScrape(companySlug: string): { jobs: JobListing[]; scrapedAt: string } | null {
    const row = this.db
      .prepare('SELECT scraped_at, jobs_json FROM company_scrapes WHERE company_slug = ?')
      .get(companySlug) as { scraped_at: number; jobs_json: string } | undefined;
    if (!row) return null;
    const ageHours = (Date.now() - row.scraped_at) / 3_600_000;
    if (ageHours > TTL_HOURS) {
      logger.debug(`Cache miss (expired) for ${companySlug}: ${ageHours.toFixed(1)}h old`);
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

  saveCompanyScrape(companySlug: string, jobs: JobListing[]): void {
    const now = Date.now();
    const insertCompany = this.db.prepare(
      'INSERT OR REPLACE INTO company_scrapes (company_slug, scraped_at, jobs_json) VALUES (?, ?, ?)',
    );
    const insertJob = this.db.prepare(
      'INSERT OR REPLACE INTO jobs (job_id, company_slug, title, location, scraped_at, data_json) VALUES (?, ?, ?, ?, ?, ?)',
    );

    const tx = this.db.transaction(() => {
      insertCompany.run(companySlug, now, JSON.stringify(jobs));
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
