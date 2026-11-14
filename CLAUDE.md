# career-jobs-mcp — Project Rules

An MCP server (plus CLI scripts) that searches company career sites and job boards, matches
jobs to a résumé, exports them to Excel and the "Job Quest Board" page, and auto-fills
Greenhouse applications. Follow these rules on every request without being reminded.

## Working rules

- **No personal data in tracked files.** Never write the user's name, phone, email, location,
  LinkedIn/GitHub URLs, résumé text or work history, local paths, résumé filename, artifact URL,
  or saved application answers into code, comments, tests, docs, examples or console text.
  Tests and examples use a fictional candidate (Jordan Ellis, Denver CO, `jordan@example.com`,
  555-01xx, Northwind/Contoso/Fabrikam); docs use placeholders like `<path to résumé>`. Real
  values live only in the git-ignored `apply-profile.json`, `job-quest-outputs.json` and `data/`.
- **No git or GitHub operations** (commit, push, history rewrites, branches, stashes). The user
  does those. Read-only git commands are fine.
- **Keep the docs in step.** When you add or change a command, flag, script or MCP tool, update
  README.md (usage example, flag table, Project Structure) and this file (Scripts table) in the
  same change. Remove every mention of anything renamed or deleted.
- **Rebuild after source changes:** `npm run build`. The scripts run the compiled `dist/`.
  `npm test` builds and runs `test/*.test.mjs`.

---

## Job search rules

1. **Posting age: 3 days by default.** "24 hours" → `postedSince: 'today'`. Never return older
   jobs unless asked. A job with no usable date is **excluded**, never assumed fresh.
2. **Experience: junior to Senior (≤5 years).** Exclude
   `/\bprincipal\b|\bstaff\b|\blead\b|\barchitect\b|\bdirector\b|\bvp\b|\bhead of\b|\bmanager\b|\bexecutive\b|\bdistinguished\b|\bfellow\b/i`.
   "Senior" is included.
3. **US only by default.** US or Remote without a non-US country. `isUSJob()` must accept every
   US format boards emit: `City, ST`, bare cities (`NYC`), full state names (`Dallas, Texas`),
   Workday prefixes (`TX-Dallas`), bare `US`. `test/job-filters.test.mjs` pins real strings.
4. **No security clearance or citizenship requirement**, checked on the **description**, not
   just the title (`src/utils/requirement-screen.ts`), sentence by sentence, skipping EEO
   boilerplate, negations ("no clearance required") and hedges. ITAR "U.S. person" counts.
   A job whose description can't be read is **kept** and counted (`requirementUnverified`);
   every drop is listed with its sentence in `meta.requirementExcluded`. Add real phrasings to
   `test/requirement-screen.test.mjs` instead of loosening a pattern.
5. **Output:** markdown table `# | Title | Company | Location | Posted | Apply URL`, with direct
   apply links. Say so clearly when there are zero results and suggest a wider window.
   **Company career sites first, job boards after**, then by score
   (`src/utils/source-priority.ts`); a board copy of a job already found on the employer's site
   is dropped (`crossSourceKey`). A 24h window is mostly board results, because company sites
   post in batches; widen the window to see more of them.
6. **Fallback profile** (only when no résumé is given: `find-java-24h.mjs`, `run-search.mjs`,
   `export-jobs-xlsx.mjs` without `--resume`). Java / Full Stack, ≤5 years. Target titles: Java
   Developer, Java Full Stack / Full Stack Java Developer, Full Stack Developer/Engineer,
   Software Engineer/Developer, Backend Developer/Engineer, Application Developer, Java Software
   Engineer. Title weights: CORE 10 (java, spring boot) · HIGH 7 (spring, microservices, full
   stack) · MID 5 (angular, react, aws, kafka, hibernate, jpa, rest, cloud) · LOW 3 (docker,
   kubernetes, ci/cd, jenkins, github actions, splunk, postgresql, mongodb, node.js, typescript,
   j2ee). Threshold 5 points; a plain target title with 0 points is still kept. Exclude
   non-target roles with no signal (Data Scientist, ML/DevOps/QA Engineer).

