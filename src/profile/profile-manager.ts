import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../utils/logger.js';

/**
 * Resume-driven candidate profile.
 *
 * The active profile drives every job search: which titles count as target
 * roles, how job titles are scored against the candidate's skills, which
 * seniority levels are excluded, and which terms the job-board scrapers
 * search for. It is persisted at data/profile.json (gitignored) and replaced
 * by the uploadResume MCP tool. When no profile file exists, DEFAULT_PROFILE
 * is used.
 */

export interface SkillWeight {
  /** Skill keyword as matched in job titles (case-insensitive, word-bounded). */
  skill: string;
  weight: number;
}

export interface ResumeProfile {
  /** Role summary, e.g. "Java / Full Stack Developer" — never a person's name. */
  headline: string;
  yearsOfExperience: number;
  /** Title stems that count as target roles even when the keyword score is 0. */
  targetRoles: string[];
  /** Terms the cross-company job boards search for (top 3 are used). */
  searchTerms: string[];
  skillWeights: SkillWeight[];
  /** Role families to exclude outright (regex alternatives). */
  excludeRoles: string[];
  /** Minimum keyword score for a title to count as a match (~60% alignment). */
  matchThreshold: number;
  source: 'default' | 'resume-upload' | 'manual';
  updatedAt?: string;
}

export const DEFAULT_PROFILE: ResumeProfile = {
  headline: 'Java / Full Stack Developer',
  yearsOfExperience: 5,
  targetRoles: [
    'java', 'full stack', 'fullstack', 'software engineer', 'software developer',
    'backend', 'back end', 'application developer',
  ],
  searchTerms: ['Java', 'Full Stack Developer', 'Software Engineer'],
  skillWeights: [
    { skill: 'java', weight: 10 },
    { skill: 'spring boot', weight: 10 },
    { skill: 'spring', weight: 7 },
    { skill: 'microservices', weight: 7 },
    { skill: 'full stack', weight: 7 },
    { skill: 'angular', weight: 5 },
    { skill: 'react', weight: 5 },
    { skill: 'aws', weight: 5 },
    { skill: 'kafka', weight: 5 },
    { skill: 'hibernate', weight: 5 },
    { skill: 'jpa', weight: 5 },
    { skill: 'rest', weight: 5 },
    { skill: 'cloud', weight: 5 },
    { skill: 'docker', weight: 3 },
    { skill: 'kubernetes', weight: 3 },
    { skill: 'ci/cd', weight: 3 },
    { skill: 'jenkins', weight: 3 },
    { skill: 'splunk', weight: 3 },
    { skill: 'postgresql', weight: 3 },
    { skill: 'mongodb', weight: 3 },
    { skill: 'node.js', weight: 3 },
    { skill: 'typescript', weight: 3 },
    { skill: 'j2ee', weight: 3 },
    { skill: 'javascript', weight: 3 },
  ],
  excludeRoles: [
    'data scientist', 'machine learning', 'ml engineer', 'devops engineer',
    'qa engineer', 'test engineer', 'security engineer', 'network engineer',
    'database administrator', 'dba', 'data engineer', 'ui developer',
    'ux designer', 'product manager', 'scrum master', 'business analyst', 'data analyst',
  ],
  matchThreshold: 5,
  source: 'default',
};

const PROFILE_PATH = path.resolve(process.cwd(), 'data', 'profile.json');

let cached: ResumeProfile | null = null;

export function loadProfile(): ResumeProfile {
  if (cached) return cached;
  try {
    if (fs.existsSync(PROFILE_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8')) as Partial<ResumeProfile>;
      cached = { ...DEFAULT_PROFILE, ...parsed };
      return cached;
    }
  } catch (err) {
    logger.warn(`Failed to read ${PROFILE_PATH}, using default profile`, err);
  }
  cached = DEFAULT_PROFILE;
  return cached;
}

export function saveProfile(profile: ResumeProfile): void {
  fs.mkdirSync(path.dirname(PROFILE_PATH), { recursive: true });
  fs.writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2), 'utf8');
  cached = profile;
  logger.info(`Profile saved to ${PROFILE_PATH} (${profile.headline}, ${profile.skillWeights.length} skills)`);
}

export function resetProfileCache(): void {
  cached = null;
}

// ── Resume text → profile ─────────────────────────────────────────────────────

interface DictEntry {
  skill: string;
  pattern: RegExp;
  /** Skill class: language/framework skills can anchor the profile. */
  core?: boolean;
}

