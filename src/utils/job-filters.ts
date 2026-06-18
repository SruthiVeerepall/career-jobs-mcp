// Shared filter/scoring logic for Sruthi Veerepalli's resume-match search.
// Rules per CLAUDE.md rules #2 (experience level), #3 (location), #4 (clearance), #6 (resume match).

// Senior / >5yr title patterns — EXCLUDE
export const OVER_5YR = /\bprincipal\b|\bstaff\b|\blead\b|\barchitect\b|\bdirector\b|\bvp\b|\bhead of\b|\bmanager\b|\bexecutive\b|\bdistinguished\b|\bfellow\b/i;

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

// Resume skill scoring weights — per CLAUDE.md rule #6 (score >= 5 = 60% match)
export const RESUME_WEIGHTS: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /\bjava\b/i, weight: 10 },
  { pattern: /\bspring boot\b/i, weight: 10 },
  { pattern: /\bspring\b/i, weight: 7 },
  { pattern: /\bmicroservices?\b/i, weight: 7 },
  { pattern: /\bfull.?stack\b/i, weight: 7 },
  { pattern: /\bangular\b/i, weight: 5 },
  { pattern: /\breact\b/i, weight: 5 },
  { pattern: /\baws\b/i, weight: 5 },
  { pattern: /\bkafka\b/i, weight: 5 },
  { pattern: /\bhibernate\b/i, weight: 5 },
  { pattern: /\bjpa\b/i, weight: 5 },
  { pattern: /\brest(ful)?\b/i, weight: 5 },
  { pattern: /\bcloud\b/i, weight: 5 },
  { pattern: /\bdocker\b/i, weight: 3 },
  { pattern: /\bkubernetes\b/i, weight: 3 },
  { pattern: /\bci\/cd\b/i, weight: 3 },
  { pattern: /\bjenkins\b/i, weight: 3 },
  { pattern: /\bsplunk\b/i, weight: 3 },
  { pattern: /\bpostgresql\b/i, weight: 3 },
  { pattern: /\bmongodb\b/i, weight: 3 },
  { pattern: /\bnode\.?js\b/i, weight: 3 },
  { pattern: /\btypescript\b/i, weight: 3 },
  { pattern: /\bj2ee\b/i, weight: 3 },
  { pattern: /\bjavascript\b/i, weight: 3 },
];

export const TARGET_ROLES = /\b(java|full.?stack|fullstack|software engineer|software developer|backend|back.end|application developer)\b/i;
export const EXCLUDE_ROLES = /\b(data scientist|machine learning|ml engineer|devops engineer|qa engineer|test engineer|security engineer|network engineer|database administrator|dba|data engineer|ui developer|ux designer|product manager|scrum master|business analyst|data analyst)\b/i;
export const RESUME_MATCH_THRESHOLD = 5;

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
