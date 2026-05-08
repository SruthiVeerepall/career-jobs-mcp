// Probe known Workday/Greenhouse/Lever tenants for big-name companies
// that auto-discovery couldn't detect.
import https from 'node:https';

const WORKDAY = [
  ['HashiCorp',         'https://www.hashicorp.com/careers',                'hashicorp',     'wd1', 'HashiCorp_Careers'],
  ['Akamai',            'https://www.akamai.com/careers',                   'akamai',        'wd1', 'Akamai'],
  ['Verizon',           'https://mycareer.verizon.com',                     'verizon',       'wd1', 'careers'],
  ['Activision Blizzard','https://careers.activisionblizzard.com',          'activision',    'wd5', 'ABK_External_Career_Site'],
  ['Electronic Arts',   'https://www.ea.com/careers',                       'ea',            'wd1', 'EA_External'],
  ['Ubisoft',           'https://www.ubisoft.com/en-us/company/careers',    'ubisoft',       'wd3', 'ubisoftgroup'],
  ['Walgreens',         'https://jobs.walgreens.com',                       'wba',           'wd1', 'Careers_External'],
  ['CVS Health',        'https://jobs.cvshealth.com',                       'cvshealth',     'wd1', 'CVS_Health_Careers'],
  ['McKesson',          'https://careers.mckesson.com',                     'mckesson',      'wd5', 'External_Career_Site'],
  ['Cardinal Health',   'https://www.cardinalhealth.com/en/about-us/careers.html', 'cardinalhealth', 'wd1', 'CardinalHealth'],
  ['Charter',           'https://jobs.spectrum.com',                        'charter',       'wd5', 'Spectrum'],
  ['Yelp',              'https://www.yelp.careers',                         'yelp',          'wd5', 'YelpCareers'],
  ['eBay',              'https://careers.ebayinc.com',                      'ebay',          'wd5', 'eBayCareers'],
  ['Etsy',              'https://careers.etsy.com',                         'etsy',          'wd5', 'Etsy_Careers'],
  ['Wayfair',           'https://www.aboutwayfair.com/careers',             'wayfair',       'wd1', 'Wayfair_Careers'],
  ['Best Buy',          'https://corporate.bestbuy.com/careers',            'bestbuy',       'wd5', 'BestBuyExternal'],
  ['Walmart',           'https://careers.walmart.com',                      'walmart',       'wd5', 'WalmartExternal'],
  ['Costco',            'https://www.costco.com/jobs.html',                 'costco',        'wd5', 'costcocareers'],
  ['Adidas',            'https://careers.adidas.com',                       'adidas',        'wd3', 'workday'],
  ['Under Armour',      'https://careers.underarmour.com',                  'underarmour',   'wd1', 'UACareers'],
  ['Lululemon',         'https://careers.lululemon.com',                    'lululemon',     'wd3', 'lululemon'],
  ['Logitech',          'https://jobs.logitech.com',                        'logitech',      'wd1', 'logitech_careers'],
  ['Qualcomm',          'https://www.qualcomm.com/company/careers',         'qcom',          'wd1', 'External'],
  ['UnitedHealth Group','https://careers.unitedhealthgroup.com',            'uhg',           'wd5', 'UnitedHealthGroup'],
  ['Humana',            'https://careers.humana.com',                       'humana',        'wd5', 'Humana_External_Career_Site'],
  ['Morgan Stanley',    'https://www.morganstanley.com/people-opportunities','morganstanley','wd5', 'External'],
  ['HSBC',              'https://www.hsbc.com/careers',                     'hsbc',          'wd3', 'HSBC_Careers'],
  ['UBS',               'https://www.ubs.com/global/en/careers.html',       'ubs',           'wd5', 'UBSCareerSite'],
  ['ING',               'https://www.ing.jobs',                             'ing',           'wd5', 'ING_Careers'],
  ['Avalara',           'https://www.avalara.com/us/en/about/careers.html', 'avalara',       'wd1', 'avalara'],
  ['Sovos',             'https://sovos.com/careers',                        'sovos',         'wd5', 'sovos'],
  ['Lockheed Martin',   'https://www.lockheedmartinjobs.com',               'lmco',          'wd1', 'External'],
  ['Northrop Grumman',  'https://www.northropgrumman.com/jobs',             'northropgrumman','wd1', 'NGCS'],
  ['Raytheon',          'https://careers.rtx.com',                          'rtx',           'wd5', 'RTX'],
  ['L3Harris',          'https://careers.l3harris.com',                     'l3harris',      'wd5', 'L3Harris_Careers'],
  ['FICO',              'https://www.fico.com/en/careers',                  'fico',          'wd1', 'FICOCareers'],
  ['Experian',          'https://www.experianplc.com/careers',              'experian',      'wd5', 'experiancareers'],
  ['Equifax',           'https://www.equifax.com/about-equifax/careers',    'equifax',       'wd5', 'EFXjobs'],
  ['TransUnion',        'https://www.transunion.com/careers',               'transunion',    'wd5', 'TransUnion_Careers'],
  ['Verisk Analytics',  'https://www.verisk.com/careers',                   'verisk',        'wd5', 'verisk'],
  ['Cruise',            'https://www.getcruise.com/careers',                'gm',            'wd1', 'Cruise'],
  ['Volvo Cars',        'https://www.volvocars.com/intl/v/careers',         'volvocars',     'wd3', 'volvogrouprecruitmentportal'],
  ['Rivian',            'https://careers.rivian.com',                       'rivian',        'wd5', 'Rivian'],
  ['Procore',           'https://careers.procore.com',                      'procore',       'wd5', 'careers'],
  ['AppFolio',          'https://www.appfolioinc.com/careers',              'appfolio',      'wd1', 'AppFolio_Careers'],
  ['RealPage',          'https://www.realpage.com/careers',                 'realpage',      'wd5', 'External_Career_Site'],
  ['Yardi',             'https://www.yardi.com/careers',                    'yardi',         'wd1', 'Careers'],
  ['Chegg',             'https://www.chegg.com/about/working-at-chegg/current-openings', 'chegg', 'wd1', 'Chegg'],
  ['Cognizant',         'https://careers.cognizant.com',                    'cognizant',     'wd1', 'Cognizant_Careers'],
  ['Capgemini',         'https://www.capgemini.com/careers',                'capgemini',     'wd3', 'capgemini'],
  ['Infosys',           'https://www.infosys.com/careers',                  'infosys',       'wd5', 'careers'],
  ['Wipro',             'https://careers.wipro.com',                        'wipro',         'wd1', 'Wipro_Careers'],
  ['HCLTech',           'https://www.hcltech.com/careers',                  'hcl',           'wd1', 'HCL_External'],
  ['EPAM Systems',      'https://www.epam.com/careers',                     'epam',          'wd5', 'EPAM_Anywhere'],
  ['Persistent Systems','https://www.persistent.com/careers',               'persistentsys', 'wd1', 'Persistent_External_Career_Site'],
  ['Mphasis',           'https://www.mphasis.com/home/careers.html',        'mphasis',       'wd5', 'careers'],
  ['Tech Mahindra',     'https://careers.techmahindra.com',                 'techmahindra',  'wd1', 'TechM'],
  ['Rippling',          'https://www.rippling.com/careers',                 'rippling',      'wd1', 'rippling_careers'],
  ['Paycor',            'https://careers.paycor.com',                       'paycor',        'wd1', 'paycor'],
  ['Paylocity',         'https://www.paylocity.com/careers',                'paylocity',     'wd1', 'paylocity_careers'],
  ['UKG',               'https://www.ukg.com/about-us/careers',             'ukg',           'wd5', 'UKG'],
  ['Northwestern Mutual','https://careers.northwesternmutual.com',          'nm',            'wd5', 'NM_Career_Site'],
  ['MassMutual',        'https://www.massmutual.com/about-us/careers',      'massmutual',    'wd5', 'MassMutual_Careers'],
  ['John Hancock',      'https://www.johnhancock.com/about-us/careers',     'manulife',      'wd3', 'MFCJH_Jobs'],
  ['Sun Life',          'https://www.sunlife.com/en/about-us/careers',      'sunlife',       'wd3', 'Experienced-Hires'],
  ['Match Group',       'https://careers.matchgroup.com',                   'match',         'wd5', 'match'],
  ['Sephora',           'https://www.sephora.com/about-us/careers',         'sephora',       'wd5', 'sephora_careers'],
];

