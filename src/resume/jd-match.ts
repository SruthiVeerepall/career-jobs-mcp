import type { CandidateProfile, ProfileSkill } from '../types.js';
import { extractSkills } from './build-profile.js';
import { NON_ENGINEERING_FAMILIES, SKILLS, skillPattern, type RoleFamily, type SkillDef } from './skill-taxonomy.js';

const DEF_BY_NAME = new Map<string, SkillDef>(SKILLS.map((d) => [d.name, d]));

export type JdMatchStatus = 'scored' | 'no-description' | 'no-known-skills';

export interface JdMatch {
  /**
   * Weighted share (0–100) of the skills the job description names that the résumé also
   * has, each scaled by how strongly the résumé shows it (`skillStrength()`). Null when
   * there is nothing to score — see `status`.
   */
  percent: number | null;
  status: JdMatchStatus;
  /** Skills the description asks for that the résumé has, strongest first. */
  matchedSkills: string[];
  /** Skills the description asks for that the résumé lacks, strongest first. */
  missingSkills: string[];
}

/**
 * Score a job description against the résumé's skills.
 *
 * Both sides go through the same `extractSkills()` taxonomy, so "Spring Boot" in the
 * résumé and "SpringBoot" in the JD are the same skill. The denominator is what the JD
 * asks for, not what the résumé has: a JD that only wants Java is a 100% fit for a Java
 * developer, however many other skills the résumé lists. Tier weights apply, so missing
 * the JD's core language costs more than missing one of its build tools.
 *
 * Repetition is emphasis: a JD that names Java eight times and Terraform once in a
 * "nice to have" line cares more about Java. Each skill's tier weight is multiplied by
 * `emphasis(mentions)` — 1× for one mention, +0.5× per extra mention, capped at 3× so a
 * keyword-stuffed JD cannot let one skill drown out the rest.
 *
 * The résumé side is weighted too: a matched skill earns `skillStrength()` of its weight,
 * not all of it. Python used once in a side project is not the same as Java used across
 * five years of jobs, so a Python-heavy JD must not score 100% for a Java developer who
 * merely lists Python.
 *
 * `employer` (the hiring company's name) drops skills that are just that name.
 */
export function matchDescription(
  description: string | undefined,
  profile: CandidateProfile,
  employer?: string,
): JdMatch {
  if (!description || !description.trim()) {
    return { percent: null, status: 'no-description', matchedSkills: [], missingSkills: [] };
  }
  const have = new Map(profile.skills.map((s) => [s.name, skillStrength(s)]));
  for (const def of SKILLS) {
    // An implied skill is as strong as the strongest skill implying it: PostgreSQL used
    // at work is SQL used at work.
    const implied = Math.max(0, ...(def.impliedBy ?? []).map((name) => have.get(name) ?? 0));
    if (implied > (have.get(def.name) ?? 0)) have.set(def.name, implied);
  }

  const wanted = extractSkills(description)
    .filter((s) => !namesEmployer(s, employer) && !offRole(s.name, profile, have))
    .sort((a, b) => b.weight * emphasis(b.mentions) - a.weight * emphasis(a.mentions));
  if (wanted.length === 0) {
    return { percent: null, status: 'no-known-skills', matchedSkills: [], missingSkills: [] };
  }
  let total = 0;
  let matched = 0;
  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];
  for (const skill of wanted) {
    const weight = skill.weight * emphasis(skill.mentions);
    total += weight;
    const strength = have.get(skill.name) ?? 0;
    if (strength > 0) {
      matched += weight * strength;
      matchedSkills.push(skill.name);
    } else {
      missingSkills.push(skill.name);
    }
  }
  return { percent: Math.round((matched / total) * 100), status: 'scored', matchedSkills, missingSkills };
}

/**
 * A skill that only identifies a non-engineering role (SEO, Salesforce, requirements
 * gathering, wireframing) and that the résumé neither has nor claims the role of. An
 * engineering JD names these as context ("write user stories", "integrate with
 * Salesforce"), and counting them cost a developer 3 points on average across 2,891 cached
 * JDs. For an analyst, PM or designer résumé, which claims those families, they count.
 */
function offRole(name: string, profile: CandidateProfile, have: Map<string, number>): boolean {
  const families = DEF_BY_NAME.get(name)?.families ?? [];
  if (families.length === 0 || (have.get(name) ?? 0) > 0) return false;
  return families.every((f) => NON_ENGINEERING_FAMILIES.has(f) && !profile.families.includes(f as RoleFamily));
}

/**
 * A skill that is the employer's own name is not a requirement: Snowflake's, Databricks'
 * or Zendesk's JDs name the company throughout, and counting it would mark every candidate
 * who never used that product as missing a core skill.
 */
function namesEmployer(skill: Pick<ProfileSkill, 'terms'>, employer: string | undefined): boolean {
  if (!employer) return false;
  return skill.terms.some((term) => skillPattern(term).test(employer));
}

/**
 * How much of a matched skill's weight the résumé earns (0–1), from where and how often
 * the résumé mentions it:
 *
 * - used in the work-experience section 3+ times → 1.0, twice → 0.9, once → 0.8;
 * - only under Skills, Projects or Education → 0.5 (listed, not shown on the job);
 * - no experience header to tell them apart → judged by total mentions with the
 *   work-experience scale (1.0 / 0.9 / 0.8), never penalised as "listed only".
 */
export function skillStrength(skill: Pick<ProfileSkill, 'mentions' | 'workMentions'>): number {
  if (skill.workMentions === undefined) return workScale(skill.mentions);
  if (skill.workMentions === 0) return skill.mentions > 0 ? LISTED_ONLY : 0;
  return workScale(skill.workMentions);
}
const LISTED_ONLY = 0.5;
function workScale(mentions: number): number {
  if (mentions <= 0) return 0;
  return mentions >= 3 ? 1 : mentions === 2 ? 0.9 : 0.8;
}

/** Multiplier for how often the JD names a skill: 1 → 1×, 2 → 1.5×, 3 → 2×, ≥5 → 3×. */
export function emphasis(mentions: number | undefined): number {
  const m = Math.max(1, mentions ?? 1);
  return Math.min(MAX_EMPHASIS, 1 + 0.5 * (m - 1));
}
const MAX_EMPHASIS = 3;

type JdRanked = { jdMatchPercent?: number | null; jdMatchedSkills?: string[] };

/**
 * Descending by JD match; postings that could not be scored sort last. Equal percentages
 * break on how many skills matched: a JD naming one skill the résumé has is 100% on thin
 * evidence and belongs below a 100% JD that names twelve.
 */
export function byJdMatch(a: JdRanked, b: JdRanked): number {
  return (
    (b.jdMatchPercent ?? -1) - (a.jdMatchPercent ?? -1) ||
    (b.jdMatchedSkills?.length ?? 0) - (a.jdMatchedSkills?.length ?? 0)
  );
}
