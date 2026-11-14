# Career Jobs MCP

> An AI-powered job search engine that scrapes **600+ company career sites directly** — no LinkedIn, no Indeed, no third-party aggregators. Built as a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server so it works natively inside Claude AI.

---

## What Is This?

Most job search tools show you the same listings from LinkedIn or Indeed, which are often outdated or missing jobs entirely. This tool goes **directly to each company's own career portal** and fetches real-time job listings.

You tell Claude: *"Find Java Full Stack jobs posted in the last 3 days, US only, no senior+ roles"* — and it searches across 600+ companies simultaneously in under 2 minutes.

```
You ──► Claude AI ──► Career Jobs MCP ──► Greenhouse API  ──► Stripe, Airbnb, Reddit...
                                      ──► Lever API       ──► Netflix, Brex...
                                      ──► Workday API     ──► JPMorgan, Goldman Sachs...
                                      ──► Ashby API       ──► Linear, Ramp...
                                      ──► 600+ more companies
```

---

## How It Works

1. **You ask Claude** to search for jobs matching your profile
2. **Claude calls this MCP server** with your search criteria
3. **The server fans out** across 600+ company career portals concurrently
4. **Each platform scraper** hits the official ATS (Applicant Tracking System) JSON API — no browser needed for most companies
5. **Results are filtered** by date, location, experience level, clearance requirements, and resume keyword match
6. **A ranked table** is returned directly in your Claude conversation

---

## Key Features

| Feature | Details |
|---------|---------|
| **600+ companies** | Tech, finance, healthcare, e-commerce, defense, and more |
| **6 ATS platforms** | Greenhouse, Lever, Ashby, SmartRecruiters, Workday, Custom (Puppeteer) |
| **Smart filtering** | Date window, US-only, experience level, no clearance, resume-match scoring |
| **Resume scoring** | Keyword-weight algorithm ranks jobs by % match to your profile |
| **24-hour cache** | SQLite cache avoids hammering the same site twice |
| **Rate limiting** | 2s per-host throttle + exponential backoff retries — respectful scraping |
| **No API keys needed** | Uses publicly accessible ATS JSON APIs |
| **Standalone scripts** | Run searches directly from terminal without Claude |

---

## What Is MCP?

**Model Context Protocol (MCP)** is an open standard created by Anthropic that lets AI models like Claude call external tools and data sources. Think of it like giving Claude a set of custom functions it can invoke.

When this server is registered with Claude, Claude can call tools like `searchMultipleCompanies(...)` just like a developer would call a function — and get back structured job data it can reason about, filter, and present to you.

> You don't need to understand MCP to use this project. It works transparently when connected to Claude.

---

## Project Structure

