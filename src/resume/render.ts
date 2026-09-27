import type { CandidateProfile } from '../types.js';
import type { ResumeSearchResult } from './search.js';

/** One-paragraph summary of what was read out of the resume. */
export function renderProfile(profile: CandidateProfile): string {
  const lines: string[] = [];
  lines.push(`**Profile:** ${profile.name ?? 'candidate'} — ${profile.yearsOfExperience ?? '?'} yrs (${profile.yearsSource.replace(/-/g, ' ')})`);
  lines.push(`**Role families:** ${profile.families.join(', ')}`);
  lines.push(`**Seniority band:** ${profile.minLevel} → ${profile.maxLevel}`);
  if (profile.resumeTitles.length) lines.push(`**Titles held:** ${profile.resumeTitles.slice(0, 6).join(' · ')}`);
  lines.push(`**Board search terms:** ${profile.searchTerms.join(' · ')}`);
  lines.push(`**Top skills:** ${profile.skills.slice(0, 12).map((s) => `${s.name} (${s.weight})`).join(', ') || 'none recognised'}`);
  lines.push(`**Location:** ${profile.country === 'US' ? 'US only (incl. Remote-US)' : profile.country}`);
  for (const note of profile.notes) lines.push(`> ⚠ ${note}`);
  return lines.join('\n');
}

/** Full report: profile summary, the results table with apply links, then the run stats. */
export function renderSearchResult(result: ResumeSearchResult): string {
  const { profile, matches, stats, meta } = result;
  const windowLabel = meta.windowDays === 1 ? 'last 24 hours' : `last ${meta.windowDays} days`;
  const out: string[] = [];

  out.push(renderProfile(profile));
  out.push('');
  out.push(`Searched ${meta.companiesSearched} sources in ${meta.elapsedSeconds}s · window: ${windowLabel} · ${stats.rawJobs} postings screened`);
  out.push('');

  if (matches.length === 0) {
    out.push(`**No matching jobs in the ${windowLabel}.** Try a wider window (\`postedWithinDays: 7\`).`);
  } else {
    out.push(`### ${matches.length} matching job${matches.length === 1 ? '' : 's'}`);
    // Company career sites first — direct employer postings are the priority; job boards
    // follow. Numbering runs continuously across both sections.
    let n = 0;
    const sections: Array<[string, typeof matches]> = [
      ['From company career sites', matches.filter((m) => m.source === 'company-site')],
      ['From job boards', matches.filter((m) => m.source === 'job-board')],
    ];
    for (const [heading, rows] of sections) {
      out.push('');
      out.push(`#### ${heading} (${rows.length})`);
      if (rows.length === 0) {
        out.push('_None in this window._');
        continue;
      }
      out.push('');
      out.push('| # | Title | Company | Location | Posted | Match | Apply URL |');
      out.push('|---|-------|---------|----------|--------|-------|-----------|');
      for (const m of rows) {
        const company = m.via ? `${cell(m.company)} (via ${m.via})` : cell(m.company);
        const url = m.applyUrl ? `[Apply](${m.applyUrl})` : 'N/A';
        out.push(`| ${++n} | ${cell(m.title)} | ${company} | ${cell(m.locations)} | ${m.postedDate} | ${m.matchPercent}% | ${url} |`);
      }
    }
  }

  out.push('');
  const dropped = [
    `${stats.droppedByProfile} off-profile`,
    `${stats.droppedByLocation} outside ${profile.country}`,
    `${stats.droppedByDate} outside window`,
    `${stats.droppedUndated} undated (age unverifiable)`,
    `${stats.droppedByRequirement} requiring clearance / US citizenship`,
    `${stats.duplicates} duplicates`,
  ];
  out.push(`_Filtered out: ${dropped.join(', ')}._`);
  if (stats.requirementUnverified > 0) {
    out.push(
      `_${stats.requirementUnverified} listed job${stats.requirementUnverified === 1 ? '' : 's'} had no readable description, ` +
        `so clearance / citizenship could not be checked — confirm on the posting._`,
    );
  }

  if (meta.failedBoards.length) {
    out.push('');
    for (const f of meta.failedBoards) {
      out.push(`> ⚠ ${f.company} failed and contributed 0 results: ${f.error}`);
    }
  }
  if (meta.failedCompanies.length) {
    out.push(`_${meta.failedCompanies.length} source${meta.failedCompanies.length === 1 ? '' : 's'} unreachable this run._`);
  }

  return out.join('\n');
}

/** Pipes break markdown table cells. */
function cell(value: string): string {
  return value.replace(/\|/g, '/').trim();
}
