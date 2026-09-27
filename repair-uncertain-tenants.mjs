/**
 * repair-uncertain-tenants.mjs
 *
 * Targeted Workday tenant sweep for the "uncertain" entries, complementing the crawl
 * passes. Exploits the signal established in CLAUDE.md: asking a Workday host for a
 * deliberately nonexistent site returns 404 when the tenant is real and 422 when it is
 * not. That makes tenant existence testable in one cheap request, so a curated candidate
 * list can be swept quickly instead of guessing site names blind.
 *
 * Candidates include acquirers, because an acquired company's board moves to the buyer's
 * tenant (VMware -> Broadcom, Splunk -> Cisco, HBO Max/WarnerMedia -> WBD).
 *
 * Removes nothing. Output: repair-uncertain-tenants.json
 *
 * Usage: node repair-uncertain-tenants.mjs [--slug X]
 */
import axios from 'axios';
import fs from 'fs';

const args = process.argv.slice(2);
const ONLY_SLUG = (() => {
  const i = args.indexOf('--slug');
  return i !== -1 ? args[i + 1] : null;
})();

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Curated tenant guesses per slug. Extra names are cheap — each costs one request — and
// the verification step below is what decides, so a wrong guess cannot leak in.
const CANDIDATES = {
  'goldman-sachs': ['goldmansachs', 'gs', 'goldman'],
  walmart: ['walmart'],
  'google-careers': ['google', 'googlecareers'],
  'splunk-careers': ['splunk', 'cisco'],
  'hbomax-careers': ['wbd', 'warnerbros', 'warnermediagroup', 'warnerbrosdiscovery'],
  ibm: ['ibm', 'ibmglobal'],
  vmware: ['broadcom', 'vmware'],
  cognizant: ['cognizant'],
  'morgan-stanley': ['ms', 'morganstanley'],
  fidelity: ['fmr', 'fidelity', 'fidelityinvestments'],
  'monday-com': ['mondaycom', 'monday'],
  infosys: ['infosys'],
  rippling: ['rippling'],
  retool: ['retool'],
  rapid7: ['rapid7'],
  shopify: ['shopify'],
  sentinelone: ['sentinelone'],
  cyberark: ['cyberark'],
  factset: ['factset'],
  klarna: ['klarna'],
  secureworks: ['secureworks', 'dell'],
  'compass-re': ['compass', 'urbancompass'],
  seagate: ['seagate', 'seagatetechnology'],
  msci: ['msci'],
  procore: ['procore'],
  enphase: ['enphase', 'enphaseenergy'],
  'kaiser-permanente': ['kaiserpermanente', 'kp'],
  vimeo: ['vimeo'],
  saic: ['saic'],
  'first-solar': ['firstsolar'],
  'tyler-technologies': ['tylertech', 'tylertechnologies'],
  solaredge: ['solaredge'],
  maximus: ['maximus', 'maximusfederal'],
  verizon: ['verizon'],
  granicus: ['granicus'],
  'dun-bradstreet': ['dnb', 'dunandbradstreet'],
  meta: ['meta', 'metacareers', 'facebook'],
  kpmg: ['kpmg', 'kpmgus'],
  tiktok: ['bytedance', 'tiktok'],
  broadcom: ['broadcom'],
  'westfield-insurance': ['westfieldinsurance', 'westfield'],
  ciena: ['ciena'],
  equifax: ['equifax'],
  vanguard: ['vanguard'],
};

const WD_HOSTS = ['wd1', 'wd3', 'wd5', 'wd2', 'wd12', 'wd10', 'wd101', 'wd103', 'wd6'];

const SITES = [
  'External',
  'Careers',
  'careers',
  'External_Career_Site',
  'ExternalCareers',
  'External_Careers',
  'externalcareers',
  'CareerSite',
  'Search',
  'Professional',
  'Experienced',
  'US_Careers',
  'Global_Careers',
  'GlobalCareers',
];

const post = (tenant, wd, site) =>
  axios.post(
    `https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`,
    { limit: 20, offset: 0, searchText: '', appliedFacets: {} },
    {
      timeout: 20000,
      validateStatus: () => true,
      headers: { 'User-Agent': UA, Accept: 'application/json', 'Content-Type': 'application/json' },
    },
  ).catch((e) => ({ status: 0, data: null, err: e.code || e.message }));

