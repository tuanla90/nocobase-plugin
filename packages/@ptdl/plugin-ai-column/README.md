# AI Column — User Guide

> Bring AI straight into your **data columns**, Airtable-style: generate text, read images/PDF/audio (OCR/STT),
> classify a value against a catalog collection, turn **one document into many rows** in a sub-table,
> create images and read text aloud as **speech** (TTS) — per cell, in **bulk**, or **auto-run on save**.

**Group:** Fields · AI · **Runs on:** /admin (classic) + /v/ (modern) · **Version:** 0.7.0

> ⚙ **Prerequisites (without these, nothing will generate):**
> - Enable **`@nocobase/plugin-ai`** and add at least **one LLM service** under **Settings → AI**.
> - **Reading files** (extract / multi-row / image) needs **`@nocobase/plugin-file-manager`** (and optionally **`@nocobase/plugin-field-attachment-url`**).
> - **Text generation / classification** work with **every** plugin-ai provider. But **image generation** and **audio transcription (STT)** currently **run only with Google (google-genai)**. **Speech (TTS)** supports **Google / ElevenLabs / Vbee**.

## What's new after installing?

- 🔑 **The entry point to EVERY feature is "Field component".** You **won't see an AI button anywhere** until you switch a field to an AI component (click ⚙ on the field → **Field component**). This is the single most important thing to remember.
- **8 new Field components** (depending on the field type): **AI input**, **AI textarea**, **AI extract**, **AI multi-row extract**, **AI classify**, **AI deep classify**, **AI image**, **AI voice**.
- **A ✨ button right on the cell**: after switching, each AI field gets a ✨ button to run manually, plus an **"AI" settings group** in the gear to configure it (service, model, prompt, trigger…).
- **Bulk table actions** (under *Configure actions*): **Bulk AI Generate**, **Bulk AI Extract**, **Bulk AI Image**, **Bulk AI Voice**, **Bulk AI Classify**, **Bulk AI Extract-rows** — run once over many ticked rows.
- **Per-record AI buttons**: **AI Function** (on the record action bar) and **AI fill** (inside a form) — one button that does any AI job for the current record.
- **Server-side auto-run**: AI can **run automatically when a record is created/updated** from automation / API / import / bulk — no need to open a form.
- **A new Settings page: "AI Providers"** — only for (a) declaring **ElevenLabs / Vbee voice credentials** and (b) **managing the vector index** for AI classify. Everyday generate/read/classify configuration still lives right on the field.

## Where to configure

There are **two places**, and the one you'll use most is **right on the field itself**:

