// Validate discovered ATS identifiers by pulling real board data:
// job count + a sample of titles/locations, so obviously-wrong boards
// (from the brute-force slug fallback) can be spotted and dropped.
import { promises as fs } from 'node:fs';
import axios from 'axios';

const inputFile = process.argv[2] || 'companies-batch2.txt';
const outBase = inputFile.replace(/\.txt$/, '');
const data = JSON.parse(await fs.readFile(`discovered-${outBase}.json`, 'utf8'));

const TIMEOUT = 20000;
const g = (url, opts = {}) => axios.get(url, { timeout: TIMEOUT, validateStatus: () => true, ...opts });

async function inspect(r) {
  const { platform, identifier } = r;
  try {
    if (platform === 'greenhouse') {
      const meta = await g(`https://boards-api.greenhouse.io/v1/boards/${identifier}`);
      const jobs = await g(`https://boards-api.greenhouse.io/v1/boards/${identifier}/jobs`);
      const list = jobs.data?.jobs || [];
      return { boardName: meta.data?.name, count: list.length, sample: list.slice(0, 3).map(j => `${j.title} @ ${j.location?.name}`) };
    }
    if (platform === 'lever') {
      const jobs = await g(`https://api.lever.co/v0/postings/${identifier}?mode=json`);
      const list = Array.isArray(jobs.data) ? jobs.data : [];
      return { boardName: list[0]?.categories?.team, count: list.length, sample: list.slice(0, 3).map(j => `${j.text} @ ${j.categories?.location}`) };
    }
    if (platform === 'ashby') {
      const jobs = await g(`https://api.ashbyhq.com/posting-api/job-board/${identifier}`);
      const list = jobs.data?.jobs || [];
      return { boardName: list[0]?.jobUrl, count: list.length, sample: list.slice(0, 3).map(j => `${j.title} @ ${j.location}`) };
    }
    if (platform === 'smartrecruiters') {
      const jobs = await g(`https://api.smartrecruiters.com/v1/companies/${identifier}/postings?limit=5`);
      const list = jobs.data?.content || [];
      return { boardName: list[0]?.company?.name, count: jobs.data?.totalFound, sample: list.slice(0, 3).map(j => `${j.name} @ ${j.location?.city}`) };
    }
    if (platform === 'workday') {
      const [tenant, wd, site] = identifier.split('|');
      const res = await axios.post(
        `https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`,
        { limit: 5, offset: 0, searchText: '', appliedFacets: {} },
        { timeout: TIMEOUT, validateStatus: () => true, headers: { 'Content-Type': 'application/json', Accept: 'application/json' } },
      );
      const list = res.data?.jobPostings || [];
      return { boardName: `${tenant}/${site}`, count: res.data?.total, sample: list.slice(0, 3).map(j => `${j.title} @ ${j.locationsText}`) };
    }
  } catch (e) {
    return { error: e.message };
  }
  return { error: 'unknown platform' };
}

const out = [];
for (const r of data.verified) {
  const info = await inspect(r);
  out.push({ ...r, ...info });
  console.log(`\n${r.name}  [${r.platform}:${r.identifier}]`);
  console.log(`  board=${info.boardName}  jobs=${info.count}${info.error ? '  ERR=' + info.error : ''}`);
  for (const s of info.sample || []) console.log(`    - ${s}`);
}
await fs.writeFile(`validated-${outBase}.json`, JSON.stringify(out, null, 2));
console.log(`\nWrote validated-${outBase}.json`);
