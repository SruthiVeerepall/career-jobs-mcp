import type { CompanyConfig } from '../types.js';
import { BaseScraper } from './base-scraper.js';
import { GreenhouseScraper } from './platforms/greenhouse.js';
import { LeverScraper } from './platforms/lever.js';
import { AshbyScraper } from './platforms/ashby.js';
import { SmartRecruitersScraper } from './platforms/smartrecruiters.js';
import { WorkdayScraper } from './platforms/workday.js';
import { CustomPuppeteerScraper } from './platforms/custom-puppeteer.js';
import { logger } from '../utils/logger.js';

const PRECONFIGURED: CompanyConfig[] = [
  // ── Greenhouse boards ────────────────────────────────────────────────
  { name: 'Stripe', slug: 'stripe', careerUrl: 'https://stripe.com/jobs', platform: 'greenhouse', platformIdentifier: 'stripe' },
  { name: 'Airbnb', slug: 'airbnb', careerUrl: 'https://careers.airbnb.com', platform: 'greenhouse', platformIdentifier: 'airbnb' },
  { name: 'Coinbase', slug: 'coinbase', careerUrl: 'https://www.coinbase.com/careers', platform: 'greenhouse', platformIdentifier: 'coinbase' },
  { name: 'Discord', slug: 'discord', careerUrl: 'https://discord.com/jobs', platform: 'greenhouse', platformIdentifier: 'discord' },
  { name: 'GitLab', slug: 'gitlab', careerUrl: 'https://about.gitlab.com/jobs', platform: 'greenhouse', platformIdentifier: 'gitlab' },
  { name: 'Reddit', slug: 'reddit', careerUrl: 'https://www.redditinc.com/careers', platform: 'greenhouse', platformIdentifier: 'reddit' },
  { name: 'Twilio', slug: 'twilio', careerUrl: 'https://www.twilio.com/company/jobs', platform: 'greenhouse', platformIdentifier: 'twilio' },
  { name: 'Pinterest', slug: 'pinterest', careerUrl: 'https://www.pinterestcareers.com', platform: 'greenhouse', platformIdentifier: 'pinterest' },
  { name: 'DoorDash', slug: 'doordash', careerUrl: 'https://careers.doordash.com', platform: 'greenhouse', platformIdentifier: 'doordash' },
  { name: 'Instacart', slug: 'instacart', careerUrl: 'https://instacart.careers', platform: 'greenhouse', platformIdentifier: 'instacart' },
  { name: 'Anthropic', slug: 'anthropic', careerUrl: 'https://www.anthropic.com/careers', platform: 'greenhouse', platformIdentifier: 'anthropic' },
  { name: 'OpenAI', slug: 'openai', careerUrl: 'https://openai.com/careers', platform: 'greenhouse', platformIdentifier: 'openai' },
  { name: 'Robinhood', slug: 'robinhood', careerUrl: 'https://careers.robinhood.com', platform: 'greenhouse', platformIdentifier: 'robinhood' },
  { name: 'Plaid', slug: 'plaid', careerUrl: 'https://plaid.com/careers', platform: 'greenhouse', platformIdentifier: 'plaid' },
  { name: 'Figma', slug: 'figma', careerUrl: 'https://www.figma.com/careers', platform: 'greenhouse', platformIdentifier: 'figma' },
  { name: 'Snowflake', slug: 'snowflake', careerUrl: 'https://careers.snowflake.com', platform: 'greenhouse', platformIdentifier: 'snowflake' },
  { name: 'Databricks', slug: 'databricks', careerUrl: 'https://www.databricks.com/company/careers', platform: 'greenhouse', platformIdentifier: 'databricks' },

  // ── Lever boards ─────────────────────────────────────────────────────
  { name: 'Netflix', slug: 'netflix', careerUrl: 'https://jobs.netflix.com', platform: 'lever', platformIdentifier: 'netflix' },
  { name: 'Quora', slug: 'quora', careerUrl: 'https://www.quora.com/careers', platform: 'lever', platformIdentifier: 'quora' },
  { name: 'Brex', slug: 'brex', careerUrl: 'https://www.brex.com/careers', platform: 'lever', platformIdentifier: 'brex' },
  { name: 'Mixpanel', slug: 'mixpanel', careerUrl: 'https://mixpanel.com/jobs', platform: 'lever', platformIdentifier: 'mixpanel' },

  // ── Ashby boards ─────────────────────────────────────────────────────
  { name: 'Linear', slug: 'linear', careerUrl: 'https://linear.app/careers', platform: 'ashby', platformIdentifier: 'linear' },
  { name: 'PostHog', slug: 'posthog', careerUrl: 'https://posthog.com/careers', platform: 'ashby', platformIdentifier: 'posthog' },
  { name: 'Replicate', slug: 'replicate', careerUrl: 'https://replicate.com/careers', platform: 'ashby', platformIdentifier: 'replicate' },
  { name: 'Ramp', slug: 'ramp', careerUrl: 'https://ramp.com/careers', platform: 'ashby', platformIdentifier: 'ramp' },

  // ── SmartRecruiters boards ───────────────────────────────────────────
  { name: 'Visa', slug: 'visa', careerUrl: 'https://corporate.visa.com/en/jobs', platform: 'smartrecruiters', platformIdentifier: 'Visa' },
  { name: 'Bosch', slug: 'bosch', careerUrl: 'https://www.bosch.com/careers', platform: 'smartrecruiters', platformIdentifier: 'BoschGroup' },

  // ── Workday boards ───────────────────────────────────────────────────
  { name: 'Salesforce', slug: 'salesforce', careerUrl: 'https://careers.salesforce.com', platform: 'workday', platformIdentifier: 'salesforce|wd1|External_Career_Site' },
  { name: 'Adobe', slug: 'adobe', careerUrl: 'https://careers.adobe.com', platform: 'workday', platformIdentifier: 'adobe|wd5|external_experienced' },
  { name: 'JPMorgan Chase', slug: 'jpmorgan', careerUrl: 'https://careers.jpmorganchase.com', platform: 'workday', platformIdentifier: 'jpmc|wd1|jpmc' },
  { name: 'Citi', slug: 'citi', careerUrl: 'https://jobs.citi.com', platform: 'workday', platformIdentifier: 'citi|wd5|2' },
  { name: 'Goldman Sachs', slug: 'goldman-sachs', careerUrl: 'https://www.goldmansachs.com/careers', platform: 'workday', platformIdentifier: 'goldman|wd1|GS_EXT_CAREERS' },
  { name: 'Vanguard', slug: 'vanguard', careerUrl: 'https://www.vanguardjobs.com', platform: 'workday', platformIdentifier: 'vanguard|wd5|vanguard_careers' },
  { name: 'NVIDIA', slug: 'nvidia', careerUrl: 'https://www.nvidia.com/en-us/about-nvidia/careers', platform: 'workday', platformIdentifier: 'nvidia|wd5|NVIDIAExternalCareerSite' },

  // ── Custom (Puppeteer) - Big tech with bespoke career sites ─────────
  {
    name: 'Apple',
    slug: 'apple',
    careerUrl: 'https://jobs.apple.com/en-us/search',
    platform: 'custom',
    requiresJavaScript: true,
    customSelectors: {
      jobListSelector: 'tbody tr.table-row, li.search-results-list-item',
      jobTitleSelector: 'a.table--advanced-search__title, [class*="title"]',
      jobLocationSelector: '[class*="location"]',
      jobDepartmentSelector: '[class*="team"]',
      jobLinkSelector: 'a',
    },
  },
  {
    name: 'Google',
    slug: 'google',
    careerUrl: 'https://www.google.com/about/careers/applications/jobs/results',
    platform: 'custom',
    requiresJavaScript: true,
    customSelectors: {
      jobListSelector: 'li.lLd3Je',
      jobTitleSelector: 'h3',
      jobLocationSelector: 'span.r0wTof, span.pwO9Dc',
      jobLinkSelector: 'a.WpHeLc',
    },
  },
  {
    name: 'Microsoft',
    slug: 'microsoft',
    careerUrl: 'https://jobs.careers.microsoft.com/global/en/search',
    platform: 'custom',
    requiresJavaScript: true,
    customSelectors: {
      jobListSelector: '[role="listitem"]',
      jobTitleSelector: 'h2',
      jobLocationSelector: '[aria-label*="location"]',
      jobLinkSelector: 'a',
    },
  },
  {
    name: 'Amazon',
    slug: 'amazon',
    careerUrl: 'https://www.amazon.jobs/en/search.json?sort=recent',
    platform: 'custom',
    requiresJavaScript: false,
  },
  {
    name: 'Meta',
    slug: 'meta',
    careerUrl: 'https://www.metacareers.com/jobs',
    platform: 'custom',
    requiresJavaScript: true,
    customSelectors: {
      jobListSelector: 'a[href*="/jobs/"]',
      jobTitleSelector: 'div',
      jobLocationSelector: '[class*="location"]',
    },
  },
  {
    name: 'Tesla',
    slug: 'tesla',
    careerUrl: 'https://www.tesla.com/careers/search',
    platform: 'custom',
    requiresJavaScript: true,
  },
  {
    name: 'Uber',
    slug: 'uber',
    careerUrl: 'https://www.uber.com/global/en/careers/list',
    platform: 'custom',
    requiresJavaScript: true,
  },
  {
    name: 'Shopify',
    slug: 'shopify',
    careerUrl: 'https://www.shopify.com/careers/search',
    platform: 'custom',
    requiresJavaScript: true,
  },
];

