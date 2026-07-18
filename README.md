# Career Jobs MCP

> An AI-powered, **resume-driven** job search engine that scrapes **820+ company career sites directly** plus **6 major job boards** (LinkedIn, SimplyHired, BuiltIn, RemoteOK, Remotive, We Work Remotely). Upload your resume once — every search is then matched against *your* skills, experience level, and target roles. Built as a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server so it works natively inside Claude AI.

---

## What Is This?

Most job search tools show you the same listings from a single aggregator, often outdated or missing jobs entirely. This tool goes **directly to each company's own career portal** — and additionally pulls from six job boards — then filters everything against a profile built from **your resume**.

You tell Claude: *"Here's my resume — find me matching jobs posted in the last 3 days, US only"* — and it searches across 820+ companies and the job boards simultaneously.

```
You ──► Claude AI ──► Career Jobs MCP ──► Greenhouse API  ──► Stripe, Airbnb, Reddit...
                                      ──► Lever API       ──► Netflix, Brex...
                                      ──► Workday API     ──► JPMorgan, Goldman Sachs...
                                      ──► Ashby API       ──► Linear, Ramp...
                                      ──► Job boards      ──► LinkedIn, SimplyHired, BuiltIn...
                                      ──► 820+ more companies
```

---

## How It Works

1. **Upload your resume** (once) — the `uploadResume` tool parses it into a profile: skills with weights, years of experience, target roles, and search terms
2. **You ask Claude** to search for jobs
3. **Claude calls this MCP server** with your search criteria
4. **The server fans out** across 820+ company career portals + 6 job boards concurrently
5. **Each platform scraper** hits the official ATS (Applicant Tracking System) JSON API — no browser needed for most companies
6. **Results are filtered** by date, location, experience level, clearance requirements, and **≥60% match against your resume profile**
7. **A ranked table** is returned directly in your Claude conversation — every row has a direct apply link

---

## Key Features

| Feature | Details |
|---------|---------|
| **Resume-driven matching** | Upload your resume once — skills, weights, experience level, and search terms are derived automatically |
| **820+ companies** | Tech, finance, healthcare, e-commerce, defense, and more |
| **6 job boards** | LinkedIn, SimplyHired, BuiltIn.com, RemoteOK, Remotive, We Work Remotely — direct apply links, real employer names |
| **6 ATS platforms** | Greenhouse, Lever, Ashby, SmartRecruiters, Workday, Custom (Puppeteer) |
| **Smart filtering** | Date window, US-only, experience level, no clearance, resume-match scoring |
| **Adaptive seniority** | ≤5 yrs excludes Principal/Staff/Lead+; 6–9 yrs allows Staff/Lead; 10+ only excludes executive titles |
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
│   ├── server.ts                   # Registers all 7 MCP tools with Claude
│   ├── types.ts                    # TypeScript types: JobListing, CompanyConfig, Filters
│   ├── profile/
│   │   └── profile-manager.ts      # Resume parser + active profile (data/profile.json)
│   ├── scrapers/
│   │   ├── base-scraper.ts         # Shared scraper logic (filtering, level detection)
│   │   ├── orchestrator.ts         # Coordinates cache + scrape per company
│   │   ├── company-registry.ts     # Master list of 820+ companies with ATS config
│   │   └── platforms/
│   │       ├── greenhouse.ts       # Greenhouse JSON API scraper
│   │       ├── lever.ts            # Lever JSON API scraper
│   │       ├── ashby.ts            # Ashby JSON API scraper
│   │       ├── smartrecruiters.ts  # SmartRecruiters JSON API scraper
│   │       ├── workday.ts          # Workday scraper (CSRF-aware session handling)
│   │       ├── linkedin.ts         # LinkedIn guest-search job board scraper
│   │       ├── simplyhired.ts      # SimplyHired job board scraper
│   │       ├── builtin.ts          # BuiltIn.com job board scraper
│   │       ├── remoteok.ts         # RemoteOK job board scraper
│   │       ├── remotive.ts         # Remotive job board scraper
│   │       ├── weworkremotely.ts   # We Work Remotely RSS scraper
│   │       └── custom-puppeteer.ts # Headless Chrome fallback for JS-rendered sites
│   ├── cache/
│   │   └── cache-manager.ts        # SQLite cache with 24-hour TTL
│   └── utils/
│       ├── logger.ts               # stderr-only logger (stdout reserved for JSON-RPC)
│       ├── rate-limiter.ts         # Per-host request throttle
│       └── retry.ts                # Exponential backoff with configurable retries
├── tools/                          # One file per MCP tool (search, list, add, etc.)
├── upload-resume.mjs               # Standalone: set the profile from a resume file (.pdf/.docx/.txt/.md)
├── find-java-24h.mjs               # Standalone: search all 820+ companies + job boards for matching roles
├── export-jobs-xlsx.mjs            # Standalone: same search, exported to an Excel sheet with an "Applied?" checkbox
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

### Option A — Run Standalone Scripts (No Claude Needed)

Everything works from the terminal — including resume upload. Full flow:

```bash
# 1. Set your profile from your resume file (.pdf, .docx, .txt, or .md)
node upload-resume.mjs "C:\path\to\my-resume.pdf"

# 2. Get results as an Excel sheet (job-results.xlsx, with Applied? checkboxes)
node export-jobs-xlsx.mjs

#    ...or as a table in the terminal
node find-java-24h.mjs
```

Profile management:

```bash
node upload-resume.mjs --show     # print the active profile (skills, weights, roles)
node upload-resume.mjs --reset    # go back to the built-in default profile
```

All script options:

```bash
# Search all 820+ companies + 6 job boards for roles matching the active profile (last 3 days)
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

### Export Results to Excel (with an "Applied?" checkbox)

`export-jobs-xlsx.mjs` runs the exact same search + resume-match filters as `find-java-24h.mjs`,
but writes the results to `job-results.xlsx` instead of printing a table. Each row has a clickable
**Apply** hyperlink and an **Applied?** column (☐ / ☑) so you can track which jobs you've applied to —
ticking a row (☑) greys it out and strikes it through via conditional formatting.

```bash
# Export the last 3 days to job-results.xlsx (default)
node export-jobs-xlsx.mjs

# 24-hour window
node export-jobs-xlsx.mjs --today

# 7-day window
node export-jobs-xlsx.mjs --week

# Write to a custom path
node export-jobs-xlsx.mjs --out "C:\Users\me\Desktop\jobs.xlsx"
```

The `Applied?` cell is a data-validation dropdown (☐ ↔ ☑) that works in every Excel version and
Google Sheets. For a one-click native checkbox in Excel 365 or Google Sheets, select the column and
use **Insert ▸ Checkbox** after opening the file.

**Example output:**

```
CLAUDE.md rules: Resume-match ≥60% | last 3 days | ≤5 yrs | US | No clearance
Profile: Java / Full Stack Developer — java, spring boot, spring, microservices, full stack, angular (source: resume-upload)
Fetch-once: 827 companies | 24 concurrent | window=week

Found 271 jobs (last 3 days | ≤5 yrs | US | No clearance | ≥60% resume match):

| # | Title                                      | Company                  | Location     | Posted | Score | Apply  |
|---|--------------------------------------------|--------------------------|--------------|--------|-------|--------|
| 1 | Java Full Stack Developer with Angular     | PETADATA (via LinkedIn)  | Austin, TX   | Jul 15 | 22    | [Apply]|
| 2 | Senior Software Engineer - Full Stack      | U.S. Bancorp             | Irving, TX   | Jul 16 | 12    | [Apply]|
| 3 | Java Software Developer (Mid-Senior Level) | Interactive Brokers      | Greenwich, CT| Jul 15 | 10    | [Apply]|
...
```

### Option B — Use as an MCP Server with Claude

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

#### Step 2 — Upload your resume (once)

Paste your resume text into the chat and say:

- *"Here's my resume — upload it so job searches match my profile"*

Claude calls the `uploadResume` tool, which builds your profile (skills → scoring weights,
years of experience → seniority ceiling, target roles → search terms) and saves it to
`data/profile.json` (gitignored — never committed). For a PDF resume, just attach it —
Claude extracts the text and passes it to the tool. To check what's active, ask
*"show my job search profile"* (`getProfile`); to start over, *"reset my job profile"*.

If you skip this step, a built-in default profile (Java / Full Stack, 5 yrs) is used.

> **Note:** the standalone terminal scripts read the profile at startup — re-run them after
> uploading a new resume.

#### Step 3 — Ask Claude to search

Once registered, you can ask Claude naturally:

- *"Find jobs matching my resume posted in the last 3 days, US only"*
- *"Find Software Engineer roles at Stripe, Airbnb, and Netflix"*
- *"Search LinkedIn and SimplyHired for jobs matching my profile"*
- *"Add Walmart's career site and search for backend roles"*
- *"List all companies in the registry"*

---

## MCP Tools Reference

The server exposes 7 tools that Claude (or any MCP client) can call:

### `uploadResume`
Build the candidate profile every search matches against. Pass plain resume text (or a `.txt`/`.md` file path); pass `reset: true` to restore the built-in default.
```json
{ "resumeText": "Full Stack Developer with 5+ years... Java, Spring Boot, Angular, AWS..." }
```
Returns the parsed profile: headline, years of experience, skill weights (10/7/5/3 tiers), target roles, job-board search terms, and exclusions.

### `getProfile`
Show the active profile (from `data/profile.json`, or the built-in default when no resume has been uploaded).

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
Returns all 820+ supported companies with their platform, career URL, and last scraped timestamp.

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
| **Job boards** | LinkedIn guest search, SimplyHired embedded JSON, BuiltIn HTML cards, RemoteOK/Remotive JSON APIs, WWR RSS | Cross-company — results show `"{Employer} (via {Board})"` with direct apply links |

> **Why Workday is special:** Most Workday endpoints require a CSRF session token. This scraper prefetches the careers page to harvest cookies and the `CALYPSO_CSRF_TOKEN`, then retries the API POST — so it works on CSRF-protected Workday tenants like JPMorgan and Goldman Sachs.

> **Why not Indeed / ZipRecruiter / Glassdoor / Monster?** They return HTTP 403 bot-protection walls on every public endpoint, so they cannot be scraped reliably. SimplyHired is Indeed-owned and mirrors much of its inventory.

---

## Personalizing for Your Profile

**Just upload your resume** — no config editing needed. The `uploadResume` tool derives:

- **Skill keyword weights** — detected skills ranked into CORE(10)/HIGH(7)/MID(5)/LOW(3) tiers
- **Experience ceiling** — ≤5 yrs excludes Principal/Staff/Lead+ titles; 6–9 yrs allows Staff/Lead; 10+ only excludes executive titles
- **Target role titles** — inferred from your stack (backend, full stack, frontend, ML, data, mobile…)
- **Job-board search terms** — the top terms the LinkedIn/SimplyHired/BuiltIn/Remotive scrapers query
- **Exclusion rules** — role families outside your profile are rejected; families your resume covers are automatically kept

The profile lives in `data/profile.json` (gitignored). The scoring engine applies your weights to every job title and only returns matches above your threshold (default: ≥5 points = 60% match). Search-wide rules (3-day window, US-only, no clearance) stay in `CLAUDE.md`.

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
