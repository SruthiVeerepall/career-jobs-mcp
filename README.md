# Career Jobs MCP

Job search that goes **straight to company career sites** (1,000+ companies on Greenhouse, Lever,
Ashby, Workday, SmartRecruiters and more), plus job boards such as LinkedIn and BuiltIn. It
matches every job to **your résumé**, exports the results to Excel and a web page, and can
**auto-fill Greenhouse applications** for you.

It runs as an [MCP](https://modelcontextprotocol.io/) server inside Claude, or as plain
command-line scripts.

```
You ──► Claude or a script ──► Career Jobs MCP ──► company career sites + job boards
                                               ──► filter, match to résumé, rank
                                               ──► table · Excel sheet · Job Quest Board
```

## Features

| | |
|---|---|
| **Résumé matching** | Reads your résumé (.pdf, .docx, .txt, .md, .html) and works out your skills, years, role types and seniority. Every job gets a **JD Match %**. |
| **Strict filters** | Posted in the last 3 days by default, US only, junior to Senior, and no security clearance or citizenship requirement (checked in the job description). |
| **Company sites first** | Jobs from employers' own sites are listed before job-board copies. |
| **Excel + web page** | Applied? checkboxes, a running total, a daily goal and streak on the Job Quest Board. |
| **Auto apply** | Fills Greenhouse forms in Chrome from your résumé and your saved answers. **It never submits**: you review and press Submit. |
| **One-click refresh** | Today / 3 days / Week / Month buttons update the sheet, the page and the board together. |

---

## Install

Requires **Node.js 18+**. The `jobquest://` links are Windows only; everything else works on any OS.

```bash
git clone <repo-url> career-jobs-mcp
cd career-jobs-mcp
npm install      # also downloads the Chrome used by browser scrapers and auto apply
npm run build
```

## Quick start

```bash
# 1. Check what is read from your résumé
node find-jobs-for-resume.mjs --resume "<path to résumé>" --profile-only

# 2. Search (last 3 days)
node find-jobs-for-resume.mjs --resume "<path to résumé>"

# 3. Daily: Excel sheet + Job Quest page in one run
node export-jobs-xlsx.mjs --resume "<path to résumé>" --today --out jobs.xlsx --page job-quest.html --no-publish

# 4. Auto apply setup (once)
node auto-apply.mjs --setup                              # LinkedIn, work authorization, sponsorship, pronouns, EEO
node install-auto-apply.mjs --resume "<path to résumé>"  # Windows: makes the Auto apply / refresh links clickable
```

---

## Search from a résumé

```bash
node find-jobs-for-resume.mjs --resume <path>                 # last 3 days
node find-jobs-for-resume.mjs --resume <path> --today         # last 24 hours
node find-jobs-for-resume.mjs --resume <path> --week --limit 50
node find-jobs-for-resume.mjs --resume <path> --json > jobs.json
```

| Flag | Effect |
|---|---|
| `--resume <path>` | Résumé file (required). Scanned PDFs can't be read. |
| `--today` / `--week` / `--days <n>` | Window (default 3 days) |
| `--limit <n>` | Maximum results |
| `--years <n>` / `--country <code>` | Override what was read from the résumé (`US`, `CA`, `ANY`…) |
| `--remote-only` | Remote jobs only |
| `--profile-only` | Show the parsed profile and stop |
| `--json` | JSON instead of a table |

Role types come from the **job titles you've held**, not from tools you list, so listing Docker
doesn't get you DevOps jobs. If the years or role types look wrong, fix them with `--years` /
`--country`.

Without a résumé, `node find-java-24h.mjs` (`--today` / `--week`) searches with the default
Java / Full Stack profile described in `CLAUDE.md`.

## Excel sheet and Job Quest Board

```bash
# Sheet only (default job-results.xlsx)
node export-jobs-xlsx.mjs --resume <path>

# Sheet + page, published to your board
node export-jobs-xlsx.mjs --resume <path> --today --out jobs.xlsx --page job-quest.html

# Page only, to open in a browser
node export-jobs-xlsx.mjs --resume <path> --html --out job-quest.html
```

| Flag | Effect |
|---|---|
| `--resume <path>` | Match to this résumé and add **JD Match %** |
| `--today` / `--week` / `--month` / `--days <n>` | Window: 24h, 7, 30 or 1–30 days (default 3) |
| `--out <path>` | Sheet path (or the page path with `--html` / `--artifact`) |
| `--min-jd-match <n>` | Drop jobs below n% match (unscored jobs are kept) |
| `--page <path>` | Also write the Job Quest page, then publish it |
| `--no-publish` | Write the page but don't publish |
| `--publish-url <url>` | Publish to this board (default `$JOB_QUEST_URL`) |
| `--local-page <path>` | Also write a standalone copy of the page to open from disk |
| `--html` / `--artifact` | Write only the page (standalone / publish-ready) |

**The sheet** has an **Applied?** checkbox per job (Excel 365; other apps show TRUE/FALSE), a
total under the last row, **Apply** and **⚡ Auto apply** links, and a row of **↻ Today /
3 days / Week / Month** refresh links.

**The Job Quest Board** shows the same jobs with a daily goal, a streak, top picks by JD match and
Applied ticks. On claude.ai your ticks are saved to your account; opened from disk, they're saved
in that browser.

**Publishing** to claude.ai is done by a short unattended Claude Code session
(`publish-job-page.mjs`), because only Claude can publish an artifact. It needs a recent Claude
Code (the VS Code extension's bundled copy works). A failed publish never stops the export; retry
with `node publish-job-page.mjs <page.html>`. New users: publish your page once from Claude Code
to get your own board link, then set `JOB_QUEST_URL` to it (or keep using `--no-publish`).

## Refresh from any button

A `--resume … --page …` run remembers where it wrote (in the git-ignored
`job-quest-outputs.json`). After that, choosing a window anywhere reruns the same export and
**updates the sheet, the page files and the board**:

| Where | How |
|---|---|
| Board in the Claude desktop app | Results appear instantly, and everything else updates in the background |
| Board in a browser, local page, Excel ↻ links | A `jobquest://refresh` link opens a console window that shows progress |
| Terminal | `node refresh-job-quest.mjs --days 7` (`1`, `3`, `7`, `30`; `--detach`, `--status`) |

Your Applied? ticks in the sheet are kept. If the sheet is open in Excel, it's saved, closed and
reopened for you. Clicking another window during a refresh queues it.

## Auto apply (Greenhouse)

Fills a Greenhouse application in a visible Chrome window: name, email, phone, location, every
job you've held, education, LinkedIn, your résumé file, and the common questions you answered
once. **It never presses Submit.**

```bash
node auto-apply.mjs --setup                          # answer the common questions once
node auto-apply.mjs --set sponsorship=no             # or change one answer
node install-auto-apply.mjs --resume <path>          # Windows: enable the clickable links
node auto-apply.mjs --resume <path> <greenhouse job url>   # fill one form from the terminal
node auto-apply.mjs --resume <path> --show-data      # see what would be filled
```

| Flag | Effect |
|---|---|
| `--resume <path>` | Résumé to read and attach |
| `<url>` | A Greenhouse job link (`job-boards.greenhouse.io/<board>/jobs/<id>`) |
| `--show-data` | Print the parsed contact, jobs and education, then stop |
| `--setup` / `--set key=value` | Save your one-time answers |
| `--link <jobquest://…>` | What a link click runs |

`install-auto-apply.mjs` also takes `--status` and `--uninstall`. Re-run it if you move the
folder or reinstall Node.

- **Where it works:** the ⚡ link in Excel, the Auto apply button on a local page or the board in a
  browser, and the board in the Claude desktop app (asks before opening Chrome).
- **What it fills from setup:** LinkedIn, work authorization, sponsorship (no / now / future),
  pronouns, and the voluntary EEO questions (gender, Hispanic/Latino, race, veteran, disability,
  LGBTQ+), each of which can be "decline". Answers are matched by meaning across different
  wordings; if no option clearly fits, the field is left for you.
- **What it leaves for you:** job-specific questions, consent boxes, citizenship, relocation,
  and a current role's end date. The console lists them under "still needs you".
- **Other repeated questions** ("How did you hear about us?"): add them to `answers` in
  `apply-profile.json`. See `apply-profile.example.json`.
- **Privacy:** your answers stay on your PC in `apply-profile.json` (git-ignored). A link carries
  only the job URL, never a file path.

---

## Use with Claude (MCP)

**Claude Code:**

```bash
claude mcp add career-jobs node "/absolute/path/to/career-jobs-mcp/dist/index.js"
```

**Claude desktop app** (needed for the board's in-app buttons). Add this to
`claude_desktop_config.json`. `CACHE_DB_PATH` is required because the app starts the server
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

Then ask, for example: *"Here's my résumé, find jobs from the last 3 days"*, or *"Find Software
Engineer roles at Stripe and Netflix"*.

### Tools

| Tool | What it does |
|---|---|
| `searchJobsForResume` | Résumé in, ranked apply links out (`resumePath` or `resumeText`, `postedWithinDays`, `limit`, `format`) |
| `parseResume` | Show what was read from a résumé, without searching |
| `autoApplyJob` | Fill a Greenhouse application in Chrome (`applyUrl`, `resumePath`); never submits |
| `refreshJobQuest` | Rerun the daily export for 1, 3, 7 or 30 days and update every output |
| `searchCompanyJobs` | Search one company (`companyName`, `jobTitle`, `postedSince`…) |
| `searchMultipleCompanies` | Search a list of companies at once |
| `getJobDetails` | Full description of a cached job |
| `listCompanies` | All supported companies |
| `addCompanyCareerSite` | Add a company by its careers URL (Workday: `platformIdentifier: "tenant\|wdN\|site"`) |

---

## Maintaining the company list

```bash
node probe-registry.mjs --dry-run      # health-check every company (no changes)
node probe-registry.mjs                # same, and remove companies that are definitely gone
```

To add companies, put `Company Name|https://careers-url` lines in a file and run
`discover-companies.mjs`, `discover-companies-browser.mjs`, `validate-discovered.mjs` (check the
sample jobs really belong to that company) and `merge-registry.mjs` on it, in that order.

## Configuration

Optional `.env` (copy `.env.example`):

| Variable | Default | Meaning |
|---|---|---|
| `CACHE_DB_PATH` | `./data/cache.db` | SQLite cache location |
| `CACHE_TTL_HOURS` | `24` | Cache ceiling (shorter windows expire sooner) |
| `SCRAPE_TIMEOUT_MS` | `30000` | Per-request timeout |
| `RATE_LIMIT_PER_HOST_MS` | `2000` | Delay between requests to one host |
| `MAX_RETRIES` | `3` | Retries per request |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `JOB_QUEST_URL` | — | Your Job Quest Board link for publishing |

## Project structure

```
src/
  server.ts, index.ts     MCP server and its tools (src/tools/)
  scrapers/               company registry, orchestrator, one scraper per platform/board
  resume/                 résumé → profile, title matching, JD match, applicant data
  apply/                  Greenhouse auto-fill, saved answers, jobquest:// links
  utils/                  filters, dates, clearance screen, browser, cache helpers
templates/job-quest.html  the Job Quest Board page
find-jobs-for-resume.mjs  résumé search (CLI)
export-jobs-xlsx.mjs      Excel sheet + page (with xlsx-checkboxes.mjs, jobs-html.mjs, excel-session.mjs)
publish-job-page.mjs      publish the page to claude.ai
refresh-job-quest.mjs     rerun the daily export (with job-quest-outputs.mjs)
auto-apply.mjs            auto apply CLI and --setup
install-auto-apply.mjs    register jobquest:// links (jobquest-link.mjs handles clicks)
probe-registry.mjs, discover-*.mjs, validate-discovered.mjs, merge-registry.mjs, repair-*.mjs
test/                     node --test suites (npm test)
```

## Development

```bash
npm run build   # compile to dist/ (the scripts run dist/)
npm test        # build + run tests
npm run dev     # recompile on save
```

## Limitations

- A 24-hour window is mostly job-board results, because companies publish in batches. Use 3 days or a week for more company jobs.
- Jobs with no posting date are left out on purpose.
- Auto apply supports Greenhouse only.
- Browser-based sites (Apple, Amazon, Tesla) are slower and break more often than API-based ones.
- Indeed, ZipRecruiter and Glassdoor block automated access and aren't included.
- Be respectful: keep the rate limit on.

## License

MIT
