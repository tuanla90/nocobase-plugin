// Batch export modes for the "In hàng loạt" action:
//  - 'print' : one merged document, printed once (handled in printService.batchPrint)
//  - 'zip'   : one PDF per record, bundled into a ZIP and downloaded (raster)
//  - 'field' : one PDF per record, saved into each record's attachment field (raster)
import { renderPdfBlobSmart, sanitizeFilename, savePdfToField } from './pdfSave';
import { ensureTemplateLibs, fetchRecordData, partialTemplates, printableTemplates, renderTemplateParts } from './printService';
import { PrintTemplate, pickTemplateForRecord } from './types';
import { loadScriptClean } from './scriptLoader';

const JSZIP_URL = '/static/plugins/@ptdl/plugin-print-template/dist/jszip.min.js';

async function ensureJSZip(): Promise<any> {
  const w = window as any;
  if (!w.JSZip) await loadScriptClean(JSZIP_URL);
  return w.JSZip;
}

function pickTemplate(printable: PrintTemplate[], opts: { pinnedId?: number; auto?: boolean }, record: any): PrintTemplate | undefined {
  if (opts.auto) return pickTemplateForRecord(printable, record);
  return (opts.pinnedId && printable.find((t) => t.id === opts.pinnedId)) || printable[0];
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** One PDF per record → ZIP → download. onProgress(done,total) for a progress UI. */
export async function batchExportZip(
  api: any,
  collectionName: string,
  templates: PrintTemplate[],
  tks: any[],
  opts: { pinnedId?: number; auto?: boolean },
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const JSZip = await ensureJSZip();
  const zip = new JSZip();
  const printable = printableTemplates(templates);
  const partials = partialTemplates(templates);
  const used = new Map<string, number>();
  for (let i = 0; i < tks.length; i++) {
    const tk = tks[i];
    let rec: any = {};
    if (opts.auto) {
      rec = await api.request({ url: `${collectionName}:get`, params: { filterByTk: tk } }).then((r: any) => r?.data?.data || {}).catch(() => ({}));
    }
    const tpl = pickTemplate(printable, opts, rec);
    if (!tpl) continue;
    const data = await fetchRecordData(api, { ...tpl, collectionName } as any, tk).catch(() => ({}));
    await ensureTemplateLibs(tpl);
    const parts = renderTemplateParts(tpl, data, partials);
    const { blob, filename } = await renderPdfBlobSmart(api, tpl, parts);
    // avoid name clashes
    const n = (used.get(filename) || 0) + 1;
    used.set(filename, n);
    const name = n > 1 ? filename.replace(/\.pdf$/i, `-${n}.pdf`) : filename;
    zip.file(name, blob);
    onProgress?.(i + 1, tks.length);
  }
  const out: Blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(out, sanitizeFilename(collectionName || 'print') + '-batch.zip');
}

/** One PDF per record, saved into each record's attachment field. */
export async function batchSaveToField(
  api: any,
  collectionName: string,
  templates: PrintTemplate[],
  tks: any[],
  targetField: string,
  opts: { pinnedId?: number; auto?: boolean },
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const printable = printableTemplates(templates);
  for (let i = 0; i < tks.length; i++) {
    const tk = tks[i];
    let rec: any = {};
    if (opts.auto) {
      rec = await api.request({ url: `${collectionName}:get`, params: { filterByTk: tk } }).then((r: any) => r?.data?.data || {}).catch(() => ({}));
    }
    const tpl = pickTemplate(printable, opts, rec);
    if (!tpl) continue;
    await savePdfToField(api, { ...tpl, collectionName } as any, tk, targetField);
    onProgress?.(i + 1, tks.length);
  }
}
