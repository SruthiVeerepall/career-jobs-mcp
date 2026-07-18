import fs from 'node:fs';
import { z } from 'zod';
import {
  parseResumeText,
  saveProfile,
  loadProfile,
  DEFAULT_PROFILE,
  type ResumeProfile,
} from '../profile/profile-manager.js';

export const uploadResumeSchema = {
  resumeText: z
    .string()
    .min(50)
    .optional()
    .describe('Plain resume text (paste the full resume; for PDFs, extract the text first).'),
  filePath: z
    .string()
    .optional()
    .describe('Path to a plain-text resume file (.txt / .md). Use resumeText for pasted content.'),
  reset: z
    .boolean()
    .optional()
    .describe('true = discard the uploaded profile and go back to the built-in default.'),
};

export interface UploadResumeArgs {
  resumeText?: string;
  filePath?: string;
  reset?: boolean;
}

export async function uploadResume(args: UploadResumeArgs): Promise<{
  status: string;
  profile: ResumeProfile;
}> {
  if (args.reset) {
    saveProfile({ ...DEFAULT_PROFILE, updatedAt: new Date().toISOString() });
    return { status: 'Profile reset to built-in default. Restart batch scripts to pick it up.', profile: loadProfile() };
  }

  let text = args.resumeText ?? '';
  if (!text && args.filePath) {
    if (!fs.existsSync(args.filePath)) {
      throw new Error(`File not found: ${args.filePath}`);
    }
    if (/\.pdf$/i.test(args.filePath)) {
      throw new Error('PDF files are not parsed directly — extract the text and pass it as resumeText.');
    }
    text = fs.readFileSync(args.filePath, 'utf8');
  }
  if (!text || text.trim().length < 50) {
    throw new Error('Provide resumeText (≥50 chars) or filePath pointing to a plain-text resume.');
  }

  const profile = parseResumeText(text);
  saveProfile(profile);
  return {
    status:
      `Profile built from resume: ${profile.headline}, ${profile.yearsOfExperience} yrs, ` +
      `${profile.skillWeights.length} skills. All searches now match against this profile. ` +
      `Note: long-running batch scripts read the profile at startup.`,
    profile,
  };
}

export async function getProfile(): Promise<ResumeProfile> {
  return loadProfile();
}
