// Shared filter/scoring logic for the resume-match job search.
// Rules per CLAUDE.md rules #2 (experience level), #3 (location), #4 (clearance), #6 (resume match).
// All candidate-specific values come from the active profile (data/profile.json,
// managed by the uploadResume MCP tool) — see src/profile/profile-manager.ts.

import { loadProfile } from '../profile/profile-manager.js';

const profile = loadProfile();

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function altGroup(terms: string[]): string {
  return terms.map((t) => `\\b${escapeRegex(t).replace(/\\?\s+/g, '.?')}\\b`).join('|');
}

// Seniority exclusion — titles implying more experience than the candidate has.
// ≤5 yrs: exclude everything above Senior. 6–9 yrs: allow Staff/Lead/Manager.
// 10+: only exclude executive titles.
function buildLevelExclude(years: number): RegExp {
  if (years <= 5) {
    return /\bprincipal\b|\bstaff\b|\blead\b|\barchitect\b|\bdirector\b|\bvp\b|\bhead of\b|\bmanager\b|\bexecutive\b|\bdistinguished\b|\bfellow\b/i;
  }
  if (years < 10) {
    return /\bdirector\b|\bvp\b|\bhead of\b|\bexecutive\b|\bdistinguished\b|\bfellow\b/i;
  }
  return /\bvp\b|\bexecutive\b|\bchief\b/i;
}

export const OVER_5YR = buildLevelExclude(profile.yearsOfExperience);

// Security clearance — EXCLUDE
export const CLEARANCE = /security clearance|secret clearance|top secret|ts\/sci|dod clearance|clearance required|us citizen|u\.s\. citizen|citizenship required|must be a citizen|active clearance|public trust/i;

// US location detection
const CA_PROVINCES = new Set(['ON', 'BC', 'AB', 'QC', 'MB', 'SK', 'NS', 'NB', 'NL', 'PE', 'NT', 'YT', 'NU']);
const US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
  'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA',
  'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
]);
export const NON_US = /\b(Canada|Ontario|Quebec|British Columbia|Alberta|UK|United Kingdom|Ireland|India|Germany|France|Australia|Singapore|Poland|Netherlands|Mexico|Israel|Japan|Korea|China|Brazil|Spain|Italy|Denmark|Norway|Sweden|Switzerland)\b/i;

export function isUSJob(locations: string[] | undefined): boolean {
  if (!locations || locations.length === 0) return true;
  return locations.some((loc) => {
    if (!loc) return true;
    if (NON_US.test(loc)) return false;
    if (/\bUSA\b|\bUnited States\b/i.test(loc)) return true;
    const m = loc.match(/,\s*([A-Z]{2})(?:\s*,|\s*$)/);
    if (m) {
      if (CA_PROVINCES.has(m[1])) return false;
      if (US_STATES.has(m[1])) return true;
    }
    if (/\bRemote\b/i.test(loc) && !NON_US.test(loc)) return true;
    return false;
  });
}

// Resume skill scoring weights — from the active profile (rule #6).
// Word-bounded, case-insensitive; "spring boot" also matches "spring-boot".
const SKILL_PATTERN_OVERRIDES: Record<string, RegExp> = {
  rest: /\brest(ful)?\b/i,
  react: /\breact(\.?js)?\b/i,
  angular: /\bangular(js)?\b/i,
  'c#': /\bc#|\.net\b/i,
  'c++': /\bc\+\+/i,
};

export const RESUME_WEIGHTS: Array<{ pattern: RegExp; weight: number }> = profile.skillWeights.map(
  ({ skill, weight }) => ({
    pattern:
      SKILL_PATTERN_OVERRIDES[skill.toLowerCase()] ??
      new RegExp(`\\b${escapeRegex(skill).replace(/\\?\s+/g, '.?').replace(/\\\.js/i, '\\.?js')}\\b`, 'i'),
    weight,
  }),
);

export const TARGET_ROLES = new RegExp(altGroup(profile.targetRoles), 'i');
export const EXCLUDE_ROLES = new RegExp(altGroup(profile.excludeRoles), 'i');
export const RESUME_MATCH_THRESHOLD = profile.matchThreshold;

export function resumeScore(title: string): number {
  let score = 0;
  for (const { pattern, weight } of RESUME_WEIGHTS) {
    if (pattern.test(title)) score += weight;
  }
  return score;
}

export function matchesProfile(title: string): boolean {
  if (EXCLUDE_ROLES.test(title)) return false;
  const score = resumeScore(title);
  if (score >= RESUME_MATCH_THRESHOLD) return true;
  if (score === 0 && TARGET_ROLES.test(title)) return true;
  return false;
}