---

## Résumé-driven search (preferred)

When the user gives a résumé (path or pasted text), use the résumé pipeline in `src/resume/`. It
derives skills, weights, role families, seniority, board keywords and country from the document.
Rules 1, 3, 4 and 5 still apply.

| Surface | Use |
|---|---|
| `searchJobsForResume` (MCP) | Résumé → ranked table. `resumePath`/`resumeText`, `postedWithinDays`, `limit`, `companies`, `remoteOnly`, `format`. Overrides: `yearsOfExperience`, `country`, `matchThreshold`, `extraSearchTerms`. |
| `parseResume` (MCP) | Show the derived profile without scraping. Run it first on a new résumé. |
| `node find-jobs-for-resume.mjs --resume <path>` | Same from the CLI (`--today`/`--week`/`--days n`, `--limit`, `--years`, `--country`, `--remote-only`, `--profile-only`, `--json`). |

Formats: `.pdf .docx .txt .md .html`; scanned PDFs are rejected. Import
`pdf-parse/lib/pdf-parse.js`, not the package root (the root reads a missing sample file under ESM).

Decisions not to re-litigate:
- **Role families come from titles the candidate has held**, not listed tools (otherwise a Java
  developer listing Docker/Terraform gets SRE jobs). `extractTitles()` rejects prose bullets.
- **Years come from the experience section only** (education dates added phantom years).
- `test/resume-profile.test.mjs` pins the sample résumé's profile (families `fullstack,
  generic-swe, backend, frontend`, band Entry→Senior, "Senior Java Full Stack Developer" = 17).

**JD match** (`src/resume/jd-match.ts`): `% = weight of JD skills the résumé has ÷ weight of all
JD skills`; weight = tier × emphasis (1×, +0.5× per extra mention, max 3×). No readable
description → `null` ("N/A"), never 0. Sorting stays company-first; JD match sorts within each
group. Descriptions are fetched once, reused by the clearance screen, and cached 14 days in the
`job_descriptions` table. **LinkedIn descriptions are fetched one at a time** (250ms gap, 429
backoff, host skipped 10 min after repeated refusals); in parallel LinkedIn refused ~90%.

**Board keywords are per-résumé.** Keyword boards (LinkedIn, SimplyHired, BuiltIn, Remotive,
Workable, Himalayas, Jobicy) get the résumé's terms, and **their cache rows are keyed by those
terms**. Company scrapers are not keyed by terms (they fetch the whole board).

---

## Dates and cache

- All window logic is in `src/utils/posted-date.ts`. **Strict:** the orchestrator drops undated
  jobs when a window is requested (`undatedExcluded`); scrapers stay lenient so the cache keeps
  them. **Absolute:** "N days ago" anchors to the start of that day, never to scrape time.
- "Last updated" is not "posted". Use: Greenhouse `first_published` (**not** `updated_at`),
  Lever `createdAt`, Ashby `publishedAt`, SmartRecruiters `releasedDate`, Workday `postedOn`
  (day-granular; dateless tenants are backfilled from the job detail), Eightfold `t_create`
  (seconds, **not** `t_update`), Rippling `createdOn` (detail endpoint only), Aurora
  `publishedDate`, iCIMS detail JSON-LD `datePosted`. BuiltIn reposts have no original date and
  are shown as "(repost)".
- Cache: SQLite `data/cache.db`, keyed by **slug + window**. The TTL scales with the window
  (a row may use at most 5% of it: today ≈ 1.2h, week ≈ 8.4h, month 24h). `forceRefresh: true` or
  deleting the file forces a re-scrape.
- Browser scrapers share one Chrome (`getBrowser()` in `src/utils/browser.ts`). Every script must
  end with `.finally(() => closeSharedBrowser())`, or it never exits. Never call
  `puppeteer.launch()` directly.

---

## Scripts

| Script | Purpose |
|---|---|
| `node find-java-24h.mjs` (`--today`/`--week`) | Fallback-profile search across all companies and boards |
| `node export-jobs-xlsx.mjs` | Same search → `job-results.xlsx`: Applied? checkboxes (`xlsx-checkboxes.mjs`), total, Apply / Auto Apply links, ↻ refresh links. Flags: `--resume`, `--today`/`--week`/`--month`/`--days n`, `--out`, `--min-jd-match n` |
| `… --page <path>` | Also write the Job Quest page and publish it (`--no-publish`, `--publish-url`, `--local-page <path>` for a standalone copy) |
| `… --html` / `--artifact` | Write only the page (standalone / publish-ready) |
| `node refresh-job-quest.mjs --days 1\|3\|7\|30` | Rerun the last `--resume --page` export for a new window, updating sheet, pages and board. `--detach`, `--status` |
| `node publish-job-page.mjs <page>` | Publish a page to the board (retry after a failed auto-publish) |
| `node auto-apply.mjs --resume <path> <greenhouse url>` | Fill one application in a visible Chrome; never submits. `--show-data`, `--link <jobquest://…>` |
| `node auto-apply.mjs --setup` / `--set key=value` | Save one-time answers (LinkedIn, authorization, sponsorship, pronouns, EEO) |
| `node install-auto-apply.mjs --resume <path>` | Register `jobquest://` links (Windows, HKCU) → `jobquest-link.mjs`. `--status`, `--uninstall`. Re-run after moving the repo or Node |
| `node probe-registry.mjs` (`--dry-run`, `--platform X`) | Health-check the registry; removes only definitive 404s |
| `node repair-uncertain.mjs`, `repair-uncertain-tenants.mjs`, `repair-uncertain-browser2.mjs` | Find replacement identifiers for *uncertain* entries (never delete) |
| `node discover-companies.mjs`, `discover-companies-browser.mjs`, `validate-discovered.mjs`, `merge-registry.mjs` | Add companies (see below) |
| `node get-5-companies.mjs`, `deloitte-scrape.mjs`, `fetch-sap-infosys.mjs` | Special scrapers for SAP, Deloitte and similar |

