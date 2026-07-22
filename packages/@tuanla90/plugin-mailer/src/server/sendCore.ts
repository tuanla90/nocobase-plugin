// The send engine, shared by the `mailer:send` action AND the workflow node. Server-only (imports
// nodemailer — BUNDLED into dist/node_modules by the recipe, like file-vault's jszip). Crash-safe:
// every public entry returns a { ok, error } result and never throws uncaught.
import nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';
import { renderEmail, htmlToText } from '../shared/renderEngine';
import {
  CONFIG_COLLECTION,
  METHODS_COLLECTION,
  TEMPLATES_COLLECTION,
  SECRET_UNCHANGED,
  DEFAULT_SMTP_PORT,
  MailerBackend,
} from '../shared/constants';
import type { MailMethodView, MailMethodOption } from '../shared/types';

/** The full, secret-bearing config of ONE sending method (a ptdlMailerMethods row). Shared by the
 *  backend send functions — same field shape the v0.1.x single ConfigRow had, plus name/key/isDefault. */
export interface MethodConfig {
  id?: number;
  key: string;
  name: string;
  backend: MailerBackend;
  enabled: boolean;
  isDefault: boolean;
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

const str = (v: any, d = '') => (v == null ? d : String(v));
const bool = (v: any, d = false) => (typeof v === 'boolean' ? v : v == null ? d : v === 'true' || v === 1 || v === '1');
const int = (v: any, d = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};

/** Generate a stable, collision-resistant method key. */
export function genMethodKey(): string {
  return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Normalize a raw row (Model | plain) into a fully-typed MethodConfig with sane defaults. */
export function methodFromRow(row: any): MethodConfig {
  const j = row?.toJSON ? row.toJSON() : row || {};
  return {
    id: j.id,
    key: str(j.key) || (j.id != null ? String(j.id) : ''),
    name: str(j.name),
    backend: (j.backend as MailerBackend) === 'smtp' ? 'smtp' : 'apps-script',
    enabled: bool(j.enabled, true),
    isDefault: bool(j.isDefault),
    fromName: str(j.fromName),
    appsScriptUrl: str(j.appsScriptUrl),
    smtpHost: str(j.smtpHost),
    smtpPort: int(j.smtpPort, DEFAULT_SMTP_PORT),
    smtpSecure: bool(j.smtpSecure, true),
    smtpUser: str(j.smtpUser),
    smtpPass: str(j.smtpPass),
    smtpFrom: str(j.smtpFrom),
    sharedToken: str(j.sharedToken),
  };
}

/** Load every sending method, default first then by id. */
export async function loadMethods(app: any): Promise<MethodConfig[]> {
  try {
    const rows = await app.db.getRepository(METHODS_COLLECTION).find({ sort: ['-isDefault', 'id'] });
    return (rows || []).map(methodFromRow);
  } catch {
    return [];
  }
}

/** Resolve which method to send with: an explicit key/id wins (returned even if disabled — the caller
 *  reports "disabled"); otherwise the default enabled method, then any enabled method, then any method. */
export function resolveMethod(methods: MethodConfig[], key?: string | number | null): MethodConfig | null {
  const k = key == null ? '' : String(key).trim();
  if (k) {
    const hit = methods.find((m) => m.key === k || String(m.id) === k);
    if (hit) return hit;
  }
  return (
    methods.find((m) => m.isDefault && m.enabled !== false) ||
    methods.find((m) => m.enabled !== false) ||
    methods.find((m) => m.isDefault) ||
    methods[0] ||
    null
  );
}

/** A masked, secret-free view of one method for the settings UI (never leaks URL/password/token). */
export function methodView(row: any): MailMethodView {
  const m = methodFromRow(row);
  let mask = '';
  if (m.appsScriptUrl) {
    const tail = m.appsScriptUrl.length > 14 ? m.appsScriptUrl.slice(-14) : m.appsScriptUrl;
    mask = '…' + tail;
  }
  return {
    id: m.id as number,
    key: m.key,
    name: m.name,
    backend: m.backend,
    enabled: m.enabled,
    isDefault: m.isDefault,
    fromName: m.fromName,
    appsScriptUrlMask: mask,
    hasAppsScriptUrl: !!m.appsScriptUrl,
    smtpHost: m.smtpHost,
    smtpPort: m.smtpPort,
    smtpSecure: m.smtpSecure,
    smtpUser: m.smtpUser,
    smtpFrom: m.smtpFrom,
    hasSmtpPass: !!m.smtpPass,
    hasSharedToken: !!m.sharedToken,
  };
}

/** Minimal, secret-free option for the loggedIn pickers (no host/user/from leaked). */
export function methodOption(row: any): MailMethodOption {
  const m = methodFromRow(row);
  return { key: m.key, name: m.name, backend: m.backend, enabled: m.enabled, isDefault: m.isDefault };
}

/** Build a PARTIAL patch for a method save. Only keys the client actually sent are touched (so a
 *  {id, enabled} toggle never resets name/backend). SECRET fields (appsScriptUrl, smtpPass, sharedToken)
 *  only overwrite when a real value is sent — a masked/sentinel/empty value keeps the stored secret. */
export function buildMethodPatch(current: any, values: any): Partial<MethodConfig> {
  const v = values || {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(v, k);
  const patch: Partial<MethodConfig> = {};
  if (has('name')) patch.name = str(v.name);
  if (has('backend')) patch.backend = v.backend === 'smtp' ? 'smtp' : 'apps-script';
  if (has('enabled')) patch.enabled = bool(v.enabled);
  if (has('isDefault')) patch.isDefault = bool(v.isDefault);
  if (has('fromName')) patch.fromName = str(v.fromName);
  if (has('smtpHost')) patch.smtpHost = str(v.smtpHost);
  if (has('smtpPort')) patch.smtpPort = int(v.smtpPort, DEFAULT_SMTP_PORT);
  if (has('smtpSecure')) patch.smtpSecure = bool(v.smtpSecure);
  if (has('smtpUser')) patch.smtpUser = str(v.smtpUser);
  if (has('smtpFrom')) patch.smtpFrom = str(v.smtpFrom);
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

/** Read the legacy single-row config (v0.1.x). Never creates a row — returns null if absent/empty. */
export async function loadLegacyConfig(app: any): Promise<any | null> {
  try {
    return await app.db.getRepository(CONFIG_COLLECTION).findOne();
  } catch {
    return null;
  }
}

/** One-time migration: if there are NO methods yet but the legacy config row carries real configuration,
 *  seed ONE default method from it so an existing v0.1.x setup keeps sending. Idempotent + crash-safe. */
export async function migrateLegacyConfig(app: any): Promise<void> {
  try {
    const methodsRepo = app.db.getRepository(METHODS_COLLECTION);
    const count = await methodsRepo.count();
    if (count > 0) return; // already have methods — nothing to migrate

    const legacy = await loadLegacyConfig(app);
    if (!legacy) return;
    const c = methodFromRow(legacy);
    // Only migrate when the legacy row holds something worth keeping (skip the empty default row a fresh
    // install left behind, so brand-new installs simply start with an empty methods list).
    const meaningful =
      c.enabled || c.appsScriptUrl || c.sharedToken || c.smtpHost || c.smtpPass || c.smtpUser || c.smtpFrom || c.fromName;
    if (!meaningful) return;

    await methodsRepo.create({
      values: {
        key: genMethodKey(),
        name: 'Mặc định', // "Default" — bilingual UI, but the stored name is a plain label the admin can rename
        backend: c.backend,
        enabled: c.enabled,
        isDefault: true,
        fromName: c.fromName,
        appsScriptUrl: c.appsScriptUrl,
        sharedToken: c.sharedToken,
        smtpHost: c.smtpHost,
        smtpPort: c.smtpPort,
        smtpSecure: c.smtpSecure,
        smtpUser: c.smtpUser,
        smtpPass: c.smtpPass,
        smtpFrom: c.smtpFrom,
      },
    });
    app.logger?.info?.('[mailer] migrated legacy single config → one default sending method');
  } catch (e: any) {
    app.logger?.warn?.(`[mailer] legacy config migration failed: ${e?.message || e}`);
  }
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

async function sendViaAppsScript(cfg: MethodConfig, mail: {
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

async function sendViaSmtp(cfg: MethodConfig, mail: {
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
  /** Which sending method to use (its stable `key`, or numeric id). Empty/absent → the default method. */
  methodKey?: string | number | null;
}

/** Resolve content + attachments and send via a specific method config. Skips the enabled check (used by
 *  the "send test" path, which must work even for a method that is currently toggled off). Never throws. */
async function sendWithMethod(app: any, cfg: MethodConfig, input: SendMailInput): Promise<SendResult> {
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

  return cfg.backend === 'smtp' ? sendViaSmtp(cfg, mail) : sendViaAppsScript(cfg, mail);
}

/** Resolve the method (by key, or the default) and send. Reports clear errors when no method exists or the
 *  chosen method is disabled. Never throws — every path returns a { ok, error } result. */
export async function sendMail(app: any, input: SendMailInput): Promise<SendResult> {
  try {
    const methods = await loadMethods(app);
    if (!methods.length) {
      return { ok: false, error: 'No sending method configured (Settings → Mailer → Sending methods → add one).' };
    }
    const cfg = resolveMethod(methods, input.methodKey);
    if (!cfg) return { ok: false, error: 'No usable sending method (all are disabled?).' };
    if (cfg.enabled === false) {
      return { ok: false, error: `Sending method "${cfg.name || cfg.key}" is disabled (enable it in Settings → Mailer).` };
    }
    return await sendWithMethod(app, cfg, input);
  } catch (e: any) {
    return { ok: false, error: `Send failed: ${e?.message || e}` };
  }
}

/** Send a test email via a SPECIFIC method (by key/id). Works even if the method is toggled off. */
export async function sendTestViaMethod(
  app: any,
  input: { methodKey?: string | number | null; to: any; subject?: string; html?: string },
): Promise<SendResult> {
  try {
    const methods = await loadMethods(app);
    if (!methods.length) return { ok: false, error: 'No sending method configured.' };
    const cfg = resolveMethod(methods, input.methodKey);
    if (!cfg) return { ok: false, error: 'Sending method not found.' };
    return await sendWithMethod(app, cfg, { to: input.to, inlineSubject: input.subject, inlineHtml: input.html });
  } catch (e: any) {
    return { ok: false, error: `Test failed: ${e?.message || e}` };
  }
}
