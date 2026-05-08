import axios from 'axios';
import type { JobListing, SearchFilters } from '../../types.js';
import { BaseScraper } from '../base-scraper.js';
import { hostFromUrl } from '../../utils/rate-limiter.js';

interface OrcReq {
  Id: string;
  Title: string;
  PostedDate?: string;
  PrimaryLocation?: string;
  ShortDescriptionStr?: string;
  ExternalQualificationsStr?: string;
  ExternalResponsibilitiesStr?: string;
  WorkplaceType?: string;
  secondaryLocations?: { Name: string }[];
}

interface OrcResponseItem {
  TotalJobsCount?: number;
  requisitionList?: OrcReq[];
}

interface OrcResponse {
  items?: OrcResponseItem[];
}

/**
 * Oracle Recruiting Cloud (ORC) — used by Oracle and many companies that license Oracle HCM.
 *
 * platformIdentifier format: "{host}|{siteNumber}"
 *   e.g. for Oracle Corporation: "eeho.fa.us2.oraclecloud.com|CX_45001"
 *
 * The REST endpoint is:
 *   GET https://{host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions
 *       ?finder=findReqs;siteNumber={siteNumber},facetsList=...,limit=N,offset=M
 *       &expand=requisitionList.secondaryLocations
 *       &onlyData=true
 */
export class OracleOrcScraper extends BaseScraper {
  async fetchJobs(filters: SearchFilters): Promise<JobListing[]> {
    const ident = this.config.platformIdentifier;
    if (!ident) throw new Error(`Oracle ORC scraper for ${this.config.name} missing platformIdentifier`);
    const [host, siteNumber] = ident.split('|');
    if (!host || !siteNumber) {
      throw new Error(
        `Oracle ORC platformIdentifier must be "host|siteNumber" (got "${ident}" for ${this.config.name})`,
      );
    }

    const baseUrl = `https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions`;
    this.logProgress(`Fetching Oracle ORC: ${host}/${siteNumber}`);

    const all: JobListing[] = [];
    const limit = 25;
    let offset = 0;
    const maxOffset = 1000;

    while (offset < maxOffset) {
      const finder = `findReqs;siteNumber=${siteNumber},facetsList=LOCATIONS%3BTITLES%3BCATEGORIES,limit=${limit},offset=${offset},sortBy=POSTING_DATES_DESC${
        filters.jobTitle ? `,keyword=${encodeURIComponent(filters.jobTitle)}` : ''
      }`;
      const url = `${baseUrl}?finder=${finder}&expand=requisitionList.secondaryLocations&onlyData=true`;

      const data = await this.rateLimitedFetch(hostFromUrl(url), async () => {
        const res = await axios.get<OrcResponse>(url, {
          timeout: Number(process.env.SCRAPE_TIMEOUT_MS ?? 30000),
          headers: { 'User-Agent': 'career-jobs-mcp/0.1', Accept: 'application/json' },
        });
        return res.data;
      });

      const item = data.items?.[0];
      const reqs = item?.requisitionList ?? [];
      const total = item?.TotalJobsCount ?? 0;

      for (const r of reqs) all.push(this.mapJob(r, host, siteNumber));

      offset += limit;
      if (reqs.length < limit || offset >= total) break;
    }

    return all.filter((j) => this.matchesFilters(j, filters));
  }

  private mapJob(r: OrcReq, host: string, siteNumber: string): JobListing {
    const locations: string[] = [];
    if (r.PrimaryLocation) locations.push(r.PrimaryLocation);
    if (r.secondaryLocations) {
      for (const loc of r.secondaryLocations) {
        if (loc.Name && !locations.includes(loc.Name)) locations.push(loc.Name);
      }
    }
    if (r.WorkplaceType && /remote/i.test(r.WorkplaceType) && !locations.some((l) => /remote/i.test(l))) {
      locations.push('Remote');
    }

    const applyUrl = `https://${host}/en/sites/CX/job/${r.Id}/?lastSelectedFacet=LOCATIONS&selectedFlexFieldsFacets=%22${siteNumber}%22`;

    return {
      id: r.Id,
      companyName: this.config.name,
      title: r.Title,
      locations,
      level: this.normalizeJobLevel(r.Title),
      applyUrl,
      postedDate: r.PostedDate,
      description: r.ShortDescriptionStr,
      requirements: r.ExternalQualificationsStr ? [r.ExternalQualificationsStr] : undefined,
      sourceUrl: applyUrl,
      scrapedAt: new Date().toISOString(),
    };
  }
}