---

## Job Quest Board

- Daily command: `node export-jobs-xlsx.mjs --resume "<path to résumé>" --today --out "<Desktop>\jobs.xlsx" --page "<Desktop>\job-quest.html"`.
  The real paths are in `job-quest-outputs.json` (`node refresh-job-quest.mjs --status`).
- **Publishing** runs unattended Claude Code (`claude -p`, Artifact + Read tools only) to the
  existing board (`DEFAULT_URL` in `publish-job-page.mjs`, or `$JOB_QUEST_URL`). It needs a Claude
  Code build that has the Artifact tool (`findClaudeBinary()`: `$CLAUDE_BIN`, then the VS Code
  extension's bundled binary, then PATH) and `CLAUDE_CODE_ENTRYPOINT=claude-vscode`, which
  `publishJobPage()` sets. A failed publish never fails the export.
- **Publishing by hand:** publish to that same URL (never a new artifact) and omit
  `capabilities` so the stored set carries over. If you must restate it, it is
  `{db:{}, user:{}, mcp:{servers:[{server:'host:career-jobs', tools:['searchJobsForResume','autoApplyJob','refreshJobQuest']}]}}`.
- Applied ticks, streak and goal live in the viewer's private db (`data/users/<id>/`, keyed by a
  hash of the apply URL), so republishing never resets them. Don't change that hash.
- Search buttons: in the Claude **desktop app** they call `searchJobsForResume` (instant list)
  then `refreshJobQuest` (rewrites everything in the background). Elsewhere they open
  `jobquest://refresh?days=N`. The desktop app's `claude_desktop_config.json` entry **must set
  `env.CACHE_DB_PATH`**, because the app starts the server in `C:\Windows\System32`.
