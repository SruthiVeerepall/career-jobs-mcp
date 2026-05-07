import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { searchCompanyJobs, searchCompanyJobsSchema } from './tools/search-company-jobs.js';
import { searchMultipleCompanies, searchMultipleCompaniesSchema } from './tools/search-multiple-companies.js';
import { getJobDetails, getJobDetailsSchema } from './tools/get-job-details.js';
import { listCompanies } from './tools/list-companies.js';
import { addCompanyCareerSite, addCompanyCareerSiteSchema } from './tools/add-company-career-site.js';
import { logger } from './utils/logger.js';
import { closeSharedBrowser } from './scrapers/platforms/custom-puppeteer.js';
import { cacheManager } from './cache/cache-manager.js';

export async function startServer(): Promise<void> {
  const server = new McpServer({
    name: 'career-jobs-mcp',
    version: '0.1.0',
  });

  server.tool(
    'searchCompanyJobs',
    'Search a single company\'s career site for job listings, with optional filters.',
    searchCompanyJobsSchema,
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await searchCompanyJobs(args), null, 2) }],
    }),
  );

  server.tool(
    'searchMultipleCompanies',
    'Search multiple companies\' career sites in parallel and return aggregated results.',
    searchMultipleCompaniesSchema,
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await searchMultipleCompanies(args), null, 2) }],
    }),
  );

  server.tool(
    'getJobDetails',
    'Get the full description, requirements, and apply URL for a specific job by id.',
    getJobDetailsSchema,
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await getJobDetails(args), null, 2) }],
    }),
  );

  server.tool(
    'listCompanies',
    'List all companies the server can scrape (pre-configured + user-added).',
    {},
    async () => ({
      content: [{ type: 'text', text: JSON.stringify(await listCompanies(), null, 2) }],
    }),
  );

  server.tool(
    'addCompanyCareerSite',
    'Register a new company career site so it can be searched. Auto-detects the platform from the URL when possible.',
    addCompanyCareerSiteSchema,
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await addCompanyCareerSite(args), null, 2) }],
    }),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('career-jobs-mcp server connected on stdio');

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down…`);
    try {
      await closeSharedBrowser();
      cacheManager.close();
    } catch (err) {
      logger.warn('Error during shutdown', err);
    }
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Re-export so consumers can import the schema constant if they want
export { z };
