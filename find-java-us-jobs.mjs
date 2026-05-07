import { spawn } from 'node:child_process';

const MCP = 'dist/index.js';

// COMPANIES is loaded dynamically from listCompanies() at runtime.
// Some Workday tenants (Bank of America, JPMorgan, Wells Fargo class) return
// huge job catalogs the synchronous paginator can't finish in <2 min — skip them.
const SKIP = new Set([
  'bank-of-america', 'jpmorgan', 'wells-fargo', 'citi', 'goldman-sachs',
  'morgan-stanley', 'us-bancorp', 'capital-one-careers',
  'cisco', 'boeing', 'lockheed-martin', 'northrop-grumman', 'raytheon-technologies',
  'amazon', 'apple', 'google', 'microsoft', 'meta', 'tesla', 'shopify', 'uber', // custom Puppeteer — flaky
]);

// Titles to query — the server filters by case-insensitive substring on the title.
const TITLE_QUERIES = ['Java', 'Backend', 'Full Stack', 'Fullstack', 'Software Engineer'];

const RESUME_KEYWORDS = {
  'spring boot':       [5, /\bspring\s*boot\b/i],
  'spring mvc':        [3, /\bspring\s*mvc\b/i],
  'spring security':   [2, /\bspring\s*security\b/i],
  'spring cloud':      [2, /\bspring\s*cloud\b/i],
  'hibernate':         [3, /\bhibernate\b/i],
  'jpa':               [2, /\bjpa\b/i],
  'microservices':     [4, /\bmicroservic/i],
  'rest':              [2, /\brest(?:ful)?\s*(?:api)?\b/i],
  'kafka':             [3, /\bkafka\b/i],
  'aws':               [3, /\baws\b/i],
  'lambda':            [2, /\blambda\b/i],
  'dynamodb':          [2, /\bdynamodb\b/i],
  'azure':             [2, /\bazure\b/i],
  'docker':            [2, /\bdocker\b/i],
  'kubernetes':        [3, /\b(?:kubernetes|k8s)\b/i],
  'angular':           [4, /\bangular\b/i],
  'react':             [3, /\breact(?:\.?js)?\b/i],
  'node.js':           [2, /\bnode\.?js\b/i],
  'typescript':        [1, /\btypescript\b/i],
  'postgres':          [2, /\bpostgres/i],
  'mongodb':           [1, /\bmongodb\b/i],
  'oracle':            [1, /\boracle\b/i],
  'jenkins':           [1, /\bjenkins\b/i],
  'github actions':    [2, /\bgithub\s*actions\b/i],
  'sonarqube':         [2, /\bsonar(?:qube)?\b/i],
  'junit':             [2, /\bjunit\b/i],
  'mockito':           [1, /\bmockito\b/i],
  'playwright':        [2, /\bplaywright\b/i],
  'splunk':            [1, /\bsplunk\b/i],
  'agile':             [1, /\b(?:agile|scrum)\b/i],
  'tdd':               [1, /\b(?:tdd|test\s*driven)\b/i],
  'graphql':           [1, /\bgraphql\b/i],
  'oauth':             [1, /\boauth\b/i],
  'jwt':               [1, /\bjwt\b/i],
  'java (req)':        [10, /\bjava\b(?!\s*script)/i], // strong require: must mention Java
};

const REJECT_PATTERNS = [
  /\bU\.?S\.?\s*citizen(?:ship)?\b/i,
  /\bmust\s+be\s+(?:a\s+)?(?:U\.?S\.?\s+)?citizen\b/i,
  /\bsecurity\s+clearance\b/i,
  /\bactive\s+(?:secret|top\s*secret|ts\/sci|public\s*trust)\s+clearance\b/i,
  /\bTS\/SCI\b/,
  /\bsecret\s+clearance\s+required\b/i,
  /\bable\s+to\s+obtain\s+(?:a\s+)?(?:security|secret|public\s*trust)\s+clearance\b/i,
  /\bclearance\s+required\b/i,
  /\bITAR\b/,
  /\bauthorized\s+to\s+work\s+in\s+the\s+US\s+without\s+sponsorship\b/i,
  /\bno\s+(?:visa\s+)?sponsorship\b/i,
  /\bdoes\s+not\s+(?:offer|provide)\s+sponsorship\b/i,
  /\bunable\s+to\s+sponsor\b/i,
  /\bwill\s+not\s+sponsor\b/i,
];

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];
const US_CITIES = ['austin','seattle','san francisco','new york','nyc','boston','chicago','los angeles','san jose','sunnyvale','mountain view','palo alto','san diego','denver','atlanta','dallas','houston','miami','philadelphia','phoenix','portland','washington','arlington','reston','mclean','plano','irving','raleigh','durham','charlotte','minneapolis','st. louis','salt lake city','nashville','cambridge','jersey city','newark','malvern','oakland','redmond','bellevue'];

