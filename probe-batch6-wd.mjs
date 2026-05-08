import https from 'node:https';

const post = (url, body) => new Promise(r => {
  const u = new URL(url);
  const req = https.request({ method: 'POST', hostname: u.hostname, port: 443, path: u.pathname + u.search,
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' }, timeout: 7000
  }, res => { let d = ''; res.on('data', x => d += x); res.on('end', () => r({ s: res.statusCode, b: d.slice(0, 60) })); });
  req.on('error', () => r({ s: 0, b: '' })); req.on('timeout', () => { req.destroy(); r({ s: 0, b: '' }); });
  req.write(body); req.end();
});

const wd = (t, w, s) => post(
  `https://${t}.${w}.myworkdayjobs.com/wday/cxs/${t}/${s}/jobs`,
  JSON.stringify({ limit: 1, offset: 0, searchText: '' })
).then(r => r.s === 200 && r.b.includes('total'));

const WORKDAY = [
  ['IBM', 'ibm', 'wd3', 'IBM'],
  ['IBM', 'ibm', 'wd5', 'IBM'],
  ['Intel', 'intel', 'wd1', 'External'],
  ['Intel', 'intel', 'wd5', 'External'],
  ['AMD', 'amd', 'wd5', 'AMD'],
  ['AMD', 'amd', 'wd1', 'AMD'],
  ['Qualcomm', 'qcom', 'wd1', 'External'],
  ['Qualcomm', 'qcom', 'wd5', 'External'],
  ['Broadcom', 'broadcom', 'wd1', 'External_Career_Site'],
  ['Fortinet', 'fortinet', 'wd5', 'Fortinet'],
  ['Fortinet', 'fortinet', 'wd1', 'External'],
  ['Autodesk', 'autodesk', 'wd1', 'Autodesk_Careers'],
  ['Autodesk', 'autodesk', 'wd5', 'External'],
  ['Snap', 'snap', 'wd5', 'Snap'],
  ['Zoom', 'zoom', 'wd5', 'ZoomCareers'],
  ['Zoom', 'zoom', 'wd1', 'External'],
  ['AT&T', 'att', 'wd5', 'ATTCareers'],
  ['AT&T', 'att', 'wd1', 'Corporate'],
  ['Verizon', 'verizon', 'wd5', 'External'],
  ['Cisco', 'cisco', 'wd5', 'Cisco_External_Careers'],
  ['Cisco', 'cisco', 'wd1', 'External'],
  ['Electronic Arts', 'ea', 'wd5', 'EA_External'],
  ['Electronic Arts', 'ea', 'wd1', 'EA_External'],
  ['Activision Blizzard', 'activision', 'wd5', 'ABK_External_Career_Site'],
  ['Ubisoft', 'ubisoft', 'wd3', 'ubisoftgroup'],
  ['ServiceNow', 'servicenow', 'wd1', 'ServiceNow_Careers'],
  ['ServiceNow', 'servicenow', 'wd5', 'External'],
  ['Pega Systems', 'pega', 'wd5', 'Pega_External'],
  ['Pega Systems', 'pegasystems', 'wd1', 'External'],
  ['NetApp', 'netapp', 'wd5', 'NetApp_Careers'],
  ['NetApp', 'netapp', 'wd1', 'External'],
  ['ADP', 'adp', 'wd5', 'ADPCareers'],
  ['ADP', 'adp', 'wd1', 'ADP_Careers'],
  ['Paycom', 'paycom', 'wd1', 'paycom'],
  ['UKG', 'ukg', 'wd5', 'UKG'],
  ['Ceridian', 'ceridian', 'wd5', 'Ceridian_Careers'],
  ['Ceridian', 'ceridian', 'wd1', 'External'],
  ['Genesys', 'genesys', 'wd5', 'Genesys'],
  ['Genesys', 'genesys', 'wd1', 'External'],
  ['NICE', 'nice', 'wd5', 'NICECareers'],
  ['NICE', 'nice', 'wd1', 'External'],
  ['Maxar', 'maxar', 'wd1', 'External'],
  ['L3Harris', 'l3harris', 'wd5', 'L3Harris_Careers'],
  ['Lockheed Martin', 'lmco', 'wd1', 'External'],
  ['Northrop Grumman', 'northropgrumman', 'wd1', 'NGCS'],
  ['Procore', 'procore', 'wd5', 'careers'],
  ['RealPage', 'realpage', 'wd5', 'External_Career_Site'],
  ['AppFolio', 'appfolio', 'wd1', 'AppFolio_Careers'],
  ['Booking.com', 'booking', 'wd3', 'booking'],
  ['Western Digital', 'wdc', 'wd5', 'External'],
  ['Seagate', 'seagate', 'wd5', 'Seagate_Careers'],
  ['Aptiv', 'aptiv', 'wd1', 'Aptiv_External'],
  ['Garmin', 'garmin', 'wd1', 'Garmin_Careers'],
  ['Akamai', 'akamai', 'wd1', 'Akamai'],
  ['Dynatrace', 'dynatrace', 'wd5', 'External'],
  ['Redfin', 'redfin', 'wd1', 'Redfin_Careers'],
  ['Vonage', 'vonage', 'wd5', 'vonage'],
  ['CoStar', 'costar', 'wd5', 'External'],
  ['Paylocity', 'paylocity', 'wd1', 'paylocity_careers'],
  ['Compass', 'compass', 'wd5', 'External'],
  ['Arista Networks', 'arista', 'wd1', 'External'],
  ['Arista Networks', 'arista', 'wd5', 'External'],
  ['DigitalOcean', 'digitalocean', 'wd5', 'DigitalOcean'],
  ['Miro', 'miro', 'wd5', 'External'],
  ['RingCentral', 'ringcentral', 'wd5', 'External'],
  ['BambooHR', 'bamboohr', 'wd5', 'External'],
  ['Canva', 'canva', 'wd5', 'External'],
  ['Logitech', 'logitech', 'wd1', 'logitech_careers'],
  ['Check Point', 'checkpoint', 'wd5', 'External'],
  ['Informatica', 'informatica', 'wd5', 'External'],
  ['Teradata', 'teradata', 'wd5', 'External'],
];

(async () => {
  const seen = new Set();
  const verified = [];
  for (const [name, t, w, s] of WORKDAY) {
    const key = `${t}|${w}|${s}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const ok = await wd(t, w, s);
    if (ok) {
      process.stdout.write(`✓ WD ${name} ${t}|${w}|${s}\n`);
      verified.push({ name, t, w, s });
    }
  }
  console.log(`\n=== WD VERIFIED (${verified.length}) ===`);
  for (const v of verified) console.log(`  ["${v.name}","${v.t}|${v.w}|${v.s}"]`);
})();
