export interface JobListing {
  id: string;
  companyName: string;
  title: string;
  department?: string;
  locations: string[];
  level?: JobLevel;
  salaryRange?: SalaryRange;
  description?: string;
  requirements?: string[];
  benefits?: string[];
  applyUrl: string;
  postedDate?: string;
  /**
   * The source advertised this as a RE-post, so `postedDate` is the republish date, not
   * the original opening date. The board exposes no original date, so the age is real but
   * the listing may be a recycled one. Surfaced in output rather than silently trusted.
   */
  isRepost?: boolean;
  /**
   * The SOURCE already filtered this job to the requested `postedSince` window, using the
   * real posting timestamp it holds internally (e.g. LinkedIn's `f_TPR=r86400`). Set only
   * when that server-side filter is posting-time based and authoritative.
   *
   * When true the client-side date check is skipped, because our own `postedDate` may be
   * a lossy reconstruction — LinkedIn publishes only a DATE, so a job posted at 23:00
   * yesterday reads as 40h old and would be wrongly dropped even though LinkedIn just
   * certified it as within 24h. Trusting the precise upstream answer beats re-deriving a
   * worse one. Safe against caching because cache rows are keyed by window.
   */
  windowVerified?: boolean;
  scrapedAt: string;
  sourceUrl: string;
  raw?: Record<string, unknown>;
}

export type JobLevel = 'Intern' | 'Entry' | 'Mid' | 'Senior' | 'Lead' | 'Principal' | 'Manager' | 'Director' | 'Executive' | 'Unknown';

export interface SalaryRange {
  min?: number;
  max?: number;
  currency?: string;
  period?: 'hourly' | 'monthly' | 'yearly';
}

export interface SearchFilters {
  jobTitle?: string;
  location?: string;
  level?: JobLevel;
  department?: string;
  postedSince?: 'today' | 'week' | 'month';
  remoteOnly?: boolean;
  /**
   * Keywords the cross-company job boards (LinkedIn, SimplyHired, BuiltIn, Remotive)
   * should query when no single `jobTitle` is given. A no-keyword fetch is meaningless on
   * a board that indexes every employer, so each board needs terms; these come from the
   * candidate's resume rather than a hard-coded profile. Ignored by company scrapers,
   * which fetch their whole board and filter client-side.
   */
  searchTerms?: string[];
}

export type CareerPlatform = 'greenhouse' | 'lever' | 'workday' | 'smartrecruiters' | 'ashby' | 'oracle-orc' | 'icims' | 'icims-jra' | 'eightfold' | 'rippling' | 'custom' | 'amazon' | 'apple' | 'tesla' | 'mckinsey' | 'aurora' | 'linkedin' | 'simplyhired' | 'builtin' | 'remoteok' | 'remotive' | 'weworkremotely';

export interface CompanyConfig {
  name: string;
  slug: string;
  careerUrl: string;
  platform: CareerPlatform;
  platformIdentifier?: string;
  customSelectors?: CustomSelectors;
  requiresJavaScript?: boolean;
}

export interface CustomSelectors {
  jobListSelector?: string;
  jobTitleSelector?: string;
  jobLocationSelector?: string;
  jobDepartmentSelector?: string;
  jobLinkSelector?: string;
  paginationSelector?: string;
}

/** A skill the resume evidenced, with the weight it contributes to a title's match score. */
export interface ProfileSkill {
  name: string;
  weight: number;
  /** Surface forms searched for in job titles — the canonical name plus its aliases. */
  terms: string[];
  /** How many times the resume mentioned it. Not scored; reported for transparency. */
  mentions: number;
}

/**
 * Everything the searcher needs to know about a candidate, derived entirely from their
 * resume text. Replaces the profile that used to be hard-coded in `job-filters.ts`.
 */
export interface CandidateProfile {
  name?: string;
  /** Years of professional experience — stated in the resume, or inferred from date ranges. */
  yearsOfExperience?: number;
  /** How `yearsOfExperience` was obtained, so a wrong inference is debuggable. */
  yearsSource: 'stated' | 'inferred-from-dates' | 'default';
  skills: ProfileSkill[];
  /** Role families the resume claims. A job in any other family is excluded. */
  families: string[];
  /** Titles found in the resume's own experience history. */
  resumeTitles: string[];
  /** Search keywords for the cross-company job boards, best-first. */
  searchTerms: string[];
  /** Inclusive seniority band on the SENIORITY_RUNGS ladder. */
  minLevelRank: number;
  maxLevelRank: number;
  minLevel: string;
  maxLevel: string;
  /** Minimum title score to count as a match. Score/threshold*0.6 = match percentage. */
  matchThreshold: number;
  /** ISO-ish country the search is restricted to; 'US' applies the US-only location rule. */
  country: string;
  /** Human-readable notes about weak or defaulted inferences. */
  notes: string[];
}

/** A job that passed every profile filter, with the reason it scored what it did. */
export interface ResumeJobMatch {
  title: string;
  company: string;
  /** Board the listing came from when the employer was found via an aggregator. */
  via?: string;
  locations: string;
  postedDate: string;
  applyUrl: string;
  score: number;
  matchPercent: number;
  level: string;
  family: string;
  /** Profile skills whose names appear in the job title. */
  matchedSkills: string[];
}

export interface ScrapeResult {
  company: string;
  jobs: JobListing[];
  scrapedAt: string;
  fromCache: boolean;
  error?: string;
  /**
   * Jobs dropped by a `postedSince` window solely because the source published no
   * usable posting date. Reported so a silent exclusion is visible to callers.
   */
  undatedExcluded?: number;
}
