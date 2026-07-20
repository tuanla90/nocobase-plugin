// Client for the server-side PDF service (Gotenberg proxy). Config lives in the DB
// (Settings UI), never hardcoded. When enabled, exports render VECTOR PDFs; otherwise
// the code falls back to the client-side raster (html2pdf).
export interface PdfServiceConfig {
  url: string;
  username: string;
  enabled: boolean;
  hasPassword: boolean;
}

export async function getPdfServiceConfig(api: any): Promise<PdfServiceConfig> {
  const res = await api.request({ url: 'ptdlPdf:getConfig', method: 'get' });
  // NocoBase wraps action results as { data: <ctx.body> } → the config is at res.data.data.
  return res?.data?.data || { url: '', username: '', enabled: false, hasPassword: false };
}

export async function setPdfServiceConfig(
  api: any,
  values: { url?: string; username?: string; password?: string | null; enabled?: boolean },
): Promise<void> {
  await api.request({ url: 'ptdlPdf:setConfig', method: 'post', data: values });
  _enabledCache = null;
}

let _enabledCache: { at: number; on: boolean } | null = null;
/** Cached "is the vector service on?" — uses the loggedIn-safe `status` action (no
 *  secrets) so non-admins also get vector output when the admin enabled it. */
export async function pdfServiceEnabled(api: any): Promise<boolean> {
  if (_enabledCache && Date.now() - _enabledCache.at < 60_000) return _enabledCache.on;
  let on = false;
  try {
    const res = await api.request({ url: 'ptdlPdf:status', method: 'get' });
    on = !!res?.data?.data?.enabled;
  } catch (e) {
    on = false; // service action absent/old build → raster (still works)
  }
  _enabledCache = { at: Date.now(), on };
  return on;
}

/** Render HTML → vector PDF blob via the server proxy. Throws if the service errors. */
export async function renderPdfViaService(api: any, html: string, filename: string): Promise<Blob> {
  const res = await api.request({
    url: 'ptdlPdf:render',
    method: 'post',
    data: { html, filename },
    responseType: 'blob',
  });
  return res?.data as Blob;
}
