# Print Template — User Guide

> Design **invoice / receipt / report** templates in a **drag-and-drop** editor (or HTML), then
> **print one record to PDF** right from a button on a table/detail page — with **batch print**,
> **save PDF to a field**, QR codes, watermarks, headers/footers, and formula & SQL summaries…
> all **without code**.

**Group:** Actions · **Runs on:** /admin (classic) + /v/ (modern) · **Version:** 0.1.5

## What's new after installing?

- **A new Settings page:** go to **⚙ Settings → "Print templates"**, with 2 tabs: **Templates** and **PDF service**.
- **3 new action buttons** to attach to a block (via **"Configure actions"**):

  | Button (in Configure actions) | Where it goes | What it does |
  |---|---|---|
  | **Print template** | A table row / a single-record detail page | Opens the **"Print / export PDF"** dialog: pick a template → preview → **Print / PDF** or **Save to field** |
  | **Save PDF to field** | A table row / a single-record detail page | One click: renders the template and **attaches the PDF straight into a field** (no prompts) |
  | **Batch print** | A **Table** toolbar | Prints the **selected** rows (none selected = the whole current page) |

- **1 new block:** **"Print preview"** — drop it into a record's popup/detail page to show the printout right
  inside the page (with floating Print / Save buttons in the corner).

## Where to configure

- **Manage templates:** **/v/ → ⚙ Settings → "Print templates" → the "Templates" tab**
  (classic: `/admin/settings/print-template`). This is where you **create / edit / duplicate / delete** templates.
- **PDF service (optional):** same page, the **"PDF service" tab** — enable it to export **vector** PDFs (real text, copyable).
- **Configure each Print button:** select the button on the block → open its **⚙** → pick a **template** (or leave it empty / "Auto").

## How to use (step by step)

### Step 1 — Create a print template
1. Go to **⚙ Settings → "Print templates" → Templates** → click **+ New template**.
2. The **General** tab: fill in the **Template name** and choose the **Data source collection**. If the printout has
   child-row tables / relation data, also select them under **Load relations (appends)** (e.g. `items` → `items.product`).
3. The **Content** tab: design the printout body with **Drag-drop** or **HTML code**.
   - Drag-drop: drag the blocks in the **"Print blocks"** group in the right-hand panel: *Data field, Table, Child-rows
     table, Total metric, Signature area, Print date, Amount in words, QR code, Page break*.
   - HTML code: click **＋ Pick column** to insert `{{field}}`, **ƒ Functions** to look up & insert formulas, or **Let AI write it**.
4. (Optional) the **Header** / **Footer** tabs (logo, address, signature repeated on every page), **Watermark**, and
   **Print page** (A4/A5… size, portrait/landscape, margins).
5. On the right is a **live preview** with a real record — change the record at **"Preview with:"**, or click **Test print**.
6. Click **Save**.

### Step 2 — Attach a Print button where users click
1. Open a page with a **Table** or a **detail page** of that collection → turn on the **UI Editor**.
2. Click **Configure actions** → choose **"Print template"** (a print button for one record) or **"Batch print"** (a button on the table toolbar).
3. Open the **⚙** of the button you just added → choose a **Template**:
   - Pick a fixed template, **leave it empty** (so the user chooses when clicking), or **🔀 Auto by record data**.
4. Click the **Print** button → the dialog shows a preview → **Print / PDF** to open the print window and **Save as PDF**. ✅

### Scenario — Save an invoice PDF into a record (one click)
1. Add the **"Save PDF to field"** button to a row / detail page.
2. Open the button's **⚙** → choose an **Attachment field (required)** (an *attachment*-type field) and a **Template**.
3. Click the button → the PDF is generated and **attached straight into that field** of the record. Great for a "close the order → save the invoice" flow.

### Scenario — Batch print
1. In the table, tick a few rows (leave none = print the whole current page) → click **Batch print**.
2. In the button's **⚙**, choose the **Export type**:
   - **Merge into 1 file** — opens the print window (1 page per record).
   - **Split into files** — downloads a **ZIP** (1 PDF per record).
   - **Split — save a PDF to each record's field** (requires choosing an **Attachment field**).

## Tips & notes

- 🖨 **The manual "Print / PDF" button always produces a vector PDF** (real text) via the browser's print window — nothing extra to install.
- ⚙ **Vector for "Save to field" & "Batch print":** you need to enable the **PDF service** (Gotenberg) on the PDF service tab.
  Off = the client rasterizes to an **image** itself (heavier, text isn't copyable). Deploy tip: the `gotenberg/gotenberg:8` image;
  prefer an **internal URL** (private network). There's a **Test connection** button.
- 🔤 **Handy Handlebars formulas:** `{{formatNumber total format="#,##0₫"}}`, `{{formatDate date "DD/MM/YYYY"}}`,
  `{{docsoHoa total}}` (number to words), `{{qr code size=110}}`, `{{#each items}}…{{/each}}`, and even **SQL** `{{#sql "SELECT … FROM ?" items}}`.
  The full reference is behind the **ƒ Functions** button in the editor.
- ♻️ **Shared block (partial):** a template can be set as a **"shared block"** + given a **slug** → embed it into another
  template with `{{> slug}}`. Edit it in one place and every embedding template updates. A shared block does **not** appear in the print picker.
- 🔀 **Auto by record data:** set **Apply conditions** in the General tab (e.g. `status ∈ [paid]`); when the button is in
  *Auto* mode, the system picks the first template that matches the record. A template with **no conditions** is the default.
- ⚠️ The **"Print preview"** block and the **"Print template"** button need a **single-record context** — place them in a
  popup/detail page opened from a data row; a blank page or a create form has nothing to preview.
- ✅ Runs on **both** clients: classic `/admin` and modern `/v/`.

## Remove / disable

- Disable the plugin in **Plugin Manager**. The Print buttons / Preview block disappear from your blocks.
- **Your designed templates stay** in the database (the hidden `ptdl_print_templates` table) — re-enable the plugin to keep using them.
- PDFs already saved to a field are normal attachments and are **unaffected** when the plugin is disabled.

---

### For developers

- The server creates 2 hidden collections: `ptdl_print_templates` (templates) and `ptdl_pdf_settings` (service config; the
  password is stored only on the server and never returned to the client). HTML→PDF vector rendering goes through the
  `ptdlPdf:render` proxy to Gotenberg; "Let AI write it" goes through `ptdlPrintAi:generate`.
- The client registers 3 action models (`PrintTemplateActionModel`, `SavePdfToFieldActionModel`, `BatchPrintActionModel`)
  + 1 block (`PrintPreviewBlockModel`) for both lanes; shared UI lives in `src/shared/*`, the drag-drop editor is GrapesJS
  (`GrapesBodyEditor`), and the Handlebars formulas are in `helpers.ts` / `HelperDocs.tsx`.
- A Vietnamese version of this guide is in `README.vi-VN.md`.
