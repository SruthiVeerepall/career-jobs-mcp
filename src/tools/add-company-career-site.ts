import { z } from 'zod';
import type { CareerPlatform, CompanyConfig } from '../types.js';
import { companyRegistry } from '../scrapers/company-registry.js';

export const addCompanyCareerSiteSchema = {
  companyName: z.string().describe('Display name of the company.'),
  careerPageUrl: z.string().url().describe('URL of the company career listings page.'),
  platform: z
    .enum(['greenhouse', 'lever', 'workday', 'smartrecruiters', 'ashby', 'custom'])
    .optional()
    .describe('Career platform. Auto-detected from URL if omitted.'),
  platformIdentifier: z
    .string()
    .optional()
    .describe('Platform-specific identifier (e.g. Greenhouse board token, Workday "tenant|wdN|site").'),
  requiresJavaScript: z.boolean().optional(),
  customSelectors: z
    .object({
      jobListSelector: z.string().optional(),
      jobTitleSelector: z.string().optional(),
      jobLocationSelector: z.string().optional(),
      jobDepartmentSelector: z.string().optional(),
      jobLinkSelector: z.string().optional(),
      paginationSelector: z.string().optional(),
    })
    .optional(),
};

export type AddCompanyCareerSiteArgs = {
  companyName: string;
  careerPageUrl: string;
  platform?: CareerPlatform;
  platformIdentifier?: string;
  requiresJavaScript?: boolean;
  customSelectors?: CompanyConfig['customSelectors'];
};

export async function addCompanyCareerSite(args: AddCompanyCareerSiteArgs) {
  const detected = args.platform ?? detectPlatform(args.careerPageUrl);
  const slug = companyRegistry.normalizeSlug(args.companyName);
  const platformIdentifier =
    args.platformIdentifier ?? extractIdentifier(args.careerPageUrl, detected) ?? slug;

  const config: CompanyConfig = {
    name: args.companyName,
    slug,
    careerUrl: args.careerPageUrl,
    platform: detected,
    platformIdentifier,
    requiresJavaScript: args.requiresJavaScript,
    customSelectors: args.customSelectors,
  };

  companyRegistry.add(config);
  return {
    success: true,
    registered: config,
    note:
      detected === 'custom'
        ? 'Registered as a custom site. Provide customSelectors for accurate scraping if defaults miss jobs.'
        : `Registered using ${detected} platform.`,
  };
}

function detectPlatform(url: string): CareerPlatform {
  const u = url.toLowerCase();
  if (u.includes('boards.greenhouse.io') || u.includes('greenhouse.io')) return 'greenhouse';
  if (u.includes('jobs.lever.co') || u.includes('lever.co')) return 'lever';
  if (u.includes('myworkdayjobs.com') || u.includes('workday.com')) return 'workday';
  if (u.includes('jobs.smartrecruiters.com') || u.includes('smartrecruiters.com')) return 'smartrecruiters';
  if (u.includes('jobs.ashbyhq.com') || u.includes('ashbyhq.com')) return 'ashby';
  return 'custom';
}

function extractIdentifier(url: string, platform: CareerPlatform): string | undefined {
  try {
    const u = new URL(url);
    const segments = u.pathname.split('/').filter(Boolean);
    switch (platform) {
      case 'greenhouse':
        // boards.greenhouse.io/{board}
        return segments[0];
      case 'lever':
        // jobs.lever.co/{company}
        return segments[0];
      case 'ashby':
        // jobs.ashbyhq.com/{org}
        return segments[0];
      case 'smartrecruiters':
        // jobs.smartrecruiters.com/{company}
        return segments[0];
      case 'workday': {
        // {tenant}.wdN.myworkdayjobs.com/{site}
        const hostMatch = u.host.match(/^([^.]+)\.(wd\d+)\.myworkdayjobs\.com$/);
        if (hostMatch && segments.length) {
          return `${hostMatch[1]}|${hostMatch[2]}|${segments[segments.length - 1]}`;
        }
        return undefined;
      }
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}
