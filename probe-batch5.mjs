import https from 'node:https';

const WORKDAY = [
  ['Mandiant',          'mandiant',     'wd1', 'External_Career'],
  ['Banner Health',     'bannerhealth', 'wd1', 'BannerHealth'],
  ['Mayo Clinic',       'mayo',         'wd5', 'mayoclinicjobs'],
  ['Mount Sinai',       'mountsinai',   'wd1', 'mountsinaijobs'],
  ['Stanford Health',   'stanfordhealthcare','wd5', 'StanfordHealthCare'],
  ['Sutter Health',     'sutterhealth', 'wd5', 'sutterhealthjobs'],
  ['Providence',        'providence',   'wd5', 'providence'],
  ['Ascension',         'ascension',    'wd5', 'ascensioncareers'],
  ['Trinity Health',    'trinityhealth','wd1', 'trinityhealth'],
  ['athenahealth',      'athenahealth', 'wd1', 'athena_career_site'],
  ['Aflac',             'aflac',        'wd1', 'aflaccareers'],
  ['American Family',   'amfam',        'wd1', 'AmFamCareers'],
  ['Genworth',          'genworth',     'wd1', 'Genworth_Careers'],
  ['Comerica',          'comerica',     'wd1', 'Comerica'],
  ['Ally Financial',    'ally',         'wd1', 'External'],
  ['Citizens',          'citizensbank', 'wd1', 'CitizensBank'],
  ['Bright Health',     'brighthealth', 'wd1', 'External'],
  ['Citizens Financial','citizens',     'wd1', 'External'],
  ['Pony.ai',           'ponyai',       'wd1', 'pony'],
  ['Mandiant (Google)', 'google',       'wd1', 'Mandiant'],
  ['Webull',            'webull',       'wd1', 'webull'],
  ['Stoke Space',       'stokespace',   'wd1', 'External'],
  ['Mandiant SR',       'Mandiant',     null,  null],
  ['Drops SR',          'Drops',        null,  null],
  ['Vodafone',          'vodafone',     'wd3', 'vodafone'],
  ['BT Group',          'bt',           'wd5', 'BT'],
  ['Broadcom',          'broadcom',     'wd1', 'External_Career_Site'],
  ['Intuitive Machines','intuitivemachines', 'wd1', 'External'],
];

const GREENHOUSE = [
  ['Mandiant',          'mandiant'],
  ['Color',             'colorhealth'],
  ['Banner Health',     'bannerhealth'],
  ['HelpScout',         'helpscout'],
  ['Webull',            'webull'],
  ['Citizens',          'citizensbank'],
  ['Pony AI',           'ponyai'],
  ['Stoke Space',       'stokespace'],
  ['ABL Space',         'ablspace'],
  ['ManTech',           'mantech'],
  ['CACI',              'caci'],
  ['Parsons',           'parsons'],
  ['Kratos',            'kratosdefense'],
  ['Vinted',            'vinted'],
  ['Depop',             'depop'],
  ['GOAT',              'goatgroup'],
  ['Mythical Games',    'mythicalgames'],
  ['Improbable',        'improbable'],
  ['Rakuten',           'rakuten'],
  ['Newegg',            'newegg'],
  ['Casper',            'casper'],
  ['ThredUp',           'thredup'],
  ['Better.com',        'bettercom'],
  ['Side',              'siderealestate'],
  ['Atos',              'atos'],
  ['Slalom',            'slalom'],
  ['Kahoot',            'kahoot'],
  ['Drops',             'drops'],
  ['Babbel',            'babbel'],
  ['IXL',               'ixl'],
  ['Brainly',           'brainly'],
  ['Hexaware',          'hexaware'],
  ['LTIMindtree',       'ltimindtree'],
  ['Genpact',           'genpact'],
  ['Coforge',           'coforge'],
  ['Egnyte',            'egnyte'],
  ['Coro',              'coro'],
  ['Cloudian',          'cloudian'],
  ['Druva',             'druva'],
  ['Bonusly',           'bonusly'],
  ['Zenefits',          'zenefits'],
  ['Dice',              'dice'],
  ['Hired',             'hired'],
  ['Erie Insurance',    'erieinsurance'],
  ['Brighthouse',       'brighthousefinancial'],
  ['Globe Life',        'globelife'],
  ['Aflac',             'aflac'],
  ['Markel',            'markelcorporation'],
  ['Munich Re',         'munichre'],
  ['Swiss Re',          'swissre'],
  ['CACI Intl',         'caciinternational'],
  ['Sierra Space',      'sierraspace'],
  ['Beta Tech',         'betatechnologies'],
  ['Kodiak Robotics',   'kodiakrobotics'],
  ['ZipRecruiter',      'ziprecruiter'],
  ['Outreach',          'outreach'],
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

async function probeWorkday(t, w, s) {
  const r = await get(`https://${t}.${w}.myworkdayjobs.com/wday/cxs/${t}/${s}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: 1, offset: 0, searchText: '' }),
  });
  return r.status === 200;
}

async function probeGreenhouse(slug) {
  const r = await get(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=false`);
  return r.status === 200 && r.body?.includes('"jobs"');
}

(async () => {
  const verified = [];
  console.log('=== WORKDAY PROBES ===');
  for (const [name, t, w, s] of WORKDAY) {
    if (!w) continue;
    const ok = await probeWorkday(t, w, s);
    console.log(`${ok?'✓':'✗'} ${name.padEnd(28)} ${t}|${w}|${s}`);
    if (ok) verified.push({ name, platform: 'workday', identifier: `${t}|${w}|${s}` });
  }
  console.log('\n=== GREENHOUSE PROBES ===');
  for (const [name, slug] of GREENHOUSE) {
    const ok = await probeGreenhouse(slug);
    console.log(`${ok?'✓':'✗'} ${name.padEnd(28)} ${slug}`);
    if (ok) verified.push({ name, platform: 'greenhouse', identifier: slug });
  }
  console.log(`\n=== ${verified.length} verified ===`);
  console.log(JSON.stringify(verified, null, 2));
})();
