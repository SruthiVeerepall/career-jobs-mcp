// CLAUDE.md rule #4 — exclude jobs that require a security clearance or US citizenship.
//
// A title almost never carries these requirements; the description does ("Must be a U.S.
// citizen", "Active Secret clearance required"). So the title check in job-filters.ts is
// only the cheap first pass, and this module screens the DESCRIPTION of every job that
// survives résumé matching.
//
// Two traps drive the design:
//   - Boilerplate. Nearly every US posting says "without regard to … citizenship status"
//     in its EEO statement, and many say "no clearance required". A plain regex over the
//     whole text rejects them all. So text is screened sentence by sentence, and a
//     sentence that negates the requirement or is EEO/E-Verify boilerplate is skipped.
//   - Missing text. Several sources return no description in their list response. Those
//     are fetched per job (Workday, SmartRecruiters, LinkedIn detail endpoints; JSON-LD or
//     page text otherwise). A job whose description cannot be fetched is kept and counted
//     as unverified — dropping it would silently discard most of a board on one timeout.

import axios from 'axios';
import type { JobListing } from '../types.js';
import { hostFromUrl, rateLimiter } from './rate-limiter.js';

export type RequirementKind = 'clearance' | 'citizenship';

export interface RequirementVerdict {
  blocked: boolean;
  kind?: RequirementKind;
  /** The sentence that triggered the block, trimmed — shown so a rejection can be audited. */
  evidence?: string;
}

// ── Text screen ─────────────────────────────────────────────────────────────

const CLEARANCE_PATTERNS: RegExp[] = [
  /\b(?:secret|top[\s-]secret|ts\s*\/\s*sci|ts-sci|dod|doe|q|security|government|federal)\s+(?:security\s+)?clearances?\b/i,
  /\b(?:active|current|existing|valid|interim)\s+(?:\w+\s+){0,3}clearances?\b/i,
  /\bclearances?\s+(?:is\s+|are\s+)?(?:required|needed|mandatory|necessary)\b/i,
  /\b(?:obtain|maintain|hold|possess|eligib\w*(?:\s+(?:to|for))?)\s+(?:and\s+maintain\s+)?(?:an?\s+|the\s+)?(?:\w+\s+){0,3}clearances?\b/i,
  /\bTS\s*\/\s*SCI\b|\bTS-SCI\b/i,
  /\bpolygraph\b/i,
  /\bpublic\s+trust\b/i,
];

/** "Clearance" in a non-security sense. */
const NON_SECURITY_CLEARANCE = /\b(?:medical|customs|tax|credit|financial|export|drug)\s+clearances?\b/i;

const CITIZEN_TERM = /\b(?:u\.?\s?s\.?|united\s+states|american)\s+citizen(?:s|ship)?\b/i;
const US_PERSON_TERM = /\bU\.?\s?S\.?\s+persons?\b|\bITAR\b/i;
const REQUIREMENT_WORD = /\b(?:requir\w*|must|only|mandatory|necessary|need(?:ed|s)?|eligib\w*|condition of employment)\b/i;

/** Sentences that mention the terms without imposing them. */
const BOILERPLATE =
  /discriminat|equal\s+(?:employment\s+)?opportunit|without\s+regard|regardless\s+of|irrespective\s+of|national\s+origin|protected\s+(?:veteran|class|status)|e-?verify|affirmative\s+action/i;
