// Source priority: a company's own career site outranks a job board.
//
// Why: the board results dominated every run — LinkedIn/BuiltIn titles are keyword-stuffed
// ("Java Full Stack (Spring Boot, Kafka, AWS)") so they out-scored the plain "Software
// Engineer II" a company site publishes, and sorting by score alone buried company jobs.
// A company-site link is also the direct application page, while a board link is one hop
// removed. So every output orders company sites first, and a board copy of an opening
// already found on the employer's own site is dropped as a duplicate.

/** Cross-company boards. Their `companyName` on each job is the real hiring employer. */
export const JOB_BOARDS = new Set(['LinkedIn', 'SimplyHired', 'BuiltIn.com', 'RemoteOK', 'Remotive', 'We Work Remotely']);

export type JobSource = 'company-site' | 'job-board';

export function sourceOf(sourceName: string): JobSource {
  return JOB_BOARDS.has(sourceName) ? 'job-board' : 'company-site';
}

/** Scrape results reordered so company sites are processed first and win cross-source dedupe. */
export function companySitesFirst<T extends { company: string }>(results: T[]): T[] {
  return [...results].sort((a, b) => Number(JOB_BOARDS.has(a.company)) - Number(JOB_BOARDS.has(b.company)));
}

const CORP_SUFFIX = /\b(inc|llc|ltd|corp|corporation|co|company|the|group|holdings|plc|na)\b/g;

/**
 * Identity of one opening across sources: employer + title, normalised so "JPMorganChase"
 * on LinkedIn meets "JPMorgan Chase" from the registry.
 */
export function crossSourceKey(employer: string, title: string): string {
  const emp = employer
    .toLowerCase()
    .replace(/\(via [^)]*\)/, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(CORP_SUFFIX, '')
    .replace(/\s+/g, '');
  const t = title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return `${emp}::${t}`;
}

/** Sort comparator: company sites before boards, then by score (desc) within each. */
export function bySourceThenScore<T extends { source: JobSource; score: number }>(a: T, b: T): number {
  return Number(a.source === 'job-board') - Number(b.source === 'job-board') || b.score - a.score;
}
