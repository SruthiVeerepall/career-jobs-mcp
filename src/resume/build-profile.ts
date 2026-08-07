import type { CandidateProfile, ProfileSkill } from '../types.js';
import {
  FAMILY_TITLE_RULES,
  SKILLS,
  TIER_WEIGHT,
  ceilingForYears,
  familyOfTitle,
  levelLabel,
  skillPattern,
  skillTerms,
  titleRank,
  type RoleFamily,
  type SkillDef,
} from './skill-taxonomy.js';

/** Default minimum title score. CLAUDE.md rule #6: score 5 == 60% match. */
export const DEFAULT_MATCH_THRESHOLD = 5;

/** The threshold represents 60% alignment, so a full 100% is threshold / 0.6. */
export const FULL_MATCH_REFERENCE = DEFAULT_MATCH_THRESHOLD / 0.6;

export interface BuildProfileOptions {
  /** Override the inferred years of experience. */
  yearsOfExperience?: number;
  /** Override the inferred country restriction ('US' applies the US-only rule). */
  country?: string;
  /** Override the minimum title score. */
  matchThreshold?: number;
  /** Extra board search keywords, prepended to the inferred ones. */
  extraSearchTerms?: string[];
}

/**
 * Turn resume text into a `CandidateProfile`.
 *
 * Everything the search then does — which skills score, which role families are allowed,
 * which seniority band is credible, which keywords the job boards are queried with — comes
 * out of this function. No candidate is baked into the code.
 */
export function buildProfile(text: string, options: BuildProfileOptions = {}): CandidateProfile {
  const notes: string[] = [];

  const name = extractName(text);
  const { years, source: yearsSource } = options.yearsOfExperience !== undefined
    ? { years: options.yearsOfExperience, source: 'stated' as const }
    : inferYears(text);

  if (yearsSource === 'default') {
    notes.push('No years of experience found in the resume; assuming mid-to-senior (0–5 yrs). Pass yearsOfExperience to correct this.');
  }

  const skills = extractSkills(text);
  if (skills.length === 0) {
    notes.push('No known technical skills were recognised in the resume — results will fall back to role-title matching only.');
  }

  const resumeTitles = extractTitles(text);
  const families = claimFamilies(resumeTitles, skills, notes);

  // A resume title may itself carry seniority ("Senior Software Engineer"), which raises
  // the ceiling above what the year count alone implies.
  const titleCeiling = resumeTitles.reduce((max, t) => Math.max(max, titleRank(t)), -1);
  const maxLevelRank = Math.max(ceilingForYears(years), titleCeiling);
  // Two rungs below the ceiling is still a plausible application; further down is a
  // downgrade the candidate would not be shortlisted for.
  const minLevelRank = Math.max(0, maxLevelRank - 2);

  const country = options.country ?? detectCountry(text);

  return {
    name,
    yearsOfExperience: years,
    yearsSource,
    skills,
    families,
    resumeTitles,
    searchTerms: buildSearchTerms(resumeTitles, skills, families, options.extraSearchTerms),
    minLevelRank,
    maxLevelRank,
    minLevel: levelLabel(minLevelRank),
    maxLevel: levelLabel(maxLevelRank),
    matchThreshold: options.matchThreshold ?? DEFAULT_MATCH_THRESHOLD,
    country,
    notes,
  };
}

// ---------------------------------------------------------------------------
// name
// ---------------------------------------------------------------------------

/**
 * The name is the first line that reads like one: resumes put it at the top, above the
 * contact block. Anything with an @, a digit, or a URL is contact info, not a name.
 */
function extractName(text: string): string | undefined {
  for (const raw of text.split('\n').slice(0, 6)) {
    const line = raw.trim().replace(/\s{2,}/g, ' ');
    if (!line || line.length > 60) continue;
    if (/[@\d]|https?:|www\.|\||resume|curriculum vitae/i.test(line)) continue;
    const words = line.split(/\s+/);
    if (words.length < 2 || words.length > 4) continue;
    if (words.every((w) => /^[A-Z][a-zA-Z.'-]*$/.test(w) || /^[A-Z.'-]+$/.test(w))) {
      return words.map((w) => (w === w.toUpperCase() && w.length > 1 ? titleCase(w) : w)).join(' ');
    }
  }
  return undefined;
}

