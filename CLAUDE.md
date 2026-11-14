# career-jobs-mcp — Project Rules

## Purpose
This MCP searches company career sites and returns job listings. Every job search request must respect the rules below without needing to be reminded each time.

## Keep the docs in step with the commands

Whenever you add or change a command, script, CLI flag or MCP tool, update the docs in the
same change, without waiting to be asked:
- **README.md:** add it to the matching *Usage* section with a runnable example, add any new
  flag to that section's flag table, and list any new file in *Project Structure*.
- **CLAUDE.md:** add it to the *Scripts* table (or the section it belongs to) with the
  non-obvious behaviour a future session needs.
- If a command is removed or renamed, delete or fix every mention in both files, so no
  example points at something that no longer exists.

---

## Résumé-Driven Search (preferred entry point)

**When the user supplies a résumé — a file path or pasted text — use the résumé pipeline, not
the fixed profile below.** It derives everything rules #2 and #6 hard-code (skills and their
weights, target role families, seniority ceiling, board search keywords, country) from the
document itself, so it works for any candidate without a code change.

| Surface | Use |
|---|---|
| `searchJobsForResume` (MCP tool) | Résumé in → ranked markdown table of direct apply links. `resumeText` or `resumePath`; `postedWithinDays` (default 3), `limit`, `companies`, `remoteOnly`, `format: 'markdown'\|'json'`. |
| `parseResume` (MCP tool) | Show the derived profile without scraping. Run this first on an unfamiliar résumé. |
| `node find-jobs-for-resume.mjs --resume <path>` | Same search from the CLI. `--today`/`--week`/`--days n`, `--limit`, `--years`, `--country`, `--remote-only`, `--profile-only`, `--json`. |
| `node export-jobs-xlsx.mjs --resume <path>` | Same search, written to the tracked spreadsheet. Add `--page <path>` to also write the Job Quest web page in the same run (see *Publishing the Job Quest Board*). |

Formats: `.pdf`, `.docx`, `.txt`, `.md`, `.html`. Scanned PDFs have no text layer and are
rejected with a message asking for pasted text.

**Overrides** when a résumé parses wrong: `yearsOfExperience`, `country`, `matchThreshold`,
`extraSearchTerms`. Rules #1, #3, #4 and #5 (window, US-only, no clearance, output format)
apply identically on this path.

### How the profile is derived (`src/resume/`)

| File | Responsibility |
|---|---|
| `extract-text.ts` | File → plain text. `pdf-parse` / `mammoth` are loaded on demand so a missing optional dep degrades to a message, not a startup crash. **Import `pdf-parse/lib/pdf-parse.js`, not the package root** — the root runs a debug branch under ESM that reads an unpublished sample file. |
| `skill-taxonomy.ts` | Skill list with tiers (core 10 / high 7 / mid 5 / low 3), role families, title→family rules, seniority ladder. No candidate specifics. |
| `build-profile.ts` | Text → `CandidateProfile`. |
| `match-jobs.ts` | `judgeTitle()` — family, seniority, clearance, score — plus the dedupe/window pass. |
| `search.ts` / `render.ts` | Orchestration and markdown output. |

Two decisions worth not re-litigating:

1. **Role families come from titles the candidate has HELD, not from listed tooling.** A Java
   developer whose skills section lists Docker, Kubernetes, Terraform and Jenkins has real
   DevOps tooling but has never held a DevOps role; scoring by skills alone surfaced SRE
   postings they would not be shortlisted for. Skills are the fallback only when no title is
   found. `extractTitles()` therefore rejects prose — a bullet reading "Collaborated with the
   DevOps team on CI/CD" matches the DevOps family pattern and must not count as a held title.
2. **Years are inferred from the experience section only.** A degree started in 2014 sits in
   the same document and added four phantom years when the whole file was scanned.

Sanity check: the sample Java/Full-Stack résumé must reproduce this exact profile —
families `fullstack, generic-swe, backend, frontend` (no `devops`), band `Entry → Senior`,
`Senior Java Full Stack Developer` scoring 17. `test/resume-profile.test.mjs` asserts this.

