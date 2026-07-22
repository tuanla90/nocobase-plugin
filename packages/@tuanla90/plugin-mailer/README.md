# Mailer — User Guide

> Send emails straight from your records and workflows, using reusable HTML templates and either Google Apps Script (Gmail) or SMTP — no code.

**Group:** Data · **Runs on:** /v/ (modern client) · **Version:** 0.2.0

## What's new in 0.2.0
- **Multiple named sending methods** instead of a single backend. Keep, say, a Gmail-via-Apps-Script method **and** an SMTP method side by side; mark one as the **default**, enable/disable each. The record action and workflow node just **pick a method** (or use the default) — no more per-node credentials.
- **Back-compatible:** an existing single-backend setup is **migrated automatically** into one method named *Mặc định / Default* on upgrade, so it keeps sending untouched.
- **Quick link** — from the Send-email dialog and the workflow node, a **“Configure sending methods ↗”** link jumps straight to the settings page to add/edit a method.

## What it does
- **Reusable HTML templates** designed in a **drag-and-drop visual editor** (GrapesJS), with Handlebars variables `{{field}}` / `{{relation.field}}` / `{{formatDate …}}` / `{{formatNumber …}}` / `{{docso …}}` and a **live preview bound to a sample record**.
- **A list of sending methods** — each is one backend config with a name: **Google Apps Script** (uses your Gmail via a web app — no SMTP setup) or **SMTP** (nodemailer). Credentials are stored **server-side** and never sent back to the browser.
- **Send from a record** — a per-record **Send email** action: pick a **method** + a template (or write inline), preview against that record, edit To/CC/BCC, attach the record's files, send.
- **Send from a workflow** — a **Send email** workflow node (Extended group): just **pick a method + a template** and set To/CC/BCC/attachments. No backend/credentials on the node.

## Where
Settings (⚙) → **Mailer / Gửi Email**. Two tabs: **Sending methods** (add/edit your Apps Script / SMTP methods, set a default) and **Templates** (create/edit HTML templates with the visual editor + preview).

## Setup
1. **Sending methods → Add:** give the method a name, pick **Apps Script** or **SMTP**.
   - **Google Apps Script:** copy the `doPost` snippet shown → create a Google Apps Script project → paste it → Deploy as a **Web app** (Execute as: Me · Access: Anyone) → copy the `/exec` URL back into the field.
   - **SMTP:** fill host / port / secure / user / pass / from (e.g. Gmail: `smtp.gmail.com:465` + an App Password).
   - **Save**, or **Save & send test**. Mark a method **default** so sends that don't pick one use it.
2. **Templates:** New template → pick a collection + optional related data (appends) → write the Subject + design the HTML body → pick a sample record on the right to preview → Save.
3. **Send:** add the **Send email** action to a record (Configure actions), or a **Send email** node in a workflow — each picks a method (or the default).

## Notes
- **Google Apps Script quota:** ~100 recipients/day (consumer Gmail), ~1500 (Workspace) — not for mass mailing.
- The Apps Script `/exec` URL is a secret (anyone with it can send as you) — it is stored server-side only.
- HTML email: clients prefer inline CSS; the visual editor stores a `<style>` block which Gmail / most SMTP clients render fine (CSS inlining is a planned follow-up for maximal cross-client fidelity).

## For developers
- Methods collection `ptdlMailerMethods` (one backend config per row, secrets masked on read); template collection `ptdlMailTemplates`. Legacy `ptdlMailerConfig` (single row) is kept read-only and migrated into one default method on load/upgrade.
- Server actions on the `mailer` resource: `send` + `methodOptions` (loggedIn); `getMethods` / `saveMethod` / `deleteMethod` / `setDefaultMethod` / `sendTest` (admin-gated via the `pm.mailer` snippet). Send resolution loads the chosen method (by stable `key`, or the default) server-side. Backends: Apps Script POST / SMTP nodemailer (bundled into the plugin).
- Template engine ported from `@tuanla90/plugin-print-template` (Handlebars), isomorphic — the client preview and the server send render through identical code.
- Workflow node type key `ptdl-mailer` (registered on `@nocobase/plugin-workflow` when present); the node config only picks a method + template + recipients/attachments.
