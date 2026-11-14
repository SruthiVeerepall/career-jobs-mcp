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
import { autoApplyJob, autoApplyJobSchema } from './tools/auto-apply-job.js';
import { refreshJobQuest, refreshJobQuestSchema } from './tools/refresh-job-quest.js';
import { logger } from './utils/logger.js';
import { closeSharedBrowser } from './utils/browser.js';
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
    // Read-only: it only reads job sites (and refreshes its own cache). Without this hint the
    // Claude desktop app asks for confirmation on every call from the Job Quest Board's
    // "Run a new search" buttons, and a dismissed prompt comes back as "cancelled".
    { title: 'Search jobs for a résumé', readOnlyHint: true, openWorldHint: true },
    async (args) => ({
      content: [{ type: 'text', text: await searchJobsForResume(args) }],
    }),
  );

  // Not read-only on purpose: it opens a Chrome window on the user's desktop, so the Claude
  // desktop app asks before each call. It fills the form and never submits it.
  server.tool(
    'autoApplyJob',
    'Open a Greenhouse job application in a visible Chrome window and fill it from the résumé: name, email, phone, location, every job held, education, LinkedIn, and the résumé file itself. It never submits; the user reviews the form and presses Submit. Returns what was filled and which required questions still need the user.',
    autoApplyJobSchema,
    { title: 'Auto-fill a job application', readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await autoApplyJob(args), null, 2) }],
    }),
  );

  // Not read-only: it rewrites the user's Excel sheet and pages and republishes the board.
  server.tool(
    'refreshJobQuest',
    'Rerun the last daily Job Quest export (saved by `export-jobs-xlsx.mjs --resume … --page …`) for a new posting window, in the background, so EVERY output updates: the Excel sheet (ticks kept; reopened if it was open in Excel), the Job Quest page files, and the published Job Quest Board. Returns at once with status "started" or "queued".',
    refreshJobQuestSchema,
    { title: 'Refresh the Job Quest outputs', readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await refreshJobQuest(args), null, 2) }],
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
