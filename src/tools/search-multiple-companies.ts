import { z } from 'zod';
import { scrapeMany } from '../scrapers/orchestrator.js';

export const searchMultipleCompaniesSchema = {
  companyList: z.array(z.string()).min(1).describe('List of company names or slugs.'),
  jobTitle: z.string().optional(),
  location: z.string().optional(),
  level: z.enum(['Intern', 'Entry', 'Mid', 'Senior', 'Lead', 'Principal', 'Manager', 'Director', 'Executive']).optional(),
  department: z.string().optional(),
  postedSince: z.enum(['today', 'week', 'month']).optional(),
  remoteOnly: z.boolean().optional(),
};

export type SearchMultipleCompaniesArgs = {
  companyList: string[];
  jobTitle?: string;
  location?: string;
  level?: 'Intern' | 'Entry' | 'Mid' | 'Senior' | 'Lead' | 'Principal' | 'Manager' | 'Director' | 'Executive';
  department?: string;
  postedSince?: 'today' | 'week' | 'month';
  remoteOnly?: boolean;
};

export async function searchMultipleCompanies(args: SearchMultipleCompaniesArgs) {
  const { companyList, ...filters } = args;
  const results = await scrapeMany(companyList, filters);
  const totalJobs = results.reduce((sum, r) => sum + r.jobs.length, 0);
  return {
    totalCompanies: results.length,
    totalJobs,
    failures: results.filter((r) => r.error).map((r) => ({ company: r.company, error: r.error })),
    perCompany: results.map((r) => ({
      company: r.company,
      jobCount: r.jobs.length,
      fromCache: r.fromCache,
      scrapedAt: r.scrapedAt,
      error: r.error,
      jobs: r.jobs.map((j) => ({
        id: j.id,
        title: j.title,
        locations: j.locations,
        level: j.level,
        applyUrl: j.applyUrl,
      })),
    })),
  };
}
