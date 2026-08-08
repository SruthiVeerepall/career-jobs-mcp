import { z } from 'zod';
import { profileFromResume } from '../resume/search.js';

export const parseResumeSchema = {
  resumeText: z.string().optional().describe('The resume pasted as plain text. Use this or resumePath.'),
  resumePath: z.string().optional().describe('Absolute path to a .pdf, .docx, .txt, .md, or .html resume.'),
  yearsOfExperience: z.number().min(0).max(45).optional().describe('Override the years of experience inferred from the resume.'),
  country: z.string().optional().describe("Country to restrict searches to (e.g. 'US', 'CA', 'ANY')."),
  matchThreshold: z.number().min(0).max(30).optional(),
};

export type ParseResumeArgs = {
  resumeText?: string;
  resumePath?: string;
  yearsOfExperience?: number;
  country?: string;
  matchThreshold?: number;
};

/**
 * Show what the searcher read out of a resume without spending a scrape on it.
 *
 * Worth running first on an unfamiliar resume: if the years, role families, or seniority
 * band come out wrong, every downstream result is wrong in the same way, and the overrides
 * on `searchJobsForResume` are how you correct it.
 */
export async function parseResume(args: ParseResumeArgs) {
  const { profile, source, format } = await profileFromResume(args);
  return { source, format, profile };
}
