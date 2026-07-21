// The send engine, shared by the `mailer:send` action AND the workflow node. Server-only (imports
// nodemailer — BUNDLED into dist/node_modules by the recipe, like file-vault's jszip). Crash-safe:
// every public entry returns a { ok, error } result and never throws uncaught.
import nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';
import { renderEmail, htmlToText } from '../shared/renderEngine';
import {
  CONFIG_COLLECTION,
  TEMPLATES_COLLECTION,
  SECRET_UNCHANGED,
  DEFAULT_SMTP_PORT,
  MailerBackend,
} from '../shared/constants';
import type { MailerConfigView } from '../shared/types';

export interface ConfigRow {
  id?: number;
  backend: MailerBackend;
  enabled: boolean;
  fromName: string;
  appsScriptUrl: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  sharedToken: string;
}

const DEFAULT_CONFIG: ConfigRow = {
  backend: 'apps-script',
  enabled: false,
  fromName: '',
  appsScriptUrl: '',
  smtpHost: '',
  smtpPort: DEFAULT_SMTP_PORT,
  smtpSecure: true,
  smtpUser: '',
  smtpPass: '',
  smtpFrom: '',
  sharedToken: '',
};

/** Load the single config row, creating a default (disabled) one if none exists. */
export async function loadConfig(app: any): Promise<any> {
  const repo = app.db.getRepository(CONFIG_COLLECTION);
  let row = await repo.findOne();
  if (!row) row = await repo.create({ values: { ...DEFAULT_CONFIG } });
  return row;
}

const str = (v: any, d = '') => (v == null ? d : String(v));
const bool = (v: any, d = false) => (typeof v === 'boolean' ? v : v == null ? d : v === 'true' || v === 1 || v === '1');
const int = (v: any, d = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};

/** A masked, secret-free view of the config for the client. Never leaks the Apps Script URL, SMTP
 *  password, or shared token — only whether each is set (+ a short masked tail for the URL). */
export function configView(row: any): MailerConfigView {
  const j = row?.toJSON ? row.toJSON() : row || {};
  const url = str(j.appsScriptUrl);
  let mask = '';
  if (url) {
    const tail = url.length > 14 ? url.slice(-14) : url;
    mask = '…' + tail;
  }
  return {
    backend: (j.backend as MailerBackend) || 'apps-script',
    enabled: bool(j.enabled),
    fromName: str(j.fromName),
    appsScriptUrlMask: mask,
    hasAppsScriptUrl: !!url,
    smtpHost: str(j.smtpHost),
    smtpPort: int(j.smtpPort, DEFAULT_SMTP_PORT),
    smtpSecure: bool(j.smtpSecure, true),
    smtpUser: str(j.smtpUser),
    smtpFrom: str(j.smtpFrom),
    hasSmtpPass: !!str(j.smtpPass),
    hasSharedToken: !!str(j.sharedToken),
  };
}

/** Build the patch for a save: non-secret fields overwrite; SECRET fields (appsScriptUrl, smtpPass,
 *  sharedToken) only overwrite when the client sends a real value — a masked/sentinel/empty value keeps
 *  the stored secret so re-saving the form never wipes secrets the client never actually saw. */
export function buildConfigPatch(current: any, values: any): Partial<ConfigRow> {
  const cur = current?.toJSON ? current.toJSON() : current || {};
  const v = values || {};
  const patch: Partial<ConfigRow> = {
    backend: v.backend === 'smtp' ? 'smtp' : 'apps-script',
    enabled: bool(v.enabled, bool(cur.enabled)),
    fromName: str(v.fromName, str(cur.fromName)),
    smtpHost: str(v.smtpHost, str(cur.smtpHost)),
    smtpPort: int(v.smtpPort, int(cur.smtpPort, DEFAULT_SMTP_PORT)),
    smtpSecure: bool(v.smtpSecure, bool(cur.smtpSecure, true)),
    smtpUser: str(v.smtpUser, str(cur.smtpUser)),
    smtpFrom: str(v.smtpFrom, str(cur.smtpFrom)),
  };
  const secret = (incoming: any) => typeof incoming === 'string' && incoming !== '' && incoming !== SECRET_UNCHANGED;
  if (secret(v.appsScriptUrl)) patch.appsScriptUrl = String(v.appsScriptUrl).trim();
  if (secret(v.smtpPass)) patch.smtpPass = String(v.smtpPass);
  if (secret(v.sharedToken)) patch.sharedToken = String(v.sharedToken).trim();
  // explicit clear (client sends null) — lets an admin remove a secret on purpose
  if (v.appsScriptUrl === null) patch.appsScriptUrl = '';
  if (v.smtpPass === null) patch.smtpPass = '';
  if (v.sharedToken === null) patch.sharedToken = '';
  return patch;
}

// ── attachments ───────────────────────────────────────────────────────────────────────────────────
function streamToBuffer(stream: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c: any) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