const NEGATED =
  /\b(?:no|not|n't|never|without)\b[^.;]{0,40}\b(?:clearance|citizen)|\b(?:clearance|citizenship)\s+(?:is\s+)?not\s+(?:required|needed|necessary)|\b(?:clearance|citizenship)\b[^.;:]{0,40}:\s*(?:none|n\/a|no|not\s+required)\b/i;
/** Company-wide hedging about SOME roles ("roles that carry sensitive requirements may be
 *  limited to…", Kodiak) — not a requirement of this job. A direct "this position requires"
 *  is unaffected. */
const HEDGED_GENERAL = /\b(?:some|certain|roles\s+that|positions\s+that)\b[^.;]{0,80}\bmay\b/i;

const MAX_SEGMENT = 400;

/**
 * A run with no sentence punctuation — HTML bullets flattened to plain text — can merge a
 * whole list with the requirement after it (SpaceX: "...Gradle) ... weekends as needed ITAR
 * REQUIREMENTS: ... must be a U.S. citizen", 884 chars). Such runs used to be skipped as
 * too coarse, which let the requirement through. Split them at ALL-CAPS headings, then
 * into overlapping windows, so nothing goes unexamined.
 */
function splitLong(s: string): string[] {
  if (s.length <= MAX_SEGMENT * 2) return [s];
  const out: string[] = [];
  for (const part of s.split(/\s(?=[A-Z][A-Z &/-]{3,}:)/)) {
    if (part.length <= MAX_SEGMENT * 2) {
      out.push(part);
      continue;
    }
    for (let i = 0; i < part.length; i += MAX_SEGMENT) out.push(part.slice(Math.max(0, i - 100), i + MAX_SEGMENT));
  }
  return out;
}

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    // "U.S." holds two periods that would split "Must be a U.S. citizen" mid-requirement.
    .replace(/\bU\.\s?S\.(?:\s?A\.)?/g, 'US')
    .split(/(?<=[.!?;•])\s+|\s[-–•*]\s/)
    .flatMap(splitLong)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Screen description text for a clearance or citizenship requirement. */
export function screenRequirementText(text: string | undefined): RequirementVerdict {
  if (!text) return { blocked: false };
  for (const s of sentences(text)) {
    if (BOILERPLATE.test(s) || NEGATED.test(s) || HEDGED_GENERAL.test(s)) continue;

    if (CLEARANCE_PATTERNS.some((p) => p.test(s)) && !NON_SECURITY_CLEARANCE.test(s)) {
      return { blocked: true, kind: 'clearance', evidence: s.slice(0, 200) };
    }
    // Citizenship: the term plus a requirement word, or a bare short bullet such as
    // "U.S. Citizenship" sitting in a requirements list.
    if (CITIZEN_TERM.test(s) && (REQUIREMENT_WORD.test(s) || s.length <= 40)) {
      return { blocked: true, kind: 'citizenship', evidence: s.slice(0, 200) };
    }
    // Export-control roles (ITAR "U.S. persons") exclude non-citizens just the same.
    if (US_PERSON_TERM.test(s) && REQUIREMENT_WORD.test(s)) {
      return { blocked: true, kind: 'citizenship', evidence: s.slice(0, 200) };
    }
  }
  return { blocked: false };
}

// ── Description fetch ───────────────────────────────────────────────────────

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 15000;

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h\d|tr|br)\s*>|<br\s*\/?>/gi, '. ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function get<T = unknown>(url: string, accept = 'application/json'): Promise<T> {
  await rateLimiter.wait(hostFromUrl(url));
  const res = await axios.get<T>(url, {
    timeout: FETCH_TIMEOUT_MS,
    headers: { 'User-Agent': UA, Accept: accept },
  });
  return res.data;
}

/** The JobPosting description embedded as schema.org JSON-LD, which most career pages carry for Google Jobs. */
function jsonLdDescription(html: string): string | undefined {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]);
      const nodes = Array.isArray(data) ? data : data['@graph'] ?? [data];
      for (const n of nodes) {
        if (n?.['@type'] === 'JobPosting' && typeof n.description === 'string') return htmlToText(n.description);
      }
    } catch {
      // malformed JSON-LD block — try the next one
    }
  }
  return undefined;
}