// Canonical skills recognized in resume text. `core: true` marks skills that,
// when dominant, define the candidate's primary stack.
const SKILL_DICTIONARY: DictEntry[] = [
  { skill: 'java', pattern: /\bjava\b(?!script)/i, core: true },
  { skill: 'python', pattern: /\bpython\b/i, core: true },
  { skill: 'c#', pattern: /\bc#|\.net\b/i, core: true },
  { skill: 'go', pattern: /\bgolang\b|\bgo\b(?=[\s,.]|$)/, core: true },
  { skill: 'ruby', pattern: /\bruby\b/i, core: true },
  { skill: 'php', pattern: /\bphp\b/i, core: true },
  { skill: 'c++', pattern: /\bc\+\+/i, core: true },
  { skill: 'javascript', pattern: /\bjavascript\b|\bes6\b/i, core: true },
  { skill: 'typescript', pattern: /\btypescript\b/i, core: true },
  { skill: 'spring boot', pattern: /\bspring\s*boot\b/i, core: true },
  { skill: 'spring', pattern: /\bspring\b(?!\s*boot)/i },
  { skill: 'node.js', pattern: /\bnode\.?js\b/i, core: true },
  { skill: 'react', pattern: /\breact(\.?js)?\b/i, core: true },
  { skill: 'angular', pattern: /\bangular(js)?\b/i, core: true },
  { skill: 'vue', pattern: /\bvue(\.?js)?\b/i, core: true },
  { skill: 'django', pattern: /\bdjango\b/i, core: true },
  { skill: 'flask', pattern: /\bflask\b/i },
  { skill: 'rails', pattern: /\brails\b/i, core: true },
  { skill: 'microservices', pattern: /\bmicro.?services?\b/i },
  { skill: 'full stack', pattern: /\bfull.?stack\b/i },
  { skill: 'hibernate', pattern: /\bhibernate\b/i },
  { skill: 'jpa', pattern: /\bjpa\b/i },
  { skill: 'rest', pattern: /\brest(ful)?\b/i },
  { skill: 'graphql', pattern: /\bgraphql\b/i },
  { skill: 'aws', pattern: /\baws\b|\bamazon web services\b/i },
  { skill: 'azure', pattern: /\bazure\b/i },
  { skill: 'gcp', pattern: /\bgcp\b|\bgoogle cloud\b/i },
  { skill: 'cloud', pattern: /\bcloud\b/i },
  { skill: 'kafka', pattern: /\bkafka\b/i },
  { skill: 'rabbitmq', pattern: /\brabbitmq\b/i },
  { skill: 'docker', pattern: /\bdocker\b/i },
  { skill: 'kubernetes', pattern: /\bkubernetes\b|\bk8s\b/i },
  { skill: 'terraform', pattern: /\bterraform\b/i },
  { skill: 'jenkins', pattern: /\bjenkins\b/i },
  { skill: 'ci/cd', pattern: /\bci\/?cd\b/i },
  { skill: 'github actions', pattern: /\bgithub actions\b/i },
  { skill: 'postgresql', pattern: /\bpostgres(ql)?\b/i },
  { skill: 'mysql', pattern: /\bmysql\b/i },
  { skill: 'mongodb', pattern: /\bmongo(db)?\b/i },
  { skill: 'dynamodb', pattern: /\bdynamodb\b/i },
  { skill: 'oracle', pattern: /\boracle\b/i },
  { skill: 'redis', pattern: /\bredis\b/i },
  { skill: 'elasticsearch', pattern: /\belasticsearch\b/i },
  { skill: 'splunk', pattern: /\bsplunk\b/i },
  { skill: 'prometheus', pattern: /\bprometheus\b/i },
  { skill: 'grafana', pattern: /\bgrafana\b/i },
  { skill: 'sql', pattern: /\bsql\b/i },
  { skill: 'html', pattern: /\bhtml5?\b/i },
  { skill: 'css', pattern: /\bcss3?\b/i },
  { skill: 'j2ee', pattern: /\bj2ee\b|\bjava ee\b/i },
  { skill: 'pandas', pattern: /\bpandas\b/i },
  { skill: 'tensorflow', pattern: /\btensorflow\b/i },
  { skill: 'pytorch', pattern: /\bpytorch\b/i },
  { skill: 'machine learning', pattern: /\bmachine learning\b|\bml\b/i },
  { skill: 'selenium', pattern: /\bselenium\b/i },
  { skill: 'playwright', pattern: /\bplaywright\b/i },
  { skill: 'ios', pattern: /\bios\b|\bswift\b/i, core: true },
  { skill: 'android', pattern: /\bandroid\b|\bkotlin\b/i, core: true },
];

// Role families used to infer target roles and exclusions from detected skills.
const ROLE_RULES: Array<{ when: (skills: Set<string>) => boolean; roles: string[]; unexclude?: string[] }> = [
  { when: (s) => s.has('java'), roles: ['java'] },
  { when: (s) => s.has('full stack') || (hasBackend(s) && hasFrontend(s)), roles: ['full stack', 'fullstack'] },
  { when: (s) => hasBackend(s), roles: ['backend', 'back end'] },
  { when: (s) => hasFrontend(s) && !hasBackend(s), roles: ['frontend', 'front end', 'ui developer'], unexclude: ['ui developer'] },
  { when: (s) => s.has('machine learning') || s.has('tensorflow') || s.has('pytorch'), roles: ['machine learning', 'ml engineer', 'data scientist'], unexclude: ['machine learning', 'ml engineer', 'data scientist'] },
  { when: (s) => s.has('pandas') || (s.has('python') && s.has('sql')), roles: ['data engineer'], unexclude: ['data engineer'] },
  { when: (s) => s.has('terraform') && s.has('kubernetes'), roles: ['devops', 'site reliability'], unexclude: ['devops engineer'] },
  { when: (s) => s.has('selenium') || s.has('playwright'), roles: [], unexclude: [] },
  { when: (s) => s.has('ios') || s.has('android'), roles: ['mobile developer', 'ios', 'android'] },
  { when: () => true, roles: ['software engineer', 'software developer', 'application developer'] },
];

function hasBackend(s: Set<string>): boolean {
  return ['java', 'python', 'c#', 'go', 'ruby', 'php', 'c++', 'node.js', 'spring boot', 'django', 'rails'].some((k) => s.has(k));
}
function hasFrontend(s: Set<string>): boolean {
  return ['react', 'angular', 'vue', 'javascript', 'typescript', 'html', 'css'].some((k) => s.has(k));
}

/**
 * Parse raw resume text into a ResumeProfile.
 * Weighting: skills are ranked by how often they appear; the top core skills
 * get weight 10, strong signals 7, common skills 5, the rest 3 — mirroring the
 * CORE/HIGH/MID/LOW scheme the scoring threshold was calibrated against.
 */
export function parseResumeText(text: string): ResumeProfile {
  const counts = new Map<string, number>();
  for (const entry of SKILL_DICTIONARY) {
    const matches = text.match(new RegExp(entry.pattern.source, entry.pattern.flags.includes('g') ? entry.pattern.flags : entry.pattern.flags + 'g'));
    if (matches && matches.length > 0) counts.set(entry.skill, matches.length);
  }
  if (counts.size === 0) {
    throw new Error('No recognizable skills found in resume text. Provide plain resume text including a skills section.');
  }

  const detected = new Set(counts.keys());
  const byCount = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const coreSkills = byCount.filter(([s]) => SKILL_DICTIONARY.find((d) => d.skill === s)?.core);

  // Assign weights: top 2 core skills = 10, next 3 skills = 7, next 8 = 5, rest = 3.
  const weights = new Map<string, number>();
  coreSkills.slice(0, 2).forEach(([s]) => weights.set(s, 10));
  let tier7 = 0, tier5 = 0;
  for (const [skill] of byCount) {
    if (weights.has(skill)) continue;
    if (tier7 < 3) { weights.set(skill, 7); tier7++; }
    else if (tier5 < 8) { weights.set(skill, 5); tier5++; }
    else weights.set(skill, 3);
  }

  // Years of experience: take the largest plausible "N+ years" mention.
  const years = [...text.matchAll(/(\d{1,2})\s*\+?\s*years?/gi)]
    .map((m) => Number(m[1]))
    .filter((n) => n > 0 && n < 40);
  const yearsOfExperience = years.length ? Math.max(...years) : 3;

  // Target roles + exclusions from role families.
  const targetRoles = new Set<string>();
  const unexclude = new Set<string>();
  for (const rule of ROLE_RULES) {
    if (rule.when(detected)) {
      rule.roles.forEach((r) => targetRoles.add(r));
      rule.unexclude?.forEach((r) => unexclude.add(r));
    }
  }
  const excludeRoles = DEFAULT_PROFILE.excludeRoles.filter((r) => !unexclude.has(r));

  // Search terms for job boards: primary core skill + strongest role stems.
  const primary = coreSkills[0]?.[0];
  const searchTerms: string[] = [];
  if (primary) searchTerms.push(capitalize(primary));
  if (targetRoles.has('full stack')) searchTerms.push('Full Stack Developer');
  if (targetRoles.has('machine learning')) searchTerms.push('Machine Learning Engineer');
  if (targetRoles.has('data engineer')) searchTerms.push('Data Engineer');
  if (targetRoles.has('mobile developer')) searchTerms.push('Mobile Developer');
  if (targetRoles.has('frontend')) searchTerms.push('Frontend Developer');
  searchTerms.push('Software Engineer');

  const headline = primary
    ? `${capitalize(primary)}${targetRoles.has('full stack') ? ' / Full Stack' : ''} Developer`
    : 'Software Engineer';

  return {
    headline,
    yearsOfExperience,
    targetRoles: [...targetRoles],
    searchTerms: [...new Set(searchTerms)].slice(0, 3),
    skillWeights: [...weights.entries()].map(([skill, weight]) => ({ skill, weight })),
    excludeRoles,
    matchThreshold: DEFAULT_PROFILE.matchThreshold,
    source: 'resume-upload',
    updatedAt: new Date().toISOString(),
  };
}

function capitalize(s: string): string {
  return s.replace(/(^|\s|\.)\w/g, (c) => c.toUpperCase());
}
