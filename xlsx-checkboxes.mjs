import fs from 'node:fs';
import JSZip from 'jszip';

/**
 * Turn the boolean cells of column A (rows firstRow..lastRow) into Excel's native in-cell
 * checkboxes. ExcelJS cannot write them, so the saved file is patched: the cells' style
 * gets an `xfComplement` pointing at a Checkbox feature-property-bag part.
 *
 * Excel 365 shows a clickable checkbox (TRUE when ticked). Older Excel, LibreOffice and
 * Google Sheets ignore the extension and show TRUE/FALSE, which COUNTIF still counts.
 */
export async function addCheckboxes(file, firstRow, lastRow) {
  const zip = await JSZip.loadAsync(await fs.promises.readFile(file));
  const sheetPath = 'xl/worksheets/sheet1.xml';
  let sheet = await zip.file(sheetPath).async('string');
  let styles = await zip.file('xl/styles.xml').async('string');

  // Every <xf> in cellXfs, in index order.
  const xfsMatch = styles.match(/<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/);
  if (!xfsMatch) throw new Error('styles.xml has no cellXfs');
  const xfs = xfsMatch[2].match(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g) ?? [];
  const EXT = '<extLst><ext uri="{C7286773-470A-42A8-94C5-96B5CB345126}" ' +
    'xmlns:xfpb="http://schemas.microsoft.com/office/spreadsheetml/2022/featurepropertybag">' +
    '<xfpb:xfComplement i="0"/></ext></extLst>';

  // Clone each style the checkbox cells use, so no other cell sharing it becomes a checkbox.
  const cloned = new Map();
  const checkboxStyle = (s) => {
    if (!cloned.has(s)) {
      const xf = xfs[Number(s)] ?? '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>';
      xfs.push(xf.endsWith('/>') ? `${xf.slice(0, -2)}>${EXT}</xf>` : xf.replace(/<\/xf>$/, `${EXT}</xf>`));
      cloned.set(s, String(xfs.length - 1));
    }
    return cloned.get(s);
  };
  sheet = sheet.replace(/<c ([^>]*?)(\/?)>/g, (tag, attrs, selfClose) => {
    const row = Number(attrs.match(/\br="A(\d+)"/)?.[1]);
    if (!row || row < firstRow || row > lastRow) return tag;
    const s = attrs.match(/\bs="(\d+)"/)?.[1] ?? '0';
    const next = /\bs="/.test(attrs) ? attrs.replace(/\bs="\d+"/, `s="${checkboxStyle(s)}"`) : `${attrs} s="${checkboxStyle(s)}"`;
    return `<c ${next}${selfClose}>`;
  });
  styles = styles.replace(xfsMatch[0], `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>`);

  zip.file(sheetPath, sheet);
  zip.file('xl/styles.xml', styles);
  zip.file('xl/featurePropertyBag/featurePropertyBag.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<FeaturePropertyBags xmlns="http://schemas.microsoft.com/office/spreadsheetml/2022/featurepropertybag">' +
    '<bag type="Checkbox"/>' +
    '<bag type="XFControls"><bagId k="CellControl">0</bagId></bag>' +
    '<bag type="XFComplement"><bagId k="XFControls">1</bagId></bag>' +
    '<bag type="XFComplements" extRef="XFComplementsMapperExtRef"><a k="MappedFeaturePropertyBags"><bagId>2</bagId></a></bag>' +
    '</FeaturePropertyBags>');

  let rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  rels = rels.replace('</Relationships>',
    '<Relationship Id="rIdFpb1" Type="http://schemas.microsoft.com/office/2022/11/relationships/FeaturePropertyBag" ' +
    'Target="featurePropertyBag/featurePropertyBag.xml"/></Relationships>');
  zip.file('xl/_rels/workbook.xml.rels', rels);

  let types = await zip.file('[Content_Types].xml').async('string');
  types = types.replace('</Types>',
    '<Override PartName="/xl/featurePropertyBag/featurePropertyBag.xml" ' +
    'ContentType="application/vnd.ms-excel.featurepropertybag+xml"/></Types>');
  zip.file('[Content_Types].xml', types);

  await fs.promises.writeFile(file, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}
