import type { CandidateProfile, JobListing, ResumeJobMatch, ScrapeResult } from '../types.js';
import { CLEARANCE, isUSJob } from '../utils/job-filters.js';
import { parsePostedDate } from '../utils/posted-date.js';
import {
  NON_ENGINEERING_TITLE,
  familyOfTitle,
  levelLabel,
  skillPattern,
  titleRank,
} from './skill-taxonomy.js';

const DAY_MS = 86_400_000;

/** Boards that aggregate many employers — their `companyName` is the real hiring company. */
export const JOB_BOARDS = new Set(['LinkedIn', 'SimplyHired', 'BuiltIn.com', 'RemoteOK', 'Remotive', 'We Work Remotely']);

export interface TitleScore {
  score: number;
  matchedSkills: string[];
}

/** Sum of the profile's skill weights whose terms appear in the job title. */
export function scoreTitle(title: string, profile: CandidateProfile): TitleScore {
  let score = 0;
  const matchedSkills: string[] = [];
  for (const skill of profile.skills) {
    if (skill.terms.some((term) => skillPattern(term).test(title))) {
      score += skill.weight;
      matchedSkills.push(skill.name);
    }
  }
  return { score, matchedSkills };
}

export interface TitleVerdict {
  matched: boolean;
  reason: string;
  score: number;
  matchedSkills: string[];
  family: string;
  level: string;
  levelRank: number;
}

/**
 * Decide whether a job title fits the candidate, and say why.
 *
 * Family is checked before score on purpose: a high skill score inside a family the
 * candidate has never worked in ("Machine Learning Engineer (Java, AWS)") is a false
 * positive, not a strong match.
 */
export function judgeTitle(title: string, profile: CandidateProfile): TitleVerdict {
  const { score, matchedSkills } = scoreTitle(title, profile);
  const family = familyOfTitle(title);
  const levelRank = titleRank(title);
  const base = { score, matchedSkills, family: family ?? 'unclassified', level: levelLabel(levelRank), levelRank };

  if (NON_ENGINEERING_TITLE.test(title)) {
    return { ...base, matched: false, reason: 'not an engineering IC role' };
  }
  if (CLEARANCE.test(title)) {
    return { ...base, matched: false, reason: 'requires security clearance / citizenship' };
  }
  if (family && !profile.families.includes(family)) {
    return { ...base, matched: false, reason: `role family "${family}" is not in the resume` };
  }
  if (levelRank > profile.maxLevelRank) {
    return { ...base, matched: false, reason: `above the ${profile.maxLevel} ceiling for ${profile.yearsOfExperience ?? '?'} yrs experience` };
  }
  if (levelRank < profile.minLevelRank) {
    return { ...base, matched: false, reason: `below the ${profile.minLevel} floor` };
  }
  // A recognised family already establishes fit — CLAUDE.md rule #6: "Software Engineer"
  // scores 0 on skill keywords yet is a target role.
  if (family) return { ...base, matched: true, reason: `${family} role in band` };
  if (score >= profile.matchThreshold) {
    return { ...base, matched: true, reason: `skill score ${score} ≥ threshold ${profile.matchThreshold}` };
  }
  return { ...base, matched: false, reason: `no known role family and score ${score} < threshold ${profile.matchThreshold}` };
}

/** Score as a percentage, where the threshold is by definition a 60% match. */
export function matchPercent(score: number, profile: CandidateProfile, familyMatched: boolean): number {
  const reference = profile.matchThreshold / 0.6;
  const raw = Math.round((score / reference) * 100);
  return Math.min(100, familyMatched ? Math.max(60, raw) : raw);
}

export interface MatchOptions {
  /** Freshness window in days. Postings older than this — or undated — are dropped. */
  windowDays: number;
  /** Cap on returned matches. */
  limit?: number;
}

export interface MatchStats {
  rawJobs: number;
  matched: number;
  droppedByProfile: number;
  droppedByLocation: number;
  droppedByDate: number;
  droppedUndated: number;
  duplicates: number;
}

export interface MatchOutcome {
  matches: ResumeJobMatch[];
  stats: MatchStats;
}

/**
 * Apply the full profile filter chain to scraped results and rank what survives.
 *
 * Order matters for the stats: profile fit is judged before location and date so that
 * "dropped by location" counts only jobs the candidate would otherwise have wanted.
 */