- **Refresh:** every `--resume --page` run saves its outputs to `job-quest-outputs.json`
  (`$JOB_QUEST_OUTPUTS_PATH` overrides; set it in tests). One run at a time
  (`data/refresh.lock`, latest queued window wins). Sheet ticks are kept by apply URL; a sheet
  open in Excel is saved, closed and reopened over COM (`excel-session.mjs`, path passed via
  env, not `$args`).

## Auto Apply (Greenhouse only)

- **Never submits.** It fills the form; the user reviews and presses Submit. Keep it that way.
- Always open the embed form `job-boards.greenhouse.io/embed/job_app?for=<board>&token=<id>`
  (`greenhouseFormUrl()`); many job pages redirect to the company site.
- Core field ids are stable (`first_name`, `email`, `phone`, `country`, `candidate-location`,
  `resume`, `company-name-N`, `school--N`…). Dropdowns are react-select: type, then click the
  option, never set `.value`. A current role's end date stays required; leave it blank.
- Résumé → applicant: `src/resume/applicant.ts`. Other answers: `apply-profile.json`
  (`apply-profile.example.json` shows the shape):
  - `standard` (`src/apply/standard-answers.ts`): authorization, sponsorship, pronouns and EEO
    (each EEO answer may be `decline`). Questions are matched by **label** over every visible
    field (EEO sections, numeric-id surveys and custom questions differ by board).
    `chooseOption()` returns null on no match **or a tie**, leaving the field blank.
  - `answers[]`: label *contains* `question`; wins over `standard`.
  - Résumé facts: legal name, `City, ST`, "located in the US", country of residence. Citizenship,
    relocation, office and H-1B history are **not** derived.
  - Never fill demographic, consent or authorization questions from guesses; never tick consent
    boxes. Leftovers are returned as `needsYou` (+ `setupHint`). Questions are re-collected up
    to 3 times (some appear after earlier answers); a checkbox group is one `needsYou` entry.
- Two routes, one filler: the `autoApplyJob` MCP tool (desktop app; not read-only, so the app
  asks first) and `jobquest://apply?url=…` links (Excel, local page, browser). **A link carries
  only the job URL** (Greenhouse only); `refresh` links accept only 1/3/7/30. Any website can
  fire these links, so never let one name a path or file.
- Visible Chrome: `getVisibleBrowser()`, profile `data/apply-chrome-profile/` (falls back to a
  temp profile when it's in use). `APPLY_HEADLESS=true` is for tests only.

---

## Registry (`src/scrapers/company-registry.ts`)

- **Never hand-write a `platformIdentifier`.** Add companies with `discover-companies.mjs` →
  `discover-companies-browser.mjs` → `validate-discovered.mjs` (**mandatory**: read the sample
  postings, because slug guesses often hit a different company's board) → `merge-registry.mjs`.
  Reject boards with 0 jobs or **no dates** (the strict gate drops everything).
- **One board, one entry.** Check `platform|platformIdentifier` isn't already present, and check
  the acquirer isn't already registered.
- **Probe:** transient failures (5xx/429/timeout) are *uncertain* and kept; only a definitive
  404 deletes. A 404 usually means the company changed ATS, so re-discover before deleting.
  Routing to `custom` is not a fix (it sets no dates).
- **Workday:** 422 = the tenant doesn't exist (wrong identifier, not CSRF); 404 = tenant fine,
  site name stale. Eightfold throttles after repeated sweeps; treat a burst of Eightfold failures
  as throttling.
- Not scrapable: Indeed, ZipRecruiter, Glassdoor, Monster, CareerBuilder, Hiring Cafe, Welcome to
  the Jungle (bot walls). Dice is excluded by user preference. Infosys's portal has no US jobs.
- Special cases: SAP (`POST jobs.sap.com/services/jobs/search/`, strip `[UTC]` from
  `referencedate`) and Deloitte (Avature, Puppeteer, no dates in the list) use their own scripts.