async function tenantLive(tenant, wd) {
  const r = await post(tenant, wd, 'ZzNoSuchSiteZz');
  return r.status === 404 || r.status === 200;
}

function siteNamesFor(tenant, slug) {
  const clean = slug.replace(/[^a-z0-9]/gi, '');
  return [
    ...new Set([
      ...SITES,
      tenant,
      `${tenant}_careers`,
      `${tenant}Careers`,
      `${tenant}_External`,
      `${tenant}ExternalCareers`,
      clean,
      `${clean}Careers`,
      `${clean}_Careers`,
    ]),
  ];
}

const uncertain = JSON.parse(fs.readFileSync('probe-results.json', 'utf8')).uncertainCompanies.filter(
  (c) => !ONLY_SLUG || c.slug === ONLY_SLUG,
);

const results = [];
console.log(`Tenant sweep over ${uncertain.length} entries\n`);

for (const c of uncertain) {
  const [curTenant] = c.platformIdentifier.split('|');
  const cands = [...new Set([...(CANDIDATES[c.slug] ?? []), curTenant])];
  const rec = { slug: c.slug, name: c.name, current: c.platformIdentifier, liveHosts: [] };

  let found = null;
  outer: for (const t of cands) {
    for (const w of WD_HOSTS) {
      if (!(await tenantLive(t, w))) continue;
      rec.liveHosts.push(`${t}.${w}`);
      for (const s of siteNamesFor(t, c.slug)) {
        const r = await post(t, w, s);
        if (r.status !== 200 || !Array.isArray(r.data?.jobPostings) || r.data.jobPostings.length === 0) continue;
        const posts = r.data.jobPostings;
        const dated = posts.filter((p) => typeof p.postedOn === 'string' && p.postedOn.trim());
        found = {
          identifier: `${t}|${w}|${s}`,
          jobCount: r.data.total ?? posts.length,
          returned: posts.length,
          datedCount: dated.length,
          samplePostedOn: [...new Set(dated.map((p) => p.postedOn))].slice(0, 3),
          sampleTitles: posts.map((p) => p.title).filter(Boolean).slice(0, 4),
          sampleLocations: posts.map((p) => p.locationsText).filter(Boolean).slice(0, 3),
        };
        break outer;
      }
    }
  }

  if (found) {
    Object.assign(rec, found, { resolution: 'FIXED', usable: found.datedCount > 0 ? 'yes' : 'no-dates' });
  } else {
    rec.resolution = rec.liveHosts.length ? 'TENANT-LIVE-SITE-UNKNOWN' : 'NO-WORKDAY-TENANT';
  }

  process.stderr.write(
    `  ${rec.resolution.padEnd(24)} ${c.name.padEnd(22)} ${
      found ? `${found.identifier}  jobs=${found.jobCount} dated=${found.datedCount}/${found.returned}` : rec.liveHosts.join(',')
    }\n`,
  );
  results.push(rec);
}

const by = {};
for (const r of results) (by[r.resolution] ??= []).push(r);
console.log(`\n${'-'.repeat(80)}`);
for (const [k, list] of Object.entries(by).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n${k} — ${list.length}`);
  for (const r of list) {
    console.log(
      k === 'FIXED'
        ? `  ${r.name.padEnd(22)} ${r.current.padEnd(40)} => ${r.identifier}  jobs=${r.jobCount} dated=${r.datedCount}/${r.returned} usable=${r.usable}\n      e.g. "${(r.samplePostedOn ?? [])[0] ?? ''}" | ${(r.sampleTitles ?? [])[0] ?? ''} | ${(r.sampleLocations ?? [])[0] ?? ''}`
        : `  ${r.name.padEnd(22)} ${r.current.padEnd(40)} ${r.liveHosts.join(', ')}`,
    );
  }
}

fs.writeFileSync('repair-uncertain-tenants.json', JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2));
console.log(`\nSaved repair-uncertain-tenants.json`);