function fileManager(app: any): any {
  try {
    const pm: any = app.pm;
    return pm.get('file-manager') || pm.get('@nocobase/plugin-file-manager') || null;
  } catch {
    return null;
  }
}

/** Read one attachment record's bytes: (1) file-manager getFileStream (all storage types, runtime lookup —
 *  no hard import); (2) local-disk fallback; (3) absolute-URL fetch. Returns null if unreadable. */
async function readAttachmentBytes(app: any, att: any): Promise<Buffer | null> {
  try {
    const fm = fileManager(app);
    if (fm?.getFileStream) {
      const res = await fm.getFileStream(att);
      const stream = res?.stream || res;
      if (stream && typeof stream.on === 'function') return await streamToBuffer(stream);
    }
  } catch {
    /* fall through */
  }
  try {
    const root = process.env.LOCAL_STORAGE_DEST || 'storage/uploads';
    const base = path.isAbsolute(root) ? root : path.resolve(process.cwd(), root);
    const p = path.resolve(base, String(att.path || '').replace(/^[\\/]+/, ''), String(att.filename || ''));
    if (fs.existsSync(p)) return await fs.promises.readFile(p);
  } catch {
    /* fall through */
  }
  try {
    if (att.url && /^https?:\/\//i.test(att.url)) {
      const r = await (globalThis as any).fetch(att.url);
      if (r?.ok) return Buffer.from(await r.arrayBuffer());
    }
  } catch {
    /* give up */
  }
  return null;
}

export interface GatheredAttachment {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

/** Fetch the `attachments` rows for the given ids and read each one's bytes. Unreadable files are skipped. */
export async function gatherAttachments(app: any, ids: Array<number | { id: number }>): Promise<GatheredAttachment[]> {
  const idList = (ids || [])
    .map((x: any) => (typeof x === 'object' ? Number(x?.id) : Number(x)))
    .filter((n: number) => Number.isFinite(n) && n > 0);
  if (!idList.length) return [];
  const out: GatheredAttachment[] = [];
  try {
    const rows = await app.db.getRepository('attachments').find({ filter: { id: { $in: idList } } });
    for (const r of rows) {
      const att = r?.toJSON ? r.toJSON() : r;
      const buf = await readAttachmentBytes(app, att);
      if (!buf) continue;
      const name = (att.title && att.extname ? `${att.title}${att.extname}` : att.filename) || `file-${att.id}`;
      out.push({ filename: String(name), mimeType: str(att.mimetype, 'application/octet-stream'), buffer: buf });
    }
  } catch {
    /* no attachments on failure — send without them rather than fail the whole mail */
  }
  return out;
}

// ── content resolution ──────────────────────────────────────────────────────────────────────────────
const arrify = (v: any): string[] => {
  if (v == null) return [];
  if (Array.isArray(v)) return v.flat().map((x) => str(x).trim()).filter(Boolean);
  return str(v)
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
};

/** Resolve subject + html for a send: a saved template (rendered against record data) OR inline
 *  subject/html (also Handlebars-rendered against whatever data is available). */
export async function resolveContent(
  app: any,
  input: { templateId?: number | null; inlineSubject?: string; inlineHtml?: string; collectionName?: string | null; recordId?: any; data?: any },
): Promise<{ subject: string; html: string; error?: string }> {
  let subject = str(input.inlineSubject);
  let html = str(input.inlineHtml);
  let collectionName = input.collectionName || null;
  let appends: string[] = [];

  if (input.templateId) {
    try {
      const tpl = await app.db.getRepository(TEMPLATES_COLLECTION).findOne({ filterByTk: Number(input.templateId) });
      if (!tpl) return { subject: '', html: '', error: `Template #${input.templateId} not found` };
      const tj = tpl.toJSON ? tpl.toJSON() : tpl;
      subject = str(tj.subject);
      html = str(tj.htmlBody);
      collectionName = collectionName || tj.collectionName || null;
      appends = Array.isArray(tj.appends) ? tj.appends.filter(Boolean) : [];
    } catch (e: any) {
      return { subject: '', html: '', error: `Load template failed: ${e?.message || e}` };
    }
  }

  // Resolve the record's data for variable interpolation: an explicitly-passed object wins (workflow
  // node); otherwise fetch by collection + record id (record action).
  let data: any = input.data && typeof input.data === 'object' ? input.data : null;
  if (!data && collectionName && input.recordId != null && input.recordId !== '') {
    try {
      const params: any = { filterByTk: input.recordId };
      if (appends.length) params.appends = appends;
      const rec = await app.db.getRepository(collectionName).findOne(params);
      data = rec?.toJSON ? rec.toJSON() : rec;
    } catch {
      data = {};
    }
  }
  const rendered = renderEmail(subject, html, data || {});
  return { subject: rendered.subject, html: rendered.html };
}

// ── backends ──────────────────────────────────────────────────────────────────────────────────────
export interface SendResult {
  ok: boolean;
  backend?: MailerBackend;
  messageId?: string;
  error?: string;
}

async function sendViaAppsScript(cfg: ConfigRow, mail: {
  to: string[]; cc: string[]; bcc: string[]; subject: string; html: string; text: string; attachments: GatheredAttachment[];
}): Promise<SendResult> {
  if (!cfg.appsScriptUrl) return { ok: false, error: 'Apps Script URL is not configured' };
  const payload = {
    to: mail.to.join(','),
    cc: mail.cc.join(','),
    bcc: mail.bcc.join(','),
    subject: mail.subject,
    htmlBody: mail.html,
    textBody: mail.text,
    fromName: cfg.fromName || undefined,
    sharedToken: cfg.sharedToken || undefined,
    attachments: mail.attachments.map((a) => ({ filename: a.filename, mimeType: a.mimeType, base64: a.buffer.toString('base64') })),
  };
  try {
    const res = await (globalThis as any).fetch(cfg.appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });
    const text = await res.text().catch(() => '');
    let reply: any = {};
    try {
      reply = JSON.parse(text);
    } catch {
      // Apps Script returns an HTML error page (e.g. auth / not-deployed-as-Anyone) instead of JSON.
      return { ok: false, error: `Apps Script did not return JSON (HTTP ${res.status}). Check the deployment is a Web App with access = Anyone. Response: ${text.slice(0, 160)}` };
    }
    if (reply.ok) return { ok: true, backend: 'apps-script', messageId: reply.messageId };
    return { ok: false, error: `Apps Script error: ${reply.error || 'unknown'}` };
  } catch (e: any) {
    return { ok: false, error: `Could not reach Apps Script URL: ${e?.message || e}` };
  }
}

