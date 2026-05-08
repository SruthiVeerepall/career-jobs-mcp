// Deep ATS sniffer — fetches each career page (with redirects), inspects the
// final URL + HTML for signatures of iCIMS / SuccessFactors / BrassRing / Taleo /
// Eightfold / Avature / Phenom, and extracts the tenant identifier.
import https from 'node:https';
import http from 'node:http';

const FAILED = [
  // [name, careerUrl]
  ['Trinity Health',     'https://careers.trinity-health.org'],
  ['Ascension',          'https://careers.ascension.org'],
  ['Providence',         'https://www.providence.org/careers'],
  ['Sutter Health',      'https://www.sutterhealth.org/careers'],
  ['Stanford Health',    'https://stanfordhealthcare.org/careers'],
  ['Mayo Clinic',        'https://jobs.mayoclinic.org'],
  ['Banner Health',      'https://www.bannerhealth.com/careers'],
  ['Aflac',              'https://www.aflac.com/careers'],
  ['Genworth',           'https://careers.genworth.com'],
  ['Citizens Financial', 'https://jobs.citizensbank.com'],
  ['Comerica',           'https://careers.comerica.com'],
  ['Ally Financial',     'https://www.ally.com/about/careers'],
  ['Vodafone',           'https://careers.vodafone.com'],
  ['BT Group',           'https://www.bt.com/careers'],
  ['Broadcom',           'https://www.broadcom.com/company/careers'],
  ['Atos',               'https://atos.net/en/careers'],
  ['Slalom',             'https://www.slalom.com/careers'],
  ['Pony.ai',            'https://pony.ai/careers'],
  ['Cruise',             'https://www.getcruise.com/careers'],
  ['Stoke Space',        'https://www.stokespace.com/careers'],
  ['ABL Space',          'https://ablspacesystems.com/careers'],
  ['ManTech',            'https://www.mantech.com/careers'],
  ['CACI',               'https://careers.caci.com'],
  ['Parsons',            'https://careers.parsons.com'],
  ['Lockheed Martin',    'https://www.lockheedmartinjobs.com'],
  ['Northrop Grumman',   'https://www.northropgrumman.com/jobs'],
  ['Raytheon',           'https://careers.rtx.com'],
  ['L3Harris',           'https://careers.l3harris.com'],
  ['Boeing',             'https://jobs.boeing.com'],
  ['IBM',                'https://www.ibm.com/careers/search'],
  ['Cisco',              'https://jobs.cisco.com'],
  ['Verizon',            'https://mycareer.verizon.com'],
  ['AT&T',               'https://www.att.jobs'],
  ['UnitedHealth',       'https://careers.unitedhealthgroup.com'],
  ['Cognizant',          'https://careers.cognizant.com'],
  ['Infosys',            'https://www.infosys.com/careers'],
  ['Wipro',              'https://careers.wipro.com'],
  ['HCLTech',            'https://www.hcltech.com/careers'],
  ['Tech Mahindra',      'https://careers.techmahindra.com'],
  ['Mphasis',            'https://www.mphasis.com/home/careers.html'],
  ['Genpact',            'https://www.genpact.com/careers'],
  ['Hexaware',           'https://hexaware.com/careers'],
  ['LTIMindtree',        'https://www.ltimindtree.com/careers'],
  ['Coforge',            'https://www.coforge.com/careers'],
  ['Persistent Systems', 'https://www.persistent.com/careers'],
  ['Northwestern Mutual','https://careers.northwesternmutual.com'],
  ['MassMutual',         'https://www.massmutual.com/about-us/careers'],
  ['Nationwide',         'https://nationwidecareers.com'],
  ['State Farm',         'https://www.statefarm.com/careers'],
  ['Liberty Mutual',     'https://www.libertymutualgroup.com/careers'],
  ['Geico',              'https://careers.geico.com'],
  ['Progressive',        'https://www.progressive.com/careers'],
  ['Allianz',            'https://careers.allianz.com'],
  ['MoneyGram',          'https://corporate.moneygram.com/careers'],
  ['Mastercard (alt)',   'https://careers.mastercard.com'],
  ['DocuSign',           'https://careers.docusign.com'],
  ['monday.com',         'https://monday.com/careers'],
  ['Zoom',               'https://careers.zoom.us'],
  ['Klarna',             'https://www.klarna.com/careers'],
  ['Fidelity',           'https://jobs.fidelity.com'],
  ['Citizens Bank',      'https://www.citizensbank.com/careers/default.aspx'],
  ['Akamai',             'https://www.akamai.com/careers'],
  ['Activision Blizzard','https://careers.activisionblizzard.com'],
  ['Electronic Arts',    'https://www.ea.com/careers'],
  ['Mandiant',           'https://www.mandiant.com/careers'],
  ['Bloomberg',          'https://www.bloomberg.com/company/careers'],
  ['Northern Trust',     'https://www.northerntrust.com/united-states/who-we-are/careers'],
  ['BNY Mellon',         'https://www.bnymellon.com/us/en/careers.html'],
  ['American Express',   'https://careers.americanexpress.com'],
  ['Truist',             'https://careers.truist.com'],
  ['PNC',                'https://careers.pnc.com'],
  ['Fifth Third',        'https://careers.53.com'],
  ['Regions',            'https://careers.regions.com'],
  ['Mphasis (alt)',      'https://www.mphasis.com/careers.html'],
  ['Honeywell',          'https://careers.honeywell.com'],
  ['Caterpillar',        'https://careers.caterpillar.com'],
  ['John Deere',         'https://careers.deere.com'],
  ['Verizon Wireless',   'https://www.verizon.com/about/careers'],
  ['Pony.ai (alt)',      'https://www.pony.ai/careers'],
  ['Cruise (alt)',       'https://getcruise.com/careers'],
  ['UPS',                'https://www.jobs-ups.com'],
  ['FedEx',              'https://careers.fedex.com'],
  ['Verisk',             'https://www.verisk.com/careers'],
];

