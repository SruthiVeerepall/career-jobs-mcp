import { z } from 'zod';
import { cacheManager } from '../cache/cache-manager.js';
import { companyRegistry } from '../scrapers/company-registry.js';
import { scrapeCompany } from '../scrapers/orchestrator.js';

export const getJobDetailsSchema = {
  jobId: z.string().describe('The ID of the job (returned from a search tool).'),
  companyName: z.string().describe('The company the job belongs to.'),
};

export type GetJobDetailsArgs = {
  jobId: string;
  companyName: string;
};

export async function getJobDetails(args: GetJobDetailsArgs) {
  const config = companyRegistry.get(args.companyName);
  if (!config) {
    return { error: `Unknown company: ${args.companyName}` };
  }

  let job = cacheManager.getJob(args.jobId, config.slug);
  if (!job) {
    // The job isn't cached — refresh the company so we have the latest list, then look up by id.
    await scrapeCompany(config.slug, {}, { forceRefresh: true });
    job = cacheManager.getJob(args.jobId, config.slug);
  }

  if (!job) {
    return {
      error: `Job ${args.jobId} not found for ${config.name}. The listing may have been removed or the id is invalid.`,
    };
  }
  return { job };
}