async function sendViaSmtp(cfg: ConfigRow, mail: {
  to: string[]; cc: string[]; bcc: string[]; subject: string; html: string; text: string; attachments: GatheredAttachment[];
}): Promise<SendResult> {
  if (!cfg.smtpHost) return { ok: false, error: 'SMTP host is not configured' };
  const from = cfg.smtpFrom || cfg.smtpUser;
  if (!from) return { ok: false, error: 'SMTP "from" address is not configured' };
  try {
    const transporter = nodemailer.createTransport({
      host: cfg.smtpHost,
      port: cfg.smtpPort || DEFAULT_SMTP_PORT,
      secure: !!cfg.smtpSecure,
      auth: cfg.smtpUser ? { user: cfg.smtpUser, pass: cfg.smtpPass } : undefined,
    } as any);
    const info = await transporter.sendMail({
      from: cfg.fromName ? `${cfg.fromName} <${from}>` : from,
      to: mail.to,
      cc: mail.cc.length ? mail.cc : undefined,
      bcc: mail.bcc.length ? mail.bcc : undefined,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      attachments: mail.attachments.map((a) => ({ filename: a.filename, content: a.buffer, contentType: a.mimeType })),
    });
    return { ok: true, backend: 'smtp', messageId: info?.messageId };
  } catch (e: any) {
    return { ok: false, error: `SMTP send failed: ${e?.message || e}` };
  }
}

// ── the public orchestrator ─────────────────────────────────────────────────────────────────────────
export interface SendMailInput {
  templateId?: number | null;
  inlineSubject?: string;
  inlineHtml?: string;
  collectionName?: string | null;
  recordId?: any;
  data?: any;
  to: any;
  cc?: any;
  bcc?: any;
  attachments?: Array<number | { id: number }>;
  backend?: MailerBackend | 'default' | '';
}

/** Resolve content + attachments and send via the configured (or overridden) backend. Never throws. */
export async function sendMail(app: any, input: SendMailInput): Promise<SendResult> {
  try {
    const row = await loadConfig(app);
    const cfg = (row?.toJSON ? row.toJSON() : row) as ConfigRow;
    if (!cfg.enabled) return { ok: false, error: 'Mailer is not enabled (Settings → Mailer → Backend → enable).' };

    const backend: MailerBackend = input.backend === 'smtp' || input.backend === 'apps-script' ? input.backend : cfg.backend;

    const to = arrify(input.to);
    if (!to.length) return { ok: false, error: 'No "to" recipient.' };
    const cc = arrify(input.cc);
    const bcc = arrify(input.bcc);

    const content = await resolveContent(app, input);
    if (content.error) return { ok: false, error: content.error };
    if (!content.subject && !content.html) return { ok: false, error: 'Nothing to send (empty subject and body).' };

    const attachments = await gatherAttachments(app, input.attachments || []);
    const text = htmlToText(content.html);
    const mail = { to, cc, bcc, subject: content.subject, html: content.html, text, attachments };

    return backend === 'smtp' ? sendViaSmtp(cfg, mail) : sendViaAppsScript(cfg, mail);
  } catch (e: any) {
    return { ok: false, error: `Send failed: ${e?.message || e}` };
  }
}
