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
}

export type CareerPlatform = 'greenhouse' | 'lever' | 'workday' | 'smartrecruiters' | 'ashby' | 'oracle-orc' | 'icims' | 'icims-jra' | 'custom' | 'amazon' | 'apple' | 'tesla' | 'mckinsey' | 'linkedin' | 'simplyhired' | 'builtin' | 'remoteok' | 'remotive' | 'weworkremotely';

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
