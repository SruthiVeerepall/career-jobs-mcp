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

export type CareerPlatform = 'greenhouse' | 'lever' | 'workday' | 'smartrecruiters' | 'ashby' | 'custom';

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
}