function titleCase(word: string): string {
  return word.charAt(0) + word.slice(1).toLowerCase();
}

// ---------------------------------------------------------------------------
// years of experience
// ---------------------------------------------------------------------------

const STATED_YEARS =
  /(\d{1,2})(?:\s*\+|\s*plus)?\s*(?:\+\s*)?years?'?s?\s+(?:of\s+)?(?:progressive\s+|professional\s+|hands.?on\s+|industry\s+|relevant\s+|extensive\s+|overall\s+|IT\s+|software\s+|work\s+)*experience/gi;

const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec';
const DATE_RANGE = new RegExp(
  `(?:(${MONTHS})[a-z]*\\.?\\s+)?((?:19|20)\\d{2})\\s*(?:-|to|–|until)\\s*(?:(?:(${MONTHS})[a-z]*\\.?\\s+)?((?:19|20)\\d{2})|present|current|now|today)`,
  'gi',
);

const MONTH_INDEX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Years of professional experience, preferring an explicit claim over an inference.
 *
 * The inference deliberately reads only the experience section: education date ranges sit
 * in the same document and a degree started in 2014 would otherwise add four phantom years.
 */
export function inferYears(text: string): { years: number | undefined; source: CandidateProfile['yearsSource'] } {
  let stated: number | undefined;
  for (const m of text.matchAll(STATED_YEARS)) {
    const n = Number(m[1]);
    if (n > 0 && n <= 45) stated = Math.max(stated ?? 0, n);
  }
  if (stated !== undefined) return { years: stated, source: 'stated' };

  const section = experienceSection(text);
  let earliest: number | undefined;
  let latest: number | undefined;
  const nowYear = new Date().getFullYear();

  for (const m of section.matchAll(DATE_RANGE)) {
    const startYear = Number(m[2]);
    if (startYear < 1970 || startYear > nowYear) continue;
    const start = startYear + (MONTH_INDEX[(m[1] ?? '').toLowerCase()] ?? 0) / 12;
    const endYearRaw = m[4] ? Number(m[4]) : undefined;
    const end = endYearRaw === undefined
      ? nowYear + new Date().getMonth() / 12
      : endYearRaw + (MONTH_INDEX[(m[3] ?? '').toLowerCase()] ?? 11) / 12;
    if (endYearRaw !== undefined && (endYearRaw < startYear || endYearRaw > nowYear)) continue;
    earliest = earliest === undefined ? start : Math.min(earliest, start);
    latest = latest === undefined ? end : Math.max(latest, end);
  }

  if (earliest !== undefined && latest !== undefined && latest > earliest) {
    const years = Math.round((latest - earliest) * 10) / 10;
    if (years >= 0.5 && years <= 45) return { years, source: 'inferred-from-dates' };
  }

  return { years: undefined, source: 'default' };
}

const EXPERIENCE_HEADER = /^\s*(professional\s+|work\s+|relevant\s+|employment\s+)?(experience|work history|employment(\s+history)?|career (history|summary))\s*:?\s*$/im;
const POST_EXPERIENCE_HEADER = /^\s*(education|academics?|certifications?|projects?|skills?|awards?|publications?|references?)\s*:?\s*$/im;

/** The experience section, or the whole document when no section header is present. */
function experienceSection(text: string): string {
  const start = text.search(EXPERIENCE_HEADER);
  if (start === -1) return text;
  const rest = text.slice(start + 1);
  const end = rest.search(POST_EXPERIENCE_HEADER);
  return end === -1 ? rest : rest.slice(0, end);
}

// ---------------------------------------------------------------------------
// skills
// ---------------------------------------------------------------------------

/** Skills the resume actually evidences, strongest first. */
export function extractSkills(text: string): ProfileSkill[] {
  const found: ProfileSkill[] = [];

  for (const skill of SKILLS) {
    let mentions = 0;
    for (const term of skillTerms(skill)) {
      const strict = skill.strictCase && term === skill.name;
      const global = new RegExp(skillPattern(term, strict).source, strict ? 'g' : 'gi');
      mentions += (text.match(global) ?? []).length;
    }
    if (mentions > 0) {
      found.push({
        name: skill.name,
        weight: TIER_WEIGHT[skill.tier],
        terms: skillTerms(skill),
        mentions,
      });
    }
  }

  return found.sort((a, b) => b.weight - a.weight || b.mentions - a.mentions);
}