### JD match — scoring the job description against the résumé (`src/resume/jd-match.ts`)
Title matching (above) decides **which** jobs qualify; `matchDescription()` then scores each
kept job's **description** against the résumé's skills. Both sides go through the same
`extractSkills()` taxonomy. `JD Match % = weight of JD skills the résumé has ÷ weight of all
JD skills`, so the JD's asks are the denominator and missing its core language costs more than
missing a build tool. Each skill's weight is `tier weight × emphasis`, where emphasis is how
often the JD names it (1×, +0.5× per extra mention, capped at 3×): a JD that repeats Java
eight times and mentions Terraform once cares more about Java. If every JD skill is on the
résumé the score is still 100%, however often each is repeated. No readable description, or no known skill in it → `null` ("N/A"), never 0.
- The description is the one the clearance screen already fetched (`ScreenOutcome.descriptions`) — no second fetch.
- `export-jobs-xlsx.mjs --resume` adds a `JD Match %` column (the matched/missing skill lists
  stay on `ResumeJobMatch` for the MCP tool's JSON, but are not written to the sheet — user preference).
  Order is still **company sites first, job portals after** (rule #5); JD match sorts
  *within* each group (ties: more matched skills, then title score). The `Source` column
  names the portal (LinkedIn, SimplyHired…) for board jobs and the employer for career-site
  jobs; `Company` is always the employer, with no "(via …)" suffix.
  `--min-jd-match <n>` drops scored jobs below n%; N/A jobs are kept at the bottom.
- **LinkedIn descriptions are fetched one at a time, 250ms apart, with 429 backoff**
  (`SERIAL_HOSTS` in `requirement-screen.ts`). At the screen's 16-way concurrency LinkedIn
  refused ~90% (140/155 unread); serialized, 131/135 were read and the clearance screen
  caught 44 jobs instead of 24. A host that exhausts its retries is skipped for 10 min so a
  hard block cannot stall the run.
- **Fetched descriptions persist** in the `job_descriptions` table of `data/cache.db`, keyed
  by apply URL, 14-day TTL — not window-scaled like scrape rows, because a posting's text
  does not age. Timings for a `--today` résumé export: cold ~2 min (was ~4 min at a 1s gap),
  re-run ~7s. Only fetched descriptions are stored; scraped ones are already free.

### Board keywords are per-résumé
`SearchFilters.searchTerms` carries the résumé's terms to the four keyword-driven boards
(LinkedIn, SimplyHired, BuiltIn, Remotive, Workable Jobs, Himalayas, Jobicy) via `BaseScraper.resolveSearchTerms()`; each board's
`DEFAULT_TERMS` is now only a fallback. **Their cache rows are keyed by those terms** — one
résumé's results must not be served to another. Company scrapers are deliberately *not* keyed
by terms: they fetch their whole board regardless, so keying them would fragment the cache.

---

## Job Search Rules

### 1. Posting Age — default window is 3 days
- Return jobs posted **within the last 3 days** (`postedSince: 'week'` is the closest filter; post-filter by ≤3 days).
- If the user asks for "24 hours" specifically, use `postedSince: 'today'`. Results will be sparse — most ATS systems batch-refresh postings rather than publishing daily, and postings whose age cannot be verified are excluded (see Posting-Date Handling).
- Never return jobs older than 3 days unless the user explicitly asks for a wider window.
- A posting with no usable date is **excluded**, not assumed fresh. The window is a guarantee, not a best effort.

### 2. Experience Level — junior to senior (≤5 years)
- **Include** titles that indicate junior, entry-level, associate, mid-level, or senior roles (Senior is the ceiling — roughly 5 years of experience).
- **Exclude** titles that signal more than 5 years of experience:
  - Principal, Staff, Lead, Architect, Director, VP, Head of, Manager, Executive, Distinguished, Fellow
- Pattern to exclude (regex): `/\bprincipal\b|\bstaff\b|\blead\b|\barchitect\b|\bdirector\b|\bvp\b|\bhead of\b|\bmanager\b|\bexecutive\b|\bdistinguished\b|\bfellow\b/i`
- The `Senior` title is **included** (typically 3–5 years).

### 3. Location — US only by default
- Only return US-based or Remote (no explicit non-US country) jobs unless the user specifies a different country.
- Exclude postings that mention: Canada, UK, India, Germany, France, Australia, Singapore, Ireland, Poland, Netherlands, etc.
- `isUSJob()` must accept every US format the boards emit, not just `City, ST`: bare cities
  (`San Francisco`, `NYC` — Ashby's default), full state names (`Dallas, Texas`), Workday
  prefixes (`TX-Dallas`), and a bare `US`. Before 2026-10-16 it accepted only `USA`/`United
  States`/`, ST`/Remote and silently dropped ~18k of 155k cached jobs as non-US, zeroing out
  whole Ashby companies. `test/job-filters.test.mjs` pins the real strings.

### 4. No Security Clearance
- Exclude any job requiring security clearance, government clearance, Top Secret / TS-SCI, public trust, or US citizenship as a job requirement.
- **Enforced on the description, not just the title** (`src/utils/requirement-screen.ts`). Titles
  almost never state it; "Must be a U.S. citizen" / "Active Secret clearance required" live in
  the body. The résumé search screens every surviving match in rank order (stopping once
  `limit` clean jobs are found), using the scraped description or, where a source has none,
  fetching it (Workday / SmartRecruiters / LinkedIn detail endpoints, else the page's JSON-LD).
- Screened **sentence by sentence**, skipping EEO / E-Verify boilerplate ("without regard to …
  citizenship status"), negations ("no clearance required", "Clearance Required to Start:
  None") and hedging about *some* roles. ITAR / export-control "U.S. person" requirements
  count as citizenship. `test/requirement-screen.test.mjs` pins real phrasings from Lockheed,
  CACI, Northrop, SpaceX, Kodiak — add to it rather than loosening a pattern.
- A job whose description can't be read is **kept and counted** (`requirementUnverified`) —
  dropping it would discard a whole board on one 429. Every drop is listed with its triggering
  sentence in `meta.requirementExcluded`, so false positives are auditable.

### 5. Output Format
- Always return results as a markdown table with columns: `#`, `Title`, `Company`, `Location`, `Posted`, `Apply URL`.
- The Apply URL must be a direct link to the job application page, not the company homepage.
- Group results by platform (Workday, Greenhouse, Lever, Ashby) when there are many results.
- If zero results are found, say so clearly and suggest broadening the date window.
- **Company career sites first, job boards after** (`src/utils/source-priority.ts`). Every
  output — the résumé tool/CLI, `export-jobs-xlsx.mjs` (its `Source` column), and
  `find-java-24h.mjs` — sorts direct employer postings above LinkedIn/BuiltIn/SimplyHired
  and friends, then by score within each group. Sorting by score alone buried them: board
  titles are keyword-stuffed ("Java Full Stack (Spring Boot, Kafka, AWS)") and out-score
  the plain "Software Engineer II" a company site publishes. A board copy of an opening
  already found on the employer's own site is dropped (`crossSourceKey`: employer + title,
  normalised so LinkedIn's "JPMorganChase" meets the registry's "JPMorgan Chase").
- **Why `--today` is mostly board results:** a 24h window catches few company postings —
  almost none on weekends, and Workday dates are day-granular so "Posted Yesterday" is
  outside it. Measured on a Sunday: 24h → 7 company / 121 board; 3 days → 152 / 179;
  7 days → 462 / 213. The company sites are being searched; widen the window to see them.

### 6. Resume-Match Filter — ≥60% profile alignment

> This section is the **fallback profile**, used by `find-java-24h.mjs`, `run-search.mjs`, and
> `export-jobs-xlsx.mjs` when no résumé is given. When the user supplies a résumé, the
> equivalent values are derived from it instead — see *Résumé-Driven Search* above.

Every search result must be relevant to **Sruthi Veerepalli's** profile. Only return roles where the job title aligns with her target roles AND the implied skills match at least 60% of her resume profile.

**Candidate profile:** Java / Full Stack Developer, 5 years of experience.
- Core: Java 8/11/17, Spring Boot, Spring MVC, Spring Security, Spring Cloud, Spring Batch, Hibernate, JPA
- Frontend: Angular, React.js, Node.js, TypeScript, JavaScript, HTML5, CSS3
- Cloud: AWS (EC2, Lambda, S3, RDS, EKS, SQS, API Gateway, DynamoDB), Azure (AKS)
- DevOps: Docker, Kubernetes, GitHub Actions, Jenkins, Terraform, Maven
- Messaging: Apache Kafka, ActiveMQ, RabbitMQ, AWS SQS
- Databases: PostgreSQL, MySQL, MongoDB, DynamoDB, Oracle, IBM DB2
- Observability: Splunk, Honeycomb, Prometheus
- Testing: JUnit, Mockito, Playwright (Java), Selenium
- Patterns: Microservices, REST, SOAP, GraphQL, MVC, CI/CD, Agile/TDD

**Target role titles** (search ALL of these, not just "Java Developer"):
- Java Developer, Java Full Stack Developer, Full Stack Java Developer
- Full Stack Developer, Full Stack Engineer
- Software Engineer, Software Developer
- Backend Developer, Backend Engineer
- Application Developer, Java Software Engineer

**Resume skill scoring weights** (used to compute match % from job title keywords):
```
CORE   (10 pts): java, spring boot
HIGH   ( 7 pts): spring, microservices, full stack, full-stack, fullstack
MID    ( 5 pts): angular, react, aws, kafka, hibernate, jpa, rest, restful, cloud
LOW    ( 3 pts): docker, kubernetes, ci/cd, jenkins, github actions, splunk, postgresql, mongodb, node.js, typescript, j2ee
```

**60% match threshold = minimum score of 5 points** from the above weights applied to the job title text.
- A title like "Senior Java Full Stack Developer" scores 10 (java) + 7 (full stack) = 17 → well above threshold.
- A title like "Software Engineer" scores 0 from keyword weights → still included if it is a recognized target role title.
- Exclude roles with no Java/Spring/Full Stack/Backend signal AND zero score (e.g., pure Data Scientist, ML Engineer, DevOps Engineer, QA Engineer).

**Search terms to use in `find-java-24h.mjs`:** Run searches for `Java`, `Full Stack`, and `Software Engineer` across all companies to maximize coverage of her profile.

---

## Technical Notes

### Posting-Date Handling (the date window depends on this)

All window logic lives in `src/utils/posted-date.ts`. Two invariants:

1. **Strict.** A job whose posting date is missing or unparseable is **excluded** when a
   window is requested — its age cannot be verified, and rule #1 says never return jobs
   older than the window. The orchestrator is the single strict gate; it reports the drop
   count as `ScrapeResult.undatedExcluded`, which the batch scripts print. Scrapers
   themselves stay lenient (`withinPostedWindowOrUndated`) because their output is what
   gets cached — a `today` scrape must not permanently strip undated jobs from the cache.
2. **Absolute.** Day-granular relative strings are anchored to the **start of that
   calendar day**, never to `Date.now()` at scrape time. A scrape-relative stamp
   rejuvenates on every cache read, letting a job whose true age approaches 48h pass a
   24h window.

Per-source date fields — verify these when adding a platform, since "last updated" is
**not** "posted":

| Source | Field | Note |
|---|---|---|
| Greenhouse | `first_published` | **Not `updated_at`** — that bumps on any edit; using it reported months-old jobs as posted today. Already present in the `?content=true` payload. |
| Lever | `createdAt` | true posting date |
| Ashby | `publishedAt` | true posting date |
| SmartRecruiters | `releasedDate` | true posting date |
| Workday | `postedOn` | relative, day granularity; `parseWorkdayDate()` → start of that day. `"Posted Yesterday"` is 24–48h old, so it is outside a 24h window but inside 3-day/7-day. Some tenants omit the field entirely — see *A board that verifies is not necessarily usable* below. A tenant can also emit a posting with **no title** (Trinity Health does); `jobs.title` is NOT NULL, so one of those failed the whole scrape at cache-write time. `WorkdayScraper` drops titleless postings. |
| BuiltIn | `parseBuiltInAgo()` | hour/minute stay relative; day/week anchor to start of day. **Reposts** — see below. |
| LinkedIn | `time[datetime]` | date only, plus authoritative server-side `f_TPR` filter (verified tight) |
| SimplyHired | `dateOnIndeed` | epoch ms; server-side `t=1` verified tight |
| Eightfold | `t_create` | epoch **seconds** — multiply by 1000. **Not `t_update`**, which bumps on any edit, the same trap as Greenhouse's `updated_at` |
| Rippling | `createdOn` | **list response has no date at all** — only the per-job detail endpoint carries it, so the scraper must fan out per job or every result gets dropped as undated |
| Aurora | `publishedDate` | `YYYY-MM-DD`; `updatedAt` sits beside it and is deliberately unused |
| Workday (dateless tenants) | `bulletFields` / detail `startDate` | Some tenants put `"Posted N Days Ago"` in `bulletFields` instead of `postedOn` (SiFive); others omit it from the list entirely (Zoom, Blackbaud, AdventHealth, Lattice) and only the per-job detail carries it. `WorkdayScraper.backfillDates()` fetches detail **only for undated jobs**, preferring the absolute `startDate`. |
| iCIMS (classic) | detail JSON-LD `datePosted` | The search list shows no date on many tenants (Liberty Mutual, Northwestern Mutual). Each detail page embeds the schema.org JobPosting sent to Google for Jobs; fetched over plain HTTP for undated jobs only. |
| McKinsey | `postedToLinkedInDate` | From the JSON gateway `gateway.mckinsey.com/.../api/jobs/search` (reachable over plain HTTP; mckinsey.com is not). Answers 422 to an empty `q`, so it runs a fixed term set — not résumé terms, because company cache rows are not keyed by terms. |

**BuiltIn reposts.** BuiltIn cards can read `"Reposted 14 Hours Ago"`. Its own structured
`datePosted` equals the republish time and it exposes **no** original posting date, so the
date cannot be corrected the way Greenhouse's could. The age is accurate for the
republish, but the opening may be older, so these are flagged with `JobListing.isRepost`
and rendered as `"Aug 2 (repost)"` in the batch output rather than silently trusted.
BuiltIn's `daysSinceUpdated` param itself was checked and **is** tight — `=1` returns only
hours-old and "Yesterday" cards.

Always rebuild (`npm run build`) after any source change — the scripts run the compiled `dist/`.

### Headless Chrome must be closed
Browser-driven scrapers (iCIMS, custom, Tesla) share ONE Chrome via `src/utils/browser.ts`.
Every script ends with `.finally(() => closeSharedBrowser())`, and the MCP server closes it on
SIGINT/SIGTERM. Without that, a run that touched any of those scrapers printed its results
and then **never exited** (the open browser held the event loop), and force-exiting left
orphaned `chrome.exe` processes. Don't add a module-local `puppeteer.launch()`; use
`getBrowser()`, and end any new script the same way.

### Cache
- SQLite at `data/cache.db`. Global ceiling 24h (`CACHE_TTL_HOURS`), but the **effective
  TTL scales with the search window**: a row may not be served once it has consumed more
  than 5% of the window it was scraped for — `today` ≈ **1.2h**, `week` ≈ **8.4h**,
  `month` 24h.
  - Why: a flat 24h TTL is incompatible with a 24h freshness window. A `linkedin|today`
    row written 22h earlier held 127 jobs that all passed the 24h cut *when cached* and
    **none** that passed it 22h later — yet the row was still "valid", so it was served
    instead of re-scraped and `--today` collapsed to 3 results across all sources. A cache
    entry must not outlive the freshness of its own contents.
  - This also bounds the staleness `windowVerified` jobs can carry, since they skip the
    client-side age check entirely.
  - Consequence: `--today` re-scrapes roughly hourly. That is the correct trade — a 24h
    window cannot be served from a many-hour-old cache.
- Cache rows are keyed by **slug + posted-window**. Scrapers narrow results server-side by
  `postedSince`, so what is cached is window-specific; sharing one row across windows made
  a `--week` run right after `--today` return almost nothing.
- Use `forceRefresh: true` or delete `data/cache.db` to get fresh results.
- After deleting the cache, all companies are re-scraped on the next request.

### Probe / Health-check
Run `node probe-registry.mjs` to verify all company career sites are reachable and automatically remove broken entries from the registry. Do this before large batch searches.

**The probe retries transient failures before condemning an entry.** A 5xx/429/timeout is
retried once, and anything still transient is reported as *uncertain* (kept) rather than
broken (deleted). Without this, one blip deleted healthy companies: Zebra, Nordstrom and MRI
Software were each reported broken while serving hundreds of jobs on the very next request.
Only a definitive 404 removes an entry.

#### When a company legitimately breaks
Three fixes, in order of preference — a 404 usually means the company **changed ATS**, not
that it stopped hiring, so look before deleting:

1. **Re-discover the identifier.** Run the discovery scripts above on just that company.
   Boards move: Fireworks AI and Brooklinen went Greenhouse → Ashby, Root Insurance went
   Greenhouse → Rippling, Netflix went Lever → Eightfold.
2. **Add a platform** if the new ATS is one we don't speak yet and exposes dates.
3. **Delete, leaving a comment saying why**, only when the jobs are genuinely unreachable —
   bot-walled (Glassdoor, Gainsight), auth-gated (Atlassian's GraphQL), non-existent tenant
   (Interactive Brokers), or already covered by another entry (dbt Labs merged into
   Fivetran, whose Greenhouse board is in the registry).

Routing an unreachable company to `custom` (Puppeteer) is **not** a fix: `CustomPuppeteerScraper`
sets no `postedDate`, so every job it returns is dropped by the strict window gate.

**A board that verifies is not necessarily usable — check that it carries dates.** Some
Workday tenants answer 200 with a full job list and no `postedOn` field on any posting;
the strict gate then drops every job, so the entry costs a scrape per run and returns
nothing. Corewell Health, Blackstone, Apollo Global Management and agilon health were all
verified, live and dateless, and are recorded as comments in the registry rather than
entries. Add this to the review step: pull one page and confirm the per-source date field
from the table above is actually populated, not just that the endpoint answers.

### Scripts
| Script | Purpose |
|--------|---------|
| `node find-java-24h.mjs` | Full batch search — Java/Full Stack/SE across all registry companies, 3-day window |
| `node find-java-24h.mjs --today` | Same, 24-hour window |
| `node find-java-24h.mjs --week` | Same, 7-day window |
| `node export-jobs-xlsx.mjs` | Same search as `find-java-24h.mjs`, exported to `job-results.xlsx` with a clickable Apply link, a first column of real Excel "Applied?" checkboxes (patched in by `xlsx-checkboxes.mjs`, since ExcelJS cannot write them) and a live "Total jobs applied" count under the last row (accepts `--today`/`--week`/`--out <path>`) |
| `node export-jobs-xlsx.mjs --page <path>` | Writes the spreadsheet **and** the "Job Quest Board" page in one run, then publishes the page automatically (`--no-publish` to skip) (combine with `--resume`, `--today`/`--week`, `--out`). Page = `templates/job-quest.html` filled by `jobs-html.mjs`: mission banner, daily goal ring, streak, milestone badges, top picks by JD match, JD meter per job, Applied checkbox per job, running total. |
| `node export-jobs-xlsx.mjs --html` / `--artifact` | Writes **only** the page: `--html` as a standalone file to open in a browser (ticks saved in that browser), `--artifact` publish-ready like `--page`. `--out` names the page file in these modes. |
| `node auto-apply.mjs --setup` / `--set key=value` | Save the one-time answers (LinkedIn, authorization, sponsorship, pronouns, EEO) to `apply-profile.json` `standard`. |
| `node auto-apply.mjs --resume <path> <greenhouse url>` | Fill one Greenhouse application in a visible Chrome from the résumé; never submits; waits for the window to close. `--show-data` prints the parsed applicant data instead; `--link <jobquest://…>` is what a link click runs (résumé from `apply-profile.json`). See *Auto Apply*. |
| `node install-auto-apply.mjs --resume <path>` | One-time: registers the `jobquest://` link type (HKCU) → `jobquest-link.mjs "%1"` and saves `resumePath` to `apply-profile.json`. `--status`, `--uninstall`. Re-run after moving the repo or Node. |
| `node refresh-job-quest.mjs --days 1\|3\|7\|30` | Rerun the last `--resume --page` export (from `job-quest-outputs.json`) for a new window: rewrites the sheet, the page(s), republishes the board. `--detach` (background, `data/refresh.log`), `--status`. See *Refresh everywhere*. |
| `node jobquest-link.mjs "<jobquest://…>"` | What a link click runs: `apply` → `auto-apply.mjs --link`, `refresh` → `runRefresh()`. |
| `export-jobs-xlsx.mjs --days <n>` / `--month` / `--local-page <path>` | Any 1–30 day window; `--local-page` also writes a standalone page copy beside `--page`. |
| `node get-5-companies.mjs` | Targeted fetch for Deloitte, SAP, Lyft, Visa, Infosys with special scrapers |
| `node deloitte-scrape.mjs` | Puppeteer DOM scraper for Deloitte (Avature ATS, server-rendered) |
| `node probe-registry.mjs` | Health-check all companies, removes broken registry entries |
| `node probe-registry.mjs --dry-run` | Report only, no changes |
| `node repair-uncertain.mjs` | Resolve *uncertain* entries, HTTP pass: follows each careerUrl for a real board, then hunts Workday tenant/site variants |
| `node repair-uncertain-tenants.mjs` | Workday tenant sweep over curated candidates (incl. acquirers), using the 404-vs-422 existence signal |
| `node repair-uncertain-browser2.mjs` | Browser pass: crawls one level into the job-search page and sniffs network calls. Run after `repair-uncertain.mjs` (reads its JSON) |

None of the three ever deletes a registry entry — they only report a verified replacement
identifier. A `--platform X` probe now writes `probe-results-X.json`; only a full sweep
owns `probe-results.json`.

### Publishing the Job Quest Board

The user's daily command (spreadsheet + page in one run):

```
node export-jobs-xlsx.mjs --resume "C:\Users\sruth\Documents\FullTime\Sruthi Veerepall.docx" --today --out "C:\Users\sruth\Desktop\jobs.xlsx" --page "C:\Users\sruth\Desktop\job-quest.html"
```

**Publishing is automatic.** After a `--page` run, `publish-job-page.mjs` starts unattended
Claude Code (`claude -p "...", --allowedTools Artifact,Read`) to publish the page to the
existing URL `https://claude.ai/artifact/KZy9NZwzNZSgLWaHUaq4TE` (override:
`--publish-url` / `$JOB_QUEST_URL`). `--no-publish` skips it, and a failed publish only prints a
retry command (`node publish-job-page.mjs <page>`), never failing the export.
- The binary matters: the npm-global `claude` 2.1.132 has **no Artifact tool** in `-p` mode,
  while the VS Code extension's bundled 2.1.322 does. `findClaudeBinary()` prefers
  `$CLAUDE_BIN`, then the newest `~/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude.exe`,
  then PATH. Verified 2026-11-12: a full `--today --page` run published in ~27s.
- The entrypoint matters too: Claude Code only offers the Artifact tool when
  `CLAUDE_CODE_ENTRYPOINT=claude-vscode`. Run from a plain terminal the variable is unset, and
  the headless session replied "no Artifact tool is available" (`cli` doesn't enable it
  either). It worked when tested from inside a VS Code Claude session only because the child
  inherited that variable. `publishJobPage()` now always sets it on the child. If
  publishing breaks after a Claude Code update, re-test with
  `claude -p "Is a tool named Artifact available? YES or NO"` under a clean environment.

If the user asks you to publish manually instead, publish the `--page` file with the Artifact
tool **to that same URL** (pass it as `url`, reading it first if this session has not), never
as a new artifact, so the user keeps one link. Omit `capabilities` so the stored
declaration (`db`, `user`, and the `mcp` entry below) carries forward.

- Applied ticks, the streak and the daily goal live in the viewer's private
  `data/users/<id>/` db collection (`kind: "applied"` docs keyed by a hash of the apply URL,
  plus one `kind: "settings"` doc for the goal), **not** in the page. Republishing never resets
  them, and an opening that reappears on the next day's page stays ticked. Changing the key
  hash in the template would orphan every saved tick.
- The `--page` file has no document skeleton on purpose; the Artifact tool adds one at publish.
- **Run a new search buttons** (Today / 3 days / Week / Month) call
  `host:career-jobs` → `searchJobsForResume` with `{resumePath: meta.resumePath,
  postedWithinDays: 1|3|7|30, format: 'json'}` through the artifact `mcp` capability, then
  re-render the page from `matches` in place (not saved; reload restores the published list).
  `export-jobs-xlsx.mjs` embeds `meta.resumePath` for this. The stored declaration is therefore
  `{db: {}, user: {}, mcp: {servers: [{server: 'host:career-jobs', tools: ['searchJobsForResume', 'autoApplyJob', 'refreshJobQuest']}]}}`
  — omitting `capabilities` on republish keeps it. (`autoApplyJob` was added 2026-11-14 for the
  Auto apply buttons; a declaration without it makes those calls fail with `not_in_manifest`.) Host servers only answer in the Claude
  **desktop app**, for the artifact's owner, with `career-jobs` in that app's
  `claude_desktop_config.json` (not Claude Code's config — on the MSIX install it lives at
  `%LOCALAPPDATA%\Claude-Data\claude_pzs8sxrjxfjjc\`, and Settings has no Developer tab). The
  entry **must set `env.CACHE_DB_PATH`** to the project's `data/cache.db`: the app launches the
  server with cwd `C:\Windows\System32`, the default `./data/cache.db` resolves there, and the
  server died on startup with `EPERM mkdir C:\WINDOWS\System32\data`. Everywhere else `use("mcp")`/the call
  fails and the buttons stay disabled. A cold search can exceed the ~130s reply budget
  (`upstream_error`); the server keeps running and caches, so a retry is fast.

### Refresh everywhere (one click updates the sheet, the pages and the board)

- Every `export-jobs-xlsx.mjs --resume … --page …` run saves its outputs (`resumePath`, `xlsx`,
  `page`, `localPage`, `publishUrl`, `minJdMatch`, `publish`) to `job-quest-outputs.json`
  (git-ignored; `$JOB_QUEST_OUTPUTS_PATH` overrides, which tests and scratch runs should set so
  they don't overwrite the user's real outputs). `refresh-job-quest.mjs` rebuilds the export
  command from it via `exportArgs()`, changing only `--days`.
- Triggers: board buttons in the desktop app (`searchJobsForResume` for an instant in-page list,
  then the `refreshJobQuest` MCP tool, which spawns the runner detached and returns at once);
  board buttons anywhere else, and the ↻ row under the jobs in the sheet → `jobquest://refresh?days=N`;
  the terminal. Refresh links accept only 1/3/7/30 and ignore every other parameter: a website
  can fire one, so it must never be able to name a path.
- One run at a time: `data/refresh.lock` (pid, written by the parent at spawn so a fast second
  click can't race) and `data/refresh.pending` (latest queued window wins, run straight after).
- The sheet keeps **Applied?** ticks across rewrites (`readAppliedUrls()`, keyed by Apply URL).
  An open workbook is locked (EBUSY), so `excel-session.mjs` asks Excel over COM to save it
  (persisting new ticks), close it, then reopens it after the write. If Excel won't let go, the
  sheet is skipped with a message and the pages and board still update.
- The artifact's capability declaration must list `refreshJobQuest` (added 2026-11-14), or the
  in-app refresh fails `not_in_manifest` and the page shows the terminal command instead.

### Auto Apply (Greenhouse only)

`autoApplyJob` (MCP tool), `node auto-apply.mjs`, and the Job Quest Board's **Auto apply**
button open a Greenhouse application in a **visible** Chrome and fill it from the résumé.
**It never submits** — the user reviews and presses Submit. Keep it that way.

- **Why Greenhouse:** largest apply host in the cache (~20k jobs) and one React form layout
  for every board. Always open `job-boards.greenhouse.io/embed/job_app?for=<board>&token=<id>`
  (`greenhouseFormUrl()`), not the job page: many boards (Coinbase, Airbnb) redirect the job
  page to the company's own site, where the form is in an iframe or behind Cloudflare.
- **Field ids are stable across boards:** `first_name`, `last_name`, `email`, `country`,
  `phone`, `candidate-location`, `resume` (file), `company-name-N`/`title-N`/`start-date-month-N`/
  `start-date-year-N`/`end-date-…-N`/`current-role-N` (employment), `school--N`/`degree--N`/
  `discipline--N` (education, double dash), `question_NNN` (board questions). Extra entries
  appear after clicking the section's "Add another".
- **Dropdowns are react-select:** fill by typing then clicking the option, never by setting
  `.value` (React ignores it). School and city lists load asynchronously after typing.
- Greenhouse keeps a current role's end-date fields **visible and required** even with
  "Current role" ticked. They are left blank (not invented) and reported in `needsYou`.
- Résumé → applicant data is `src/resume/applicant.ts` (`buildApplicant`), pure and tested in
  `test/auto-apply.test.mjs`. It handles `Company / Title  Mon YYYY - Present` (the user's
  résumé) and `Title | Company | dates`, picking the title side by its wording.
- Answers the résumé can't give come from `apply-profile.json` at the project root
  (git-ignored; `apply-profile.example.json` shows the shape). The user's résumé has **no
  LinkedIn URL** (its only links are GitHub and LeetCode), so LinkedIn must come from here too.
  - `standard` (`src/apply/standard-answers.ts`): workAuthorized, sponsorship (no/now/future),
    pronouns, gender, hispanic, race (+ raceDetail), veteran, disability, lgbtq, each EEO one
    accepting `decline`. Written by `node auto-apply.mjs --setup` / `--set key=value`.
    Fields are found by **label** over every visible input, not by id: the EEO section is
    `gender`/`hispanic_ethnicity`/`veteran_status`, demographic surveys use bare numeric ids
    (Discord `4033064002`, Robinhood `1258`), and Airbnb asks Gender as a `question_N`.
    `chooseOption()` matches by meaning and returns null on no match **or a tie**, leaving the
    field blank. Option lists in `test/standard-answers.test.mjs` are copied from live forms.
  - `answers[]` match when the question label *contains* `question`, and win over `standard`.
  - Résumé facts need no setup (`classifyDerived`): "Full Legal Name" (not the native-language
    one), "Your Location" → `City, ST`, "located/based in the US" → Yes and "which country do
    you reside" → United States, only when the résumé's state is a US state. Citizenship,
    relocation, office preference and H-1B history are deliberately NOT derived.
  - Questions are collected in up to 3 passes: some appear only after an earlier answer
    (Netlify's work-authorization question shows once Country is set).
  - A required "select all that apply" checkbox group (`name="question_N[]"`) is ONE
    `needsYou` entry (its legend), not one per option; Netlify's produced ~30 lines.
  - Retest set (2026-11-14, real profile, headless, 0 failures): Netlify, xAI, Twitch, Discord,
    Robinhood. Many boards have no employment/education section at all; that is not a bug.
  - Never fill demographic, consent or authorization questions from anything but the user's
    own saved answers; never tick consent checkboxes. Unanswered required fields are returned
    as `needsYou`, plus `setupHint` when a missing one-time answer is the cause.
- The visible Chrome is `getVisibleBrowser()` in `src/utils/browser.ts`, with a persistent
  profile in `data/apply-chrome-profile/`, closed by `closeSharedBrowser()`. Paths resolve from
  the module, not the cwd (the desktop app runs the server in `C:\Windows\System32`).
  `APPLY_HEADLESS=true` is for tests only.
- **Two routes, one filler.** In the Claude desktop app the page button calls the MCP tool
  (deliberately **not** `readOnlyHint`, so the app asks before opening Chrome). Everywhere else
  (Excel's *Auto Apply* column, a local `--html` page, the board in a browser) it is a
  `jobquest://apply?url=<enc>` link (`src/apply/protocol.ts`). `install-auto-apply.mjs`
  registers that scheme under `HKCU\Software\Classes\jobquest` →
  `"<node.exe>" "<repo>\jobquest-link.mjs" "%1"` (dispatches apply links to `auto-apply.mjs --link`). The page also falls back to the link when
  the MCP call fails with `server_not_connected`/`not_in_manifest`/`not_granted`.
- **A link carries only the job URL**, validated as Greenhouse on both ends. The résumé comes
  from `apply-profile.json` `resumePath`. Never add a path or other parameter to the link: any
  website can fire a `jobquest://` link (the browser's "open Node.js?" prompt is the only guard).
- A second link click while Chrome is open can't share the persistent profile (one Chrome per
  profile), so `getVisibleBrowser()` falls back to a throwaway temp profile.
- On a link-mode error `auto-apply.mjs` waits for Enter so the console window doesn't vanish
  with the message.

### Adding companies to the registry

Never hand-write a `platformIdentifier` — guessed board tokens are frequently *some other
company's* board. The four scripts below take a list of `Company Name|https://careers-url`
lines and end at a verified entry. Run them in order on the same input file:

| Script | Purpose |
|--------|---------|
| `node discover-companies.mjs <input.txt>` | HTTP pass: follows the careers URL and scrapes the page for a Greenhouse/Lever/Ashby/SmartRecruiters/Workday id, then verifies it against the ATS API |
| `node discover-companies-browser.mjs <input.txt>` | Second pass over whatever the first could not resolve. Loads each site in headless Chrome and watches network calls, which is the only way to see the ATS on a JS-rendered careers page. Records the ATS name (iCIMS, Taleo, SuccessFactors, Phenom, Avature, Eightfold…) when it finds an unsupported one, so a failure explains itself |
| `node validate-discovered.mjs <input.txt>` | Prints each board's real name, job count and three sample postings — **the mandatory review step** |
| `node merge-registry.mjs <input.txt>` | Splices the verified entries into `company-registry.ts`, above the job-board sources block, skipping slugs already present |

**Why `validate-discovered.mjs` is not optional.** When page-scraping finds nothing,
`discover-companies.mjs` falls back to trying slug variants of the company name, including
its first word. That reaches a live board often enough to look like success while belonging
to a completely different employer — `us` is the board of "itel" and not US Foods, `eli` is
not Eli Lilly, `union` is not Union Pacific, `flock` is a UK motor-fleet insurer and not
Flock Safety. Only the sample postings distinguish these, so read them before merging. A
board that verifies with **0 jobs** is likewise not usable.

Two more checks worth repeating: a Workday endpoint can answer HTTP 200 with an HTML body
rather than the jobs JSON (Otis does), and an acquired company's careers URL now resolves to
the acquirer's tenant (discover.com/careers → the Capital One tenant), which would duplicate
an existing entry.

**Expected yield by company size.** A sweep of 328 large non-tech employers (retail, food,
airlines, utilities, industrials, automotive, pharma, health systems, insurance, banks,
media, construction, agriculture) resolved only ~27%: the rest sit on SuccessFactors,
Oracle Recruiting, Phenom, iCIMS, Taleo, Radancy, BrassRing or Avature, none of which we
speak. The same-sized sweep of mid-market and growth companies *within those industries*
resolved ~56%, because they buy Greenhouse/Lever/Ashby. Target the second group when adding
industry coverage; a Fortune-100 list mostly burns the browser pass for nothing. Eightfold
is worth a second look but is usually gated — Starbucks, Chevron and Eaton all run it and
all return `{"message": "Not authorized for PCSX"}` without a tenant key, unlike Netflix's
open board.

### Special Company Scrapers (not in registry — require custom methods)

These companies use ATS platforms that cannot be queried via the standard registry pipeline. Use the scripts above or the methods described here when the user asks for jobs from these companies.

#### SAP
- **ATS:** Custom SuccessFactors portal at `jobs.sap.com`
- **Working endpoint:** `POST https://jobs.sap.com/services/jobs/search/`
- **Request body:**
  ```json
  {
    "keywords": "Java Software Engineer",
    "locationsearch": "",
    "sortby": "referencedate",
    "sortdir": "desc",
    "recordsperpage": 100,
    "startrow": 0,
    "facetquery": { "facet": true, "limit": 100, "fields": ["country"] },
    "filterquery": { "country": ["US"] }
  }
  ```
- **Date field:** `referencedate` format `"2026-05-18T02:00:00Z[UTC]"` — strip `[UTC]` suffix before passing to `new Date()`.
- **Use:** `node get-5-companies.mjs` or `node fetch-sap-infosys.mjs`

#### Deloitte
- **ATS:** Avature at `apply.deloitte.com` — server-rendered HTML, no public JSON API
- **Working method:** Puppeteer DOM scraping with keyword in URL path:
  `https://apply.deloitte.com/en_US/careers/SearchJobs/{keyword}?sort=relevancy`
  Use terms: `java`, `full-stack`, `software-engineer`, `backend-developer`
- **Job listing selector:** `.article--result` (title: `h2 a` or `a[href*="JobDetail"]`)
- **Job detail URL format:** `https://apply.deloitte.com/en_US/careers/JobDetail/{slug}/{id}`
- **Limitation:** Location and posting date not shown at list view. Verify clearance requirement on "Cyber" roles individually.
- **Use:** `node deloitte-scrape.mjs` or `node get-5-companies.mjs`

#### Lyft
- **ATS:** Greenhouse public board — works via standard registry
- **Already in registry** as `platform: 'greenhouse', platformIdentifier: 'lyft'`
- **Note:** Job titles don't include tech stack; verify Java/backend stack on individual postings.

#### Visa
- **ATS:** SmartRecruiters public board — works via standard registry
- **Already in registry** as `platform: 'smartrecruiters', platformIdentifier: 'Visa'`
- **Apply URL format:** `https://jobs.smartrecruiters.com/Visa/{jobId}`

#### Infosys
- **Portal:** `career.infosys.com` — **India/China/Manila ONLY**, zero US jobs
- **US hiring:** Uses a separate internal ATS with no public API; cannot be scraped.
- **Workaround:** Direct the user to search LinkedIn for "Infosys software engineer" filtered to United States.
- **Do NOT add to registry** — portal only returns India-based roles.

### Job-Board Sources (cross-company — IN the registry)

Nine job boards are registered alongside the company scrapers and included automatically in
`find-java-24h.mjs` / `export-jobs-xlsx.mjs` runs. Each returns the **real hiring employer**
in `companyName` (batch scripts display `"{Employer} (via {Board})"`) and a **direct apply
link** in `applyUrl`. All are cached 24h and skipped by `probe-registry.mjs` (no probeable
JSON API). When no `jobTitle` filter is given, keyword-driven boards search the profile
terms (`Java`, `Full Stack Developer`, `Software Engineer`) and dedupe by posting id.
The 3-day cutoff is always applied client-side like all other sources.

| Board | Slug | Method | Date filter | Notes |
|-------|------|--------|-------------|-------|
| LinkedIn | `linkedin` | Guest HTML endpoint `/jobs-guest/jobs/api/seeMoreJobPostings/search` (cheerio) | `f_TPR=r86400/r604800/r2592000` | Direct `linkedin.com/jobs/view/{id}/` links; page size varies 10–25; can 429 under heavy use |
| SimplyHired | `simplyhired` | `__NEXT_DATA__` JSON embedded in `/search?q=…&l=United States&t={days}` | `t=1/7/30` days | Indeed-owned; `dateOnIndeed` epoch-ms → ISO; 20 jobs/page |
| BuiltIn.com | `builtin-jobs` | HTML cards `[data-id="job-card"]` on `/jobs?search=…&country=USA` (cheerio) | `daysSinceUpdated=1/7/30` | US tech-focused; relative dates ("2 Hours Ago") converted to ISO |
| RemoteOK | `remoteok` | Public JSON API `https://remoteok.com/api` | none (client-side only) | Latest ~100 remote jobs; `tags` param unreliable so full feed is fetched |
| Remotive | `remotive` | Public JSON API `/api/remote-jobs?search=…&limit=100` | none (client-side only) | Remote-only; non-commercial use API |
| We Work Remotely | `weworkremotely` | RSS feeds (programming, full-stack, back-end categories) | none (client-side only) | Item titles are `"Company: Title"`; region in `<region>` |
| Workable Jobs | `workable-jobs` | Public JSON `jobs.workable.com/api/v1/jobs?query=…&location=United States&day_range=…`, paged by `pageToken` (≤10 pages/term) | `day_range=1/7/30` on `created` (verified tight) | Every employer hiring through Workable; descriptions in payload |
| Himalayas | `himalayas` | Public JSON `himalayas.app/jobs/api/search?q=…&country=US&sort=recent&page=n` (≤5 pages/term) | none — client-side on `pubDate` (epoch **seconds**) | Remote-only. Featured posts come first, then newest-first; paging stops once a page is entirely outside the window. Throttles bursts — 1s per-host gap |
| Jobicy | `jobicy` | Public JSON `jobicy.com/api/v2/remote-jobs?count=100&geo=usa&tag=…` | none (client-side only) | Remote-only; `tag` is a loose match. API terms ask that listings credit Jobicy and link to the original job URL |

- **Remote-board location handling:** remote-only boards normalize US-friendly regions
  (`Worldwide`, `Anywhere`, `USA`, `Americas`) to `"Remote — …"` so `isUSJob()` keeps them;
  other regions (e.g. `Europe`) pass through raw and get excluded downstream.
- **NOT addable:** Indeed, ZipRecruiter, Glassdoor, Monster, CareerBuilder — all return
  HTTP 403 bot-walls (Cloudflare/PerimeterX) on every known endpoint. Dice has a working
  API but was excluded by user preference.
  Hiring Cafe (Cloudflare challenge on every endpoint) and Welcome to the Jungle (CloudFront
  blocks headless Chrome; job search is only reachable through its private Algolia key) were
  evaluated on 2026-11-09 and are likewise not addable. The Muse's public API now answers 403;
  Arbeitnow is almost entirely German roles; Working Nomads exposes only its latest ~35 jobs.

---

### How the probe checks each platform
- **One JSON request** — `greenhouse`, `lever`, `ashby`, `smartrecruiters`, `workday`.
- **The real scraper** — every other platform (Oracle, iCIMS, Phenom, Radancy, SuccessFactors,
  Eightfold, Rippling, Aurora, the bespoke scrapers and the job boards). Nothing is
  "skipped" any more; these used to be, which hid dead entries such as Disney (portal moved
  host) and Tesla (bot-walled). Runs in a separate pool of 4 because some drive Chrome.
  Pass = jobs returned **and some dated**. Anything else is *uncertain* and kept — a scraper
  failing is never the definitive 404 that deletion requires.

**Eightfold throttles hard.** Several back-to-back full sweeps get the caller's IP a 403
HTML block page / 429 from every Eightfold tenant for a while. Treat an Eightfold-only
cluster of uncertain results right after repeated runs as throttling, not breakage. The
scraper already tries the other API (v2 ↔ PCSX) when the first fails, keeps collected pages
when a deep page is refused, and **throws** (so nothing is cached) when even the first page
is refused — returning `[]` there cached "0 jobs" for hours.

### Registry duplicates
One board must have exactly one entry. A duplicate re-scrapes the same board, doubles its
jobs, and — for an acquired company or a name collision — labels someone else's jobs with
the wrong employer (Split.io on Harness's board, Carbon Black on Carbon 3D's, Mercury
Insurance on Mercury's). 24 were removed on 2026-09-26; before adding an entry, check its
`platform|platformIdentifier` is not already present.

### Workday 422s mean a dead tenant, NOT a CSRF wall

A Workday 422 looks like an auth challenge and is not one. Control test:

| Request | Answer |
|---|---|
| real tenant, real site (`rackspace\|wd1\|External`) | 200 with jobs |
| real tenant, made-up site (`rackspace\|wd1\|BogusSiteName`) | **404** `{"message":"not found: Job_Posting_Site_ID=…"}` |
| made-up tenant (`bogustenantxyz\|wd1\|External`) | **422**, empty message |
| every "uncertain" registry entry | **422**, empty message — identical to the made-up tenant |

So a 422 says the tenant subdomain does not resolve: the identifier is wrong and no
session handshake can fix it. The board has to be re-discovered. This was previously
recorded here as "CSRF-protected, handled at runtime", which made 44 entries look healthy
while every one of them returned nothing — `WorkdayScraper`'s CSRF retry was verified
against all 44 and fixed none. (The CSRF prefetch is still correct for a genuine 401 and
is left in place; it is simply not what 422 is.)

A **404** is the recoverable one: tenant lives, only the site name is stale.

`probe-registry.mjs` reports both as *uncertain* and never deletes them — a wrong
identifier should cost a re-discovery, not the company. Resolve with:

```
node repair-uncertain.mjs            # HTTP pass: careers-URL follow + tenant/site hunt
node repair-uncertain-browser2.mjs   # browser pass: crawls one level into the job-search page
```

The browser pass crawls *past* the careers landing page on purpose. Landing pages are
marketing; Goldman's makes 145 requests and not one touches an ATS. The board only
appears on the job-search page one click in, so a pass that sniffs only the landing page
reports "no ATS signal" for nearly everything and means nothing.

Amazon is `platform: 'custom'` (not Workday) and uses Puppeteer; its generic selectors may
still return zero results.

#### Repair sweep of 2026-08-29 — 44 uncertain -> 31

13 entries were re-pointed to verified, fully-dated boards (975 -> 987 passing). Nothing was
deleted. What the leftovers actually are, so the discovery is not repeated:

| Company | Finding |
|---|---|
| VMware, CyberArk, Splunk | Acquired. Their roles sit on Broadcom / Palo Alto Networks / Cisco boards that are **already registered** under the acquirer, so re-pointing would duplicate a board and label the acquirer's jobs with the acquiree's name. Left as-is, annotated in the registry. |
| Granicus | Really on iCIMS. Verified: 59 jobs and **zero dates**, so the strict window gate drops all of them — a re-point would cost a scrape and return nothing. |
| Ciena | Identifier is *correct*; the tenant answers HTTP 502 to everything. Upstream outage. |
| Dun & Bradstreet | `dnb.wd1` is live but its cxs endpoint returns 403 (`errorCode S22`) to every client. No identifier fixes a deliberate block. |
| Seagate, MSCI, Kaiser Permanente, Tyler Technologies, Maximus | Run SuccessFactors/Avature, iCIMS/Radancy, Radancy/Avature/Taleo, Jobvite, Avature respectively — host known, but each needs its portal host confirmed before wiring. |
| Goldman Sachs, Walmart, Google, IBM, Cognizant, Meta, TikTok, KPMG, Infosys, SAIC, Shopify, Klarna, monday.com, Retool, Rippling, Rapid7, Vimeo, Enphase, SolarEdge, Westfield | No public JSON board found by HTTP or browser crawl. Walmart's tenant returns 422 on every `wdN` host even for a bogus site, i.e. it does not resolve publicly at all. |

The acquisition pattern is the recurring one: check whether the acquirer is already in the
registry **before** re-pointing, or the same board gets scraped twice under two names.
