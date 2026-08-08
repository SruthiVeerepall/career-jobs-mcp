import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, resolve } from 'node:path';

export interface ResumeInput {
  /** Raw resume text, already extracted by the caller. */
  resumeText?: string;
  /** Path to a .pdf, .docx, .txt, .md, or .html resume. */
  resumePath?: string;
}

export interface ExtractedResume {
  text: string;
  source: string;
  format: string;
}

const TEXT_EXT = new Set(['.txt', '.md', '.markdown', '.rst', '.text', '']);

/**
 * Read a resume into plain text.
 *
 * `.pdf` and `.docx` go through optional dependencies loaded on demand — the server must
 * still start (and plain-text resumes must still work) when they are not installed, so a
 * missing parser has to surface as an actionable message rather than a module-load crash.
 */
export async function extractResumeText(input: ResumeInput): Promise<ExtractedResume> {
  if (input.resumeText && input.resumeText.trim().length > 0) {
    return { text: normalize(input.resumeText), source: 'inline text', format: 'text' };
  }

  if (!input.resumePath) {
    throw new Error('Provide either `resumeText` (the resume pasted as text) or `resumePath` (a .pdf/.docx/.txt/.md file).');
  }

  const path = resolve(input.resumePath);
  if (!existsSync(path)) throw new Error(`Resume file not found: ${path}`);

  const ext = extname(path).toLowerCase();

  if (TEXT_EXT.has(ext)) {
    return { text: normalize(await readFile(path, 'utf8')), source: path, format: ext.replace('.', '') || 'text' };
  }

  if (ext === '.pdf') {
    return { text: normalize(await readPdf(path)), source: path, format: 'pdf' };
  }

  if (ext === '.docx') {
    return { text: normalize(await readDocx(path)), source: path, format: 'docx' };
  }

  if (ext === '.html' || ext === '.htm') {
    const cheerio = await import('cheerio');
    const $ = cheerio.load(await readFile(path, 'utf8'));
    $('script, style').remove();
    return { text: normalize($('body').text() || $.root().text()), source: path, format: 'html' };
  }

  if (ext === '.doc' || ext === '.rtf' || ext === '.pages') {
    throw new Error(`Legacy format "${ext}" cannot be read. Save the resume as PDF or DOCX, or paste it via \`resumeText\`.`);
  }

  throw new Error(`Unsupported resume format "${ext}". Supported: .pdf, .docx, .txt, .md, .html — or pass \`resumeText\`.`);
}

async function readPdf(path: string): Promise<string> {
  let pdfParse: (buf: Buffer) => Promise<{ text: string }>;
  try {
    // Import the library entry point directly. pdf-parse's index.js runs a debug branch
    // when `module.parent` is falsy — which it always is under ESM — and that branch reads
    // a sample file that does not ship, so importing the package root throws ENOENT.
    const mod = await import('pdf-parse/lib/pdf-parse.js');
    pdfParse = (mod.default ?? mod) as typeof pdfParse;
  } catch (err) {
    throw new Error(`Reading PDF resumes needs the "pdf-parse" package (npm install pdf-parse). Original error: ${msg(err)}`);
  }
  const parsed = await pdfParse(await readFile(path));
  if (!parsed.text || parsed.text.trim().length < 50) {
    throw new Error('The PDF produced almost no text — it is probably a scanned image. Paste the resume via `resumeText` instead.');
  }
  return parsed.text;
}

async function readDocx(path: string): Promise<string> {
  let mammoth: { extractRawText: (o: { path: string }) => Promise<{ value: string }> };
  try {
    const mod = await import('mammoth');
    mammoth = (mod.default ?? mod) as typeof mammoth;
  } catch (err) {
    throw new Error(`Reading DOCX resumes needs the "mammoth" package (npm install mammoth). Original error: ${msg(err)}`);
  }
  const result = await mammoth.extractRawText({ path });
  return result.value;
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * PDF extraction emits ligatures, non-breaking spaces, and bullet glyphs that break the
 * word-boundary matching the profile builder relies on. Collapse them, but keep newlines —
 * section detection and title extraction are line-oriented.
 */
function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[•●▪·]/g, ' ')
    .replace(/ﬁ/g, 'fi')
    .replace(/ﬂ/g, 'fl')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
