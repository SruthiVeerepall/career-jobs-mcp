import https from 'node:https';

const get = (url) => new Promise(r => {
  const u = new URL(url);
  const req = https.request({ hostname: u.hostname, port: 443, path: u.pathname + u.search,
    headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 6000
  }, res => { let d = ''; res.on('data', x => d += x); res.on('end', () => r({ s: res.statusCode, b: d.slice(0, 80) })); });
  req.on('error', () => r({ s: 0, b: '' })); req.on('timeout', () => { req.destroy(); r({ s: 0, b: '' }); }); req.end();
});

const gh = (slug) => get(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=false`)
  .then(r => r.s === 200 && r.b.includes('jobs'));

const CANDIDATES = [
  ['IBM', 'ibm'], ['IBM', 'ibmcareers'],
  ['Intel', 'intel'], ['AMD', 'amd'],
  ['Qualcomm', 'qualcomm'], ['Broadcom', 'broadcom'],
  ['Logitech', 'logitech'], ['Razer', 'razer'],
  ['HP Inc', 'hpinc'], ['Dell Technologies', 'dell'], ['Dell Technologies', 'delltechnologies'],
  ['HPE', 'hpe'], ['HPE', 'hewlettpackardenterprise'],
  ['Akamai', 'akamai'], ['Fortinet', 'fortinet'],
  ['Check Point', 'checkpoint'], ['Check Point', 'checkpointsoftware'],
  ['SentinelOne', 'sentinelone'], ['Darktrace', 'darktrace'],
  ['SAP', 'sap'], ['Infor', 'infor'], ['Autodesk', 'autodesk'],
  ['Siemens', 'siemens'], ['Zoho', 'zoho'],
  ['Rapid7', 'rapid7'], ['CyberArk', 'cyberark'],
  ['Splunk', 'splunk'], ['Mandiant', 'mandiant'],
  ['Cloudera', 'cloudera'], ['Teradata', 'teradata'], ['Informatica', 'informatica'],
  ['Snap', 'snapinc'], ['Snap', 'snapchat'],
  ['Zoom', 'zoom'], ['Zoom', 'zoomvideo'],
  ['Activision Blizzard', 'activisionblizzard'], ['Activision Blizzard', 'activision'],
  ['Electronic Arts', 'ea'], ['Electronic Arts', 'electronicarts'],
  ['Ubisoft', 'ubisoft'], ['Unity Technologies', 'unity'], ['Unity Technologies', 'unitytechnologies'],
  ['Hugging Face', 'huggingface'],
  ['DataRobot', 'datarobot'], ['Runway ML', 'runwayml'], ['Runway ML', 'runway'],
  ['AT&T', 'att'], ['Verizon', 'verizon'],
  ['Charter', 'charter'], ['Cisco', 'cisco'],
  ['Square', 'square'], ['Square', 'block'], ['Square', 'blockinc'],
  ['Klarna', 'klarna'],
  ['Rivian', 'rivian'], ['Mobileye', 'mobileye'],
  ['Garmin', 'garmin'], ['eBay', 'ebay'], ['eBay', 'ebaycareers'],
  ['GitHub', 'github'], ['HashiCorp', 'hashicorp'],
  ['Tableau', 'tableau'], ['MicroStrategy', 'microstrategy'],
  ['Domo', 'domo'], ['ThoughtSpot', 'thoughtspot'], ['Dynatrace', 'dynatrace'],
  ['Teladoc', 'teladoc'], ['Teladoc', 'teladochealth'],
  ['Chegg', 'chegg'], ['Codecademy', 'codecademy'],
  ['Quizlet', 'quizlet'], ['IXL', 'ixl'],
  ['Accenture', 'accenture'], ['TCS', 'tcs'],
  ['Infosys', 'infosys'], ['Wipro', 'wipro'],
  ['HCL Technologies', 'hcl'], ['HCL Technologies', 'hcltech'],
  ['Tech Mahindra', 'techmahindra'],
  ['Cognizant', 'cognizant'], ['Capgemini', 'capgemini'],
  ['Atos', 'atos'], ['SAIC', 'saic'],
  ['ManTech', 'mantech'], ['CACI', 'caci'], ['CACI', 'caciinternational'],
  ['DXC', 'dxc'], ['DXC', 'dxctechnology'],
  ['LTIMindtree', 'ltimindtree'], ['Mphasis', 'mphasis'],
  ['Hexaware', 'hexaware'], ['Persistent Systems', 'persistentsystems'], ['Persistent Systems', 'persistentsys'],
  ['Coforge', 'coforge'], ['Procore', 'procore'],
  ['CoStar', 'costar'], ['Redfin', 'redfin'],
  ['Compass', 'compass'], ['RealPage', 'realpage'],
  ['AppFolio', 'appfolio'], ['AppFolio', 'appfolioinc'],
  ['ServiceNow', 'servicenow'],
  ['Appian', 'appian'], ['Pega Systems', 'pega'], ['Pega Systems', 'pegasystems'],
  ['Monday.com', 'mondaydotcom'], ['Monday.com', 'monday'],
  ['Canva', 'canva'], ['Miro', 'miro'],
  ['Arista Networks', 'arista'], ['Arista Networks', 'aristanetworks'],
  ['NetApp', 'netapp'], ['DigitalOcean', 'digitalocean'],
  ['Veeam', 'veeam'], ['Cohesity', 'cohesity'], ['Wasabi', 'wasabi'],
  ['ADP', 'adp'], ['Paycom', 'paycom'], ['Paylocity', 'paylocity'],
  ['BambooHR', 'bamboohr'], ['Ceridian', 'ceridian'], ['Ceridian', 'dayforce'],
  ['RingCentral', 'ringcentral'], ['Five9', 'five9'],
  ['Genesys', 'genesys'], ['NICE', 'nice'], ['Vonage', 'vonage'],
  ['Maxar', 'maxar'], ['Maxar', 'maxartechnologies'],
  ['L3Harris', 'l3harris'], ['Lockheed Martin', 'lockheedmartin'],
  ['Northrop Grumman', 'northropgrumman'],
  ['Icertis', 'icertis'],
  ['Booking.com', 'booking'], ['Booking.com', 'bookingcom'],
  ['Revolut', 'revolut'], ['Monzo', 'monzo'],
  ['Wise', 'wise'], ['Wise', 'transferwise'],
  ['Western Digital', 'westerndigital'], ['Western Digital', 'wdc'],
  ['Seagate', 'seagate'], ['Aptiv', 'aptiv'],
  ['HERE Technologies', 'here'], ['TomTom', 'tomtom'],
  ['Rakuten', 'rakuten'], ['Deliveroo', 'deliveroo'],
];

(async () => {
  const seen = new Set();
  const verified = [];
  for (const [name, slug] of CANDIDATES) {
    if (seen.has(slug)) continue;
    seen.add(slug);
    const ok = await gh(slug);
    if (ok) {
      process.stdout.write(`✓ GH ${name} (${slug})\n`);
      verified.push({ name, slug });
    }
  }
  console.log(`\n=== GH VERIFIED (${verified.length}) ===`);
  for (const v of verified) console.log(`  ["${v.name}","greenhouse","${v.slug}"]`);
})();