const GREENHOUSE = [
  ['HashiCorp',         'https://www.hashicorp.com/careers',                'hashicorp'],
  ['GitHub',            'https://github.com/about/careers',                 'github'],
  ['Match Group',       'https://careers.matchgroup.com',                   'matchgroup'],
  ['Hinge',             'https://hinge.co/careers',                         'hingehealth'],
  ['Strava',            'https://www.strava.com/careers',                   'strava'],
  ['Anduril',           'https://www.anduril.com/careers',                  'andurilindustries'],
  ['Saronic',           'https://www.saronic.com/careers',                  'saronictechnologies'],
  ['Firefly Aerospace', 'https://fireflyspace.com/careers',                 'fireflyaerospace'],
  ['Wix',               'https://www.wix.com/jobs',                         'wix'],
  ['Casetext',          'https://casetext.com/careers',                     'casetext'],
  ['Hims & Hers',       'https://www.forhims.com/careers',                  'himshers'],
  ['Mobileye',          'https://careers.mobileye.com',                     'mobileye'],
  ['Polestar',          'https://www.polestar.com/global/careers',          'polestar'],
  ['Sketch',            'https://www.sketch.com/careers',                   'sketch'],
  ['InVision',          'https://www.invisionapp.com/careers',              'invision'],
  ['Frame.io',          'https://frame.io/careers',                         'frameio'],
  ['Whimsical',         'https://whimsical.com/jobs',                       'whimsical'],
  ['Framer',            'https://www.framer.com/careers',                   'framer'],
  ['MyCase',            'https://www.mycase.com/careers',                   'mycase'],
  ['EvenUp',            'https://www.evenuplaw.com/careers',                'evenup'],
  ['Spellbook',         'https://www.spellbook.legal/careers',              'spellbook'],
  ['Mosaic',            'https://www.mosaicml.com/careers',                 'mosaicml'],
  ['Cybereason',        'https://www.cybereason.com/careers',               'cybereason'],
  ['Quizlet',           'https://quizlet.com/jobs',                         'quizlet'],
  ['Codecademy',        'https://www.codecademy.com/about/careers',         'codecademy'],
  ['ThoughtSpot',       'https://www.thoughtspot.com/careers',              'thoughtspot'],
  ['Domo',              'https://www.domo.com/company/careers',             'domo'],
  ['Hugging Face',      'https://huggingface.co/jobs',                      'huggingface'],
  ['Cerebras',          'https://cerebras.ai/careers',                      'cerebrassystems'],
  ['SambaNova',         'https://sambanova.ai/careers',                     'sambanovasystems'],
  ['Snap',              'https://careers.snap.com',                         'snapinc'],
  ['Wealthsimple',      'https://www.wealthsimple.com/en-us/careers',       'wealthsimple'],
];

