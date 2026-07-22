import type { MailerBackend } from './constants';

/** A reusable email template row (ptdlMailTemplates). */
export interface MailTemplate {
  id?: number;
  name: string;
  subject: string;
  htmlBody: string;
  /** Optional collection this template is written for — drives the variable picker + preview sample. */
  collectionName?: string | null;
  /** Optional relation dot-paths to `appends` when resolving variables (e.g. ["customer", "items.product"]). */
  appends?: string[];
  enabled?: boolean;
}

/** One named "sending method" (ptdlMailerMethods row) — a backend config with a name, on/off + default flag. */
export interface MailMethod {
  id?: number;
  /** Stable id used by pickers (workflow node / send action) so a method can be renamed without breaking refs. */
  key: string;
  name: string;
  backend: MailerBackend;
  enabled?: boolean;
  isDefault?: boolean;
  fromName?: string;
  /** apps-script (SECRET) */
  appsScriptUrl?: string;
  sharedToken?: string; // SECRET
  /** smtp */
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string; // SECRET
  smtpFrom?: string;
}

/** A method as SENT TO the settings UI by mailer:getMethods — secrets masked, only "hasX" flags returned. */
export interface MailMethodView {
  id: number;
  key: string;
  name: string;
  backend: MailerBackend;
  enabled: boolean;
  isDefault: boolean;
  fromName: string;
  appsScriptUrlMask: string;
  hasAppsScriptUrl: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpFrom: string;
  hasSmtpPass: boolean;
  hasSharedToken: boolean;
}

/** Minimal, secret-free method option for the loggedIn pickers (mailer:methodOptions). */
export interface MailMethodOption {
  key: string;
  name: string;
  backend: MailerBackend;
  enabled: boolean;
  isDefault: boolean;
}

/** Config as SENT TO the client by mailer:getConfig — secrets are NEVER included, only "hasX" flags.
 *  @deprecated v0.2.0 replaced the single config with a methods list (MailMethodView). Kept for reference. */
export interface MailerConfigView {
  backend: MailerBackend;
  enabled: boolean;
  fromName: string;
  /** apps-script */
  appsScriptUrlMask: string; // masked tail, e.g. "…/AKfy…/exec" — never the full secret URL
  hasAppsScriptUrl: boolean;
  /** smtp (non-secret parts returned as-is) */
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpFrom: string;
  hasSmtpPass: boolean;
  /** shared token (secret) */
  hasSharedToken: boolean;
}

/** The input to a send call (record action or workflow node). */
export interface SendInput {
  templateId?: number | null;
  inlineSubject?: string;
  inlineHtml?: string;
  collectionName?: string | null;
  recordId?: any;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  /** Attachment ids from the `attachments` collection. */
  attachments?: Array<number | { id: number }>;
  /** Which sending method to use (its stable `key`, or numeric id). Empty/absent → the default method. */
  methodKey?: string | number | null;
}
