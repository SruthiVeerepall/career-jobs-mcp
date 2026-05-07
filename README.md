# career-jobs-mcp

An independent **Model Context Protocol (MCP) server** that scrapes company career sites directly — no third-party aggregators (no Apify, LinkedIn, Indeed). Claude Code (or any MCP client) can call its tools to search jobs across major tech, finance, and growth-stage companies.

## Features

- **5 MCP tools**: `searchCompanyJobs`, `searchMultipleCompanies`, `getJobDetails`, `listCompanies`, `addCompanyCareerSite`
- **40+ pre-configured companies** across 6 platform types (Greenhouse, Lever, Ashby, SmartRecruiters, Workday, Custom)
- **Smart platform detection** — drop in a URL and it auto-routes to the right scraper
- **Public JSON APIs first** (Greenhouse / Lever / Ashby / SmartRecruiters / Workday all expose them) — Puppeteer only when sites are JS-rendered
- **24-hour SQLite cache** with new/removed-job tracking, configurable TTL
- **Per-host rate limiting**, exponential-backoff retries, 30s timeouts
- **Filters**: title keyword, location, level, department, posted-since (today/week/month), remote-only

## Architecture

```
src/
├── index.ts                            # Entry point
├── server.ts                           # MCP server + tool registration
├── types.ts                            # JobListing, CompanyConfig, Filters
├── scrapers/
│   ├── base-scraper.ts                 # Abstract base + filter/level helpers
│   ├── orchestrator.ts                 # Cache-aware scrape coordination
│   ├── company-registry.ts             # Pre-configured companies + add/lookup
│   └── platforms/
│       ├── greenhouse.ts               # boards-api.greenhouse.io
│       ├── lever.ts                    # api.lever.co
│       ├── ashby.ts                    # api.ashbyhq.com
│       ├── smartrecruiters.ts          # api.smartrecruiters.com
│       ├── workday.ts                  # wday/cxs/{tenant}/{site}/jobs
│       └── custom-puppeteer.ts         # Generic Puppeteer/Cheerio fallback
├── cache/cache-manager.ts              # better-sqlite3, 24h TTL
├── utils/
│   ├── logger.ts                       # stderr-only (stdout reserved for JSON-RPC)
│   ├── rate-limiter.ts                 # Per-host throttle
│   └── retry.ts                        # Exp. backoff + timeout
└── tools/                              # One file per MCP tool
```

## Install & Build

```bash
cd career-jobs-mcp
npm install
cp .env.example .env
npm run build
```

> **Note:** `puppeteer` downloads Chromium on install (~170 MB). Set `PUPPETEER_SKIP_DOWNLOAD=1` if you only need the API-based scrapers (Greenhouse, Lever, Ashby, SmartRecruiters, Workday).

## Configure in Claude Code

Add this to your Claude Code MCP settings (or `claude mcp add`):

```json
{
  "mcpServers": {
    "career-jobs": {
      "command": "node",
      "args": ["c:/Users/sruth/Desktop/Angular Practice/career-jobs-mcp/dist/index.js"]
    }
  }
}
```

Or via CLI:
```bash
claude mcp add career-jobs node "c:/Users/sruth/Desktop/Angular Practice/career-jobs-mcp/dist/index.js"
```

## Tool Reference

### `searchCompanyJobs`
```
{ companyName, jobTitle?, location?, level?, department?, postedSince?, remoteOnly?, forceRefresh? }
```
Example: `searchCompanyJobs({ companyName: "Stripe", jobTitle: "Java", location: "USA" })`

### `searchMultipleCompanies`
```
{ companyList[], jobTitle?, location?, level?, department?, postedSince?, remoteOnly? }
```
Example: `searchMultipleCompanies({ companyList: ["Stripe", "Airbnb", "Netflix"], jobTitle: "Backend" })`

### `getJobDetails`
```
{ jobId, companyName }
```
Returns the full cached job (description, requirements, benefits, apply URL). Re-scrapes if missing.

### `listCompanies`
Returns every supported company with `{ name, slug, platform, careerUrl, lastScrapedAt }`.

### `addCompanyCareerSite`
```
{ companyName, careerPageUrl, platform?, platformIdentifier?, requiresJavaScript?, customSelectors? }
```
Auto-detects platform from URL. For Workday, pass `platformIdentifier` as `"tenant|wdN|site"` if auto-detection fails.

## Pre-configured Companies (40+)

| Platform | Companies |
|----------|-----------|
| Greenhouse | Stripe, Airbnb, Coinbase, Discord, GitLab, Reddit, Twilio, Pinterest, DoorDash, Instacart, Anthropic, OpenAI, Robinhood, Plaid, Figma, Snowflake, Databricks |
| Lever | Netflix, Quora, Brex, Mixpanel |
| Ashby | Linear, PostHog, Replicate, Ramp |
| SmartRecruiters | Visa, Bosch |
| Workday | Salesforce, Adobe, JPMorgan Chase, Citi, Goldman Sachs, Vanguard, NVIDIA |
| Custom (Puppeteer) | Apple, Google, Microsoft, Amazon, Meta, Tesla, Uber, Shopify |

## Adding a New Company

If a company uses a known platform, just call `addCompanyCareerSite` and let it auto-detect:
```
addCompanyCareerSite({
  companyName: "Block",
  careerPageUrl: "https://boards.greenhouse.io/block"
})
```

For Workday, pass the explicit identifier:
```
addCompanyCareerSite({
  companyName: "Walmart",
  careerPageUrl: "https://walmart.wd5.myworkdayjobs.com/WalmartExternal",
  platform: "workday",
  platformIdentifier: "walmart|wd5|WalmartExternal"
})
```

For fully bespoke sites, register as `custom` with `customSelectors`:
```
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

## Environment Variables

| Var | Default | Purpose |
|-----|---------|---------|
| `CACHE_DB_PATH` | `./data/cache.db` | SQLite cache location |
| `CACHE_TTL_HOURS` | `24` | How long cached results stay fresh |
| `SCRAPE_TIMEOUT_MS` | `30000` | Per-request timeout |
| `RATE_LIMIT_PER_HOST_MS` | `2000` | Min delay between requests to the same host |
| `MAX_RETRIES` | `3` | Exp-backoff retries on failure |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |
| `PUPPETEER_HEADLESS` | `true` | Set `false` to debug visually |

## Notes & Caveats

- **Custom scrapers (Apple/Google/Microsoft/etc.) require Puppeteer.** These big-tech sites change their DOM frequently — selectors will need maintenance. The Greenhouse/Lever/Ashby/Workday platform scrapers are far more stable because they hit official JSON APIs.
- **Respect `robots.txt` and ToS.** This server uses a 2s/host rate limit by default and a custom `User-Agent`. Don't disable rate limiting on production sites.
- **Workday tenants vary.** The `platformIdentifier` format is `tenant|wdN|site`; the values pre-configured here are best-guess and may need adjusting if a company moves their Workday instance.
- Logs go to **stderr** because stdout is reserved for the MCP JSON-RPC channel.

## Development

```bash
npm run dev       # tsc --watch
npm run build     # one-shot compile
npm start         # run the built server (use this in MCP config)
npm run clean     # remove dist/
```
