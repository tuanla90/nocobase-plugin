// "Save PDF to field": render the template off-screen, rasterise to PDF with
// html2pdf.js (html2canvas + jsPDF — lazy static asset like alasql/pagedjs/grapes),
// upload via attachments:create and attach to the record's attachment field.
// Raster output: text becomes an image (Vietnamese always correct); vector PDF is
// the V2 server/puppeteer job.
import { BuiltParts, buildPrintDocument } from './printDoc';
import { ensureTemplateLibs, fetchRecordData, fetchTemplates, partialTemplates, renderTemplateParts } from './printService';
import { DEFAULT_PAGE_SETUP, PrintTemplate } from './types';
import { loadScriptClean } from './scriptLoader';
import { pdfServiceEnabled, renderPdfViaService } from './pdfServiceClient';
import { t } from './i18n';

const HTML2PDF_URL = '/static/plugins/@ptdl/plugin-print-template/dist/html2pdf.bundle.min.js';

export async function ensureHtml2Pdf(): Promise<any> {
  const w = window as any;
  if (!w.html2pdf) await loadScriptClean(HTML2PDF_URL);
  return w.html2pdf;
}

/** Attachment fields of a collection (candidates for the target field). */
export function attachmentFieldsOf(collection: any): any[] {
  const fields = collection?.getFields?.() || [];
  return fields.filter((f: any) => (f?.options?.interface ?? f?.interface) === 'attachment');
}

export function sanitizeFilename(s: string): string {
  return (
    String(s || 'print')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .trim()
      .slice(0, 120) || 'print'
  );
}

export interface SavePdfResult {
  attachment: any;
  filename: string;
}

/** Rasterise a rendered template (parts) to a PDF blob via html2pdf (off-screen iframe). */
export async function renderPdfBlob(template: PrintTemplate, parts: BuiltParts): Promise<{ blob: Blob; filename: string }> {
  const html2pdf = await ensureHtml2Pdf();
  const doc = buildPrintDocument({ ...template, pageSetup: { ...(template.pageSetup || {}), pageNumbers: false } }, parts);
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;left:-12000px;top:0;width:900px;height:1400px;visibility:hidden;';
  document.body.appendChild(iframe);
  try {
    const idoc = iframe.contentDocument!;
    idoc.open();
    idoc.write(doc);
    idoc.close();
    await new Promise((r) => setTimeout(r, 300));
    await Promise.all(
      Array.from(idoc.images).map((img) =>
        img.complete ? Promise.resolve() : new Promise((res) => ((img.onload = res as any), (img.onerror = res as any))),
      ),
    );
    idoc.getElementById('__pt-print-btn')?.remove();
    const page = { ...DEFAULT_PAGE_SETUP, ...(template.pageSetup || {}) };
    const filename = sanitizeFilename(parts.title || template.title || 'print') + '.pdf';
    const blob: Blob = await html2pdf()
      .set({
        margin: 0,
        filename,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, windowWidth: 900 },
        jsPDF: {
          unit: 'mm',
          format: String(page.size || 'A4').toLowerCase(),
          orientation: page.orientation === 'landscape' ? 'landscape' : 'portrait',
        },
        pagebreak: { mode: ['css', 'legacy'] },
      })
      .from(idoc.body)
      .output('blob');
    return { blob, filename };
  } finally {
    document.body.removeChild(iframe);
  }
}

/** Best PDF for the file: VECTOR via the configured service if enabled, else raster.
 *  Both use the table flavour (no Paged.js) so header/footer repeat reliably. */
export async function renderPdfBlobSmart(
  api: any,
  template: PrintTemplate,
  parts: BuiltParts,
): Promise<{ blob: Blob; filename: string }> {
  if (await pdfServiceEnabled(api)) {
    try {
      const name = sanitizeFilename(parts.title || template.title || 'print');
      const html = buildPrintDocument({ ...template, pageSetup: { ...(template.pageSetup || {}), pageNumbers: false } }, parts);
      const blob = await renderPdfViaService(api, html, name);
      if (blob && blob.size > 0) return { blob, filename: name + '.pdf' };
    } catch (e) {
      /* service down/misconfigured → fall back to raster */
    }
  }
  return renderPdfBlob(template, parts);
}

export async function savePdfToField(
  api: any,
  template: PrintTemplate,
  filterByTk: any,
  targetField: string,
): Promise<SavePdfResult> {
  const [data, list] = await Promise.all([
    fetchRecordData(api, template, filterByTk),
    fetchTemplates(api, template.collectionName).catch(() => []),
    ensureTemplateLibs(template),
  ]);
  const parts = renderTemplateParts(template, data, partialTemplates(list));
  const { blob, filename } = await renderPdfBlobSmart(api, template, parts);
  {
    const fd = new FormData();
    fd.append('file', new File([blob], filename, { type: 'application/pdf' }));
    const up = await api.request({
      url: 'attachments:create',
      method: 'post',
      data: fd,
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const attachment = up?.data?.data;
    if (!attachment?.id) throw new Error(t('Upload attachment thất bại'));

    await api.request({
      url: `${template.collectionName}:update`,
      method: 'post',
      params: { filterByTk },
      data: { [targetField]: [attachment] },
    });
    return { attachment, filename };
  }
}