```
career-jobs-mcp/
├── src/
│   ├── index.ts                    # Entry point — starts the MCP server
│   ├── server.ts                   # Registers the MCP tools with Claude
│   ├── types.ts                    # TypeScript types: JobListing, CompanyConfig, Filters
│   ├── scrapers/
│   │   ├── base-scraper.ts         # Shared scraper logic (filtering, level detection)
│   │   ├── orchestrator.ts         # Coordinates cache + scrape per company
│   │   ├── company-registry.ts     # Master list of 600+ companies with ATS config
│   │   └── platforms/
│   │       ├── greenhouse.ts       # Greenhouse JSON API scraper
│   │       ├── lever.ts            # Lever JSON API scraper
│   │       ├── ashby.ts            # Ashby JSON API scraper
│   │       ├── smartrecruiters.ts  # SmartRecruiters JSON API scraper
│   │       ├── workday.ts          # Workday scraper (CSRF-aware session handling)
│   │       └── custom-puppeteer.ts # Headless Chrome fallback for JS-rendered sites
│   ├── resume/
│   │   └── applicant.ts            # Résumé → contact details, jobs held, education (for auto apply)
│   ├── apply/
│   │   ├── auto-apply.ts           # Opens a Greenhouse application in a visible Chrome and fills it
│   │   ├── greenhouse.ts           # Greenhouse form field map, dropdown picking, "still needs you" report
│   │   ├── protocol.ts             # jobquest://apply and jobquest://refresh links (build + validate)
│   │   ├── standard-answers.ts     # Authorization / sponsorship / pronouns / EEO answers, matched by meaning
│   │   └── apply-profile.ts        # Loads apply-profile.json (LinkedIn, answers to yes/no questions)
│   ├── cache/
│   │   └── cache-manager.ts        # SQLite cache with 24-hour TTL
│   └── utils/
│       ├── logger.ts               # stderr-only logger (stdout reserved for JSON-RPC)
│       ├── rate-limiter.ts         # Per-host request throttle
│       └── retry.ts                # Exponential backoff with configurable retries
├── tools/                          # One file per MCP tool (search, list, add, etc.)
├── find-java-24h.mjs               # Standalone: search all 600+ companies for Java roles
├── export-jobs-xlsx.mjs            # Standalone: same search, exported to an Excel sheet and/or the Job Quest web page
├── xlsx-checkboxes.mjs             # Adds Excel's native in-cell checkboxes to the exported sheet
├── jobs-html.mjs                   # Fills templates/job-quest.html with a run's jobs
├── publish-job-page.mjs            # Publishes the page to the Job Quest Board via unattended Claude Code
├── templates/job-quest.html        # The Job Quest Board page (goal ring, streak, JD match, Applied ticks)
├── auto-apply.mjs                  # Standalone: fill a Greenhouse application from your résumé (never submits)
├── install-auto-apply.mjs          # One-time: registers jobquest:// links (Auto apply + refresh) for Excel/any page
├── jobquest-link.mjs               # What a jobquest:// link click runs: apply or refresh
├── refresh-job-quest.mjs           # Reruns the daily export for a new window, updating every output
├── job-quest-outputs.mjs           # Saves/loads where the daily export writes (job-quest-outputs.json)
├── excel-session.mjs               # Rewrites a sheet open in Excel (save/close/reopen) and keeps its ticks
├── apply-profile.example.json      # Template for apply-profile.json (git-ignored): LinkedIn + question answers
├── probe-registry.mjs              # Standalone: health-check all companies, remove broken ones
├── run-search.mjs                  # Standalone: broader search with month window
├── data/cache.db                   # SQLite cache (auto-created on first run)
├── dist/                           # Compiled JavaScript (generated by npm run build)
├── CLAUDE.md                       # Search rules and profile for personalized filtering
└── package.json
```

---

## Prerequisites

