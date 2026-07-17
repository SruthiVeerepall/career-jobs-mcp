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

### 6. Resume-Match Filter — ≥60% profile alignment

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
| `node find-java-24h.mjs` | Full batch search — Java/Full Stack/SE across all registry companies, 3-day window |
| `node find-java-24h.mjs --today` | Same, 24-hour window |
| `node find-java-24h.mjs --week` | Same, 7-day window |
| `node export-jobs-xlsx.mjs` | Same search as `find-java-24h.mjs`, exported to `job-results.xlsx` with a clickable Apply link and an "Applied?" checkbox column (accepts `--today`/`--week`/`--out <path>`) |
| `node get-5-companies.mjs` | Targeted fetch for Deloitte, SAP, Lyft, Visa, Infosys with special scrapers |
| `node deloitte-scrape.mjs` | Puppeteer DOM scraper for Deloitte (Avature ATS, server-rendered) |
| `node probe-registry.mjs` | Health-check all companies, removes broken registry entries |
| `node probe-registry.mjs --dry-run` | Report only, no changes |

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

#### LinkedIn (cross-company job board — IN the registry)
- **In registry** as `platform: 'linkedin', slug: 'linkedin'` — included automatically in `find-java-24h.mjs` / `export-jobs-xlsx.mjs` runs.
- **Method:** public guest endpoint (no login/API key): `GET https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=…&location=United States&f_TPR=r604800&start=N` — returns HTML job cards parsed with cheerio (`src/scrapers/platforms/linkedin.ts`).
- **Search terms:** when no `jobTitle` filter is given it runs the profile terms `Java`, `Full Stack Developer`, `Software Engineer` (up to ~50 postings per term, deduped by posting id).
- **Output:** `companyName` = the real hiring employer from the card; `applyUrl` = direct `https://www.linkedin.com/jobs/view/{id}/` link; `postedDate` = real ISO date from `<time datetime>`. Batch scripts display the company as `"{Employer} (via LinkedIn)"`.
- **Date filter mapping:** `postedSince: 'today'` → `f_TPR=r86400`, `'week'`/default → `r604800`, `'month'` → `r2592000`; the 3-day cutoff is applied client-side like all other sources.
- **Caveats:** guest endpoint can rate-limit (429) under heavy use — requests go through the shared rate limiter; page size varies (10–25). Skipped by `probe-registry.mjs` (no JSON API).

---

### Platforms with working JSON APIs (probeable)
- `greenhouse`, `lever`, `ashby`, `smartrecruiters`, `workday`

### Platforms skipped by probe (no standard JSON API)
- `oracle-orc`, `icims`, `icims-jra`, `custom` — these need browser-based scraping.
- `linkedin` — guest HTML endpoint, verified at runtime instead.

### Known Workday 422s (CSRF-protected, kept in registry)
Companies like Google, Microsoft, JPMorgan, Goldman Sachs return HTTP 422 from the probe because their Workday endpoints require a CSRF session. The scraper now handles these by prefetching the careers page to harvest session cookies and the `CALYPSO_CSRF_TOKEN`, then retrying the POST — so they should return results at runtime. Amazon is `platform: 'custom'` (not Workday) and uses Puppeteer; its generic selectors may still return zero results.
