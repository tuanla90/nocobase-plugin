import crypto from 'crypto';

// Zero-dep Google service-account client: sign a RS256 JWT with node crypto,
// exchange it for an access token, call the Sheets REST API with global fetch.
// (googleapis/google-auth-library would trip the build-env prune trap for no gain.)

export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
// Full spreadsheets scope (not readonly) so the future write-back V2 needs no re-consent;
// the service account can still only touch sheets explicitly shared with it.
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

interface CachedToken {
  token: string;
  exp: number; // epoch seconds
}
const tokenCache = new Map<string, CachedToken>();

export function parseCredentials(raw: any): ServiceAccount {
  let obj = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      throw new Error('Credentials không phải JSON hợp lệ');
    }
  }
  if (!obj?.client_email || !obj?.private_key) {
    throw new Error('Credentials thiếu client_email/private_key — cần file JSON của Service Account');
  }
  return { client_email: obj.client_email, private_key: obj.private_key };
}

export async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const cacheKey = sa.client_email;
  const now = Math.floor(Date.now() / 1000);
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.exp - 60 > now) return cached.token;

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }),
  );
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  let signature: string;
  try {
    signature = b64url(signer.sign(sa.private_key));
  } catch (e: any) {
    throw new Error(`private_key không hợp lệ: ${e?.message}`);
  }
  const jwt = `${header}.${claims}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(
      `Google từ chối cấp token (${res.status}): ${data.error_description || data.error || 'unknown'}`,
    );
  }
  tokenCache.set(cacheKey, { token: data.access_token, exp: now + (data.expires_in || 3600) });
  return data.access_token;
}

async function sheetsCall(sa: ServiceAccount, path: string, init?: RequestInit): Promise<any> {
  const token = await getAccessToken(sa);
  let res = await fetch(`${SHEETS_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers as any) },
  });
  // one retry on quota exhaustion — write bursts can trip the per-minute limit
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 2500));
    res = await fetch(`${SHEETS_BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers as any) },
    });
  }
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    if (res.status === 403) {
      throw new Error(
        `Không có quyền (403): ${msg}. Hãy Share sheet cho email ${sa.client_email}` +
          (init?.method && init.method !== 'GET' ? ' với quyền Editor (ghi ngược cần Editor, Viewer không đủ)' : ''),
      );
    }
    if (res.status === 404) throw new Error(`Không tìm thấy spreadsheet (404) — kiểm tra lại Spreadsheet ID`);
    throw new Error(`Google Sheets API lỗi: ${msg}`);
  }
  return data;
}

const sheetsGet = (sa: ServiceAccount, path: string) => sheetsCall(sa, path);

// Accept a bare ID or a full https://docs.google.com/spreadsheets/d/<id>/... URL.
export function extractSpreadsheetId(input: string): string {
  const s = (input || '').trim();
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : s;
}

export async function getSpreadsheetMeta(sa: ServiceAccount, spreadsheetId: string) {
  const data = await sheetsGet(
    sa,
    `/${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))`,
  );
  return {
    title: data?.properties?.title || '',
    sheets: (data?.sheets || []).map((s: any) => ({
      sheetId: s?.properties?.sheetId,
      title: s?.properties?.title,
      rowCount: s?.properties?.gridProperties?.rowCount,
      columnCount: s?.properties?.gridProperties?.columnCount,
    })),
  };
}

// UNFORMATTED_VALUE + SERIAL_NUMBER keeps numbers as numbers and dates as serials
// (locale-proof: "1.234,56" formatted strings never reach us).
export async function getSheetValues(sa: ServiceAccount, spreadsheetId: string, range: string): Promise<any[][]> {
  const data = await sheetsGet(
    sa,
    `/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,
  );
  return data?.values || [];
}

// ---- write APIs (V2 write-back; verified against the real API 2026-07-12) ----

// Update many disjoint ranges in ONE request (quota-friendly).
export async function batchUpdateValues(
  sa: ServiceAccount,
  spreadsheetId: string,
  data: { range: string; values: any[][] }[],
): Promise<void> {
  if (!data.length) return;
  await sheetsCall(sa, `/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
  });
}

// Append one row after the table; returns the new 1-based row number.
// updatedRange comes back as `Sheet1!A4:D4` or `'Tên có space'!A4:D4`.
export async function appendRowValues(
  sa: ServiceAccount,
  spreadsheetId: string,
  sheetName: string,
  rowValues: any[],
): Promise<number | null> {
  const data = await sheetsCall(
    sa,
    `/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${sheetName}!A1`)}:append?valueInputOption=USER_ENTERED`,
    { method: 'POST', body: JSON.stringify({ values: [rowValues] }) },
  );
  const range: string = data?.updates?.updatedRange || '';
  const m = range.match(/![A-Z]+(\d+)(?::|$)/);
  return m ? parseInt(m[1], 10) : null;
}

// Structural requests (deleteDimension needs the NUMERIC sheetId, not the tab name).
export async function batchUpdateSpreadsheet(
  sa: ServiceAccount,
  spreadsheetId: string,
  requests: any[],
): Promise<void> {
  if (!requests.length) return;
  await sheetsCall(sa, `/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests }),
  });
}

// FORMATTED_VALUE variant — only used on a small sample to tell date serials from plain numbers.
export async function getSheetValuesFormatted(
  sa: ServiceAccount,
  spreadsheetId: string,
  range: string,
): Promise<any[][]> {
  const data = await sheetsGet(
    sa,
    `/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`,
  );
  return data?.values || [];
}

// Per-cell effective number-format TYPE for a sample window — the authoritative
// date-vs-number signal (Google itself tells us DATE / DATE_TIME / TIME / NUMBER…),
// so date detection no longer depends on locale-specific formatted strings.
// Returns a grid of type strings aligned with the range ('' when a cell has none).
export async function getSheetNumberFormats(
  sa: ServiceAccount,
  spreadsheetId: string,
  range: string,
): Promise<string[][]> {
  const data = await sheetsGet(
    sa,
    `/${encodeURIComponent(spreadsheetId)}?ranges=${encodeURIComponent(range)}` +
      `&fields=${encodeURIComponent('sheets.data.rowData.values.effectiveFormat.numberFormat.type')}`,
  );
  const rowData = data?.sheets?.[0]?.data?.[0]?.rowData || [];
  return rowData.map((r: any) =>
    (r?.values || []).map((c: any) => c?.effectiveFormat?.numberFormat?.type || ''),
  );
}