- **Node.js 18+** — [Download here](https://nodejs.org/)
- **Claude Code** (to use as an MCP) — [Install here](https://claude.ai/code) *(optional — you can also run standalone scripts)*

---

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/career-jobs-mcp.git
cd career-jobs-mcp

# 2. Install dependencies
npm install
# Note: Puppeteer downloads Chromium (~170 MB) during install.
# To skip Chromium (if you only use API-based scrapers): PUPPETEER_SKIP_DOWNLOAD=1 npm install

# 3. Build the TypeScript source
npm run build

# 4. (Optional) Copy environment config
cp .env.example .env
```

---

## Usage

### Option A — Search From Your Résumé

Point the search at a résumé file and it does the rest: it reads the résumé, works out your
skills, years of experience, role families and seniority band, and returns a ranked table of
direct apply links.

```bash
# Résumé in → job links out (last 3 days)
node find-jobs-for-resume.mjs --resume ./resume.pdf

# 24-hour window
node find-jobs-for-resume.mjs --resume ./resume.docx --today

# 7-day window, top 50 results
node find-jobs-for-resume.mjs --resume ./resume.txt --week --limit 50

# See what was read out of the résumé, without running a search
node find-jobs-for-resume.mjs --resume ./resume.pdf --profile-only

# Machine-readable output
node find-jobs-for-resume.mjs --resume ./resume.pdf --json > jobs.json
```

Accepted formats: `.pdf`, `.docx`, `.txt`, `.md`, `.html`. (Scanned/image-only PDFs have no
text layer — paste the text instead.)

| Flag | Effect |
|------|--------|
| `--resume <path>` | Résumé file. Required. |
| `--today` / `--week` / `--days <n>` | Freshness window. Default 3 days. |
| `--limit <n>` | Cap the number of results. |
| `--years <n>` | Override the years of experience read from the résumé. |
| `--country <code>` | Override the country restriction (`US`, `CA`, `ANY`, …). |
| `--remote-only` | Remote postings only. |
| `--profile-only` | Print the parsed profile and exit. |
| `--json` | Emit JSON instead of the markdown table. |

**What gets derived from the résumé**

| Derived | How |
|---------|-----|
| Skills + weights | Matched against a taxonomy; tier sets the weight (language/primary framework 10 → tooling 3). |
| Years of experience | An explicit claim ("5 years of experience") if present, else the span of the dates in the experience section. Education dates are ignored. |
| Seniority band | From the years, plus any seniority in your own titles. 5 yrs → Entry…Senior; Lead/Staff/Principal are filtered out. |
| Role families | From the job titles you have **held**, not from tooling you have listed. A Java developer who lists Docker and Terraform does not get shown SRE roles. |
| Board search terms | Your own titles with seniority words stripped, then your strongest skill, then a per-family default. |
| Country | The contact block at the top of the résumé. Offshore offices in your history don't relocate the search. |

Run `--profile-only` first on a new résumé: if the years or role families come out wrong,
every result is wrong the same way, and `--years` / `--country` are how you correct it.

### Option B — Run the Fixed-Profile Scripts

These use the profile written into `CLAUDE.md` rather than a résumé file:

```bash
# Search all 600+ companies for Java / Full Stack / Software Engineer roles (last 3 days)
node find-java-24h.mjs

# Same search but 7-day window
node find-java-24h.mjs --week

# Only jobs from the last 24 hours
node find-java-24h.mjs --today

# Broader search (Java + Full Stack, month window)
node run-search.mjs

# Health-check all companies and remove broken career site URLs
node probe-registry.mjs

# Health-check only — report issues but make no changes
node probe-registry.mjs --dry-run
```

### Export Results to Excel and the Job Quest web page

`export-jobs-xlsx.mjs` runs the same search and filters as `find-java-24h.mjs` (or, with
`--resume`, the résumé pipeline) and writes the results to a spreadsheet, a web page, or both.

**The spreadsheet** (`job-results.xlsx` by default):
- Column A is a real **Applied?** checkbox. Click it to tick a job; the row greys out and is struck through.
- One row below the last job, a live total reads **"Total jobs applied: X of N"**.
- Each row has a clickable **Apply** link. With `--resume` there is also a **JD Match %** column.
- The checkboxes are clickable in Excel 365. Older Excel, LibreOffice and Google Sheets show
  `TRUE`/`FALSE` instead; type `TRUE` to mark a job, and the total still counts it.

**The Job Quest Board page** (`templates/job-quest.html`) shows the same jobs as a web page:
- Today's mission banner, a daily goal ring, an application streak, and milestone badges.
- "Top picks for you": your best JD matches you haven't applied to yet.
- A JD match meter on every job (for example "82%, 9 of 11 skills"), plus search and filters.
- 20 jobs per page, with page numbers for Company career sites and Job boards separately.
- An Applied checkbox on every job, and a running total.

On claude.ai your ticks, streak and goal save privately to your account and carry over to the
next day's page. Opened from disk, they are saved in that browser.

**Run a new search from the board.** The page has **Today**, **3 days**, **Week** and **Month**
buttons that call this project's `searchJobsForResume` MCP tool with your résumé and replace the
list with the fresh results. They work only when the published board is opened in the **Claude
desktop app** with the `career-jobs` server added to its `claude_desktop_config.json`
(Settings → Developer → Edit Config; on the Microsoft Store install, the file is under
`%LOCALAPPDATA%\Claude-Data\`), with the cache path set, because the app starts the server
from `C:\Windows\System32`:

```json
"mcpServers": {
  "career-jobs": {
    "command": "node",
    "args": ["C:/path/to/career-jobs-mcp/dist/index.js"],
    "env": { "CACHE_DB_PATH": "C:/path/to/career-jobs-mcp/data/cache.db" }
  }
}
```

The buttons need this because a web page can't start a program on your computer by
itself. In a browser, VS Code, or the local HTML file the buttons stay greyed out. New results
show until you reload; they don't rewrite the spreadsheet or the published page. A first search
can take longer than Claude waits for a reply (about 2 minutes); it keeps running, so pressing
the button again a minute later is fast.

```bash
# Daily: résumé-matched, last 24 hours, spreadsheet AND web page in one run.
# The page is then published to the Job Quest Board automatically.
node export-jobs-xlsx.mjs --resume "C:\path\to\resume.docx" --today --out "C:\Users\me\Desktop\jobs.xlsx" --page "C:\Users\me\Desktop\job-quest.html"

# Same, but don't publish (publish later with: node publish-job-page.mjs <page>)
node export-jobs-xlsx.mjs --resume ./resume.pdf --today --page job-quest.html --no-publish

# Spreadsheet only: last 3 days to job-results.xlsx (default)
node export-jobs-xlsx.mjs

# Window: --today (24 hours) | --week (7 days) | --month (30 days) | --days <n> | default 3 days
node export-jobs-xlsx.mjs --week

# Daily run plus a standalone copy of the page to open from disk
node export-jobs-xlsx.mjs --resume ./resume.pdf --today --out jobs.xlsx --page job-quest.html --local-page job-quest-local.html

# Write the spreadsheet to a custom path
node export-jobs-xlsx.mjs --out "C:\Users\me\Desktop\jobs.xlsx"

# Match against a résumé instead of the CLAUDE.md profile (adds JD Match %)
node export-jobs-xlsx.mjs --resume ./resume.pdf --week

# Drop weak fits (jobs whose description could not be scored are kept)
node export-jobs-xlsx.mjs --resume ./resume.pdf --min-jd-match 50

# Web page only, to open in a browser
node export-jobs-xlsx.mjs --resume ./resume.pdf --html --out job-results.html
```

| Flag | What it does |
|---|---|
| `--resume <path>` | Match against this résumé (`.pdf`, `.docx`, `.txt`, `.md`, `.html`) and add JD Match % |
| `--today` / `--week` / `--month` | 24-hour, 7-day or 30-day window (default: 3 days) |
| `--days <n>` | Any window from 1 to 30 days |
| `--out <path>` | Where to write the spreadsheet (or the page, with `--html` / `--artifact`) |
| `--page <path>` | **Also** write the Job Quest page in the same run, then publish it to the Job Quest Board |
| `--no-publish` | With `--page`: write the page but don't publish it |
| `--publish-url <url>` | With `--page`: publish to a different artifact (default: `$JOB_QUEST_URL`, else the Job Quest Board) |
| `--local-page <path>` | With `--page`: **also** write a standalone copy of the page to open from disk |
| `--html` | Write **only** the page, as a standalone file to open in a browser |
| `--artifact` | Write **only** the page, publish-ready (what `--page` writes) |
| `--min-jd-match <n>` | Drop scored jobs below n% JD match |

**How the automatic publish works.** A script can't publish to claude.ai by itself; only Claude
Code's Artifact tool can. So after a `--page` run, `publish-job-page.mjs` starts a short
unattended Claude Code session (`claude -p`, limited to the Artifact and Read tools) that
publishes the page to the same link. It takes about 20 seconds and uses your Claude plan.
- It needs a recent Claude Code. It uses `$CLAUDE_BIN` if set, then the newest copy bundled
  with the VS Code extension, then `claude` on your PATH. The npm-installed 2.1.132 did not
  have the Artifact tool; the extension's 2.1.322 does. To use the PATH copy, update it with
  `npm install -g @anthropic-ai/claude-code`.
- A failed publish never fails the export. The spreadsheet and page are still written, and the
  output prints the retry command: `node publish-job-page.mjs <page.html>`.

**Example output:**

```
CLAUDE.md rules: Resume-match ≥60% | last 3 days | Junior–Senior | US | No clearance
Search: [Java, Full Stack, Software Engineer] in parallel | 574 companies | 12 batches

Found 271 jobs (last 3 days | Junior–Senior | US | No clearance | ≥60% resume match):

| # | Title                                      | Company         | Location     | Posted | Score | Apply  |
|---|--------------------------------------------|-----------------|--------------|--------|-------|--------|
| 1 | Senior Software Engineer - Full Stack      | U.S. Bancorp    | Irving, TX   | May 18 | 12    | [Apply]|
| 2 | Senior Software Engineer – Java            | U.S. Bancorp    | Irving, TX   | May 18 | 10    | [Apply]|
| 3 | Java Software Developer (Mid-Senior Level) | Interactive Brokers | Greenwich, CT | May 15 | 10 | [Apply]|
...
```

### Refresh every output from any button

A `--resume … --page …` run remembers where it wrote (sheet, page, local page, board) in
`job-quest-outputs.json` (git-ignored). After that, picking a window anywhere reruns that same
export for the new window and **updates all of them**: the Excel sheet, the page files and the
published Job Quest Board.

| Where you click | How it runs |
|---|---|
| **Today / 3 days / Week / Month** on the board in the Claude desktop app | results appear on the page at once (`searchJobsForResume`), then the `refreshJobQuest` MCP tool updates the sheet, the files and the board in the background |
| The same buttons on the board in a browser, or a local page | a `jobquest://refresh?days=N` link: a console window shows progress (needs the one-time `node install-auto-apply.mjs`) |
| **↻ Today / 3 days / Week / Month** links under the jobs in the Excel sheet | same link |
| A terminal | `node refresh-job-quest.mjs --days 7`, or the full `export-jobs-xlsx.mjs` command |

Ticked **Applied?** boxes in the sheet are kept across refreshes (matched by apply URL). If the
sheet is open in Excel, Excel is asked to save it, close it, and reopen the new version. One
refresh runs at a time: clicking another window while one runs queues it, and the last one
clicked wins.

```bash
node refresh-job-quest.mjs --days 7           # 1 | 3 | 7 | 30, progress in this console
node refresh-job-quest.mjs --days 3 --detach  # in the background, log in data/refresh.log
node refresh-job-quest.mjs --status           # saved outputs, and whether a refresh is running
```

| Flag | Effect |
|------|--------|
| `--days <n>` | Window: 1, 3, 7 or 30 days. Required unless `--status`. |
| `--detach` | Start in the background and return at once (what the MCP tool does). |
| `--status` | Print the saved outputs and any running refresh. |

### Auto Apply (Greenhouse jobs)

Fills a Greenhouse job application from your résumé in a **visible** Chrome window: first and
last name, email, phone, country, city, **every job you have held** (company, title, start and
end month/year, "current role"), **education** (school, degree, discipline), LinkedIn, and the
résumé file itself. **It never presses Submit.** You review the form, answer what is left, and
submit it yourself.

Greenhouse was picked first because it is the most common apply host in the cache (~20k jobs
on `job-boards.greenhouse.io` / `boards.greenhouse.io`) and one form layout covers every board.

**Works from anywhere** after a one-time setup on your PC:

```bash
node install-auto-apply.mjs --resume "C:\path\to\resume.docx"
```

This registers a `jobquest://` link type for your Windows user (no admin needed) and remembers
which résumé to use. Then an **Auto apply** link appears on every Greenhouse job in:

| Where | How it runs |
|---|---|
| The Excel sheet (`export-jobs-xlsx.mjs`) | **Auto Apply** column → `jobquest://` link |
| A local page (`--html`) opened in a browser | **Auto apply** button → `jobquest://` link (the browser asks once to open Node.js) |
| The Job Quest Board in a browser | same link |
| The Job Quest Board in the Claude desktop app | the `autoApplyJob` MCP tool (reports what it filled on the page); falls back to the link if the tool isn't connected |

A link carries only the job URL. The résumé path stays in `apply-profile.json` on your PC, so a
link can't choose a file to upload, and it only accepts Greenhouse jobs. Each click opens a
console window that lists what was filled and what still needs you. It closes once you close Chrome.

```bash
# Fill one application (waits until you close the Chrome window)
node auto-apply.mjs --resume "C:\path\to\resume.docx" https://job-boards.greenhouse.io/boxinc/jobs/8328785

# Show what would be filled, without opening a browser
node auto-apply.mjs --resume "C:\path\to\resume.docx" --show-data
```

| Flag | Effect |
|------|--------|
| `--resume <path>` | Résumé to read and attach. Required. |
| `<url>` | A Greenhouse job URL (`job-boards.greenhouse.io/<board>/jobs/<id>`, `boards.greenhouse.io/…`, or an `/embed/job_app` link). |
| `--show-data` | Print the parsed applicant data (contact, jobs, education) and exit. |
| `--link <jobquest://…>` | Fill from an apply link: job URL from the link, résumé from `apply-profile.json`. |
| `--setup` | Answer LinkedIn, work authorization, sponsorship, pronouns and EEO questions once (interactive). |
| `--set key=value` | Save one answer without prompts (repeatable), e.g. `--set sponsorship=no`. |

Link clicks run `jobquest-link.mjs`, which hands apply links to `auto-apply.mjs` and refresh
links to `refresh-job-quest.mjs`. It accepts only Greenhouse jobs and the four refresh windows.

`install-auto-apply.mjs` flags: `--resume <path>` (register and remember the résumé),
`--status` (show the registered command and résumé), `--uninstall` (remove the link type).
Re-run it after moving this folder or changing Node; the registered command holds both paths.

**Answers a résumé can't give: set them once.**

```bash
node auto-apply.mjs --setup                                   # asks each question in the terminal
node auto-apply.mjs --set sponsorship=no --set workAuthorized=yes   # or set answers directly
```

`--setup` asks for your LinkedIn URL and the questions almost every form asks: work
authorization, sponsorship (`no` / `now` / `future`), pronouns, and the voluntary EEO questions
(gender, Hispanic/Latino, race, veteran, disability, LGBTQ+), each of which also accepts
`decline`. Answers are saved under `standard` in `apply-profile.json` (git-ignored, on your PC
only) and used on every form. They're matched by the question's wording, not its field id,
so they work on the standard EEO section, on demographic surveys and on boards that ask them as
custom questions. Options are matched by meaning ("Female" / "Woman", "Decline To Self Identify" /
"I don't wish to answer"). If no option clearly fits (an "Asian" answer against a list of
East / South / Southeast Asian), the field is left for you. Use `raceDetail` for that.

For anything else, add `answers[]` (see `apply-profile.example.json`): each is used when a
question's label *contains* its `question` text, and it wins over `standard`. Consent boxes and
job-specific questions are never filled; they're listed as **still needs you**, along with a
reminder to run `--setup` when a missing one-time answer was the reason.

Chrome keeps its own profile in `data/apply-chrome-profile/`, so cookie banners or a
Greenhouse sign-in are remembered between runs.

### Option C — Use as an MCP Server with Claude

#### Step 1 — Register with Claude Code

```bash
claude mcp add career-jobs node "/absolute/path/to/career-jobs-mcp/dist/index.js"
```

Or add manually to your Claude Code MCP settings file:

```json
{
  "mcpServers": {
    "career-jobs": {
      "command": "node",
      "args": ["/absolute/path/to/career-jobs-mcp/dist/index.js"]
    }
  }
}
```

#### Step 2 — Ask Claude to search

Once registered, you can ask Claude naturally:

- *"Here's my resume — find me jobs posted in the last 3 days"* (attach or point at the file)
- *"Search for Java Full Stack jobs posted in the last 3 days, US only"*
- *"Find Software Engineer roles at Stripe, Airbnb, and Netflix"*
- *"Add Walmart's career site and search for backend roles"*
- *"List all companies in the registry"*

---

## MCP Tools Reference

The server exposes 7 tools that Claude (or any MCP client) can call:

### `searchJobsForResume`
The main entry point: résumé in, ranked apply links out. Every filter is derived from the
résumé, so no configuration is needed for a new candidate.
```json
{
  "resumePath": "C:/Users/me/Documents/resume.pdf",
  "postedWithinDays": 3,
  "limit": 50
}
```
Or paste the text directly with `resumeText`. Returns a markdown table of
`# | Title | Company | Location | Posted | Match | Apply URL` by default; pass
`"format": "json"` for structured matches.

Optional overrides when the résumé is read wrong: `yearsOfExperience`, `country`
(`"US"` / `"CA"` / `"ANY"`), `matchThreshold`, `extraSearchTerms`, `companies`, `remoteOnly`.

### `parseResume`
Show what the searcher read out of a résumé — skills and weights, years of experience,
role families, seniority band, board search terms — without spending a scrape on it.
```json
{ "resumePath": "C:/Users/me/Documents/resume.pdf" }
```

### `autoApplyJob`
Open a Greenhouse application in a visible Chrome window and fill it from the résumé (contact
details, all jobs, education, LinkedIn, résumé upload). **Never submits.** Returns the fields
filled, any it could not fill, and the required questions still left for you.
```json
{ "applyUrl": "https://job-boards.greenhouse.io/boxinc/jobs/8328785", "resumePath": "C:/Users/me/Documents/resume.docx" }
```

### `refreshJobQuest`
Rerun the last daily export (saved by `export-jobs-xlsx.mjs --resume … --page …`) for a new
window, in the background, updating the Excel sheet, the page files and the published board.
Returns at once with `status: "started"` or `"queued"`.
```json
{ "postedWithinDays": 7 }
```

### `searchCompanyJobs`
Search a single company's career site.
```json
{
  "companyName": "Stripe",
  "jobTitle": "Java",
  "location": "USA",
  "level": "senior",
  "postedSince": "week",
  "remoteOnly": false,
  "forceRefresh": false
}
```

### `searchMultipleCompanies`
Search many companies in one call (batched + concurrent).
```json
{
  "companyList": ["Stripe", "Airbnb", "Netflix", "Roblox"],
  "jobTitle": "Full Stack",
  "postedSince": "week"
}
```

### `getJobDetails`
Get the full job description, requirements, and apply URL for a cached job.
```json
{ "jobId": "abc123", "companyName": "Stripe" }
```

### `listCompanies`
Returns all 600+ supported companies with their platform, career URL, and last scraped timestamp.

### `addCompanyCareerSite`
Register a new company so it's searchable going forward.
```json
{
  "companyName": "Block",
  "careerPageUrl": "https://boards.greenhouse.io/block"
}
```
Platform is auto-detected from the URL. For Workday sites, pass `platformIdentifier: "tenant|wdN|siteName"`.

---

## Supported ATS Platforms

| Platform | How It Works | Example Companies |
|---------|-------------|------------------|
| **Greenhouse** | Public JSON API (`boards-api.greenhouse.io`) | Stripe, Airbnb, Reddit, Anthropic, Coinbase, DoorDash |
| **Lever** | Public JSON API (`api.lever.co`) | Netflix, Brex, Quora, Mixpanel |
| **Ashby** | Public JSON API (`api.ashbyhq.com`) | Linear, Ramp, PostHog, Replicate |
| **SmartRecruiters** | Public JSON API (`api.smartrecruiters.com`) | Visa, Bosch |
| **Workday** | Session-based API with CSRF token handling | JPMorgan, Goldman Sachs, Adobe, Salesforce, U.S. Bancorp |
| **Custom (Puppeteer)** | Headless Chrome + CSS selectors | Amazon, Apple, Google, Tesla |

> **Why Workday is special:** Most Workday endpoints require a CSRF session token. This scraper prefetches the careers page to harvest cookies and the `CALYPSO_CSRF_TOKEN`, then retries the API POST — so it works on CSRF-protected Workday tenants like JPMorgan and Goldman Sachs.

---

## Personalizing for Your Profile

**The simplest way is to pass your résumé** — `searchJobsForResume` / `find-jobs-for-resume.mjs`
derive the target titles, skill weights, seniority ceiling and location rule from the document
itself, so there is nothing to edit. Use the sections below only for the fixed-profile scripts
(`find-java-24h.mjs`, `run-search.mjs`).

Edit `CLAUDE.md` at the root of the project to set:

- **Your target role titles** (Java Developer, Full Stack, Software Engineer, etc.)
- **Skill keyword weights** for resume-match scoring
- **Experience level ceiling** (default: Senior = ~5 years max)
- **Date window** (default: 3 days)
- **Location preference** (default: US only)
- **Exclusion rules** (no clearance, no Principal/Staff/Lead/Director titles)

The scoring engine applies your keyword weights to every job title and only returns matches above your threshold (default: ≥5 points = 60% match).

---

## Adding More Companies

### Known ATS platforms — just pass the URL:

```bash
# Greenhouse (URL contains boards.greenhouse.io)
addCompanyCareerSite({ companyName: "Rippling", careerPageUrl: "https://boards.greenhouse.io/rippling" })

# Lever (URL contains jobs.lever.co)
addCompanyCareerSite({ companyName: "Scale AI", careerPageUrl: "https://jobs.lever.co/scaleai" })

# Ashby (URL contains ashbyhq.com)
addCompanyCareerSite({ companyName: "Anrok", careerPageUrl: "https://jobs.ashbyhq.com/anrok" })
```

### Workday sites — include the tenant identifier:

```bash
addCompanyCareerSite({
  companyName: "Walmart",
  careerPageUrl: "https://walmart.wd5.myworkdayjobs.com/WalmartExternal",
  platform: "workday",
  platformIdentifier: "walmart|wd5|WalmartExternal"
})
```

### Custom sites — provide CSS selectors:

```bash
addCompanyCareerSite({
  companyName: "Acme Corp",
  careerPageUrl: "https://acme.com/careers",
  platform: "custom",
  requiresJavaScript: true,
  customSelectors: {
    jobListSelector: ".job-card",
    jobTitleSelector: ".job-title",
    jobLocationSelector: ".job-location",
    jobLinkSelector: "a.apply"
  }
})
```

---

## Environment Variables

Create a `.env` file in the project root (copy from `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `CACHE_DB_PATH` | `./data/cache.db` | Where the SQLite cache is stored |
| `CACHE_TTL_HOURS` | `24` | Hours before cached results expire |
| `SCRAPE_TIMEOUT_MS` | `30000` | Per-request timeout in milliseconds |
| `RATE_LIMIT_PER_HOST_MS` | `2000` | Minimum delay between requests to the same host |
| `MAX_RETRIES` | `3` | Number of retry attempts on failure |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `PUPPETEER_HEADLESS` | `true` | Set to `false` to watch the browser during scraping |

---

## Development

```bash
npm run dev      # Watch mode — recompiles TypeScript on every save
npm run build    # One-shot compile to dist/
npm start        # Run the compiled MCP server
npm run clean    # Delete dist/ folder
```

To test a scraper without Claude, run a standalone script and watch stderr for per-company progress:

```bash
node find-java-24h.mjs 2>&1 | head -50
```

---

## Caveats & Known Limitations

- **Puppeteer sites (Apple, Google, Amazon, Tesla)** use a headless Chrome browser and are slower and more fragile — DOM structures change frequently. API-based scrapers (Greenhouse, Lever, Ashby, Workday) are far more reliable.
- **Workday `postedSince: 'today'` is sparse** — most Workday tenants batch-refresh job postings, not in real time. Use `week` for better coverage.
- **Greenhouse `postedDate` = `updated_at`**, not the original post date. A minor edit to an old listing resets this field, so Greenhouse dates can appear more recent than they are.
- **Lever `postedDate` = `createdAt`** and **Ashby = `publishedAt`** — both are accurate.
- **Respect robots.txt and Terms of Service.** This tool uses a 2-second per-host rate limit and a descriptive User-Agent. Do not disable rate limiting.
- Logs go to **stderr** — stdout is reserved for the MCP JSON-RPC protocol channel.

---

## Tech Stack

- **Language:** TypeScript (Node.js 18+)
- **MCP SDK:** `@modelcontextprotocol/sdk`
- **HTTP Client:** Axios
- **HTML Parsing:** Cheerio
- **Headless Browser:** Puppeteer (Chromium)
- **Cache:** better-sqlite3
- **Schema Validation:** Zod
- **Build:** TypeScript compiler (`tsc`)

---

## License

MIT — free to use, modify, and distribute.

---

*Built to automate the job hunt. If this helped you, consider starring the repo.*
