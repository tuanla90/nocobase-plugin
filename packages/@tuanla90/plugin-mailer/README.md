# Mailer — User Guide

> Send emails straight from your records and workflows, using reusable HTML templates and either Google Apps Script (Gmail) or SMTP — no code.

**Group:** Data · **Runs on:** /v/ (modern client) · **Version:** 0.1.1

## What it does
- **Reusable HTML templates** designed in a **drag-and-drop visual editor** (GrapesJS), with Handlebars variables `{{field}}` / `{{relation.field}}` / `{{formatDate …}}` / `{{formatNumber …}}` / `{{docso …}}` and a **live preview bound to a sample record**.
- **Two sending backends** you pick from: **Google Apps Script** (uses your Gmail via a web app — no SMTP setup) or **SMTP** (nodemailer). Credentials are stored **server-side** and never sent back to the browser.
- **Send from a record** — a per-record **Send email** action: pick a template (or write inline), preview against that record, edit To/CC/BCC, attach the record's files, send.
- **Send from a workflow** — a **Send email** workflow node (Extended group) with a per-node backend override.

## Where
Settings (⚙) → **Mailer / Gửi Email**. Two tabs: **Backend** (choose Apps Script or SMTP + credentials) and **Templates** (create/edit HTML templates with the visual editor + preview).

## Setup
1. **Backend → Google Apps Script:** copy the `doPost` snippet shown on the Backend tab → create a Google Apps Script project → paste it → Deploy as a **Web app** (Execute as: Me · Access: Anyone) → copy the `/exec` URL back into the field. Or **SMTP:** fill host / port / secure / user / pass / from (e.g. Gmail: `smtp.gmail.com:465` + an App Password). **Save**, then **Save & send test**.
2. **Templates:** New template → pick a collection + optional related data (appends) → write the Subject + design the HTML body → pick a sample record on the right to preview → Save.
3. **Send:** add the **Send email** action to a record (Configure actions), or a **Send email** node in a workflow.

## Notes
- **Google Apps Script quota:** ~100 recipients/day (consumer Gmail), ~1500 (Workspace) — not for mass mailing.
- The Apps Script `/exec` URL is a secret (anyone with it can send as you) — it is stored server-side only.
- HTML email: clients prefer inline CSS; the visual editor stores a `<style>` block which Gmail / most SMTP clients render fine (CSS inlining is a planned follow-up for maximal cross-client fidelity).

## For developers
- Config collection `ptdlMailerConfig` (secrets masked on read); template collection `ptdlMailTemplates`.
- Server action `mailer:send` (loggedIn); config CRUD admin-gated. Backends: Apps Script POST / SMTP nodemailer (bundled into the plugin).
- Template engine ported from `@tuanla90/plugin-print-template` (Handlebars), isomorphic — the client preview and the server send render through identical code.
- Workflow node type key `ptdl-mailer` (registered on `@nocobase/plugin-workflow` when present).
