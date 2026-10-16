import type { CandidateProfile } from '../types.js';
import { extractSkills } from './build-profile.js';

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
 */
export function matchDescription(description: string | undefined, profile: CandidateProfile): JdMatch {
  if (!description || !description.trim()) {
    return { percent: null, status: 'no-description', matchedSkills: [], missingSkills: [] };
  }
  const wanted = extractSkills(description);
  if (wanted.length === 0) {
    return { percent: null, status: 'no-known-skills', matchedSkills: [], missingSkills: [] };
  }

  const have = new Set(profile.skills.map((s) => s.name));
  let total = 0;
  let matched = 0;
  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];
  for (const skill of wanted) {
    total += skill.weight;
    if (have.has(skill.name)) {
      matched += skill.weight;
      matchedSkills.push(skill.name);
    } else {
      missingSkills.push(skill.name);
    }
  }
  return { percent: Math.round((matched / total) * 100), status: 'scored', matchedSkills, missingSkills };
}

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
