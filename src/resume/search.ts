import type { CandidateProfile, ResumeJobMatch, SearchFilters } from '../types.js';
import { companyRegistry } from '../scrapers/company-registry.js';
import { scrapeMany } from '../scrapers/orchestrator.js';
import { buildProfile, type BuildProfileOptions } from './build-profile.js';
import { extractResumeText, type ResumeInput } from './extract-text.js';
import { JOB_BOARDS, matchJobs, type MatchStats } from './match-jobs.js';
import { screenRequirements } from '../utils/requirement-screen.js';

/** Default freshness window, per CLAUDE.md rule #1. */
export const DEFAULT_WINDOW_DAYS = 3;

export interface ResumeSearchOptions extends ResumeInput, BuildProfileOptions {
  /** Freshness window in days. 1 = last 24h, 7 = last week. Default 3. */
  postedWithinDays?: number;
  /** Restrict to these companies/slugs. Defaults to every scrapable registry entry. */
  companies?: string[];
  remoteOnly?: boolean;
  /** Max matches returned. */
  limit?: number;
  concurrency?: number;
  /** Skip the cache and re-scrape everything. */
  forceRefresh?: boolean;
  onProgress?: (done: number, total: number) => void;
}

export interface ResumeSearchResult {
  profile: CandidateProfile;
  matches: ResumeJobMatch[];
  stats: MatchStats;
  meta: {
    resumeSource: string;
    resumeFormat: string;
    windowDays: number;
    companiesSearched: number;
    elapsedSeconds: number;
    failedCompanies: Array<{ company: string; error: string }>;
    /** Boards that failed. Called out separately — they supply most of the results, so a
     *  rate-limited board looks identical to "nothing matched" unless it is named. */
    failedBoards: Array<{ company: string; error: string }>;
    /** Jobs dropped by the description screen, with the sentence that triggered each drop,
     *  so a false positive can be spotted instead of silently costing a real match. */
    requirementExcluded: Array<{ title: string; company: string; applyUrl: string; kind?: string; evidence?: string }>;
  };
}

/**
 * Companies excluded from a whole-registry sweep: Puppeteer-backed entries are mostly
 * non-US or unreliable in bulk (they OOM when run at full concurrency). They can still be
 * searched by naming them explicitly in `companies`.
 */
function defaultCompanies(): string[] {
  return companyRegistry
    .list()
    .filter((c) => c.platform !== 'custom' && c.platform !== 'oracle-orc')
    .map((c) => c.slug);
}

/** The narrowest server-side window that still contains the requested day count. */
function apiWindow(days: number): SearchFilters['postedSince'] {
  if (days <= 1) return 'today';
  if (days <= 7) return 'week';
  return 'month';
}

/**
 * Read a resume, derive a candidate profile from it, sweep every career site, and return
 * the postings that fit — ranked, deduped, and inside the freshness window.
 */
export async function searchJobsForResume(options: ResumeSearchOptions): Promise<ResumeSearchResult> {
  const { text, source, format } = await extractResumeText(options);
  const profile = buildProfile(text, options);

  const windowDays = options.postedWithinDays ?? DEFAULT_WINDOW_DAYS;
  const companies = options.companies?.length ? options.companies : defaultCompanies();

  const start = Date.now();
  const results = await scrapeMany(
    companies,
    {
      postedSince: apiWindow(windowDays),
      remoteOnly: options.remoteOnly,
      // The resume drives what the keyword-based boards actually search for.
      searchTerms: profile.searchTerms,
    },
    { concurrency: options.concurrency, onProgress: options.onProgress },
  );
  const elapsedSeconds = Number(((Date.now() - start) / 1000).toFixed(1));

  // No limit here: the description screen below may reject some of the top-ranked jobs,
  // so the limit is applied to what survives it.
  const { matches: candidates, stats, sources } = matchJobs(results, profile, { windowDays });

  // CLAUDE.md rule #4. The title check inside matchJobs only catches titles like
  // "Engineer (TS/SCI)"; the requirement is almost always stated in the description.
  const screened = await screenRequirements(candidates, (m) => sources.get(m)!, {
    stopAfter: options.limit,
  });
  const matches = screened.kept;
  stats.droppedByRequirement = screened.blocked.length;
  stats.requirementUnverified = screened.unverified;
  stats.matched = matches.length;

  const failures = results
    .filter((r) => r.error)
    .map((r) => ({ company: r.company, error: r.error as string }));

  return {
    profile,
    matches,
    stats,
    meta: {
      resumeSource: source,
      resumeFormat: format,
      windowDays,
      companiesSearched: companies.length,
      elapsedSeconds,
      failedCompanies: failures,
      failedBoards: failures.filter((f) => JOB_BOARDS.has(f.company)),
      requirementExcluded: screened.blocked.map(({ item, verdict }) => ({
        title: item.title,
        company: item.company,
        applyUrl: item.applyUrl,
        kind: verdict.kind,
        evidence: verdict.evidence,
      })),
    },
  };
}

/** Read a resume and return only the derived profile, without running any search. */
export async function profileFromResume(
  options: ResumeInput & BuildProfileOptions,
): Promise<{ profile: CandidateProfile; source: string; format: string }> {
  const { text, source, format } = await extractResumeText(options);
  return { profile: buildProfile(text, options), source, format };
}
