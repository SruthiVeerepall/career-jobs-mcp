/**
 * excel-session.mjs: lets export-jobs-xlsx.mjs rewrite a workbook that is open in Excel, and
 * keep the "Applied?" ticks the user made in it.
 *
 * Excel holds an open .xlsx locked, so writing it fails with EBUSY. When it is open, Excel is
 * asked over COM (Windows PowerShell) to save the workbook (so ticks made since the last save
 * are on disk), close it, and after the new file is written, open it again.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ExcelJS from 'exceljs';

/** True when another program (Excel) holds the file open for writing. */
export function isLocked(file) {
  if (!fs.existsSync(file)) return false;
  try { fs.closeSync(fs.openSync(file, 'r+')); return false; }
  catch (err) { return ['EBUSY', 'EPERM', 'EACCES'].includes(err.code); }
}

function excel(script, file) {
  if (process.platform !== 'win32') return 'unsupported';
  try {
    // The path goes in through the environment: with -Command, extra arguments are pasted into
    // the script text rather than arriving in $args.
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000, windowsHide: true,
        env: { ...process.env, JQ_XLSX: path.resolve(file) } }).trim();
  } catch (err) {
    return `failed: ${(err.stderr || err.message || '').toString().trim().split(/\r?\n/)[0]}`;
  }
}

// $env:JQ_XLSX is the file. DisplayAlerts off so a compatibility prompt cannot block the save.
const CLOSE = `
$p = [IO.Path]::GetFullPath($env:JQ_XLSX)
try { $xl = [Runtime.InteropServices.Marshal]::GetActiveObject('Excel.Application') } catch { 'not-open'; exit }
foreach ($wb in @($xl.Workbooks)) {
  if ($wb.FullName -ieq $p) { $xl.DisplayAlerts = $false; $wb.Save(); $wb.Close($false); $xl.DisplayAlerts = $true; 'closed'; exit }
}
'not-open'`;

const OPEN = `
$p = [IO.Path]::GetFullPath($env:JQ_XLSX)
try { $xl = [Runtime.InteropServices.Marshal]::GetActiveObject('Excel.Application') } catch { $xl = New-Object -ComObject Excel.Application }
$xl.Visible = $true
$null = $xl.Workbooks.Open($p)
'opened'`;

/** Save and close the workbook if Excel has it open: 'closed' | 'not-open' | 'unsupported' | 'failed: …'. */
export function closeInExcel(file) { return excel(CLOSE, file); }

/** Open the workbook in Excel again (after closeInExcel). */
export function openInExcel(file) { return excel(OPEN, file); }

/** Apply URLs whose "Applied?" box is ticked in an existing export, so a rewrite can keep them. */
export async function readAppliedUrls(file) {
  const ticked = new Set();
  if (!fs.existsSync(file)) return ticked;
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.worksheets[0];
    if (!ws) return ticked;
    const headers = {};
    ws.getRow(1).eachCell((c, col) => { headers[String(c.value ?? '').trim()] = col; });
    const appliedCol = headers['Applied?'];
    const urlCol = headers['Apply URL'];
    if (!appliedCol || !urlCol) return ticked;
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const v = row.getCell(appliedCol).value;
      const raw = row.getCell(urlCol).value;
      const url = typeof raw === 'string' ? raw : raw?.hyperlink ?? raw?.text;
      if ((v === true || v === 'TRUE') && url) ticked.add(String(url));
    });
  } catch { /* unreadable old file: start fresh rather than fail the export */ }
  return ticked;
}
