import https from 'node:https';

const get = (url) => new Promise(r => {
  const u = new URL(url);
  const req = https.request({ hostname: u.hostname, port: 443, path: u.pathname + u.search,
    headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 6000
  }, res => { let d = ''; res.on('data', x => d += x); res.on('end', () => r({ s: res.statusCode, b: d.slice(0, 120) })); });
  req.on('error', () => r({ s: 0, b: '' })); req.on('timeout', () => { req.destroy(); r({ s: 0, b: '' }); }); req.end();
});

const lever = (slug) => get(`https://api.lever.co/v0/postings/${slug}?mode=json`)
  .then(r => r.s === 200 && (r.b.includes('[') || r.b.includes('{')));

const ashby = (slug) => get(`https://api.ashbyhq.com/posting-api/job-board/${slug}`)
  .then(r => r.s === 200 && r.b.includes('jobs'));

const sr = (slug) => get(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=1`)
  .then(r => r.s === 200 && r.b.includes('content'));

const LEVER_SLUGS = [
  ['Klarna', 'klarna'], ['Rivian', 'rivian'],
  ['Monzo', 'monzo'], ['Wise', 'wise'],
  ['Revolut', 'revolut'], ['Deliveroo', 'deliveroo'],
  ['Canva', 'canva'], ['Miro', 'miro'],
  ['HERE Technologies', 'here'], ['TomTom', 'tomtom'],
  ['Square', 'square'], ['Square', 'squareup'],
  ['HashiCorp', 'hashicorp'], ['Garmin', 'garmin'],
  ['DigitalOcean', 'digitalocean'], ['Redfin', 'redfin'],
  ['Compass', 'compass'], ['Veeam', 'veeam'],
  ['Cohesity', 'cohesity'], ['BambooHR', 'bamboohr'],
  ['Darktrace', 'darktrace'], ['Icertis', 'icertis'],
  ['Rakuten', 'rakuten'], ['Rapid7', 'rapid7'],
  ['Informatica', 'informatica'], ['Teradata', 'teradata'],
  ['Dynatrace', 'dynatrace'], ['RingCentral', 'ringcentral'],
  ['Five9', 'five9'], ['Arista Networks', 'arista'],
];

const ASHBY_SLUGS = [
  ['Canva', 'canva'], ['Miro', 'miro'], ['Rivian', 'rivian'],
  ['ThoughtSpot', 'thoughtspot'], ['Dynatrace', 'dynatrace'],
  ['Cohesity', 'cohesity'], ['Veeam', 'veeam'],
  ['BambooHR', 'bamboohr'], ['DigitalOcean', 'digitalocean'],
  ['Wise', 'wise'], ['Revolut', 'revolut'], ['Klarna', 'klarna'],
  ['Arista Networks', 'arista'], ['Five9', 'five9'],
  ['ServiceNow', 'servicenow'], ['Informatica', 'informatica'],
  ['Zoom', 'zoom'], ['Snap', 'snap'],
  ['Chegg', 'chegg'], ['Wasabi', 'wasabi'],
];

(async () => {
  const verified = [];
  console.log('=== LEVER ===');
  for (const [name, slug] of LEVER_SLUGS) {
    const ok = await lever(slug);
    if (ok) { process.stdout.write(`✓ LV ${name} (${slug})\n`); verified.push({ name, slug, platform: 'lever' }); }
  }
  console.log('=== ASHBY ===');
  for (const [name, slug] of ASHBY_SLUGS) {
    const ok = await ashby(slug);
    if (ok) { process.stdout.write(`✓ AB ${name} (${slug})\n`); verified.push({ name, slug, platform: 'ashby' }); }
  }
  console.log(`\n=== LEVER/ASHBY VERIFIED (${verified.length}) ===`);
  for (const v of verified) console.log(`  ["${v.name}","${v.platform}","${v.slug}"]`);
})();