function fetch(url, redirects = 0) {
  return new Promise((resolve) => {
    let parsed;
    try { parsed = new URL(url); } catch { return resolve({ error: 'bad url' }); }
    const lib = parsed.protocol === 'http:' ? http : https;
    const req = lib.request({
      method: 'GET',
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'http:' ? 80 : 443),
      path: parsed.pathname + parsed.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      timeout: 12000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 6) {
        const next = new URL(res.headers.location, url).href;
        res.destroy();
        return fetch(next, redirects + 1).then(resolve);
      }
      let data = '';
      res.on('data', (d) => {
        data += d;
        if (data.length > 1_500_000) { res.destroy(); resolve({ status: res.statusCode, body: data, finalUrl: url }); }
      });
      res.on('end', () => resolve({ status: res.statusCode, body: data, finalUrl: url }));
    });
    req.on('error', (e) => resolve({ error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });
    req.end();
  });
}

const SIGS = [
  // iCIMS — career site URLs and embedded scripts
  { ats: 'icims', re: /https?:\/\/careers-([a-z0-9-]+)\.icims\.com/i, group: 1 },
  { ats: 'icims', re: /https?:\/\/jobs-([a-z0-9-]+)\.icims\.com/i, group: 1 },
  { ats: 'icims', re: /([a-z0-9-]+)\.icims\.com\/jobs/i, group: 1 },

  // SuccessFactors — CareerSite/Career? company=
  { ats: 'successfactors', re: /career\?company=([A-Za-z0-9_-]+)/, group: 1 },
  { ats: 'successfactors', re: /careerSite\.do\?siteid=([A-Za-z0-9_-]+)/i, group: 1 },
  { ats: 'successfactors', re: /([a-z0-9-]+)\.successfactors\.com/i, group: 1 },

  // BrassRing/Kenexa — sjobs.brassring.com URLs with partnerid + siteid
  { ats: 'brassring', re: /sjobs\.brassring\.com[^"']*partnerid=(\d+)[^"']*siteid=(\d+)/i, group: 0 },
  { ats: 'brassring', re: /partnerid=(\d+).*siteid=(\d+)/i, group: 0 },

  // Taleo — tenantname.taleo.net
  { ats: 'taleo', re: /([a-z0-9-]+)\.taleo\.net\/careersection/i, group: 1 },
  { ats: 'taleo', re: /tbe\.taleo\.net\/CH\d+\/ats\/careers\/[^"']*/i, group: 0 },

  // Eightfold AI
  { ats: 'eightfold', re: /([a-z0-9-]+)\.eightfold\.ai\/careers/i, group: 1 },
  { ats: 'eightfold', re: /eightfold\.ai\/api\/apply\/v2\/jobs[^"']*domain=([^&"']+)/i, group: 1 },

  // Avature
  { ats: 'avature', re: /([a-z0-9-]+)\.avature\.net/i, group: 1 },

  // Phenom People
  { ats: 'phenompeople', re: /([a-z0-9-]+)\.phenompeople\.com/i, group: 1 },
  { ats: 'phenompeople', re: /phenom-?people\.com\/[^"']*\/([a-z0-9-]+)/i, group: 1 },

  // SmartRecruiters via embedded search widget
  { ats: 'smartrecruiters', re: /jobs\.smartrecruiters\.com\/([A-Za-z0-9_-]+)/, group: 1 },

  // JobVite
  { ats: 'jobvite', re: /jobs\.jobvite\.com\/([a-z0-9-]+)/i, group: 1 },

  // Workday — caught earlier, but probe again
  { ats: 'workday', re: /([a-z0-9_-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([a-z0-9_-]+)/i, group: 0 },

  // Greenhouse
  { ats: 'greenhouse', re: /(?:job-)?boards(?:-api)?\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9_-]+)/i, group: 1 },

  // Lever
  { ats: 'lever', re: /jobs\.lever\.co\/([a-z0-9_-]+)/i, group: 1 },

  // Ashby
  { ats: 'ashby', re: /(?:jobs|api)\.ashbyhq\.com\/(?:posting-api\/job-board\/)?([a-z0-9_-]+)/i, group: 1 },
];

function detect(html, finalUrl) {
  const haystack = (finalUrl || '') + '\n' + (html || '');
  const found = [];
  for (const sig of SIGS) {
    const m = haystack.match(sig.re);
    if (m) {
      const value = sig.group === 0 ? m[0] : m[sig.group];
      // dedupe by ATS
      if (!found.some((f) => f.ats === sig.ats)) {
        found.push({ ats: sig.ats, value });
      }
    }
  }
  return found;
}

(async () => {
  const results = [];
  let i = 0;
  for (const [name, url] of FAILED) {
    i++;
    process.stdout.write(`\r${i}/${FAILED.length} ${name.padEnd(28).slice(0, 28)}     `);
    const r = await fetch(url);
    if (r.error) {
      results.push({ name, url, error: r.error });
      continue;
    }
    const found = detect(r.body, r.finalUrl);
    results.push({ name, url, finalUrl: r.finalUrl, found });
  }
  process.stdout.write('\n\n');

  // Group by ATS
  const byAts = {};
  for (const r of results) {
    if (r.error || !r.found || !r.found.length) continue;
    for (const f of r.found) {
      (byAts[f.ats] ||= []).push({ name: r.name, value: f.value, finalUrl: r.finalUrl });
    }
  }

  for (const [ats, list] of Object.entries(byAts)) {
    console.log(`\n=== ${ats.toUpperCase()} (${list.length}) ===`);
    for (const item of list) {
      console.log(`  ${item.name.padEnd(28)} ${item.value}`);
    }
  }

  console.log('\n=== UNDETECTED ===');
  for (const r of results) {
    if (r.error) console.log(`  ${r.name.padEnd(28)} ERR: ${r.error}`);
    else if (!r.found?.length) console.log(`  ${r.name.padEnd(28)} → ${r.finalUrl}`);
  }
})();
