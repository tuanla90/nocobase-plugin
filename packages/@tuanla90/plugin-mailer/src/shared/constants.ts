// Shared, isomorphic constants for @tuanla90/plugin-mailer (safe to import from client + server —
// NO react/antd/nodemailer here). The collection names, the backend enum, the masked-secret sentinel,
// and the copy-paste-ready Google Apps Script the settings page shows.

export const CONFIG_COLLECTION = 'ptdlMailerConfig';
export const TEMPLATES_COLLECTION = 'ptdlMailTemplates';

/** The `mailer` resource name (custom actions live here: send, getConfig, saveConfig, sendTest). */
export const MAILER_RESOURCE = 'mailer';

export type MailerBackend = 'apps-script' | 'smtp';

/** When the client sends this exact value for a secret field, the server keeps the stored secret
 *  unchanged (so a masked placeholder round-tripped from getConfig never clobbers the real secret). */
export const SECRET_UNCHANGED = '__ptdl_secret_unchanged__';

/** Placeholder shown in the UI where a secret is set but its value is withheld. */
export const SECRET_MASK = '••••••••';

export const DEFAULT_SMTP_PORT = 465;

/**
 * The Google Apps Script the user deploys as a Web App (Deploy → New deployment → Web app,
 * Execute as = Me, Who has access = Anyone). The plugin POSTs the mail payload to the resulting
 * `/exec` URL; GmailApp sends the mail from the deploying Google account. No SMTP server needed.
 *
 * The payload keys here MUST match what src/server/sendCore.ts posts:
 *   { to, cc, bcc, subject, htmlBody, textBody, fromName, sharedToken, attachments:[{filename,mimeType,base64}] }
 */
export const APPS_SCRIPT_SNIPPET = `function doPost(e) {
  try {
    var p = JSON.parse(e.postData.contents);

    // OPTIONAL shared token: if you set one in the Mailer plugin, uncomment and paste it here so a
    // leaked URL alone cannot send mail. Must equal the plugin's "Shared token".
    // if (p.sharedToken !== 'PASTE_YOUR_SHARED_TOKEN_HERE') return json({ ok: false, error: 'bad token' });

    var opts = {
      htmlBody: p.htmlBody,
      name: p.fromName || undefined,
      cc: p.cc || undefined,
      bcc: p.bcc || undefined
    };
    if (p.attachments && p.attachments.length) {
      opts.attachments = p.attachments.map(function (a) {
        return Utilities.newBlob(Utilities.base64Decode(a.base64), a.mimeType, a.filename);
      });
    }
    GmailApp.sendEmail(p.to, p.subject, p.textBody || '', opts);
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}`;