class CompanyRegistry {
  private companies = new Map<string, CompanyConfig>();

  constructor(initial: CompanyConfig[]) {
    for (const cfg of initial) this.companies.set(cfg.slug, cfg);
  }

  list(): CompanyConfig[] {
    return Array.from(this.companies.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  get(nameOrSlug: string): CompanyConfig | undefined {
    const slug = this.normalizeSlug(nameOrSlug);
    if (this.companies.has(slug)) return this.companies.get(slug);
    const lower = nameOrSlug.toLowerCase();
    for (const cfg of this.companies.values()) {
      if (cfg.name.toLowerCase() === lower) return cfg;
    }
    return undefined;
  }

  add(config: CompanyConfig): void {
    this.companies.set(config.slug, config);
    logger.info(`Registered company: ${config.name} (${config.platform})`);
  }

  createScraper(config: CompanyConfig): BaseScraper {
    switch (config.platform) {
      case 'greenhouse':
        return new GreenhouseScraper(config);
      case 'lever':
        return new LeverScraper(config);
      case 'ashby':
        return new AshbyScraper(config);
      case 'smartrecruiters':
        return new SmartRecruitersScraper(config);
      case 'workday':
        return new WorkdayScraper(config);
      case 'custom':
        return new CustomPuppeteerScraper(config);
      default:
        throw new Error(`Unsupported platform: ${config.platform}`);
    }
  }

  normalizeSlug(input: string): string {
    return input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}

export const companyRegistry = new CompanyRegistry(PRECONFIGURED);