// ---------------------------------------------------------------------------
// titles
// ---------------------------------------------------------------------------

const ROLE_NOUN = /\b(developer|engineer|engineering|architect|analyst|scientist|programmer|consultant|specialist|administrator|intern|sde|swe|manager|director|lead)\b/i;
const TITLE_SPLIT = /\s*(?:\||,|·|—|-\s|\bat\b|•|\t)\s*/i;

/**
 * Job titles from the resume's own history.
 *
 * Only lines that *look* like titles qualify: short, few words, containing a role noun.
 * Prose is deliberately rejected — "Collaborated with the DevOps team on CI/CD" matches
 * the DevOps family pattern, and treating that as a held title would claim a role family
 * the candidate has never worked in.
 */
export function extractTitles(text: string): string[] {
  const titles: string[] = [];
  const seen = new Set<string>();

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.length > 100) continue;
    if (line.split(/\s+/).length > 12) continue;
    if (!ROLE_NOUN.test(line)) continue;

    for (const segment of line.split(TITLE_SPLIT)) {
      const candidate = segment.trim().replace(/[.:;]+$/, '');
      const words = candidate.split(/\s+/);
      if (words.length < 2 || words.length > 6) continue;
      if (/\d{4}/.test(candidate)) continue; // a date fragment, not a title
      if (!ROLE_NOUN.test(candidate)) continue;
      if (!familyOfTitle(candidate)) continue;

      const key = candidate.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      titles.push(candidate);
    }
  }

  return titles;
}

// ---------------------------------------------------------------------------
// families
// ---------------------------------------------------------------------------

/** Families that build software products, and so also qualify for generic SWE roles. */
const SOFTWARE_FAMILIES: RoleFamily[] = ['backend', 'frontend', 'fullstack', 'mobile', 'embedded'];

/** Skill-derived family scores are only claimed at this fraction of the strongest family. */
const FAMILY_CLAIM_FRACTION = 0.4;

/**
 * Role families the candidate can credibly apply to.
 *
 * Held titles are the primary evidence and skills only supplement them. That ordering is
 * the point: a Java developer whose resume lists Docker, Kubernetes, Terraform and Jenkins
 * has real DevOps *tooling* but has never held a DevOps *role*, and scoring by skills alone
 * would surface SRE postings they would not be shortlisted for.
 */
export function claimFamilies(titles: string[], skills: ProfileSkill[], notes: string[] = []): string[] {
  const claimed = new Set<RoleFamily>();

  for (const title of titles) {
    const family = familyOfTitle(title);
    if (family) claimed.add(family);
  }

  if (claimed.size === 0) {
    const byFamily = familyScores(skills);
    const top = Math.max(0, ...byFamily.values());
    for (const [family, score] of byFamily) {
      if (top > 0 && score >= top * FAMILY_CLAIM_FRACTION) claimed.add(family);
    }
    if (claimed.size > 0) {
      notes.push('No job titles were found in the resume, so role families were inferred from skills alone. Results may be broader than expected.');
    }
  }

  // Full stack implies both halves, and holding both halves implies full stack.
  if (claimed.has('fullstack')) {
    claimed.add('backend');
    claimed.add('frontend');
  }
  const skillFamilies = familyScores(skills);
  if (claimed.has('backend') && (skillFamilies.get('frontend') ?? 0) > 0) {
    claimed.add('frontend');
    claimed.add('fullstack');
  }
  if (claimed.has('frontend') && (skillFamilies.get('backend') ?? 0) > 0) {
    claimed.add('backend');
    claimed.add('fullstack');
  }

  // Anyone building software qualifies for a generically-titled software role. Specialists
  // (data, security, QA) do not get this by default — "Software Engineer" is not their lane.
  if (SOFTWARE_FAMILIES.some((f) => claimed.has(f))) claimed.add('generic-swe');

  if (claimed.size === 0) {
    notes.push('Could not determine a role family from the resume; falling back to general software engineering roles.');
    claimed.add('generic-swe');
  }

  return [...claimed];
}

