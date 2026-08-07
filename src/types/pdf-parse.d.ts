/**
 * pdf-parse ships no types, and the package root cannot be imported under ESM (its
 * index.js runs a debug branch that reads a sample file which is not published), so
 * `extract-text.ts` imports the library entry point directly. Declared here rather than
 * pulled from DefinitelyTyped to keep the optional dependency optional.
 */
declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseResult {
    text: string;
    numpages: number;
    info: Record<string, unknown>;
  }
  function pdfParse(data: Buffer | Uint8Array): Promise<PdfParseResult>;
  export default pdfParse;
}
