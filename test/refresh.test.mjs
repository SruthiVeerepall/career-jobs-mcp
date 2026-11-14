import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { refreshLink, parseJobQuestLink } from '../dist/apply/protocol.js';
import { exportArgs, saveOutputs, loadOutputs } from '../job-quest-outputs.mjs';
import { readAppliedUrls, isLocked } from '../excel-session.mjs';

test('jobquest://refresh links accept only the four board windows', () => {
  assert.equal(refreshLink(7), 'jobquest://refresh?days=7');
  assert.deepEqual(parseJobQuestLink('jobquest://refresh?days=30'), { action: 'refresh', days: 30 });
  assert.deepEqual(parseJobQuestLink('jobquest://refresh/?days=1'), { action: 'refresh', days: 1 });
  assert.throws(() => parseJobQuestLink('jobquest://refresh?days=365'), /one of/);
  // Extra parameters are ignored: a link can never name an output.
  assert.deepEqual(parseJobQuestLink('jobquest://refresh?days=7&out=C:/x.xlsx'), { action: 'refresh', days: 7 });
  assert.throws(() => refreshLink(5), /one of/);
});

test('saved outputs rebuild the full export command with only the window changed', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jq-')), 'outputs.json');
  saveOutputs({ resumePath: 'C:/r.docx', xlsx: 'C:/jobs.xlsx', page: 'C:/job-quest.html', minJdMatch: 40, publish: true }, file);
  const o = loadOutputs(file);
  assert.deepEqual(exportArgs(o, 7), [
    '--resume', path.resolve('C:/r.docx'), '--days', '7', '--out', path.resolve('C:/jobs.xlsx'),
    '--page', path.resolve('C:/job-quest.html'), '--min-jd-match', '40',
  ]);
  assert.ok(exportArgs({ ...o, publish: false }, 1).includes('--no-publish'));
  assert.throws(() => exportArgs(null, 3), /Run the daily export once/);
});

test('ticks in an existing sheet are read back by apply URL', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jq-')), 'jobs.xlsx');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Jobs');
  ws.columns = [{ header: 'Applied?', key: 'a' }, { header: 'Title', key: 't' }, { header: 'Apply URL', key: 'u' }];
  ws.addRow({ a: true, t: 'One', u: 'https://x.test/1' });
  ws.addRow({ a: false, t: 'Two', u: 'https://x.test/2' });
  ws.addRow({ a: true, t: 'Three', u: { text: 'https://x.test/3', hyperlink: 'https://x.test/3' } });
  await wb.xlsx.writeFile(file);
  assert.deepEqual([...await readAppliedUrls(file)].sort(), ['https://x.test/1', 'https://x.test/3']);
  assert.equal(isLocked(file), false);
  assert.equal((await readAppliedUrls(file + '.missing')).size, 0);
});
