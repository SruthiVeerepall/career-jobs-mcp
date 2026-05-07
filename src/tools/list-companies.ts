import { companyRegistry } from '../scrapers/company-registry.js';
import { cacheManager } from '../cache/cache-manager.js';

export async function listCompanies() {
  const companies = companyRegistry.list().map((c) => ({
    name: c.name,
    slug: c.slug,
    platform: c.platform,
    careerUrl: c.careerUrl,
    lastScrapedAt: cacheManager.getLastScrapedAt(c.slug),
  }));
  return {
    total: companies.length,
    companies,
  };
}