async function fetchWorkday(url: string): Promise<string | undefined> {
  const m = url.match(/^https:\/\/([^.]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([^/]+)(\/job\/.+)$/);
  if (!m) return undefined;
  const [, tenant, wd, site, path] = m;
  const data = await get<{ jobPostingInfo?: { jobDescription?: string } }>(
    `https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}${path}`,
  );
  const d = data.jobPostingInfo?.jobDescription;
  return d ? htmlToText(d) : undefined;
}

async function fetchSmartRecruiters(url: string): Promise<string | undefined> {
  const m = url.match(/jobs\.smartrecruiters\.com\/([^/]+)\/(\d+)/);
  if (!m) return undefined;
  const data = await get<{ jobAd?: { sections?: Record<string, { text?: string }> } }>(
    `https://api.smartrecruiters.com/v1/companies/${m[1]}/postings/${m[2]}`,
  );
  const sections = Object.values(data.jobAd?.sections ?? {});
  const text = sections.map((s) => s.text ?? '').join(' ');
  return text ? htmlToText(text) : undefined;
}

async function fetchLinkedIn(url: string): Promise<string | undefined> {
  const m = url.match(/linkedin\.com\/jobs\/view\/(?:[^/]*-)?(\d+)/);
  if (!m) return undefined;
  const html = await get<string>(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${m[1]}`, 'text/html');
  const body = String(html).match(/<div[^>]+class="[^"]*show-more-less-html__markup[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  return body ? htmlToText(body[1]) : undefined;
}

async function fetchGeneric(url: string): Promise<string | undefined> {
  const html = String(await get<string>(url, 'text/html,application/xhtml+xml'));
  const fromLd = jsonLdDescription(html);
  if (fromLd) return fromLd;
  const text = htmlToText(html);
  // A JS shell page renders nothing useful server-side; too little text to judge.
  return text.length > 400 ? text : undefined;
}

/** Best available description for a job: the scraped one, else fetched from its source. */
export async function fetchJobDescription(job: Pick<JobListing, 'description' | 'applyUrl' | 'sourceUrl'>): Promise<string | undefined> {
  if (job.description && job.description.length > 50) return job.description;
  const url = job.applyUrl || job.sourceUrl;
  if (!url || !/^https?:\/\//.test(url)) return undefined;
  if (/myworkdayjobs\.com/.test(url)) return fetchWorkday(url);
  if (/jobs\.smartrecruiters\.com/.test(url)) return fetchSmartRecruiters(url);
  if (/linkedin\.com\/jobs\/view/.test(url)) return fetchLinkedIn(url);
  return fetchGeneric(url);
}

// ── Screening a result set ──────────────────────────────────────────────────

export interface ScreenOutcome<T> {
  kept: T[];
  blocked: Array<{ item: T; verdict: RequirementVerdict }>;
  /** Kept without a description to check — the source gave none and it could not be fetched. */
  unverified: number;
}

// Descriptions do not change within a posting's life, so a verdict is reused for the
// lifetime of the process (the MCP server is long-lived) instead of re-fetched per search.
const verdictCache = new Map<string, RequirementVerdict & { verified: boolean }>();

async function screenOne(job: JobListing): Promise<RequirementVerdict & { verified: boolean }> {
  const key = job.applyUrl || job.sourceUrl || `${job.companyName}::${job.id}`;
  const hit = verdictCache.get(key);
  if (hit) return hit;
  let description: string | undefined;
  try {
    description = await fetchJobDescription(job);
  } catch {
    description = undefined;
  }
  // The title is screened too, so a description fetch failure never un-blocks a title
  // like "Software Engineer (TS/SCI)".
  const verdict = screenRequirementText(`${job.title}. ${description ?? ''}`);
  const result = { ...verdict, verified: description !== undefined };
  // Only cache what was actually verified; a failed fetch deserves another try next search.
  if (result.verified || result.blocked) verdictCache.set(key, result);
  return result;
}

/**
 * Screen items in their given (ranked) order and drop those whose description requires a
 * clearance or US citizenship. With `stopAfter`, screening ends once that many items have
 * been kept — the rest are never fetched, which keeps a `limit`-ed search cheap.
 */
export async function screenRequirements<T>(
  items: T[],
  jobOf: (item: T) => JobListing,
  options: { concurrency?: number; stopAfter?: number } = {},
): Promise<ScreenOutcome<T>> {
  const concurrency = Math.max(1, options.concurrency ?? 16);
  const outcome: ScreenOutcome<T> = { kept: [], blocked: [], unverified: 0 };

  // Fixed-size batches in rank order, so `stopAfter` keeps the best-ranked survivors.
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const verdicts = await Promise.all(batch.map((item) => screenOne(jobOf(item))));
    batch.forEach((item, j) => {
      const v = verdicts[j];
      if (v.blocked) {
        outcome.blocked.push({ item, verdict: { blocked: true, kind: v.kind, evidence: v.evidence } });
      } else {
        outcome.kept.push(item);
        if (!v.verified) outcome.unverified++;
      }
    });
    if (options.stopAfter !== undefined && outcome.kept.length >= options.stopAfter) break;
  }
  if (options.stopAfter !== undefined) outcome.kept = outcome.kept.slice(0, options.stopAfter);
  return outcome;
}
