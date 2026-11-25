# career-jobs-mcp — Project Rules

An MCP server (plus CLI scripts) that searches company career sites and job boards, matches
jobs to a résumé, exports them to Excel and the "Job Quest Board" page, and auto-fills
Greenhouse, Ashby, Lever, Workable, Workday and Eightfold applications. Follow these rules on every request without being reminded.

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
   "Senior" is included. In the résumé pipeline a "Manager" / "Executive" / "Architect" that
   names the role (Product Manager, Account Executive, Solutions Architect, Scrum Master) is
   not a rung (`ROLE_NAME_NOT_RANK` in `skill-taxonomy.ts`); "Engineering Manager" still is.
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
- **No role is blocked outright.** Non-engineering roles are families like any other
  (`data-analytics`, `business-analysis`, `product`, `project-management`, `design`,
  `technical-writing`, `solutions`, `sales`, `marketing`, `customer-support`, `recruiting`,
  `finance`), so a data analyst résumé gets analyst jobs and a developer's résumé never does.
  Their title rules come **after** the engineering ones ("Backend Engineer, Payroll" stays
  backend). Non-engineering résumés get no "<skill> Developer" board query.
  `test/resume-roles.test.mjs` pins this. (The fallback profile's `EXCLUDE_ROLES` is separate.)
- **A title that names a stack needs that stack on the résumé** (`stackSkillsInTitle()`: core
  backend / frontend / mobile / embedded skills such as Java, Python, .NET, Go, Rails, Swift,
  Android). The backend family spans every language, so a Python résumé got "Java Developer".
  "Java / Python Developer" passes for either; C# and .NET imply each other; "Go-to-Market" is
  not Go. On the cached jobs it removed 743 of ~12,400 titles a Java résumé kept, all other stacks.
- **Years come from the experience section only** (education dates added phantom years).
- `test/resume-profile.test.mjs` pins the sample résumé's profile (families `fullstack,
  generic-swe, backend, frontend`, band Entry→Senior, "Senior Java Full Stack Developer" = 17).

**JD match** (`src/resume/jd-match.ts`): `% = Σ(weight × résumé strength) of JD skills the résumé
has ÷ weight of all JD skills`; weight = tier × emphasis (1×, +0.5× per extra mention, max 3×).
Not counted: a skill that is the employer's own name (Snowflake's JDs name Snowflake), and a
skill whose families are all non-engineering when the résumé neither has it nor claims one of
them (`offRole()`: "user stories", "Salesforce" in a developer's JD; counting them moved a Java
résumé's scores −3 points on average over 2,891 cached JDs, after the change −0.05).
Résumé strength (`skillStrength()`, from `ProfileSkill.workMentions`): used in the experience
section 3+ times 1.0, twice 0.9, once 0.8; only under Skills/Projects/Education 0.5; no
experience header → total mentions on the 1.0/0.9/0.8 scale; an implied skill (SQL from
PostgreSQL) takes its implier's strength. So one Python project doesn't make a Python-heavy JD
100% for a Java developer (`test/jd-match.test.mjs` pins it). No readable
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
| `node auto-apply.mjs --resume <path> <job url>` | Fill one application in a visible Chrome; never submits (Workday: waits for sign-in, then fills each step as it opens). A board job URL (LinkedIn, BuiltIn…) is looked up on the employer's own job site first (never signs in to the board). `--show-data`, `--link <jobquest://…>` |
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

## Auto Apply (Greenhouse, Ashby, Lever, Workable, Workday, Eightfold; board jobs leading to them)

- **Never submits.** It fills the form; the user reviews and presses Submit. Keep it that way.
- **Platforms** are chosen in one place, `applyFormFor()` (`src/apply/platforms.ts`); the CLI, MCP tool,
  links, the sheet's Auto Apply column and the board all ask it. Shared helpers are in
  `src/apply/common.ts`. To add a platform: a `<name>FormUrl()` + `fill<Name>()` pair, one line in
  `applyFormFor()`, its "form loaded" selector in `FORM_READY` (`auto-apply.ts`), an `OPEN_FORM`
  step if the form needs a click to appear, the URL regex next to `GH_JOB` in
  `templates/job-quest.html` (and a test that it agrees with `<name>FormUrl()`), and the
  platform list in the `autoApplyJob` description (`src/server.ts`, `src/tools/auto-apply-job.ts`).
- **Greenhouse:** always open the embed form `job-boards.greenhouse.io/embed/job_app?for=<board>&token=<id>`
  (`greenhouseFormUrl()`); many job pages redirect to the company site.
- Core field ids are stable (`first_name`, `email`, `phone`, `country`, `candidate-location`,
  `resume`, `company-name-N`, `school--N`…). Dropdowns are react-select: type, then click the
  option, never set `.value`. A current role's end date stays required; leave it blank.
- **Ashby** (`src/apply/ashby.ts`): open `jobs.ashbyhq.com/<org>/<job id>/application`
  (`ashbyFormUrl()`); wait for `#_systemfield_name`, which renders after page load. Every question
  is an `.ashby-application-form-field-entry` with a `.ashby-application-form-question-title`
  label (a `_required` class marks required). System fields: `_systemfield_name` (full name),
  `_systemfield_email`, `_systemfield_resume`, `_systemfield_location` (type-ahead; pick
  "City, State, United States"), EEO radios `…_systemfield_eeoc_gender/race/veteran_status`.
  Yes/No questions are `button[data-option="yes"|"no"]`. A text box inside a block wins over its
  Yes/No buttons (Ramp's Phone carries an SMS-consent Yes/No, which is left alone). Text boxes
  include `type=url` and `type=number`. When selecting inside a block, scope **every**
  comma-separated selector (`entryHandle()`); `[block] a, b` matches `b` anywhere and typed the
  phone into Email. Ashby has no work-history or education sections.
  Live check (2026-11-14, headless, 0 failures, values read back from the page): Mercor, OpenAI,
  Ramp, Zip, WHOOP, UiPath, Thumbtack.
- **Lever** (`src/apply/lever.ts`): open `jobs.lever.co/<company>/<posting id>/apply` (`leverFormUrl()`).
  Plain HTML: each question is an `.application-question` (skip `.awli-application-row`, the
  "Apply with LinkedIn" widget) with an `.application-label`. Fixed names: `resume`, `name`,
  `email`, `phone`, `location`, `org` (current company), `urls[LinkedIn|GitHub|Portfolio|Other]`,
  `pronouns` (checkboxes), `eeo[gender|race|veteran|disability]` (selects); custom questions are
  `cards[…][fieldN]`, surveys `surveysResponses[…]`. Pitfalls: **radios** are ticked with a DOM
  `.click()` and then checked (a mouse click missed TrueML's sponsorship radio); the **location**
  type-ahead ignores a DOM click, so pick with ArrowDown × n + Enter, accept only a result in the
  résumé's state (the list briefly shows "Austin, MN" first), and confirm `selectedLocation`.
  hCaptcha runs only on Submit. Live check (2026-11-14, 8 boards, 0 failures): Zoox, Match
  Group, TrueML, SonarSource, Spotify, Restaurant365, Protolabs, Palantir.
- **Workable** (`src/apply/workable.ts`): two entry points, one form. Board jobs
  (`jobs.workable.com/view/<id>`, what the `workable-jobs` scraper returns) open the form in place
  after **Apply now**; company pages open `apply.workable.com/<account>/j/<code>/apply/`
  (`workableFormUrl()`, also maps `<account>.workable.com/j/<code>`). `openWorkableForm()` (run
  from `OPEN_FORM` in `auto-apply.ts`) declines the cookie banner first (it swallows the first
  click), then presses Apply now. No login; any captcha runs on Submit. Fields are found by
  role and labelled via `aria-labelledby`: text `input[name]`/`textarea[name]` (`firstname`,
  `lastname`, `email`, `phone`, `address`, `headline`, `CA_<n>`/`QA_<n>` custom), dropdowns
  `[data-input-type=select][data-ui=<name>]` (read-only combobox `#input_<name>_input`; options
  exist only while open; value lands in a hidden `input[name=<name>]`), yes/no
  `fieldset[role=radiogroup]` (values true/false, text YES/NO), multi `[role=group]`. Option text
  is either inside the `[role=radio]` or in the span named by the last id of its
  `aria-labelledby` (custom-attribute radios). Pitfalls: **never press Escape**: with no list open
  it closes the whole application on the board and drops everything typed (close a dropdown by
  clicking its box again); `address` is pre-filled from the visitor's IP, so always overwrite it;
  a label that names GitHub/LinkedIn gets the profile URL only if it asks for a profile/URL
  (`wantsProfileLink()`: "share your contributions with links (GitHub PRs…)" is left).
  Education / Experience are optional "+ Add" sections and are not filled.
  Live check (2026-11-15, headless, 8 forms, values read back from the page, 0 errors): Multi
  Media, J-Mack, Peregrine, Stafford Gray, Sigma Defense, Man Group, Katmai, Hugging Face.
- **Workday** (`src/apply/workday.ts`): open `<job url>/apply/applyManually` (`workdayFormUrl()`;
  `openWorkdayForm()` declines cookies and falls back to Apply → Apply Manually). Every tenant
  has its own account: the flow opens on *Create Account / Sign In* (`signInContent`) and the
  **user** signs in. Never type credentials, never create accounts, never touch
  `input[data-automation-id=beecatcher]` (honeypot named `website`). It is a wizard, so
  `autoApply()` fills the step on screen (if already signed in) and returns; `followWorkday()`
  then polls `workdayState()` and fills each new step once (keyed by the
  `progressBarActiveStep` text) until Review, tab close or 90 min. The user presses Save and
  Continue; the filler presses neither that nor Submit. Results carry `followsSteps` /
  `waitingForSignIn`. Fields: `div[data-automation-id="formField-<id>"]` + `<label>`/`<legend>`
  (`*` = required); dropdowns `button[aria-haspopup=listbox]` with `[role=option]` only while
  open ("Select One" = empty); prompts (type, Enter, `promptOption`, picked = `selectedItem`);
  dates `dateSectionMonth-input`/`dateSectionYear-input`. Country before address (it
  re-renders); "United States of America"; phone as national digits, device type Mobile.
  **Every** résumé job and school gets an entry (`entryFor()`): an entry already holding that
  company / school (a parsed résumé, the last application) is completed, empty fields only;
  else an untouched blank entry; else Add / Add Another. An entry's section is its
  `aria-labelledby` group label ("Work Experience 2"), else the nearest section heading.
  **Never count a `<legend>` or a heading inside a formField as a section**: date fields are
  fieldsets with legend "From"/"To", and counting them hid "Add Another" after job 1.
  Prompts (school, field of study, skills) are multi-selects whose results list **stays open
  after a pick**, over the fields below, swallowing the next click: `closeLists()` runs before
  and after every pick and dropdown (Escape, checked, then a click on the step heading).
  A picked value's **pill is itself a `role=option` in a `role=listbox`** (`selectedItemList`,
  with a `promptOption` inside), so options / results are read only outside `PILL`
  (`visibleItems()`), and waited for (`waitForItems()`): counting the school pill made Degree
  read no degrees and Field of Study no results (Citi, 2026-11-22). The test mock draws pills
  that way, keeps its list open and draws lists 250ms late; it fails without the fix.
  Workday's fixed footer (`pageFooter`, Back / Save and Continue) covers buttons that count as
  "in view": `clickAdd()` centres the Add button, and `entryFor()` retries with a DOM click when
  no entry appears (a mouse click on the footer left Education with no entry).
  The résumé upload may not be a formField (`file-upload-input-ref`); wait for it to land plus
  3s for Workday's parse before matching entries. `chooseDegree()`: exact degree, else the one
  generic option, else science/arts by field of study ("Master of Computer Science" →
  "Master of Science (MS)"); MBA is never a plain Master's; a tie stays blank.
  `readFields()` clears old `data-jq-field` tags first (hidden fields kept stale tags).
  Role Description = the résumé lines under that job (`ApplicantJob.description`, "• " bullets,
  ≤ 4,000 chars, from `parseExperience()`). Date parts and prompt searches sit under display
  overlays: `focusBox()` (click, then JS focus) and type with the keyboard; `setDate()` checks
  the input or `dateSection<Part>-display`. Every field goes through `attempt()` / try-catch, so
  one failure is reported and the step goes on (one bad date box used to abort the step: no
  Add Another, no dates, no Education). Schools from a prompt list: the exact name, else one
  starting with it ("… - Main Campus"; an exact name beats "…-Lake Campus"). Field of study:
  `chooseFieldOfStudy()` (exact, else the one option starting with or naming it; two: blank).
  Each step's markup (values stripped; open lists drawn outside the form included) is saved to
  `data/workday-debug/<step> before.html` before filling and `<step>.html` after, and its fill
  report (filled / failed with the options or results seen / needsYou) to
  `<step>.report.json` (all git-ignored): read them first when a tenant's field is missed.
  Self Identify's disability boxes are keyed by field id. Terms / consent boxes, "previously
  worked here", How did you hear, address line and signature date are left (`needsYou`).
  Live check (2026-11-20, headless): URL mapping on 2,997 cached jobs; 6 tenants (Workday,
  Zendesk, YETI, Zebra, Wells Fargo, Wegmans) reach sign-in. Steps after sign-in are tested on
  a Workday-shaped mock in `test/workday.test.mjs` only; no account was used.
- **Board jobs: never sign in to a board** (user decision: account-lock risk, and a fresh
  sign-in per window). `boardJobFor()` (`src/apply/board-link.ts`) accepts job pages on
  LinkedIn, BuiltIn, SimplyHired, Himalayas, We Work Remotely, Jobicy, RemoteOK, Remotive (exact
  https hosts; `BOARD_JOB` in `templates/job-quest.html` must agree, tested).
  **Employer match** (`src/apply/employer-match.ts`): the board job's company, title and
  location find the same posting on the employer's own board. Registered company
  (`registeredEmployer()`, Greenhouse / Lever / Ashby / Workday only): its board, no guessing.
  Otherwise one guessed Greenhouse / Lever / Ashby name (`boardNameGuesses()`), remembered per
  company 7 days (`employer_boards`). `pickPosting()`: same `titleKey()`, a form `applyFormFor()`
  accepts, locations not disagreeing (`placesAgree()`; a shared state is enough at a registered
  company, a guess needs `yes`, because a guessed name can be another company's board); a loose
  title (no "(Remote)" / " - City") only when unique. Greenhouse/Lever/Ashby are read with one
  light API call each (`listPublicBoard()`; Greenhouse's `absolute_url` is often the company's
  own page, which is no form, so build `job-boards.greenhouse.io/<board>/jobs/<id>`); Workday
  uses its scraper (server-side title search). Results per board URL: `employer_links`, 14 days
  (2 for no match). The export runs `matchBoardJobs()` on its board jobs and sets `j.auto` (the
  form, the employer posting, a Remotive/WWR board URL, or ''); the sheet's Auto Apply column
  and the page's `autoUrl(j)` use it, so an unmatched board job shows no ⚡. `autoApply()` on a
  board URL calls `employerUrlFor()` (cached link, else the cached board job's details); no
  match on a sign-in board → `via.outcome: 'no-match'` + `notFilled`, **nothing opened**.
  Live (2026-11-22): 13 of 60 recent board jobs matched (Workday, Lever, Ashby, Greenhouse; same
  title, checked by hand), 11s; then 0s from cache. Click test: a LinkedIn job → CLEAR's
  Greenhouse form, 12 fields filled, LinkedIn never opened.
  **Following the Apply button** (`followBoardApply()`) is used only for boards that reach the
  employer without an account (`followsWithoutAccount()`: Remotive, We Work Remotely). It never
  presses a board's own apply (Easy Apply, Indeed), types credentials, or clicks board dialogs.
  Live, signed out: LinkedIn's public page has no employer link (Apply opens a sign-in dialog or
  an authwall; `public_jobs_apply-link-onsite` = Easy Apply, `…-offsite` = company site);
  BuiltIn `?handler=ApplyRedirect` → `?applyRequired=true`; Jobicy and Himalayas gate Apply
  behind sign-up; SimplyHired / Himalayas / WWR serve Cloudflare; RemoteOK `/l/<id>` bounced
  back; Remotive reached employer sites.
- **Eightfold** (`src/apply/eightfold.ts`): open `https://<site>/careers/apply?pid=<id>`
  (`eightfoldFormUrl()`; hosts allowlisted: `*.eightfold.ai`, `explore.jobs.netflix.net`,
  `careers.qualcomm.com`, `apply.careers.microsoft.com`, because a jobquest:// link can carry one;
  `EIGHTFOLD_JOB` in the template must agree, tested). Ready = `[id^="Contact_Information_"]`.
  Every question is `<label id="<Q>_label" for="<Q>">` / `<legend id="<Q>_legend">` + the element
  with id `<Q>` (the box, a wrapper, or a `role=group` of checkboxes); `readQuestions()` tags them
  `data-jq-q`. Selectors put the element first (`input[data-jq-q="0"]`; `[data-jq-q="0"]input` is
  invalid and failed every field once). Dropdowns: `input[role=combobox][aria-controls=list-N]`,
  click, `button[role=option]` in `#list-N` (can open empty: wait, click again), value read back.
  Phone code: combobox `aria-label="Country code"` → "(+1) United States". Contact fields
  `Contact_Information_<firstname|lastname|email|phone|city>`; "State" appears after Country.
  Self-ID groups: gender and race only (one box); `NEVER` covers sexual orientation,
  transgender, clearance, signatures, consent, "how did you hear". A box naming LinkedIn gets the
  LinkedIn URL. Microsoft (Microsoft sign-in) and Qualcomm (email sign-in) show no form until the
  user signs in: `eightfoldWantsSignIn()` (vs a closed job), `waitingForSignIn` + background
  `waitForEightfoldForm()` (30 min), then `fillEightfold()`. Pre-ticked "Save my answers"
  (Lockheed) and Netflix's cookie box are site defaults, not ours.
  Live check (2026-11-22, headless, values read back, 0 failures): Netflix 14 filled, Lockheed
  Martin 9 (16 left: clearance, military, signature…); Microsoft and Qualcomm → waitingForSignIn.
- **Greenhouse jobs on a company's own careers page** (`absolute_url` = `stripe.com/…?gh_jid=N`):
  `greenhouseJobFor()` (`employer-match.ts`) → `job-boards.greenhouse.io/<registry board>/jobs/N`,
  used for `j.auto` in the export (4,011 such jobs in 14 days; open ones' forms load: Helsing,
  JFrog, Block, Carvana, Stripe, Toast). The listed `applyUrl` is unchanged (Applied ticks are
  keyed by it).
- **Not supported:** SmartRecruiters' apply page (`oneclick-ui`) answers automated browsers with
  a DataDome 403 + captcha; do not try to get around it.
- "Are you authorized to work … **without** sponsorship?" is its own key
  (`authorizedWithoutSponsorship`, Yes only when workAuthorized=yes AND sponsorship=no). Read as a
  sponsorship question it was answered No. Use `savedAnswer(key, std)`, not `std[key]`.
- Résumé → applicant: `src/resume/applicant.ts`. Other answers: `apply-profile.json`
  (`apply-profile.example.json` shows the shape):
  - `standard` (`src/apply/standard-answers.ts`): authorization, sponsorship, pronouns and EEO
    (each EEO answer may be `decline`). Questions are matched by **label** over every visible
    field (EEO sections, numeric-id surveys and custom questions differ by board).
    `chooseOption()` returns null on no match **or a tie**, leaving the field blank.
    Wordings without the key word count too: "legal authorization to work" (workAuthorized),
    "need to obtain… a visa or work permit" (sponsorship). Veteran: "I am a veteran, but not a
    protected veteran" is a veteran, never a "no" (it tied with "I am not a veteran").
    `test/standard-answers.test.mjs` pins BlackRock's live labels.
  - `answers[]`: label *contains* `question`; wins over `standard`.
  - Résumé facts: legal name, `City, ST`, "located in the US", country of residence, current
    employer and title (latest job). Citizenship,
    relocation, office and H-1B history are **not** derived.
  - Never fill demographic, consent or authorization questions from guesses; never tick consent
    boxes. Leftovers are returned as `needsYou` (+ `setupHint`). Questions are re-collected up
    to 3 times (some appear after earlier answers); a checkbox group is one `needsYou` entry.
- Two routes, one filler: the `autoApplyJob` MCP tool (desktop app; not read-only, so the app
  asks first) and `jobquest://apply?url=…` links (Excel, local page, browser). **A link carries
  only the job URL** (`acceptsAutoApply()`: Greenhouse/Ashby/Lever/Workable/Workday/Eightfold forms and
  `boardJobFor()` board pages only); `refresh` links accept only 1/3/7/30. Any website can
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