const NON_US_HINTS = /\b(?:emea|apac|india|uk|united\s*kingdom|canada|europe|latam|brazil|mexico|ireland|spain|estonia|germany|france|netherlands|poland|portugal|italy|sweden|denmark|romania|bulgaria|switzerland|israel|singapore|japan|korea|china|australia|argentina|chile|colombia|philippines|vietnam)\b/i;

function isUSLocation(loc) {
  if (!loc) return false;
  const s = String(loc).toLowerCase();
  if (NON_US_HINTS.test(s)) return false;
  if (/\b(?:united states|usa|u\.s\.a?\.?|u\.s\.)\b/i.test(loc)) return true;
  if (/\bremote\b/i.test(s)) {
    // Accept only if explicitly US, or if no other country marker is present
    if (/\b(?:us|usa|united states|u\.s\.)\b/i.test(s)) return true;
    return false; // be conservative: "Remote - X" without US marker → reject
  }
  if (US_CITIES.some((c) => s.includes(c))) return true;
  for (const st of US_STATES) {
    if (new RegExp(`,\\s*${st}\\b`, 'i').test(loc)) return true;
    if (new RegExp(`\\b${st}\\s+(?:USA|United States)\\b`, 'i').test(loc)) return true;
  }
  return false;
}

let serverProc = null;
let nextId = 1;
const pending = new Map();

function startServer() {
  return new Promise((resolve) => {
    serverProc = spawn('node', [MCP], { stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '';
    serverProc.stdout.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id && pending.has(msg.id)) {
            pending.get(msg.id)(msg);
            pending.delete(msg.id);
          }
        } catch {}
      }
    });
    serverProc.stderr.on('data', () => {});
    setTimeout(resolve, 200);
  });
}

function call(method, params, timeoutMs = 60000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    serverProc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`Timeout: ${method} (id=${id})`));
      }
    }, timeoutMs);
  });
}

