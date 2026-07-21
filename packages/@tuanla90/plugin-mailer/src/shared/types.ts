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

/** Config as SENT TO the client by mailer:getConfig — secrets are NEVER included, only "hasX" flags. */
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
  /** Optional per-send backend override ('' / 'default' = use the configured backend). */
  backend?: MailerBackend | 'default' | '';
}