function familyScores(skills: ProfileSkill[]): Map<RoleFamily, number> {
  const defByName = new Map<string, SkillDef>(SKILLS.map((s) => [s.name, s]));
  const scores = new Map<RoleFamily, number>();
  for (const skill of skills) {
    const def = defByName.get(skill.name);
    if (!def) continue;
    for (const family of def.families) {
      scores.set(family, (scores.get(family) ?? 0) + skill.weight);
    }
  }
  return scores;
}

// ---------------------------------------------------------------------------
// board search terms
// ---------------------------------------------------------------------------

/** Fallback keyword per family, used when the resume's own titles are too few. */
const FAMILY_SEARCH_TERM: Record<RoleFamily, string> = {
  backend: 'Backend Developer',
  frontend: 'Frontend Developer',
  fullstack: 'Full Stack Developer',
  mobile: 'Mobile Developer',
  'data-science': 'Machine Learning Engineer',
  'data-engineering': 'Data Engineer',
  devops: 'DevOps Engineer',
  qa: 'QA Engineer',
  security: 'Security Engineer',
  embedded: 'Embedded Engineer',
  'generic-swe': 'Software Engineer',
};

/** Each extra term is another network round on every board, so the list is capped. */
const MAX_SEARCH_TERMS = 4;

/**
 * Keywords the cross-company boards are queried with, best-first: the candidate's own
 * titles, then their strongest skill, then a per-family default.
 */
export function buildSearchTerms(
  titles: string[],
  skills: ProfileSkill[],
  families: string[],
  extra: string[] = [],
): string[] {
  const terms: string[] = [];
  const seen = new Set<string>();
  const add = (term: string | undefined) => {
    const value = term?.trim();
    if (!value) return;
    const key = value.toLowerCase();
    if (seen.has(key) || terms.length >= MAX_SEARCH_TERMS) return;
    seen.add(key);
    terms.push(value);
  };

  for (const term of extra) add(term);

  // Strip seniority words: boards match keywords literally, and "Senior" in the query
  // hides every non-senior posting that is otherwise in band.
  for (const title of titles) add(stripSeniority(title));

  const topSkill = skills.find((s) => s.weight >= TIER_WEIGHT.core);
  if (topSkill) add(`${topSkill.name} Developer`);

  for (const family of families) add(FAMILY_SEARCH_TERM[family as RoleFamily]);

  return terms.length > 0 ? terms : ['Software Engineer'];
}

function stripSeniority(title: string): string {
  return title
    .replace(/\b(senior|sr\.?|snr|junior|jr\.?|entry.?level|associate|principal|staff|lead|mid.?level|i{1,3}|iv|v)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// location
// ---------------------------------------------------------------------------

const COUNTRY_HINTS: Array<{ country: string; pattern: RegExp }> = [
  { country: 'IN', pattern: /\b(India|Bengaluru|Bangalore|Hyderabad|Chennai|Pune|Mumbai|Delhi|Noida|Gurgaon)\b/i },
  { country: 'CA', pattern: /\b(Canada|Toronto|Vancouver|Montreal|Ottawa|Calgary|Ontario|Quebec|British Columbia)\b/i },
  { country: 'UK', pattern: /\b(United Kingdom|England|London|Manchester|Birmingham|Scotland|Wales)\b/i },
  { country: 'DE', pattern: /\b(Germany|Berlin|Munich|Hamburg|Frankfurt)\b/i },
  { country: 'AU', pattern: /\b(Australia|Sydney|Melbourne|Brisbane|Perth)\b/i },
];

/**
 * Country to restrict the search to, read from the contact block at the top of the resume.
 * Only the header is inspected — a US-based candidate's employment history routinely names
 * offshore offices, and matching on those would relocate the whole search.
 */
export function detectCountry(text: string): string {
  const header = text.slice(0, 600);
  for (const { country, pattern } of COUNTRY_HINTS) {
    if (pattern.test(header)) return country;
  }
  return 'US';
}