function notify(method, params) {
  serverProc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

function score(text) {
  let s = 0;
  const hits = [];
  for (const [name, [w, re]] of Object.entries(RESUME_KEYWORDS)) {
    if (re.test(text)) { s += w; hits.push(name); }
  }
  return { score: s, hits };
}

function extractYears(text) {
  const m = text.match(/(\d+)\s*\+?\s*years?(?:\s+of)?\s+(?:professional\s+)?(?:experience|exp)/i);
  return m ? parseInt(m[1], 10) : null;
}

function isRejected(text) {
  for (const re of REJECT_PATTERNS) if (re.test(text)) return re.source;
  return null;
}

(async () => {
  await startServer();
  await call('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'java-us-finder', version: '0' },
  });
  notify('notifications/initialized', {});

  // Step 0: pull the full company list dynamically; filter out SKIP set.
  const listResp = await call('tools/call', { name: 'listCompanies', arguments: {} });
  const listData = JSON.parse(listResp.result.content[0].text);
  const COMPANIES = listData.companies
    .filter(c => !SKIP.has(c.slug))
    .map(c => c.name);
  console.log(`[0/4] Loaded ${COMPANIES.length} companies (skipped ${listData.total - COMPANIES.length})`);

  // Step 1a: cache should already be warm from prior run; only refresh if requested
  if (process.env.REFRESH === '1') {
    console.log(`[1a/4] Force-scraping ${COMPANIES.length} companies (no title filter) to populate cache...`);
    await Promise.all(COMPANIES.map(async (c) => {
      try {
        const resp = await call('tools/call', {
          name: 'searchCompanyJobs',
          arguments: { companyName: c, forceRefresh: true },
        }, 120000);
        if (!resp.result) { console.log(`    ${c}: ERROR ${JSON.stringify(resp.error)}`); return; }
        const data = JSON.parse(resp.result.content[0].text);
        console.log(`    ${c}: ${data.jobCount} total jobs${data.error ? ' (ERR: '+data.error+')' : ''}`);
      } catch (e) { console.log(`    ${c}: ${e.message}`); }
    }));
  } else {
    console.log(`[1a/4] Using warm cache (set REFRESH=1 to force re-scrape).`);
  }

  // Step 1b: union of jobs across multiple title queries (now hits the full-cache)
  console.log(`[1b/4] Filtering by title across ${TITLE_QUERIES.length} queries...`);
  const seen = new Map();
  for (const title of TITLE_QUERIES) {
    process.stdout.write(`  - "${title}"... `);
    try {
      const titleArgs = { companyList: COMPANIES, jobTitle: title };
      if (process.env.POSTED_SINCE) titleArgs.postedSince = process.env.POSTED_SINCE;
      const resp = await call('tools/call', {
        name: 'searchMultipleCompanies',
        arguments: titleArgs,
      }, 300000);
      if (!resp.result) { console.log('FAIL', JSON.stringify(resp.error)); continue; }
      const data = JSON.parse(resp.result.content[0].text);
      let added = 0;
      for (const c of data.perCompany) {
        if (!c.jobs) continue;
        for (const j of c.jobs) {
          const key = c.company + '::' + j.id;
          if (!seen.has(key)) { seen.set(key, { company: c.company, ...j }); added++; }
        }
      }
      console.log(`${data.totalJobs} hits (${added} new)`);
    } catch (e) {
      console.log('ERR', e.message);
    }
  }
  console.log(`  Total unique: ${seen.size}`);

  // Step 2: filter to US
  const us = [];
  for (const j of seen.values()) {
    const usLocs = (j.locations || []).filter(isUSLocation);
    if (usLocs.length === 0) continue;
    us.push({ ...j, usLocations: usLocs });
  }
  console.log(`[2/4] US-located: ${us.length}`);

  // Step 3: fetch descriptions for each (cached after first run, so cheap)
  console.log(`[3/4] Fetching descriptions for ${us.length} jobs...`);
  let done = 0;
  const detailed = [];
  // Run in batches of 8 to keep the server snappy
  const batchSize = 8;
  for (let i = 0; i < us.length; i += batchSize) {
    const batch = us.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(async (j) => {
      try {
        const resp = await call('tools/call', {
          name: 'getJobDetails',
          arguments: { jobId: j.id, companyName: j.company },
        }, 60000);
        if (!resp.result) return { ...j, _error: resp.error?.message };
        const detail = JSON.parse(resp.result.content[0].text);
        const job = detail.job || detail;
        return { ...j, description: job.description || '', requirements: job.requirements || [], benefits: job.benefits || [] };
      } catch (e) {
        return { ...j, _error: e.message };
      }
    }));
    detailed.push(...results);
    done += batch.length;
    process.stdout.write(`\r  ${done}/${us.length}`);
  }
  console.log();

  // Step 4: filter rejects + must-mention-Java + score + sort
  const scored = [];
  for (const j of detailed) {
    const haystack = [j.title, j.description || '', ...(j.requirements || []), ...(j.benefits || [])].join('\n');
    if (!/\bjava\b(?!\s*script)/i.test(haystack)) continue;        // must mention Java
    const rej = isRejected(haystack);
    if (rej) continue;
    const { score: s, hits } = score(haystack);
    const years = extractYears(haystack);
    scored.push({ ...j, score: s, hits, years });
  }
  scored.sort((a, b) => b.score - a.score || (b.years || 0) - (a.years || 0));
  const top = scored.slice(0, 50);

  console.log(`[4/4] Java-mentioning, no-rejection: ${scored.length}; top ${top.length}:`);
  console.log();
  console.log('| # | Company | Title | Location | Posted | Yrs req | Score | Top stack matches |');
  console.log('|---|---------|-------|----------|--------|---------|-------|-------------------|');
  top.forEach((j, i) => {
    const loc = j.usLocations.slice(0, 2).join('; ');
    const stack = j.hits.filter(h => h !== 'java (req)').slice(0, 6).join(', ');
    const posted = j.postedDate ? new Date(j.postedDate).toISOString().slice(0, 10) : '?';
    console.log(`| ${i+1} | ${j.company} | [${j.title.replace(/\|/g,'\\|')}](${j.applyUrl}) | ${loc} | ${posted} | ${j.years ?? '?'} | ${j.score} | ${stack} |`);
  });
  console.log();
  console.log('--- Plain URL list ---');
  top.forEach((j, i) => console.log(`${i+1}. ${j.company} — ${j.title}\n   ${j.applyUrl}`));

  serverProc.stdin.end();
  serverProc.kill();
})();