export function matchJobs(
  results: ScrapeResult[],
  profile: CandidateProfile,
  options: MatchOptions,
): MatchOutcome {
  const cutoff = Date.now() - options.windowDays * DAY_MS;
  const stats: MatchStats = {
    rawJobs: 0,
    matched: 0,
    droppedByProfile: 0,
    droppedByLocation: 0,
    droppedByDate: 0,
    // The orchestrator already drops undated postings before we see them; carry its count
    // through so the exclusion is visible rather than silent.
    droppedUndated: results.reduce((n, r) => n + (r.undatedExcluded ?? 0), 0),
    duplicates: 0,
  };

  const matches: ResumeJobMatch[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    if (result.error) continue;
    for (const job of result.jobs) {
      stats.rawJobs++;
      const title = job.title ?? '';

      const verdict = judgeTitle(title, profile);
      if (!verdict.matched) {
        stats.droppedByProfile++;
        continue;
      }

      if (!matchesCountry(job.locations, profile.country)) {
        stats.droppedByLocation++;
        continue;
      }

      // `windowVerified` sources already applied the window against the real posting
      // timestamp; their published date is only day-precise, so re-cutting it here would
      // discard jobs they just certified as fresh.
      const posted = parsePostedDate(job.postedDate);
      if (!job.windowVerified) {
        if (posted === null) {
          stats.droppedUndated++;
          continue;
        }
        if (posted < cutoff) {
          stats.droppedByDate++;
          continue;
        }
      }

      const key = job.applyUrl || `${result.company}::${title}`;
      if (seen.has(key)) {
        stats.duplicates++;
        continue;
      }
      seen.add(key);

      const viaBoard = JOB_BOARDS.has(result.company);
      matches.push({
        title,
        company: viaBoard && job.companyName && job.companyName !== result.company ? job.companyName : result.company,
        via: viaBoard ? result.company : undefined,
        locations: (job.locations ?? []).join(' | ') || 'N/A',
        postedDate: formatPosted(posted, job),
        applyUrl: job.applyUrl ?? '',
        score: verdict.score,
        matchPercent: matchPercent(verdict.score, profile, verdict.family !== 'unclassified'),
        level: verdict.level,
        family: verdict.family,
        matchedSkills: verdict.matchedSkills,
      });
    }
  }

  matches.sort((a, b) => b.score - a.score || a.company.localeCompare(b.company));
  stats.matched = matches.length;

  return {
    matches: options.limit ? matches.slice(0, options.limit) : matches,
    stats,
  };
}

/**
 * Rendered in UTC on purpose. Date-only sources (LinkedIn) parse to UTC midnight, so
 * formatting in local time shifts them a day earlier and a fresh job looks stale.
 * "(repost)" marks a republished listing — see JobListing.isRepost.
 */
function formatPosted(posted: number | null, job: JobListing): string {
  const label = posted === null
    ? 'within window'
    : new Date(posted).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return label + (job.isRepost ? ' (repost)' : '');
}

const COUNTRY_PATTERNS: Record<string, RegExp> = {
  IN: /\b(India|Bengaluru|Bangalore|Hyderabad|Chennai|Pune|Mumbai|Delhi|Noida|Gurgaon)\b/i,
  CA: /\b(Canada|Toronto|Vancouver|Montreal|Ottawa|Calgary|Ontario|Quebec|British Columbia)\b/i,
  UK: /\b(United Kingdom|England|London|Manchester|Birmingham|Scotland|Wales)\b/i,
  DE: /\b(Germany|Berlin|Munich|Hamburg|Frankfurt)\b/i,
  AU: /\b(Australia|Sydney|Melbourne|Brisbane|Perth)\b/i,
};

/**
 * `US` runs the full US-only rule (state codes, non-US exclusion list, Remote handling).
 * Other countries only have a name/city test available, so Remote postings are kept —
 * dropping them would be a guess in the restrictive direction.
 */
export function matchesCountry(locations: string[] | undefined, country: string): boolean {
  if (!country || country === 'ANY') return true;
  if (country === 'US') return isUSJob(locations);
  const pattern = COUNTRY_PATTERNS[country.toUpperCase()];
  if (!pattern) return true;
  if (!locations || locations.length === 0) return true;
  return locations.some((loc) => pattern.test(loc) || /\bremote\b/i.test(loc));
}
