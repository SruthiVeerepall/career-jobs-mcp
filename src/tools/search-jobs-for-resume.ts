import { z } from 'zod';
import { searchJobsForResume as runSearch } from '../resume/search.js';
import { renderSearchResult } from '../resume/render.js';

export const searchJobsForResumeSchema = {
  resumeText: z.string().optional().describe('The resume pasted as plain text. Use this or resumePath.'),
  resumePath: z.string().optional().describe('Absolute path to a .pdf, .docx, .txt, .md, or .html resume.'),
  postedWithinDays: z.number().int().min(1).max(30).optional().describe('Freshness window in days. 1 = last 24h. Default 3.'),
  companies: z.array(z.string()).optional().describe('Restrict to these company names/slugs. Defaults to every scrapable source.'),
  remoteOnly: z.boolean().optional().describe('Only return remote postings.'),
  limit: z.number().int().min(1).max(500).optional().describe('Max jobs returned. Default: all matches.'),
  yearsOfExperience: z.number().min(0).max(45).optional().describe('Override the years of experience inferred from the resume.'),
  country: z.string().optional().describe("Country to restrict to (e.g. 'US', 'CA', 'ANY'). Defaults to the country detected in the resume header."),
  matchThreshold: z.number().min(0).max(30).optional().describe('Minimum title score. Default 5 (== a 60% profile match).'),
  extraSearchTerms: z.array(z.string()).optional().describe('Additional keywords for the job boards, on top of the ones derived from the resume.'),
  format: z.enum(['markdown', 'json']).optional().describe("'markdown' (default) returns a ready-to-read table of apply links; 'json' returns structured matches."),
};

export type SearchJobsForResumeArgs = {
  resumeText?: string;
  resumePath?: string;
  postedWithinDays?: number;
  companies?: string[];
  remoteOnly?: boolean;
  limit?: number;
  yearsOfExperience?: number;
  country?: string;
  matchThreshold?: number;
  extraSearchTerms?: string[];
  format?: 'markdown' | 'json';
};

/**
 * The resume-driven entry point: resume in, ranked apply links out.
 *
 * Every filter the search applies — role families, seniority band, skill scoring, board
 * keywords, country — is derived from the resume text, so the tool works for any candidate
 * without code changes.
 */
export async function searchJobsForResume(args: SearchJobsForResumeArgs): Promise<string> {
  const { format = 'markdown', ...options } = args;
  const result = await runSearch(options);

  if (format === 'json') {
    return JSON.stringify(
      {
        profile: result.profile,
        totalMatches: result.stats.matched,
        matches: result.matches,
        stats: result.stats,
        meta: result.meta,
      },
      null,
      2,
    );
  }

  return renderSearchResult(result);
}