| What to change | Where to go |
|---|---|
| **Enable AI on a column + prompt/model/trigger** *(most common)* | Click ⚙ on the field → **Field component** → pick an AI component → reopen ⚙ → the **AI** group |
| **Voice credentials (ElevenLabs / Vbee)** | **/v/** ⚙ Settings → **"AI Providers"** → the **"Voice (TTS)"** tab · (classic: `/admin/settings/ptdl-ai-provider`) |
| **Vector index for AI classify** | Same **"AI Providers"** page → the **"Matching / Embedding"** tab |
| **LLM service + API key** (belongs to plugin-ai, not this plugin) | **Settings → AI** |

## How to use (step by step)

> ✅ **Always start the same way:** open a **Form** or **Table** block at `/v/` (or /admin) → turn on **UI Editor** → click ⚙ on the field you want to add AI to → **Field component** → pick an AI component (table below). Then reopen ⚙ → the **AI** group to configure it.

**Which component for which field type:**

| Field type | Pick "Field component" | What it does |
|---|---|---|
| Single-line text (input/email/url/phone) | **AI input** | Generate / summarize / translate / classify / score → fill **that same cell** |
| Long text / Markdown | **AI textarea** | Same, but long content; keeps markdown |
| Attachment (image/PDF/DOC/**audio**) | **AI extract** | Read the file → fill **several other fields** (OCR invoices/ID cards, score a CV, **transcribe audio**) |
| Attachment **or** Long text | **AI multi-row extract** | One document → **N rows** in a **sub-table** (one-to-many relation) |
| Single-line text | **AI classify** | Match a value against **a master collection** (catalog) → write the best-matching **code** |
| Single-line text **or** Relation (n-1) | **AI deep classify** | Same + **score & explain** each candidate; for a relation field, assign the **FK** directly |
| Attachment | **AI image** | Generate an image from a prompt **or edit an image** (img2img: remove background, shift tone…) |
| Attachment | **AI voice** | Read text aloud as **speech** (TTS) → an audio file into that cell |

### Scenario A — Generate text into a cell (AI input / AI textarea)

1. Switch a text field to **AI input** (or **AI textarea** for long content).
2. Open ⚙ → the **AI** group: pick an **LLM service** + **Model**, choose the **Output type** (**Text** / **Number** / **Single select**).
3. Write the **Prompt**. To insert another column's value, use the **insert-field button** to drop in `{{field_name}}` (no need to remember names); or quickly pick a **Prompt template** (Short summary / Rewrite professionally / Translate to English / Sentiment classification / Extract keywords…).
4. Click **✨** to run → check the value → **Save**. If you chose **Number** / **Single select**, the result is **coerced to the right type** (a real number / exactly one option).

### Scenario B — Read an image / PDF / audio → fill several fields (AI extract)

1. Switch an **Attachment** field (holding an image/PDF/DOC/audio) to **AI extract**.
2. Open ⚙ → the **AI** group: write what to read, then in the **Fields to extract** table click **+ Add field** to choose the target fields to fill (number/true-false/enum type is **auto-detected** from each field).
3. Upload a file to the field → click **✨** → the AI reads the file and fills the mapped fields → review → **Save**.
> 💡 Use for: OCR invoices/ID cards, **scoring CVs/calls**, **transcribing audio (STT)** (audio currently runs only with Google).

### Scenario C — Classify against a catalog collection (AI classify)

1. Switch a code field (e.g. *HS code*, *Product code*) to **AI classify** (or **AI deep classify** if you need scoring + explanations).
2. Open ⚙ → the **AI** group: pick the **Master collection** (the catalog to match against), set the **Text to match** (columns of the current record) and the **Value written into the field** (the master's code column).
3. The first time, click **Embed master** to build the **vector index** (later, manage it under Settings → **AI Providers** → **Matching / Embedding**).
4. Click **✨** → the AI shows the nearest candidates → **Pick** an answer → the code is written into the cell. You can have it auto-pick when the score ≥ a threshold.

### Scenario D — One document → many sub-table rows (AI multi-row extract)

1. Switch an **Attachment** field (or a **Long text** field with pasted content) to **AI multi-row extract**.
2. Open ⚙ → the **AI** group: pick the **Sub-table to receive rows** (a one-to-many relation of the record), then **+ Add field** to declare the **Fields per row**; choose the **Write mode**: **Append** or **Replace**.
3. Click **✨** → the AI splits the document (e.g. a quote → line items) and fills the sub-table → review → **Save**.

### Scenario E — Generate / edit images (AI image)

1. Switch an **Attachment** field to **AI image**. Open ⚙ → the **AI** group: pick the **Image model** (default `gemini-2.5-flash-image`) + write a **Prompt**.
2. **Generate new:** leave the **Source image to EDIT** box empty → prompt describing the image to create → **✨**.
3. **Edit an image (img2img):** set the **Source image to EDIT** = an image field (even the field itself) → prompt describing the edit (*"remove background"*, *"white background"*, *"warm tone"*) → **✨**. Or quickly pick a **Prompt template (generate / edit)** — choosing an edit template auto-sets the source image to the field itself.

### Scenario F — Read aloud (AI voice) — *"where do I pick the voice?"*

1. Switch an **Attachment** field to **AI voice** → open ⚙ → the **AI** group.
2. Pick the **Voice provider**: **Google (Gemini TTS)** / **ElevenLabs** / **Vbee (Vietnamese voices)**.
   - **Google:** pick a **TTS model** + a **Voice** (30 voices — type `male`/`female` to filter) + the **Style / emotion / pace** box (described in words, e.g. *"slow, warm"*).
   - **ElevenLabs / Vbee:** pick a **Credential** (declared beforehand in Settings, see below) + paste a **Voice ID / voice_code**.
3. Fill in the **Text to read** (column insert supported), click **🔊 Preview** to hear it first, then **✨** to create the file → **Save**.
> 💡 **Declare ElevenLabs / Vbee credentials** under **Settings → "AI Providers" → the "Voice (TTS)" tab**: add a credential, then return to the field and pick that Provider + credential. Google does **not** need declaring here (it uses the LLM service under Settings → AI). Secret keys are write-only and **never shown again**.

### Scenario G — Run in bulk over many rows (bulk)

1. In a **Table block**, turn on **Configure actions** → add the AI action you need (**Bulk AI Generate** / **Bulk AI Extract** / **Bulk AI Image** / **Bulk AI Voice** / **Bulk AI Classify** / **Bulk AI Extract-rows**).
2. Open the button's ⚙ to configure it (target field + prompt; voice also takes a voice/style).
3. **Tick several rows** → click the button → run in one pass. It **retries** on rate limits; failed rows are reported separately so you can rerun them later.
> ⚠️ The target field's current value is **overwritten** for the selected rows.

### Scenario H — One AI button per record (AI Function)

1. Turn on **UI Editor** → on the record's action bar (or inside a form) add an **AI Function** button (inside a form it's called **AI fill**).
2. Open ⚙ → choose the **Job**: *Generate content*, *Extract*, *Classify*, *Create multiple rows*, *Generate image*, *Read aloud (TTS)*, or *Transcribe from audio (STT)* — then configure the matching field/prompt.
3. Click the button on a record to run that exact job for the current record.

### Scenario I — Auto-run server-side on save (auto-run)

1. In the field's config (or a bulk button), find the **Auto-generate when** trigger → choose **"Server: when a record is created/updated (incl. automation/API/bulk)"**.
2. To save cost, open **Run condition (cost saving)**: turn on **"Only run when the target field is empty (don't regenerate if it already has a value)"** and/or add a field condition (e.g. only score when `status = new`).
3. From now on, whenever a record is created/updated from **automation / API / import / bulk**, the AI **runs automatically** — no need to open a form. Applies to all four kinds: generate text, extract, generate images, generate voice.

## Tips & notes

- 🔑 **No AI button?** You haven't switched the field to an AI **Field component** yet — that is the only entry point. If the AI component **doesn't appear** in the list: check the plugin is enabled + the field type is right (AI extract/image/voice only show on **Attachment** fields).
- ⚠️ **Bulk / auto-run overwrite** the target field's value. Consider turning on **"Only run when the target field is empty"** so you don't regenerate what's already there.
- 💰 **Built-in cost savings:** an **identical text-generation** result (same service/model/prompt) is **reused for one hour** (classifying 1000 rows with only a handful of distinct values → just a few calls); a burst of auto-runs is **queued** so you don't burn through quota.
- 🎙️ **Provider limits:** **image generation** and **audio transcription (STT)** are currently **Google (google-genai) only**; **speech (TTS)** has the full **Google / ElevenLabs / Vbee**; **text generate/read** works with **every provider**.
- 🔢 **Out of quota (429 errors):** Google's free tier runs dry easily, especially TTS — wait for the daily reset or upgrade billing. The plugin retries on rate limits but can't fix an exhausted quota.
- 🩺 **Auto-run failures are no longer silent:** each error is written to the hidden **`ptdlAiAutorunLog`** collection (build a table block on it to view; auto-cleaned after 14 days).
- Runs on **both** clients: classic `/admin` and modern `/v/`. Because it touches the server tier (auto-run, hidden collections), **enabling/disabling the plugin requires a server restart**.

## Remove / disable

- **Turn off a single feature:** switch the field's Field component **back to a plain type** (e.g. *Switch back to plain Input*), or reset the **"Auto-generate when"** trigger to **"(leave empty = only the manual ✨ button)"**. Data already generated stays.
- **Remove entirely:** disable the plugin in **Plugin Manager**. AI fields revert to plain components; data already generated (text, images, audio, child rows) **stays in the records**. Voice credentials and the vector index remain in the database (collections `ptdlVoiceProvider`, `ptdlClassifyEmbed`…) in case you re-enable later.

---

### For developers

Server actions: `ptdlAiColumn:generate` / `:extract` / `:generateImage` / `:generateVoice` (+ `:setAutorun` / `:removeAutorun` / `:setVoiceProvider` / `:autorunErrors`). Text generation goes through `@nocobase/plugin-ai` (multi-provider); media calls the Google REST API directly (`google-genai`) because the plugin-ai reuse is chat-only — hence **image generation and STT are Google-only**. Server auto-run stores its config in the hidden collection `ptdlAiAutorun`; the `afterCreate` / `afterUpdateWithAssociations` hooks run the AI **after commit** and write results back with `hooks:false` (prevents infinite loops); failures go to `ptdlAiAutorunLog` (auto-cleaned after 14 days, queryable via `:autorunErrors`). Cost controls: identical text results are cached and reused for one hour (the response carries `cached:true`), and bursts of auto-runs are queued at concurrency 3. Voice credentials live in `ptdlVoiceProvider` (secrets are write-only); the classify index lives in `ptdlClassifyEmbed` / `ptdlClassifyConfig` (plus the decision log `ptdlClassifyDecisionLog`). All **three lanes must be built & installed** (`client` + `client-v2` + `server`) — a missing marker breaks `/v/` with "Script error". Not yet done: video (Veo) and bulk on pure pre-flow-engine classic Formily tables. Full manual test matrix & limits: see `TEST-CHECKLIST.md`.
