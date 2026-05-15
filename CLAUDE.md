# career-jobs-mcp — Project Rules

## Purpose
This MCP searches company career sites and returns job listings. Every job search request must respect the rules below without needing to be reminded each time.

---

## Job Search Rules

### 1. Posting Age — default window is 3 days
- Return jobs posted **within the last 3 days** (`postedSince: 'week'` is the closest filter; post-filter by ≤3 days when accurate dates are available).
- If the user asks for "24 hours" specifically, use `postedSince: 'today'` and note that results may be sparse since most ATS systems batch-refresh postings, not daily.
- Never return jobs older than 3 days unless the user explicitly asks for a wider window.

### 2. Experience Level — junior to senior (≤5 years)
- **Include** titles that indicate junior, entry-level, associate, mid-level, or senior roles (Senior is the ceiling — roughly 5 years of experience).
- **Exclude** titles that signal more than 5 years of experience:
  - Principal, Staff, Lead, Architect, Director, VP, Head of, Manager, Executive, Distinguished, Fellow
- Pattern to exclude (regex): `/\bprincipal\b|\bstaff\b|\blead\b|\barchitect\b|\bdirector\b|\bvp\b|\bhead of\b|\bmanager\b|\bexecutive\b|\bdistinguished\b|\bfellow\b/i`
- The `Senior` title is **included** (typically 3–5 years).

### 3. Location — US only by default
- Only return US-based or Remote (no explicit non-US country) jobs unless the user specifies a different country.
- Exclude postings that mention: Canada, UK, India, Germany, France, Australia, Singapore, Ireland, Poland, Netherlands, etc.

### 4. No Security Clearance
- Exclude any job requiring security clearance, government clearance, Top Secret / TS-SCI, public trust, or US citizenship as a job requirement.

### 5. Output Format
- Always return results as a markdown table with columns: `#`, `Title`, `Company`, `Location`, `Posted`, `Apply URL`.
- The Apply URL must be a direct link to the job application page, not the company homepage.
- Group results by platform (Workday, Greenhouse, Lever, Ashby) when there are many results.
- If zero results are found, say so clearly and suggest broadening the date window.

---

## Technical Notes

### Workday Date Parsing
Workday returns relative strings like `"Posted Yesterday"` or `"Posted 4 Days Ago"` — not ISO dates.
The scraper at `src/scrapers/platforms/workday.ts` converts these via `parseWorkdayDate()` to real ISO-8601 timestamps. Always use the compiled `dist/` version after any source change (`npm run build`).

### Cache
- Cache TTL is 24 hours (SQLite at `data/cache.db`).
- Use `forceRefresh: true` or delete `data/cache.db` to get fresh results.
- After deleting the cache, all companies are re-scraped on the next request.

### Probe / Health-check
Run `node probe-registry.mjs` to verify all company career sites are reachable and automatically remove broken entries from the registry. Do this before large batch searches.

### Scripts
| Script | Purpose |
|--------|---------|
| `node find-java-24h.mjs` | Java roles, today filter, ≤5yr experience |
| `node find-java-24h.mjs --week` | Same but 7-day window |
| `node run-search.mjs` | Broader Java + Full Stack search, month window |
| `node probe-registry.mjs` | Health-check all 600+ companies, removes broken ones |
| `node probe-registry.mjs --dry-run` | Report only, no changes |

### Platforms with working JSON APIs (probeable)
- `greenhouse`, `lever`, `ashby`, `smartrecruiters`, `workday`

### Platforms skipped by probe (no standard JSON API)
- `oracle-orc`, `icims`, `icims-jra`, `custom` — these need browser-based scraping.

### Known Workday 422s (CSRF-protected, kept in registry)
Companies like Google, Microsoft, Amazon, JPMorgan, Goldman Sachs return HTTP 422 from the probe because their Workday endpoints require a browser session. The scraper handles these correctly at runtime.
