import axios from 'axios';
import type { JobListing, SearchFilters } from '../../types.js';
import { BaseScraper } from '../base-scraper.js';

/**
 * We Work Remotely — public RSS feeds, no auth. Item titles are
 * "Company: Job Title"; <region> says which regions may apply.
 * Feeds fetched: programming, full-stack programming, back-end programming.
 */
export class WeWorkRemotelyScraper extends BaseScraper {
  private static readonly FEEDS = [
    'remote-programming-jobs',
    'remote-full-stack-programming-jobs',
    'remote-back-end-programming-jobs',
  ];
  private static readonly HOST = 'weworkremotely.com';

  async fetchJobs(filters: SearchFilters): Promise<JobListing[]> {
    const seen = new Map<string, JobListing>();

    for (const feed of WeWorkRemotelyScraper.FEEDS) {
      const url = `https://${WeWorkRemotelyScraper.HOST}/categories/${feed}.rss`;
      let xml: string;
      try {
        xml = await this.rateLimitedFetch(WeWorkRemotelyScraper.HOST, async () => {
          const res = await axios.get<string>(url, {
            timeout: Number(process.env.SCRAPE_TIMEOUT_MS ?? 30000),
            headers: { 'User-Agent': 'career-jobs-mcp/0.1 (personal job search)' },
          });
          return res.data;
        });
      } catch {
        continue; // one dead feed shouldn't kill the others
      }

      for (const job of this.parseFeed(xml)) {
        if (!seen.has(job.id)) seen.set(job.id, job);
      }
    }

    this.logProgress(`We Work Remotely: ${seen.size} unique postings across ${WeWorkRemotelyScraper.FEEDS.length} feeds`);
    return [...seen.values()].filter((j) => this.matchesFilters(j, filters));
  }

  private parseFeed(xml: string): JobListing[] {
    const jobs: JobListing[] = [];
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);

    for (const item of items) {
      const pick = (tag: string): string =>
        (item.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)) ?? [])[1]
          ?.replace(/<!\[CDATA\[|\]\]>/g, '')
          .trim() ?? '';

      const rawTitle = decodeEntities(pick('title'));
      const link = pick('link');
      if (!rawTitle || !link) continue;

      // "Company: Job Title" — split on the first ": "
      const sep = rawTitle.indexOf(': ');
      const company = sep > 0 ? rawTitle.slice(0, sep) : 'Unknown';
      const title = sep > 0 ? rawTitle.slice(sep + 2) : rawTitle;

      const region = decodeEntities(pick('region'));
      const pubDate = pick('pubDate');
      const parsed = pubDate ? new Date(pubDate) : undefined;

      jobs.push({
        id: `wwr-${link.split('/').pop()}`,
        companyName: company,
        title,
        locations: [this.normalizeRegion(region)],
        level: this.normalizeJobLevel(title),
        applyUrl: link,
        postedDate: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : undefined,
        sourceUrl: link,
        scrapedAt: new Date().toISOString(),
      });
    }
    return jobs;
  }

  private normalizeRegion(region: string): string {
    if (!region || /anywhere in the world|worldwide/i.test(region)) return 'Remote — Worldwide';
    if (/usa|united states|americas|north america/i.test(region)) return `Remote — ${region}`;
    return region; // non-US regions excluded by isUSJob() downstream
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
