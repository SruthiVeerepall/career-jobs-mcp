import axios from 'axios';
import * as cheerio from 'cheerio';
import type { JobListing, SearchFilters } from '../../types.js';
import { BaseScraper } from '../base-scraper.js';
import { startOfDaysAgo } from '../../utils/posted-date.js';

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
    const terms = this.resolveSearchTerms(filters, BuiltInScraper.DEFAULT_TERMS);
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
        // "Reposted 14 Hours Ago" — BuiltIn's own datePosted equals the republish time and
        // no original date is exposed anywhere, so the date cannot be corrected. Flag it
        // instead: the listing may be a recycled one being re-advertised.
        isRepost: /repost/i.test(agoText),
        sourceUrl: applyUrl,
        scrapedAt: new Date().toISOString(),
      });
    });

    return jobs;
  }

  private parseAgo(text: string): string | undefined {
    return parseBuiltInAgo(text);
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

/**
 * "2 Hours Ago" / "3 Days Ago" / "Today" / "Yesterday" → ISO timestamp.
 * Also handles the "Reposted …" prefix, which carries the same shapes.
 *
 * Hour/minute strings are genuinely relative and stay relative. Day-granular strings are
 * anchored to the start of that calendar day so the timestamp does not rejuvenate across
 * cache reads (see parseWorkdayDate for the same reasoning).
 *
 * Note the date is the REPOST time when the text says "Reposted". BuiltIn's own
 * `datePosted` agrees with that and exposes no original date, so the age is accurate for
 * the republish but the opening may be older — hence the separate `isRepost` flag.
 */
export function parseBuiltInAgo(text: string | undefined, now = Date.now()): string | undefined {
  if (!text) return undefined;
  // BuiltIn words singular quantities: "An Hour Ago", "A Day Ago" — not just "1 Hour Ago".
  // Matching digits alone made those unparseable, and since unparseable now means
  // EXCLUDED, it silently dropped the freshest listings on the board.
  const amount = (unit: string): number | undefined => {
    // `\+?` tolerates the "30+ Days Ago" form; `\s+` keeps "an"/"a" from gluing onto the
    // unit ("aday") while still allowing "An Hour".
    const m = text.match(new RegExp(`\\b(\\d+|an?)\\+?\\s+${unit}`, 'i'));
    if (!m) return undefined;
    const raw = m[1].toLowerCase();
    return raw === 'a' || raw === 'an' ? 1 : Number(raw);
  };

  const hours = amount('hour');
  if (hours !== undefined) return new Date(now - hours * 3600000).toISOString();
  if (/minute/i.test(text)) return new Date(now).toISOString();
  if (/today/i.test(text)) return startOfDaysAgo(0, now);
  if (/yesterday/i.test(text)) return startOfDaysAgo(1, now);
  const days = amount('day');
  if (days !== undefined) return startOfDaysAgo(days, now);
  const weeks = amount('week');
  if (weeks !== undefined) return startOfDaysAgo(weeks * 7, now);
  const months = amount('month');
  if (months !== undefined) return startOfDaysAgo(months * 30, now);
  // Unrecognized → undefined. The strict window check excludes it rather than letting an
  // unknown-age job through.
  return undefined;
}
