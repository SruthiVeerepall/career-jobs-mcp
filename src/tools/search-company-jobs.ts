import { z } from 'zod';
import { scrapeCompany } from '../scrapers/orchestrator.js';

export const searchCompanyJobsSchema = {
  companyName: z.string().describe('Name (or slug) of the company to search, e.g. "Stripe" or "stripe".'),
  jobTitle: z.string().optional().describe('Keyword to match against the job title (case-insensitive).'),
  location: z.string().optional().describe('Location filter, e.g. "USA", "Remote", "New York".'),
  level: z.enum(['Intern', 'Entry', 'Mid', 'Senior', 'Lead', 'Principal', 'Manager', 'Director', 'Executive']).optional(),
  department: z.string().optional(),
  postedSince: z.enum(['today', 'week', 'month']).optional(),
  remoteOnly: z.boolean().optional(),
  forceRefresh: z.boolean().optional().describe('Bypass the 24h cache and re-scrape immediately.'),
};

export type SearchCompanyJobsArgs = {
  companyName: string;
  jobTitle?: string;
  location?: string;
  level?: 'Intern' | 'Entry' | 'Mid' | 'Senior' | 'Lead' | 'Principal' | 'Manager' | 'Director' | 'Executive';
  department?: string;
  postedSince?: 'today' | 'week' | 'month';
  remoteOnly?: boolean;
  forceRefresh?: boolean;
};

export async function searchCompanyJobs(args: SearchCompanyJobsArgs) {
  const { companyName, forceRefresh, ...filters } = args;
  const result = await scrapeCompany(companyName, filters, { forceRefresh });
  return {
    company: result.company,
    fromCache: result.fromCache,
    scrapedAt: result.scrapedAt,
    error: result.error,
    jobCount: result.jobs.length,
    jobs: result.jobs.map((j) => ({
      id: j.id,
      title: j.title,
      department: j.department,
      locations: j.locations,
      level: j.level,
      applyUrl: j.applyUrl,
      postedDate: j.postedDate,
    })),
  };
}