function get(url, opts = {}) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request({
      method: opts.method || 'GET',
      hostname: u.hostname, port: 443, path: u.pathname + u.search,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*', ...(opts.headers || {}) },
      timeout: 8000,
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', () => resolve({ status: 0 }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0 }); });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function probeWorkday(tenant, wd, site) {
  const r = await get(`https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: 1, offset: 0, searchText: '' }),
  });
  return r.status === 200;
}

async function probeGreenhouse(slug) {
  const r = await get(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=false`);
  return r.status === 200 && r.body && r.body.includes('"jobs"');
}

(async () => {
  const verified = [];
  console.log('=== WORKDAY PROBES ===');
  for (const [name, url, t, w, s] of WORKDAY) {
    const ok = await probeWorkday(t, w, s);
    console.log(`${ok?'✓':'✗'} ${name.padEnd(28)} ${t}|${w}|${s}`);
    if (ok) verified.push({ name, url, platform: 'workday', identifier: `${t}|${w}|${s}` });
  }
  console.log('\n=== GREENHOUSE PROBES ===');
  for (const [name, url, slug] of GREENHOUSE) {
    const ok = await probeGreenhouse(slug);
    console.log(`${ok?'✓':'✗'} ${name.padEnd(28)} ${slug}`);
    if (ok) verified.push({ name, url, platform: 'greenhouse', identifier: slug });
  }
  console.log(`\n=== ${verified.length} verified ===`);
  console.log(JSON.stringify(verified, null, 2));
})();
