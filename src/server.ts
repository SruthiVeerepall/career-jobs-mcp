import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { searchCompanyJobs, searchCompanyJobsSchema } from './tools/search-company-jobs.js';
import { searchMultipleCompanies, searchMultipleCompaniesSchema } from './tools/search-multiple-companies.js';
import { getJobDetails, getJobDetailsSchema } from './tools/get-job-details.js';
import { listCompanies } from './tools/list-companies.js';
import { addCompanyCareerSite, addCompanyCareerSiteSchema } from './tools/add-company-career-site.js';
import { searchJobsForResume, searchJobsForResumeSchema } from './tools/search-jobs-for-resume.js';
import { parseResume, parseResumeSchema } from './tools/parse-resume.js';
import { logger } from './utils/logger.js';
import { closeSharedBrowser } from './scrapers/platforms/custom-puppeteer.js';
import { cacheManager } from './cache/cache-manager.js';

export async function startServer(): Promise<void> {
  const server = new McpServer({
    name: 'career-jobs-mcp',
    version: '0.1.0',
  });

  // Primary entry point: a resume in, a ranked table of apply links out. Every filter
  // (role families, seniority band, skill scoring, board keywords, country) is derived
  // from the resume itself — no candidate is hard-coded.
  server.tool(
    'searchJobsForResume',
    'Search every configured career site and job board for roles matching a resume, and return a ranked table of direct apply links. Accepts the resume as text (resumeText) or a file path (resumePath: .pdf/.docx/.txt/.md).',
    searchJobsForResumeSchema,
    async (args) => ({
      content: [{ type: 'text', text: await searchJobsForResume(args) }],
    }),
  );

  server.tool(
    'parseResume',
    'Extract the candidate profile from a resume — skills, years of experience, role families, seniority band, and the keywords the job boards will be searched with — without running a search.',
    parseResumeSchema,
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await parseResume(args), null, 2) }],
    }),
  );

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
