// Combine the HTTP and browser discovery passes, drop the boards that were
// verified as reachable but proved to belong to someone else (the slug-variant
// fallback can land on an unrelated company with the same first word), and emit
// the pair of files merge-registry.mjs consumes.
import { promises as fs } from 'node:fs';

// Reachable but wrong — each checked by hand against the board's actual postings.
const DROP = new Map([
  ['Nutanix', 'ashby board exists but returns 0 jobs'],
  ['Eli Lilly', 'ashby "eli" is an unrelated company (1 job, Montreal marketing)'],
  ['Union Pacific', 'ashby "union" is an unrelated Seattle software company'],
  ['US Foods', 'greenhouse "us" is the board of "itel", not US Foods'],
  ['Flock Safety', 'ashby "flock" is Flock, the UK motor-fleet insurer'],
  ['Angi', 'ashby "angi" is an unrelated EU company, not Angi home services'],
  ['NBCUniversal', 'smartrecruiters "my-applications" is not a real board (0 jobs)'],
  ['Otis', 'workday endpoint returns HTML, not the jobs JSON'],
  ['Discover Financial Services', 'resolves to the Capital One tenant already in the registry'],
]);

const passes = ['discovered-companies-batch2.json', 'discovered-browser-companies-batch2.json'];
const verified = [];
const seen = new Set();
for (const f of passes) {
  const data = JSON.parse(await fs.readFile(f, 'utf8'));
  for (const r of data.verified) {
    if (DROP.has(r.name) || seen.has(r.name)) continue;
    seen.add(r.name);
    verified.push(r);
  }
}

// Keep the human-supplied careers URLs, not the redirect targets.
const inputLines = (await fs.readFile('companies-batch2.txt', 'utf8'))
  .split('\n').map(l => l.trim()).filter(Boolean);
const keep = inputLines.filter(l => seen.has(l.split('|')[0].trim()));

await fs.writeFile('companies-final.txt', keep.join('\n') + '\n');
await fs.writeFile('discovered-companies-final.json', JSON.stringify({ verified, failed: [] }, null, 2));

const byPlat = {};
for (const r of verified) (byPlat[r.platform] ||= []).push(r.name);
console.log(`Kept ${verified.length} verified companies (dropped ${DROP.size} false positives)\n`);
for (const [p, l] of Object.entries(byPlat)) console.log(`  ${p.padEnd(16)} ${l.length}`);
console.log('\nDropped:');
for (const [n, why] of DROP) console.log(`  ${n.padEnd(30)} ${why}`);
