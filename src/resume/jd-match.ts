import type { CandidateProfile } from '../types.js';
import { extractSkills } from './build-profile.js';
import { SKILLS } from './skill-taxonomy.js';

export type JdMatchStatus = 'scored' | 'no-description' | 'no-known-skills';

export interface JdMatch {
  /**
   * Weighted share (0–100) of the skills the job description names that the résumé also
   * has. Null when there is nothing to score — see `status`.
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
 */
export function matchDescription(description: string | undefined, profile: CandidateProfile): JdMatch {
  if (!description || !description.trim()) {
    return { percent: null, status: 'no-description', matchedSkills: [], missingSkills: [] };
  }
  const wanted = extractSkills(description).sort(
    (a, b) => b.weight * emphasis(b.mentions) - a.weight * emphasis(a.mentions),
  );
  if (wanted.length === 0) {
    return { percent: null, status: 'no-known-skills', matchedSkills: [], missingSkills: [] };
  }

  const have = new Set(profile.skills.map((s) => s.name));
  for (const def of SKILLS) {
    if (def.impliedBy?.some((name) => have.has(name))) have.add(def.name);
  }
  let total = 0;
  let matched = 0;
  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];
  for (const skill of wanted) {
    const weight = skill.weight * emphasis(skill.mentions);
    total += weight;
    if (have.has(skill.name)) {
      matched += weight;
      matchedSkills.push(skill.name);
    } else {
      missingSkills.push(skill.name);
    }
  }
  return { percent: Math.round((matched / total) * 100), status: 'scored', matchedSkills, missingSkills };
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
