import axios from 'axios';
import * as cheerio from 'cheerio';
import type { JobListing, SearchFilters } from '../../types.js';
import { BaseScraper } from '../base-scraper.js';

/**
 * Built In (builtin.com) — US tech job board, server-rendered HTML. No login.
 *   GET https://builtin.com/jobs?search={term}&country=USA&daysSinceUpdated={d}
 * Cards: [data-id="job-card"], title link: a[data-id="job-card-title"],
 * posted: "N Hours/Days Ago" span, location/level in font-barlow spans.
 */
export class BuiltInScraper extends BaseScraper {
  private static readonly DEFAULT_TERMS = ['Java Developer', 'Full Stack Developer', 'Software Engineer'];
  private static readonly HOST = 'builtin.com';

  async fetchJobs(filters: SearchFilters): Promise<JobListing[]> {
    const terms = filters.jobTitle ? [filters.jobTitle] : BuiltInScraper.DEFAULT_TERMS;
    const seen = new Map<string, JobListing>();

    for (const term of terms) {
      const params = new URLSearchParams({
        search: term,
        country: 'USA',
        daysSinceUpdated: this.daysParam(filters.postedSince),
      });
      const url = `https://${BuiltInScraper.HOST}/jobs?${params}`;

      const html = await this.rateLimitedFetch(BuiltInScraper.HOST, async () => {
        const res = await axios.get<string>(url, {
          timeout: Number(process.env.SCRAPE_TIMEOUT_MS ?? 30000),
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });
        return res.data;
      });

      for (const job of this.parseCards(html)) {
        if (!seen.has(job.id)) seen.set(job.id, job);
      }
    }

    this.logProgress(`Built In: ${seen.size} unique postings across ${terms.length} search terms`);
    return [...seen.values()].filter((j) => this.matchesFilters(j, filters));
  }

  private parseCards(html: string): JobListing[] {
    const $ = cheerio.load(html);
    const jobs: JobListing[] = [];

    $('[data-id="job-card"]').each((_, el) => {
      const card = $(el);
      const titleLink = card.find('a[data-id="job-card-title"]').first();
      const title = titleLink.text().trim();
      const href = titleLink.attr('href') ?? '';
      const idMatch = href.match(/\/(\d+)\s*$/) ?? (card.attr('id') ?? '').match(/job-card-(\d+)/);
      const id = idMatch?.[1];
      if (!id || !title) return;

      const company =
        card.find('a[href^="/company/"]').first().text().trim() ||
        card.find('span').first().text().trim();

      // Location + workplace spans look like "New York, NY, USA", "Remote", "Hybrid"
      const locations: string[] = [];
      card.find('span').each((_, s) => {
        const t = $(s).text().trim();
        if (/^(Remote|Hybrid)$/i.test(t) || /,\s*[A-Z]{2},?\s*(USA)?$|United States|USA/.test(t)) {
          if (!locations.includes(t)) locations.push(t);
        }
      });

      const agoText = card
        .find('span')
        .filter((_, s) => /\b(ago|today|yesterday)\b/i.test($(s).text()))
        .first()
        .text()
        .trim();

      const applyUrl = `https://builtin.com${href.startsWith('/') ? href : `/${href}`}`;
      jobs.push({
        id: `builtin-${id}`,
        companyName: company || 'Unknown',
        title,
        locations,
        level: this.normalizeJobLevel(title),
        applyUrl,
        postedDate: this.parseAgo(agoText),
        sourceUrl: applyUrl,
        scrapedAt: new Date().toISOString(),
      });
    });

    return jobs;
  }

  /** "2 Hours Ago" / "3 Days Ago" / "Today" / "Yesterday" → ISO timestamp. */
  private parseAgo(text: string): string | undefined {
    if (!text) return undefined;
    const now = Date.now();
    if (/today|hour|minute/i.test(text)) {
      const h = text.match(/(\d+)\s*hour/i);
      return new Date(now - (h ? Number(h[1]) : 0) * 3600000).toISOString();
    }
    if (/yesterday/i.test(text)) return new Date(now - 86400000).toISOString();
    const d = text.match(/(\d+)\s*day/i);
    if (d) return new Date(now - Number(d[1]) * 86400000).toISOString();
    const w = text.match(/(\d+)\s*week/i);
    if (w) return new Date(now - Number(w[1]) * 7 * 86400000).toISOString();
    return undefined;
  }

  private daysParam(postedSince: SearchFilters['postedSince']): string {
    switch (postedSince) {
      case 'today':
        return '1';
      case 'month':
        return '30';
      case 'week':
      default:
        return '7';
    }
  }
}
