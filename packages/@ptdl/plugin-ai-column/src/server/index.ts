/**
 * @ptdl/plugin-ai-column — server lane.
 *
 * Exposes a single action `ptdlAiColumn:generate` that runs an LLM prompt through a
 * configured NocoBase LLM service and returns the (coerced) text. It reuses the native
 * `@nocobase/plugin-ai` at runtime (via `ctx.app.pm.get('ai')`) — so we never touch API
 * keys, provider SDKs or LangChain here; all of that lives in plugin-ai.
 *
 * Request body (ctx.action.params.values):
 *   { llmService?, model?, system?, prompt, values, output: { type, options? } }
 * Response: { value, raw, service, model }
 */
import { Plugin } from '@nocobase/server';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Read a dot-path (`a.b.c`) out of a plain object; undefined when any hop is missing. */
function getPath(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((acc: any, key: string) => (acc == null ? undefined : acc[key]), obj);
}

/** Replace {{field}} / {{rel.sub}} tokens in the prompt with row values. */
function renderTemplate(tpl: string, values: Record<string, any>): string {
  if (!tpl) return '';
  return String(tpl).replace(/\{\{\s*([\w.$-]+)\s*\}\}/g, (_m, path) => {
    const v = getPath(values, path);
    if (v == null) return '';
    if (typeof v === 'object') {
      try {
        return JSON.stringify(v);
      } catch {
        return String(v);
      }
    }
    return String(v);
  });
}

/** Pull plain text out of a LangChain AIMessage (content is a string or an array of blocks). */
function extractText(msg: any): string {
  if (msg == null) return '';
  const c = msg.content !== undefined ? msg.content : msg;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c
      .map((b: any) => (typeof b === 'string' ? b : b?.text ?? b?.content ?? ''))
      .join('');
  }
  if (c && typeof c === 'object' && typeof c.text === 'string') return c.text;
  return String(c ?? '');
}

/** JSON schema for `structuredOutput` — wraps the answer in `{value}` (structured-output methods
 *  generally require an object at the root, not a bare number/enum). Returns null for 'text' (no
 *  schema needed) or 'singleSelect' with no configured options (falls back to free text). */
function buildResultSchema(type: string, opts: string[]): any | null {
  if (type === 'number') {
    return {
      type: 'object',
      properties: { value: { type: 'number', description: 'The numeric result — no units, no text.' } },
      required: ['value'],
    };
  }
  if (type === 'singleSelect' && opts.length) {
    return {
      type: 'object',
      properties: { value: { type: 'string', enum: opts, description: 'Exactly one of the allowed options.' } },
      required: ['value'],
    };
  }
  return null;
}

/** Strip common LLM-generated markdown syntax (bold/italic/code/headers/bullets/links/quotes) so
 *  a plain text/number/select field doesn't end up showing literal `**word**` / `# Title` / etc.
 *  Regex-based, not a full parser — covers the patterns models actually produce, not the whole
 *  CommonMark spec; deliberately no external markdown dependency for this much cleanup. Skipped
 *  entirely when the target field itself renders markdown (`keep=true`) — see fieldPicker.tsx's
 *  `fieldJsonMeta` for how the client detects that from the field's real interface. */
export function stripMarkdown(text: string, keep = false): string {
  if (keep || !text) return text;
  let t = text;
  t = t.replace(/```[\s\S]*?```/g, (m) => m.replace(/```(\w*\n?)?/g, '').trim()); // fenced code blocks
  t = t.replace(/`([^`]+)`/g, '$1'); // inline code
  // Bold/italic markers must not have whitespace right inside them (CommonMark's "flanking" rule,
  // simplified) — without this, 2 unrelated stray markers (e.g. "5 * 3 = 15 and use *args") get
  // misread as one italic span covering everything in between them.
  t = t.replace(/\*\*(?!\s)([^*]+?)(?<!\s)\*\*/g, '$1'); // bold **x**
  t = t.replace(/__(?!\s)([^_]+?)(?<!\s)__/g, '$1'); // bold __x__
  t = t.replace(/(?<!\*)\*(?!\s)([^*\n]+?)(?<!\s)\*(?!\*)/g, '$1'); // italic *x*
  t = t.replace(/(?<!_)_(?!\s)([^_\n]+?)(?<!\s)_(?!_)/g, '$1'); // italic _x_
  t = t.replace(/~~([^~]+)~~/g, '$1'); // strikethrough
  t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // [text](url) -> text
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, ''); // # headers
  t = t.replace(/^\s{0,3}[-*+]\s+/gm, ''); // - bullet / * bullet
  t = t.replace(/^\s{0,3}\d+\.\s+/gm, ''); // 1. numbered list
  t = t.replace(/^\s{0,3}>\s?/gm, ''); // > blockquote
  return t.trim();
}

/** Coerce the raw LLM text into the requested output type. */
function coerce(raw: string, output: any): any {
  const type = output?.type || 'text';
  const text = stripMarkdown((raw || '').trim(), !!output?.markdown);
  if (type === 'number') {
    const m = text.replace(/[, ]/g, '').match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : null;
  }
  if (type === 'singleSelect') {
    const opts: string[] = Array.isArray(output?.options) ? output.options.filter(Boolean) : [];
    if (!opts.length) return text;
    const low = text.toLowerCase();
    // exact match first, then substring either way
    let hit = opts.find((o) => String(o).toLowerCase() === low);
    if (hit != null) return hit;
    hit = opts.find((o) => {
      const ol = String(o).toLowerCase();
      return low.includes(ol) || ol.includes(low);
    });
    return hit != null ? hit : opts[0];
  }
  return text;
}

/** One extracted-field mapping: `{name}` must match a real field of the CURRENT collection.
 *  `type`/`enum`/`markdown` come from the client auto-detecting the target field's REAL data type
 *  (see fieldPicker.tsx's fieldJsonMeta) — not free-typed by the user — so e.g. a number/boolean/
 *  select field gets a properly typed & constrained schema property instead of a bare string, and
 *  a markdown-interface field is exempted from the plain-text markdown stripping below. */
type ExtractFieldDef = {
  name: string;
  description?: string;
  type?: 'string' | 'number' | 'boolean';
  enum?: string[];
  markdown?: boolean;
};

/** Build the multi-property structuredOutput schema for `extract` — one property per target field. */
function buildExtractSchema(fields: ExtractFieldDef[]): any {
  const properties: Record<string, any> = {};
  for (const f of fields) {
    if (!f?.name) continue;
    const prop: any = { type: f.type || 'string', description: f.description || `Value for ${f.name}` };
    if (Array.isArray(f.enum) && f.enum.length) prop.enum = f.enum;
    properties[f.name] = prop;
  }
  return { type: 'object', properties, required: Object.keys(properties) };
}

/** Build the ARRAY structuredOutput schema for `extractRows` (AI Multi-row Extract): one document/
 *  prompt → N rows, each row shaped by the SAME per-field defs as `extract` (but pointing at the
 *  CHILD collection's fields). Wrapped in `{rows:[...]}` because structured-output methods require an
 *  object at the root, not a bare array. Used to turn e.g. a quote PDF into order-line rows. */
function buildRowsSchema(fields: ExtractFieldDef[]): any {
  return {
    type: 'object',
    properties: {
      rows: {
        type: 'array',
        items: buildExtractSchema(fields),
        description: 'One object per extracted row / line item — return every distinct line found.',
      },
    },
    required: ['rows'],
  };
}

/** Post-process extracted rows: guarantee an array, drop non-object entries, and strip markdown noise
 *  from plain-text child fields (leaving markdown-interface fields intact — same rule as `extract`). */
function postProcessRows(rows: any, fields: ExtractFieldDef[]): any[] {
  const arr = Array.isArray(rows) ? rows : [];
  const out: any[] = [];
  for (const row of arr) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    for (const f of fields) {
      if ((f.type || 'string') === 'string' && typeof row[f.name] === 'string') {
        row[f.name] = stripMarkdown(row[f.name], !!f.markdown);
      }
    }
    out.push(row);
  }
  return out;
}

/** Normalize whatever shape a source field's value can take into a plain array:
 *  undefined | a bare URL string (attachmentURL interface) | one attachment record |
 *  an array of attachment records (attachment interface, belongsToMany — e.g. front+back of an ID card). */
function normalizeAttachments(v: any): any[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Fetch a URL and inline it as base64 + its detected mimetype. Base64 encoding is REQUIRED for at
 *  least Google Gemini — tested live and confirmed it rejects a bare `image_url.url` remote link
 *  ("Please provide image as base64 encoded data URL"), unlike OpenAI's vision API which accepts
 *  either. Encoding is the universal-safe choice: every vision-capable provider accepts a data URI. */
async function fetchAsBase64(url: string): Promise<{ base64: string; dataUri: string; mimetype: string } | null> {
  try {
    // A generic/missing User-Agent gets a flat 400/403 from some hosts (e.g. Wikimedia's bot
    // policy) — a real browser-like UA avoids that without doing anything shady.
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NocoBaseAiColumn/1.0)' } });
    if (!res.ok) return null;
    const mimetype = res.headers.get('content-type')?.split(';')[0] || 'application/octet-stream';
    const buf = Buffer.from(await res.arrayBuffer());
    const base64 = buf.toString('base64');
    return { base64, dataUri: `data:${mimetype};base64,${base64}`, mimetype };
  } catch {
    return null;
  }
}

/** Last path segment of a URL (query/hash stripped) — used as the synthetic attachment's filename
 *  so plugin-ai's document loader can key off its extension (.docx/.xlsx/…). */
function urlBasename(url: string): string {
  try {
    const clean = url.split('#')[0].split('?')[0];
    const seg = clean.substring(clean.lastIndexOf('/') + 1);
    return decodeURIComponent(seg) || 'document';
  } catch {
    return 'document';
  }
}

/** Turn one source-field item into a LangChain vision/file content block (or a system note).
 *  - A real uploaded attachment RECORD (object with mimetype) goes straight through
 *    `@nocobase/plugin-ai`'s own pipeline (`parseAttachment`), which handles images (vision API),
 *    PDF, AND office/text documents (.doc/.docx/.xls/.pptx/.txt/.csv… via its document loader →
 *    extracted text).
 *  - A bare URL STRING (attachmentURL interface): images are inlined as a base64 `image_url` data
 *    URI (proven path — Gemini rejects a bare remote image URL). Non-images (PDF/office docs) are
 *    routed through the SAME `parseAttachment` pipeline via a synthetic record — each provider
 *    overrides the block format differently (google-genai emits `{type:'<mimetype>', data}`,
 *    others differ), so we never hardcode one provider's shape. `getFileURL` returns the bare url
 *    for a record with no `storageId`, and the doc loader keys off the filename extension. */
async function attachmentToBlock(ctx: any, provider: any, item: any): Promise<{ placement?: string; content: any } | null> {
  if (item && typeof item === 'object' && item.mimetype) {
    try {
      return await provider.parseAttachment(ctx, item);
    } catch (e: any) {
      ctx.log?.warn?.('[ptdl-ai-column] parseAttachment failed for one file: ' + (e?.message || e));
      return null;
    }
  }
  if (typeof item === 'string' && item.trim()) {
    const url = item.trim();
    const fetched = await fetchAsBase64(url);
    if (!fetched) {
      // Fetch failed — last-ditch: hand the raw URL to the provider as an image (works for
      // providers that dereference remote image URLs; harmless otherwise).
      return { content: { type: 'image_url', image_url: { url } } };
    }
    if (fetched.mimetype.startsWith('image/')) {
      return { content: { type: 'image_url', image_url: { url: fetched.dataUri } } };
    }
    // PDF / office / text document reachable only by URL: build the provider-correct block by
    // running it through the real attachment pipeline with a synthetic record.
    try {
      const block = await provider.parseAttachment(ctx, {
        url,
        mimetype: fetched.mimetype,
        filename: urlBasename(url),
      });
      if (block) return block;
    } catch (e: any) {
      ctx.log?.warn?.('[ptdl-ai-column] URL attachment parse failed: ' + (e?.message || e));
    }
    return null;
  }
  return null;
}

/** Read a configured LLM service's raw credentials directly from the DB. `@nocobase/plugin-ai`
 *  reuse (getLLMService/invoke) is CHAT-ONLY — it never exposes an image/audio-generation path —
 *  so media generation has to call the provider's REST API directly, which means reaching the raw
 *  apiKey. Falls back to the first google-genai service when no name is given. Returns null when
 *  nothing usable is configured. */
async function getServiceCredentials(
  db: any,
  serviceName?: string,
): Promise<{ serviceName: string; provider: string; apiKey?: string; baseURL?: string } | null> {
  const repo = db?.getRepository?.('llmServices');
  if (!repo) return null;
  let svc: any;
  if (serviceName) svc = await repo.findOne({ filter: { name: serviceName } });
  if (!svc) svc = await repo.findOne({ filter: { provider: 'google-genai' } });
  if (!svc) return null;
  const get = (k: string) => (typeof svc.get === 'function' ? svc.get(k) : svc[k]);
  const options = get('options') || {};
  return { serviceName: get('name'), provider: get('provider'), apiKey: options.apiKey, baseURL: options.baseURL };
}

/** Read a 3rd-party TTS provider credential (ElevenLabs / Vbee) from the plugin's own
 *  `ptdlVoiceProvider` store by name (falls back to the first enabled row of `wantProvider`). Unlike
 *  Google TTS — which reuses @nocobase/plugin-ai's `llmServices` — ElevenLabs/Vbee aren't LLM
 *  providers, so their secrets live in this dedicated collection. Returns the full record incl.
 *  secrets (server-side only; the client picker action never returns these). */
async function getVoiceProviderCreds(
  db: any,
  name?: string,
  wantProvider?: string,
): Promise<{ name: string; provider: string; apiKey?: string; appId?: string; token?: string; baseURL?: string; voiceDefault?: string } | null> {
  const repo = db?.getRepository?.('ptdlVoiceProvider');
  if (!repo) return null;
  let row: any;
  if (name) row = await repo.findOne({ filter: { name } });
  if (!row && wantProvider) row = await repo.findOne({ filter: { provider: wantProvider, enabled: true } });
  if (!row) return null;
  const g = (k: string) => (typeof row.get === 'function' ? row.get(k) : row[k]);
  return { name: g('name'), provider: g('provider'), apiKey: g('apiKey'), appId: g('appId'), token: g('token'), baseURL: g('baseURL'), voiceDefault: g('voiceDefault') };
}

/** Generate one image via Google's Generative Language API (generateContent + IMAGE modality).
 *  Returns the raw bytes + mimetype, or null when the model returned no image part. */
async function googleGenerateImage(
  apiKey: string,
  model: string,
  prompt: string,
  baseURL?: string,
  images?: Array<{ mimeType: string; base64: string }>,
): Promise<{ buffer: Buffer; mimetype: string } | null> {
  const base = baseURL && baseURL.trim() ? baseURL.replace(/\/+$/, '') : 'https://generativelanguage.googleapis.com/v1beta';
  const url = `${base}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  // img2img: prepend any input images as inlineData parts — the model then EDITS them per the prompt
  // (background removal, restyle, enhance…) instead of generating from text alone.
  const reqParts: any[] = [];
  if (images && images.length) {
    for (const im of images) reqParts.push({ inlineData: { mimeType: im.mimeType, data: im.base64 } });
  }
  reqParts.push({ text: prompt });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: reqParts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Google image API ${res.status}: ${t.slice(0, 300)}`);
  }
  const j: any = await res.json();
  const parts = j?.candidates?.[0]?.content?.parts || [];
  for (const p of parts) {
    const inline = p.inlineData || p.inline_data;
    if (inline?.data) {
      return { buffer: Buffer.from(inline.data, 'base64'), mimetype: inline.mimeType || inline.mime_type || 'image/png' };
    }
  }
  return null;
}

/** Wrap raw PCM (what Gemini TTS returns — `audio/L16;codec=pcm;rate=NNNN`) in a minimal WAV/RIFF
 *  header so the result is a real, playable/attachable `.wav` file. Without this the bytes are just
 *  headerless samples that nothing can play. */
function pcmToWav(pcm: Buffer, sampleRate: number, channels = 1, bitsPerSample = 16): Buffer {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(byteRate, 28);
  h.writeUInt16LE(blockAlign, 32);
  h.writeUInt16LE(bitsPerSample, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** Generate speech (TTS) via Google's Generative Language API. The TTS models refuse if the input
 *  reads like a question, so the text is prefixed with an explicit read-aloud directive (Gemini
 *  treats a leading instruction as a style cue and does NOT speak it — verified live). Output is
 *  raw PCM which we wrap into a WAV. Returns the WAV bytes, or null when no audio came back. */
async function googleGenerateVoice(
  apiKey: string,
  model: string,
  text: string,
  voiceName: string,
  baseURL?: string,
  style?: string,
): Promise<{ buffer: Buffer; mimetype: string } | null> {
  const base = baseURL && baseURL.trim() ? baseURL.replace(/\/+$/, '') : 'https://generativelanguage.googleapis.com/v1beta';
  const url = `${base}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  // Gemini TTS has NO numeric speed/pitch knobs (those are Cloud TTS) — delivery is controlled by a
  // natural-language directive, which Gemini follows without speaking it. `style` (e.g. "vui vẻ,
  // nhanh" / "chậm rãi, trầm ấm") is woven into that directive.
  const styleClause = style && style.trim() ? `, ${style.trim()}` : ' clearly';
  const directed = `Read the following text aloud in the same language as the text${styleClause}. Do not add or translate anything:\n\n${text}`;
  const body = JSON.stringify({
    contents: [{ parts: [{ text: directed }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName || 'Kore' } } },
    },
  });

  // The TTS model NON-DETERMINISTICALLY refuses (returns a text part instead of audio) for the same
  // input — verified live. Retry a few times before giving up so a lone refusal isn't a failure.
  let lastText = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Google TTS API ${res.status}: ${t.slice(0, 300)}`);
    }
    const j: any = await res.json();
    const parts = j?.candidates?.[0]?.content?.parts || [];
    for (const p of parts) {
      const inline = p.inlineData || p.inline_data;
      if (inline?.data) {
        const mime = inline.mimeType || inline.mime_type || '';
        const pcm = Buffer.from(inline.data, 'base64');
        // Already a container format? (rare) — pass through. Otherwise treat as raw PCM and wrap.
        if (/wav|mpeg|mp3|ogg/i.test(mime)) return { buffer: pcm, mimetype: mime.split(';')[0] };
        const rate = Number((mime.match(/rate=(\d+)/) || [])[1]) || 24000;
        return { buffer: pcmToWav(pcm, rate), mimetype: 'audio/wav' };
      }
      if (p.text) lastText = p.text;
    }
  }
  if (lastText) throw new Error(`TTS model kept returning text instead of audio: "${lastText.slice(0, 120)}"`);
  return null;
}

/** ElevenLabs TTS. The base `/text-to-speech/{voiceId}` endpoint returns raw MP3 bytes directly
 *  (unlike `/with-timestamps` which wraps base64 in JSON — we don't need timestamps here). Contract
 *  learned from the semantix-docs video pipeline: header `xi-api-key`, model `eleven_multilingual_v2`
 *  (best for Vietnamese), `voice_settings` for v2/v2.5, `language_code` only honoured by turbo/flash
 *  v2.5. Audio-tags like `[excited]` are read aloud by v2.5 → strip unless the model is v3. */
async function elevenLabsGenerateVoice(
  apiKey: string,
  voiceId: string,
  model: string,
  text: string,
  opts?: { stability?: number; similarity?: number; style?: number; language?: string; baseURL?: string },
): Promise<{ buffer: Buffer; mimetype: string }> {
  if (!voiceId) throw new Error('ElevenLabs cần Voice ID.');
  const base = opts?.baseURL && opts.baseURL.trim() ? opts.baseURL.replace(/\/+$/, '') : 'https://api.elevenlabs.io/v1';
  const mdl = model && model.trim() ? model : 'eleven_multilingual_v2';
  const isV3 = /v3$/i.test(mdl);
  const clean = isV3 ? text : text.replace(/\[[^\]]*\]/g, ''); // strip audio-tags for non-v3
  const url = `${base}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
  const body: any = { text: clean, model_id: mdl };
  if (!isV3) {
    body.voice_settings = {
      stability: opts?.stability ?? 0.4,
      similarity_boost: opts?.similarity ?? 0.75,
      style: opts?.style ?? 0.3,
      use_speaker_boost: true,
    };
  }
  if (opts?.language && /(turbo|flash)/i.test(mdl)) body.language_code = opts.language;
  const res = await fetch(url, { method: 'POST', headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`ElevenLabs TTS ${res.status}: ${t.slice(0, 300)}`);
  }
  return { buffer: Buffer.from(await res.arrayBuffer()), mimetype: 'audio/mpeg' };
}

/** Vbee TTS (Vietnamese-first). ASYNC by design: POST returns a `request_id`, then you POLL
 *  `GET /tts/{id}` until `status == SUCCESS` and download `audio_link` (mp3). `callback_url` is a
 *  REQUIRED body field (missing → 400) but a real callback server isn't needed — polling works.
 *  Contract verified in semantix-docs (2026-06-24). `speed_rate` must be a STRING. */
async function vbeeGenerateVoice(
  appId: string,
  token: string,
  voiceCode: string,
  text: string,
  speed?: string | number,
  baseURL?: string,
): Promise<{ buffer: Buffer; mimetype: string }> {
  if (!voiceCode) throw new Error('Vbee cần voice_code.');
  const base = baseURL && baseURL.trim() ? baseURL.replace(/\/+$/, '') : 'https://vbee.vn/api/v1';
  const body = {
    app_id: appId,
    input_text: text,
    voice_code: voiceCode,
    audio_type: 'mp3',
    bitrate: 128,
    speed_rate: String(speed || '1.0'),
    callback_url: 'https://example.com/vbee-callback', // required by API; we poll instead of receiving it
  };
  const res = await fetch(`${base}/tts`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Vbee TTS ${res.status}: ${t.slice(0, 300)}`);
  }
  const j: any = await res.json();
  const requestId = j?.result?.request_id;
  if (!requestId) throw new Error('Vbee: không có request_id — ' + JSON.stringify(j).slice(0, 200));
  let audioLink = '';
  for (let i = 0; i < 40; i++) {
    // ~40 × 1.5s = 60s ceiling; Vbee usually done in 3–20s.
    await new Promise((r) => setTimeout(r, 1500));
    const pr = await fetch(`${base}/tts/${requestId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!pr.ok) continue;
    const pj: any = await pr.json();
    const st = pj?.result?.status;
    if (st === 'SUCCESS') {
      audioLink = pj?.result?.audio_link;
      break;
    }
    if (st === 'FAILURE' || st === 'ERROR' || st === 'FAILED') throw new Error('Vbee TTS lỗi: ' + JSON.stringify(pj?.result || pj).slice(0, 200));
  }
  if (!audioLink) throw new Error('Vbee TTS timeout (không SUCCESS trong ~60s).');
  const audioRes = await fetch(audioLink);
  if (!audioRes.ok) throw new Error(`Vbee tải audio_link lỗi ${audioRes.status}`);
  return { buffer: Buffer.from(await audioRes.arrayBuffer()), mimetype: 'audio/mpeg' };
}

const MIME_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'audio/wav': '.wav',
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'video/mp4': '.mp4',
};

/** Persist a generated media buffer as a real NocoBase attachment (so it drops straight into an
 *  attachment field). Uses file-manager's `createFileRecord`, which uploads a file from DISK into
 *  the collection's (or default) storage — so we stage the bytes in a temp file first. */
async function saveBufferAsAttachment(app: any, buffer: Buffer, mimetype: string, hint: string): Promise<any> {
  const fileManager = app.pm.get('file-manager');
  if (!fileManager?.createFileRecord) throw new Error('file-manager plugin is not available');
  const ext = MIME_EXT[mimetype] || '.bin';
  const tmp = path.join(os.tmpdir(), `ptdl-${hint}-${Date.now()}${ext}`);
  fs.writeFileSync(tmp, buffer);
  try {
    // The local storage engine leaves `mimetype` null for a file staged this way, so set it
    // explicitly via `values` (createFileRecord merges these over the uploaded file data).
    const record = await fileManager.createFileRecord({
      collectionName: 'attachments',
      filePath: tmp,
      values: { mimetype },
    });
    const json = record?.toJSON ? record.toJSON() : record;
    // `url` is a computed field (storage baseUrl + path/filename), not stored on the row — resolve
    // it so the client can preview/associate the attachment immediately without a re-fetch.
    try {
      json.url = await fileManager.getFileURL(json);
    } catch {
      /* url resolution best-effort */
    }
    return json;
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* temp cleanup best-effort */
    }
  }
}

const AUDIO_EXT_RE = /\.(mp3|wav|m4a|ogg|oga|aac|flac|opus|weba|webm|aiff|amr)(\?|#|$)/i;

/** Whether a source-field item is an AUDIO attachment (→ route extraction through the direct-REST
 *  audio path, since plugin-ai's parseAttachment only supports image/pdf/office docs). */
function isAudioAttachment(item: any): boolean {
  if (typeof item === 'string') return AUDIO_EXT_RE.test(item.trim());
  if (item && typeof item === 'object') {
    if (typeof item.mimetype === 'string' && item.mimetype.startsWith('audio/')) return true;
    if (typeof item.filename === 'string' && AUDIO_EXT_RE.test(item.filename)) return true;
    if (typeof item.url === 'string' && AUDIO_EXT_RE.test(item.url)) return true;
  }
  return false;
}

/** Fetch an audio attachment (record or bare url) → base64 + mime. Relative urls (local storage,
 *  e.g. `/storage/uploads/x.wav`) are resolved against the incoming request's origin so the server
 *  can pull its own file without knowing its configured public URL. */
async function attachmentToMediaPart(ctx: any, item: any): Promise<{ mimeType: string; base64: string } | null> {
  let url: string | undefined;
  let mime: string | undefined;
  if (typeof item === 'string') url = item.trim();
  else if (item && typeof item === 'object') {
    url = item.url;
    mime = item.mimetype;
  }
  if (!url) return null;

  // Build candidate absolute URLs. A relative local-storage url (`/storage/uploads/x.wav`) needs an
  // origin — `ctx.origin` isn't always the reachable one (NocoBase runs behind a gateway), so try
  // several sources and use whichever actually fetches.
  const candidates: string[] = [];
  if (/^https?:\/\//i.test(url)) {
    candidates.push(url);
  } else {
    const origins: string[] = [];
    if (ctx.origin && /^https?:\/\//i.test(ctx.origin)) origins.push(ctx.origin);
    if (ctx.protocol && ctx.host) origins.push(`${ctx.protocol}://${ctx.host}`);
    try {
      const ref = ctx.get?.('referer');
      if (ref) origins.push(new URL(ref).origin);
    } catch {
      /* bad referer — ignore */
    }
    if (ctx.host) origins.push(`http://${ctx.host}`);
    origins.push('http://127.0.0.1:13000');
    for (const o of origins) {
      const c = o.replace(/\/+$/, '') + url;
      if (!candidates.includes(c)) candidates.push(c);
    }
  }

  for (const full of candidates) {
    const fetched = await fetchAsBase64(full);
    if (fetched) return { mimeType: mime && mime.startsWith('audio/') ? mime : fetched.mimetype, base64: fetched.base64 };
  }
  return null;
}

/** Map our ExtractFieldDef list to a Google `responseSchema` (its type names are UPPERCASE). */
function buildGoogleResponseSchema(fields: ExtractFieldDef[]): any {
  const properties: Record<string, any> = {};
  for (const f of fields) {
    if (!f?.name) continue;
    const t = f.type === 'number' ? 'NUMBER' : f.type === 'boolean' ? 'BOOLEAN' : 'STRING';
    const prop: any = { type: t, description: f.description || `Value for ${f.name}` };
    if (Array.isArray(f.enum) && f.enum.length) {
      prop.type = 'STRING';
      prop.enum = f.enum;
    }
    properties[f.name] = prop;
  }
  return { type: 'OBJECT', properties, required: Object.keys(properties) };
}

/** Structured extraction (incl. plain transcription) from audio via Google's REST generateContent
 *  + responseSchema — the chat/LangChain path (provider.invoke) doesn't accept audio input. */
async function googleStructuredFromMedia(
  apiKey: string,
  model: string,
  prompt: string,
  system: string,
  audioParts: Array<{ mimeType: string; base64: string }>,
  fields: ExtractFieldDef[],
  baseURL?: string,
): Promise<any> {
  const base = baseURL && baseURL.trim() ? baseURL.replace(/\/+$/, '') : 'https://generativelanguage.googleapis.com/v1beta';
  const url = `${base}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const parts: any[] = audioParts.map((a) => ({ inlineData: { mimeType: a.mimeType, data: a.base64 } }));
  parts.push({ text: prompt || 'Nghe đoạn audio và trích thông tin theo schema.' });
  const bodyObj: any = {
    contents: [{ parts }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: buildGoogleResponseSchema(fields) },
  };
  if (system && system.trim()) bodyObj.systemInstruction = { parts: [{ text: system }] };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyObj) });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Google audio API ${res.status}: ${t.slice(0, 300)}`);
  }
  const j: any = await res.json();
  const txt = (j?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('');
  try {
    return JSON.parse(txt);
  } catch {
    throw new Error('Model did not return valid JSON for the audio extraction');
  }
}

/** Google `responseSchema` for the ARRAY (`extractRows`) case — wraps buildGoogleResponseSchema in a
 *  `{rows: ARRAY<items>}` object (Google's type names are UPPERCASE). */
function buildGoogleRowsResponseSchema(fields: ExtractFieldDef[]): any {
  return {
    type: 'OBJECT',
    properties: { rows: { type: 'ARRAY', items: buildGoogleResponseSchema(fields) } },
    required: ['rows'],
  };
}

/** ARRAY structured extraction from image/PDF/audio via Google's REST generateContent — the ctx-free
 *  media path for `extractRows` (image blocks the LangChain vision path can't run outside a request).
 *  Returns the parsed `{rows:[...]}` object. */
async function googleStructuredRowsFromMedia(
  apiKey: string,
  model: string,
  prompt: string,
  system: string,
  mediaParts: Array<{ mimeType: string; base64: string }>,
  fields: ExtractFieldDef[],
  baseURL?: string,
): Promise<any> {
  const base = baseURL && baseURL.trim() ? baseURL.replace(/\/+$/, '') : 'https://generativelanguage.googleapis.com/v1beta';
  const url = `${base}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const parts: any[] = mediaParts.map((a) => ({ inlineData: { mimeType: a.mimeType, data: a.base64 } }));
  parts.push({ text: prompt || 'Đọc tài liệu và tách thành các dòng theo schema.' });
  const bodyObj: any = {
    contents: [{ parts }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: buildGoogleRowsResponseSchema(fields) },
  };
  if (system && system.trim()) bodyObj.systemInstruction = { parts: [{ text: system }] };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyObj) });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Google rows API ${res.status}: ${t.slice(0, 300)}`);
  }
  const j: any = await res.json();
  const txt = (j?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('');
  try {
    return JSON.parse(txt);
  } catch {
    throw new Error('Model did not return valid JSON for the multi-row extraction');
  }
}

/* --------------------------- result-dedup cache (#2) --------------------------- */
/** In-memory LRU+TTL cache of text-generation results, keyed by the request that fully determines
 *  the answer (service+model+system+RENDERED prompt+output shape). Its big win is low-cardinality
 *  work — e.g. "categorize {{status}}" over 1000 rows where `status` has 5 values collapses to 5
 *  LLM calls, not 1000. Only used for the deterministic-ish `generate` path (not media/extract,
 *  where inputs rarely repeat). Process-local (resets on restart) — a cost optimization, not a
 *  correctness dependency. */
const RESULT_CACHE = new Map<string, { at: number; value: any }>();
const RESULT_CACHE_TTL_MS = 60 * 60 * 1000; // 1h — long enough to cover a bulk run / burst
const RESULT_CACHE_MAX = 1000;
function resultCacheGet(key: string): any {
  const hit = RESULT_CACHE.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > RESULT_CACHE_TTL_MS) {
    RESULT_CACHE.delete(key);
    return undefined;
  }
  RESULT_CACHE.delete(key); // re-insert → most-recently-used moves to the end
  RESULT_CACHE.set(key, hit);
  return hit.value;
}
function resultCacheSet(key: string, value: any): void {
  RESULT_CACHE.set(key, { at: Date.now(), value });
  while (RESULT_CACHE.size > RESULT_CACHE_MAX) {
    const oldest = RESULT_CACHE.keys().next().value;
    if (oldest === undefined) break;
    RESULT_CACHE.delete(oldest);
  }
}

/* ------------------------- autorun throttle queue (#3) ------------------------- */
/** A concurrency-limited, coalescing job queue for server-side auto-run work. Without it, an
 *  automation/bulk import that writes 1000 records fires 1000 near-simultaneous LLM generations →
 *  quota burst / overload. Jobs are keyed by record (`collection:tk`); a newer save for the same
 *  record REPLACES the queued (not-yet-started) job so we never run stale generations. Drains at a
 *  fixed concurrency; each job is fully self-contained (errors go to onError, never thrown out). */
class AutorunQueue {
  private pending = new Map<string, () => Promise<void>>();
  private order: string[] = [];
  private active = 0;
  constructor(private concurrency: number, private onError: (key: string, e: any) => void) {}
  size(): number {
    return this.pending.size + this.active;
  }
  enqueue(key: string, job: () => Promise<void>): void {
    if (!this.pending.has(key)) this.order.push(key);
    this.pending.set(key, job); // coalesce: latest values win for the same record
    this.drain();
  }
  private drain(): void {
    while (this.active < this.concurrency && this.order.length) {
      const key = this.order.shift() as string;
      const job = this.pending.get(key);
      if (!job) continue;
      this.pending.delete(key);
      this.active++;
      Promise.resolve()
        .then(job)
        .catch((e) => {
          try {
            this.onError(key, e);
          } catch {
            /* onError must never throw the queue over */
          }
        })
        .finally(() => {
          this.active--;
          this.drain();
        });
    }
  }
}

/** True when `values[field]` is empty (unset / '' / empty array) — used by the `onlyWhenEmpty`
 *  auto-run gate to skip regenerating a field that already has a value (big cost saver for
 *  "fill once" columns). */
function isFieldEmpty(v: any): boolean {
  if (v == null || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/** Evaluate a simple auto-run gate condition `{field, op, value}` against the record. Deliberately
 *  tiny (no expression language) — just the handful of operators worth gating cost on, e.g. only
 *  score a lead when `status = 'new'`. Empty/invalid condition → true (no gating). */
function matchesCondition(cond: any, values: Record<string, any>): boolean {
  if (!cond || !cond.field || !cond.op) return true;
  const left = values[cond.field];
  const right = cond.value;
  const s = (x: any) => (x == null ? '' : String(x));
  switch (cond.op) {
    case 'eq':
      return s(left) === s(right);
    case 'ne':
      return s(left) !== s(right);
    case 'empty':
      return isFieldEmpty(left);
    case 'notEmpty':
      return !isFieldEmpty(left);
    case 'contains':
      return s(left).toLowerCase().includes(s(right).toLowerCase());
    default:
      return true;
  }
}

/** The text-generation core, shared by the `generate` action AND the server-side auto-run hook.
 *  Takes `app` (not a Koa ctx) so it can run outside a request; throws Error on failure. */
async function runGenerateCore(
  app: any,
  params: { llmService?: string; model?: string; system?: string; prompt: string; values?: Record<string, any>; output?: any },
): Promise<{ value: any; raw: string; service: string; model: string; structured: boolean; cached?: boolean }> {
  const { llmService, model, system, prompt, values = {}, output } = params;
  if (!prompt || !String(prompt).trim()) throw new Error('prompt is required');
  const aiPlugin = app.pm.get('ai');
  if (!aiPlugin || !aiPlugin.aiManager) throw new Error('AI plugin (@nocobase/plugin-ai) is not enabled');

  let svc = llmService;
  let mdl = model;
  if (!svc || !mdl) {
    const resolved = await aiPlugin.aiManager.resolveModel({ llmService: svc, model: mdl });
    svc = resolved.llmService;
    mdl = resolved.model;
  }
  const { provider } = await aiPlugin.aiManager.getLLMService({ llmService: svc, model: mdl });

  const rendered = renderTemplate(String(prompt), values);
  const type = output?.type || 'text';
  const optsList: string[] = Array.isArray(output?.options) ? output.options.filter(Boolean) : [];
  const baseSys = system ? String(system) : '';

  // Result-dedup cache (#2): identical (service, model, system, rendered prompt, output) → reuse the
  // prior answer instead of paying for another call. Marks `cached:true` so callers can tell.
  const cacheKey = JSON.stringify({ svc, mdl, baseSys, rendered, type, optsList });
  const cached = resultCacheGet(cacheKey);
  if (cached !== undefined) return { ...cached, cached: true };

  let value: any;
  let rawText = '';
  let structured = false;

  const schema = buildResultSchema(type, optsList);
  if (schema) {
    try {
      const result = await provider.invoke({
        messages: [...(baseSys.trim() ? [['system', baseSys.trim()]] : []), ['human', rendered]],
        structuredOutput: { schema, name: 'ai_column_result', description: 'The requested result.' },
      });
      const parsed = result && typeof result === 'object' && 'parsed' in result ? result.parsed : result;
      if (parsed && typeof parsed === 'object' && parsed.value != null) {
        value = type === 'number' ? Number(parsed.value) : String(parsed.value);
        rawText = String(parsed.value);
        structured = true;
      }
    } catch (e: any) {
      app.log?.warn?.('[ptdl-ai-column] structured output failed, falling back to plain text: ' + (e?.message || e));
    }
  }

  if (!structured) {
    let sys = baseSys;
    if (type === 'number') {
      sys += '\n\nRespond with ONLY a single number — no words, no units, no explanation.';
    } else if (type === 'singleSelect' && optsList.length) {
      sys += '\n\nRespond with EXACTLY ONE of the following options, copied verbatim, and nothing else:\n' + optsList.map((o) => `- ${o}`).join('\n');
    }
    const messages: any[] = [];
    if (sys.trim()) messages.push(['system', sys.trim()]);
    messages.push(['human', rendered]);
    const aiMsg = await provider.invoke({ messages });
    rawText = extractText(aiMsg);
    value = coerce(rawText, output);
  }

  const outResult = { value, raw: rawText, service: svc, model: mdl, structured };
  // Cache only successful, non-null results (don't memoize a transient failure/empty answer).
  if (value != null) resultCacheSet(cacheKey, outResult);
  return outResult;
}

/** Multi-field extraction core (image/PDF/audio → named fields), shared by the server-side auto-run
 *  hook. Uses the direct-REST + responseSchema path for ALL media (ctx-free, google-genai only) so
 *  it can run outside a request — unlike the interactive `extract` action's LangChain image path
 *  which needs a Koa ctx. Passes a minimal `{}` ctx to attachmentToMediaPart, which then resolves a
 *  local `/storage/...` url via its `http://127.0.0.1:13000` fallback. */
async function runExtractCore(
  app: any,
  params: { llmService?: string; model?: string; system?: string; prompt: string; values?: Record<string, any>; attachment: any; fields: ExtractFieldDef[] },
): Promise<Record<string, any>> {
  const creds = await getServiceCredentials(app.db, params.llmService);
  if (!creds || creds.provider !== 'google-genai' || !creds.apiKey) {
    throw new Error('Server-side extract cần một Google (google-genai) service có API key.');
  }
  const parts: Array<{ mimeType: string; base64: string }> = [];
  for (const it of normalizeAttachments(params.attachment)) {
    const m = await attachmentToMediaPart({}, it);
    if (m) parts.push(m);
  }
  if (!parts.length) throw new Error('Không đọc được file nguồn.');
  const rendered = renderTemplate(String(params.prompt || ''), params.values || {});
  const mdl = params.model && String(params.model).trim() ? String(params.model) : 'gemini-2.5-flash';
  const out = await googleStructuredFromMedia(creds.apiKey, mdl, rendered, params.system || '', parts, params.fields, creds.baseURL);
  for (const f of params.fields) {
    if ((f.type || 'string') === 'string' && typeof out?.[f.name] === 'string') {
      out[f.name] = stripMarkdown(out[f.name], !!f.markdown);
    }
  }
  return out;
}

/** Multi-row extraction core (ctx-free) — shared by the `extractRows` action's autorun counterpart.
 *  Turns ONE source (optional image/PDF/audio attachment + a {{token}} prompt over the parent row)
 *  into N child rows shaped by `fields`. Two paths, same as the interactive action:
 *   - a source attachment present → Google REST + responseSchema (ctx-free vision/file/audio);
 *   - text-only (no attachment, just the prompt) → @nocobase/plugin-ai's provider.invoke with a
 *     structuredOutput rows schema (any configured chat provider, e.g. a pasted quote in a textarea).
 *  Returns the (markdown-stripped) row array; the caller writes them as child records. */
async function runExtractRowsCore(
  app: any,
  params: { llmService?: string; model?: string; system?: string; prompt: string; values?: Record<string, any>; attachment?: any; fields: ExtractFieldDef[] },
): Promise<any[]> {
  const fieldDefs: ExtractFieldDef[] = Array.isArray(params.fields) ? params.fields.filter((f: any) => f?.name) : [];
  if (!fieldDefs.length) throw new Error('at least one child field is required');
  const rendered = renderTemplate(String(params.prompt || ''), params.values || {});
  const srcItems = normalizeAttachments(params.attachment);

  if (srcItems.length) {
    const creds = await getServiceCredentials(app.db, params.llmService);
    if (!creds || creds.provider !== 'google-genai' || !creds.apiKey) {
      throw new Error('Trích nhiều dòng từ tệp (phía server) cần một Google (google-genai) service có API key.');
    }
    const parts: Array<{ mimeType: string; base64: string }> = [];
    for (const it of srcItems) {
      const m = await attachmentToMediaPart({}, it);
      if (m) parts.push(m);
    }
    if (!parts.length) throw new Error('Không đọc được file nguồn.');
    const mdl = params.model && String(params.model).trim() ? String(params.model) : 'gemini-2.5-flash';
    const out = await googleStructuredRowsFromMedia(creds.apiKey, mdl, rendered, params.system || '', parts, fieldDefs, creds.baseURL);
    return postProcessRows(out?.rows, fieldDefs);
  }

  // Text-only: reuse plugin-ai's chat provider with a structuredOutput rows schema.
  const aiPlugin = app.pm.get('ai');
  if (!aiPlugin || !aiPlugin.aiManager) throw new Error('AI plugin (@nocobase/plugin-ai) is not enabled');
  let svc = params.llmService;
  let mdl = params.model;
  if (!svc || !mdl) {
    const resolved = await aiPlugin.aiManager.resolveModel({ llmService: svc, model: mdl });
    svc = resolved.llmService;
    mdl = resolved.model;
  }
  const { provider } = await aiPlugin.aiManager.getLLMService({ llmService: svc, model: mdl });
  const baseSys = params.system ? String(params.system) : '';
  const messages: any[] = [];
  if (baseSys.trim()) messages.push(['system', baseSys.trim()]);
  messages.push(['human', rendered]);
  const result = await provider.invoke({
    messages,
    structuredOutput: { schema: buildRowsSchema(fieldDefs), name: 'ai_extract_rows', description: 'The extracted rows / line items.' },
  });
  const parsed = result && typeof result === 'object' && 'parsed' in result ? result.parsed : result;
  return postProcessRows(parsed?.rows, fieldDefs);
}

/** Image-generation core (ctx-free) — shared by the `generateImage` action and the server auto-run
 *  hook. Renders the prompt against the row, calls Google's image model, and persists the bytes as a
 *  NocoBase attachment record (google-genai only, like all media here). Returns the attachment. */
async function runImageCore(
  app: any,
  params: { llmService?: string; model?: string; prompt: string; values?: Record<string, any>; imageSource?: string },
): Promise<any> {
  const creds = await getServiceCredentials(app.db, params.llmService);
  if (!creds || creds.provider !== 'google-genai' || !creds.apiKey) {
    throw new Error('Sinh ảnh cần một Google (google-genai) service có API key.');
  }
  const rendered = renderTemplate(String(params.prompt || ''), params.values || {});
  if (!rendered.trim()) throw new Error('Prompt rỗng — không có gì để sinh ảnh.');
  const mdl = params.model && String(params.model).trim() ? String(params.model) : 'gemini-2.5-flash-image';
  // img2img (#5): if a source-image field is configured, feed the row's current image(s) as input.
  const images: Array<{ mimeType: string; base64: string }> = [];
  if (params.imageSource) {
    for (const it of normalizeAttachments((params.values || {})[params.imageSource])) {
      const m = await attachmentToMediaPart({}, it);
      if (m) images.push(m);
    }
  }
  const img = await googleGenerateImage(creds.apiKey, mdl, rendered, creds.baseURL, images);
  if (!img) throw new Error('Model không trả về ảnh.');
  return await saveBufferAsAttachment(app, img.buffer, img.mimetype, 'ai-image');
}

/** Voice-generation (TTS) core (ctx-free) — shared by the `generateVoice` action and the server
 *  auto-run hook. Multi-provider: Google (Gemini TTS via llmServices) | ElevenLabs | Vbee (both via
 *  the ptdlVoiceProvider credential store). `voiceId` carries the ElevenLabs voice id OR the Vbee
 *  voice_code; `credName` picks a stored credential (falls back to first enabled of that provider). */
async function runVoiceCore(
  app: any,
  params: {
    provider?: string; // 'google' (default) | 'elevenlabs' | 'vbee'
    prompt: string;
    values?: Record<string, any>;
    // google:
    llmService?: string;
    model?: string;
    voice?: string;
    style?: string;
    // elevenlabs / vbee:
    credName?: string;
    voiceId?: string; // 11labs voice id | vbee voice_code
    elevenModel?: string;
    speed?: string | number; // vbee
  },
): Promise<any> {
  const rendered = renderTemplate(String(params.prompt || ''), params.values || {});
  if (!rendered.trim()) throw new Error('Text rỗng — không có gì để đọc.');
  const provider = params.provider || 'google';

  let audio: { buffer: Buffer; mimetype: string } | null = null;
  if (provider === 'elevenlabs') {
    const c = await getVoiceProviderCreds(app.db, params.credName, 'elevenlabs');
    if (!c?.apiKey) throw new Error('Chưa cấu hình ElevenLabs — thêm 1 mục ở "AI Voice Provider" (apiKey).');
    audio = await elevenLabsGenerateVoice(c.apiKey, params.voiceId || c.voiceDefault || '', params.elevenModel || '', rendered, { baseURL: c.baseURL });
  } else if (provider === 'vbee') {
    const c = await getVoiceProviderCreds(app.db, params.credName, 'vbee');
    if (!c?.appId || !c?.token) throw new Error('Chưa cấu hình Vbee — thêm 1 mục ở "AI Voice Provider" (appId + token).');
    audio = await vbeeGenerateVoice(c.appId, c.token, params.voiceId || c.voiceDefault || '', rendered, params.speed, c.baseURL);
  } else {
    const creds = await getServiceCredentials(app.db, params.llmService);
    if (!creds || creds.provider !== 'google-genai' || !creds.apiKey) {
      throw new Error('Sinh giọng nói (Google) cần một google-genai service có API key.');
    }
    const mdl = params.model && String(params.model).trim() ? String(params.model) : 'gemini-2.5-flash-preview-tts';
    audio = await googleGenerateVoice(creds.apiKey, mdl, rendered, params.voice || 'Kore', creds.baseURL, params.style);
  }
  if (!audio) throw new Error('Model không trả về audio.');
  return await saveBufferAsAttachment(app, audio.buffer, audio.mimetype, 'ai-voice');
}

/* ============================ Block B: AI Classify (vector match) ============================
 * Match a free-text query to ONE row of a MASTER collection (product code, HS code, account code…):
 *   embed master rows once → cache vectors → embed the query → brute-force cosine top-K → LLM re-rank
 *   the shortlist → return best tk + confidence + ranked candidates.
 * SQLite (nb-local) has no pgvector, so similarity is computed in Node — fine to tens of thousands of
 * rows (1536-dim dot-products are microseconds each). Embeddings via Google's REST embed API (the
 * chat provider.invoke path is text-only); reuses the same google-genai apiKey as the media paths. */

/** Cosine similarity of two equal-length numeric vectors (0 when either is empty/zero). */
function cosineSim(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Tokenize for the keyword fallback: lowercase, unicode-aware split, drop 1-char noise. */
function tokenize(s: string): string[] {
  return String(s || '')
    .toLowerCase()
    .normalize('NFC')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1);
}

/** Fraction of query tokens present in the candidate text — cheap lexical relevance for the no-index
 *  fallback (0..1). Not semantic, but enough to shortlist candidates the LLM then re-ranks. */
function lexScore(qTokens: string[], tTokens: string[]): number {
  if (!qTokens.length || !tTokens.length) return 0;
  const tset = new Set(tTokens);
  let hit = 0;
  for (const q of qTokens) if (tset.has(q)) hit++;
  return hit / qTokens.length;
}

/** Stable short hash of the embed-text so re-embedding only happens when a master row's text changed. */
/** Dimensionality of the cached vectors (from the first cache row), so a query embed can be requested
 *  at the SAME `outputDimensionality` — otherwise a 768-dim cache vs a 3072-dim query vector can't be
 *  cosine-compared. Returns undefined for an empty cache (→ query uses the model default). */
function embedDimsOf(cached: any[]): number | undefined {
  const r0: any = cached && cached[0];
  if (!r0) return undefined;
  const v = r0.toJSON ? r0.toJSON().vector : r0.vector;
  return Array.isArray(v) && v.length ? v.length : undefined;
}

function textHash(s: string): string {
  let h = 5381;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

/** Normalize an embedding model id to Google's `models/…` form. Default `gemini-embedding-001` (the
 *  current GA Gemini embedding model; text-embedding-00x isn't available on all keys/API versions). */
function normEmbedModel(m?: string): string {
  const id = m && String(m).trim() ? String(m).trim() : 'gemini-embedding-001';
  return id.startsWith('models/') ? id : `models/${id}`;
}

/** Batch-embed texts via Google's Generative Language REST API (`batchEmbedContents`), chunked to
 *  stay under the per-request cap. Returns one vector per input text, order preserved. */
async function googleEmbed(apiKey: string, model: string, texts: string[], baseURL?: string, dims?: number): Promise<number[][]> {
  const base = baseURL && baseURL.trim() ? baseURL.replace(/\/+$/, '') : 'https://generativelanguage.googleapis.com/v1beta';
  const mdl = normEmbedModel(model);
  const url = `${base}/${mdl}:batchEmbedContents?key=${encodeURIComponent(apiKey)}`;
  // Optionally truncate the embedding to a lower dimensionality (gemini-embedding-001 supports
  // `outputDimensionality`). At 12k+ master rows the default 3072 dims blow up cache size (~39KB/row)
  // and per-query cosine cost; 768 keeps ~99% of ranking quality at 1/4 the storage. Query-time embeds
  // pass the SAME dims as the cached vectors (derived from cache) so cosine dimensions always match.
  const outDim = dims && dims > 0 ? Math.floor(dims) : undefined;
  const out: number[][] = [];
  const CHUNK = 100; // Google batch cap
  for (let i = 0; i < texts.length; i += CHUNK) {
    const slice = texts.slice(i, i + CHUNK);
    const body = { requests: slice.map((t) => ({ model: mdl, content: { parts: [{ text: String(t || '').slice(0, 8000) }] }, ...(outDim ? { outputDimensionality: outDim } : {}) })) };
    // The embed endpoint intermittently drops the connection / 429s / 5xx under rapid calls (seen
    // live) — retry a few times with backoff so a transient blip isn't a hard classify failure. A 4xx
    // other than 429 (e.g. 404 unknown model) is a real config error → fail fast, no retry.
    let j: any = null;
    let lastErr = '';
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (res.ok) {
          j = await res.json();
          break;
        }
        const t = await res.text().catch(() => '');
        lastErr = `Google embed API ${res.status}: ${t.slice(0, 300)}`;
        if (res.status >= 400 && res.status < 500 && res.status !== 429) throw new Error(lastErr); // config error
      } catch (e: any) {
        lastErr = e?.message || String(e);
        if (/embed API 4\d\d/.test(lastErr) && !/429/.test(lastErr)) throw e; // don't retry config errors
      }
      await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
    }
    if (!j) throw new Error(lastErr || 'Google embed API failed after retries');
    const embs = j?.embeddings || [];
    for (let k = 0; k < slice.length; k++) out.push(embs[k]?.values || []);
  }
  return out;
}

/** JSON schema for the LLM re-rank step: an ordered list of the shortlisted candidates with a 0–100
 *  match score + short Vietnamese reasoning. `tk` echoes the candidate's primary key we passed in. */
function buildRankSchema(): any {
  return {
    type: 'object',
    properties: {
      ranked: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            tk: { type: 'string', description: 'The primary key (mã) of the candidate, copied exactly.' },
            score: { type: 'number', description: 'Match score 0–100 (100 = chắc chắn đúng).' },
            reasoning: { type: 'string', description: 'Lý do ngắn gọn bằng tiếng Việt.' },
          },
          required: ['tk', 'score'],
        },
      },
    },
    required: ['ranked'],
  };
}

/** Deep-classify attribute-extraction schema: one nullable property per configured attribute + a
 *  `missing_info` list (what's still needed to classify confidently — the honest "no golden answer"
 *  signal). Generic: the caller defines which attributes matter for its domain. */
function buildDeepExtractSchema(attributes: Array<{ name: string; description?: string }>): any {
  const properties: Record<string, any> = {};
  for (const a of attributes) {
    if (!a?.name) continue;
    properties[a.name] = { type: 'string', description: (a.description || a.name) + ' — null nếu không nêu rõ, KHÔNG đoán.' };
  }
  properties.missing_info = { type: 'array', items: { type: 'string' }, description: 'Thông tin còn thiếu để phân loại chắc chắn.' };
  return { type: 'object', properties, required: [] };
}

/** Deep-classify scoring schema: per-candidate rich judgment (score + reasoning + matched/unmatched
 *  criteria + confidence + what to verify + warnings) + an overall recommendation. Domain-agnostic. */
function buildDeepScoreSchema(): any {
  return {
    type: 'object',
    properties: {
      candidates: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            tk: { type: 'string', description: 'Mã (primary key) ứng viên, copy đúng.' },
            score: { type: 'number', description: 'Điểm khớp 0–100.' },
            reasoning: { type: 'string', description: 'Giải thích khớp/lệch (cùng ngôn ngữ với input).' },
            matched_criteria: { type: 'array', items: { type: 'string' } },
            unmatched_criteria: { type: 'array', items: { type: 'string' } },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            requires_verification: { type: 'array', items: { type: 'string' }, description: 'Người dùng cần tự kiểm tra gì để chốt.' },
            warnings: { type: 'string', description: 'Cảnh báo chính sách/rủi ro nếu có (rút từ dữ liệu ứng viên).' },
          },
          required: ['tk', 'score'],
        },
      },
      overall_recommendation: { type: 'string' },
    },
    required: ['candidates'],
  };
}

export class PluginAiColumnServer extends Plugin {
  /** collectionName → active auto-run rules (in-memory cache; avoids a DB query on every save). */
  autorunCache = new Map<string, any[]>();
  /** collections we've already attached save-hooks to (attach once). */
  autorunListeners = new Set<string>();
  /** Throttle (#3): all auto-run work funnels through here so a 1000-record burst can't fire 1000
   *  simultaneous LLM calls. Concurrency 3, coalesced per record. */
  autorunQueue = new AutorunQueue(3, (key, e) =>
    this.app.log?.warn?.(`[ptdl-ai-column] autorun job (${key}) crashed: ` + (e?.message || e)),
  );
  /** Scheduled embedding refresh (Block B): a single ticker that re-embeds each master whose
   *  `refreshEveryMin` has elapsed since `lastRefreshAt`. Persisted timing → survives restarts. */
  classifyRefreshTimer: any = null;
  classifyRefreshing = new Set<string>();

  /** Start the periodic embedding-refresh ticker (idempotent). Runs incremental re-embeds (only
   *  new/changed master rows) for configs with a schedule, spacing each master by its own interval. */
  startClassifyScheduler() {
    if (this.classifyRefreshTimer) return;
    const tick = async () => {
      let cfgs: any[] = [];
      try {
        cfgs = await this.db.getRepository('ptdlClassifyConfig').find({ filter: { refreshEveryMin: { $gt: 0 } } });
      } catch {
        return;
      }
      const now = Date.now();
      for (const c of cfgs || []) {
        const r = c.toJSON ? c.toJSON() : c;
        const key = `${r.dataSourceKey || 'main'}:${r.masterCollection}`;
        if (this.classifyRefreshing.has(key)) continue;
        const every = Number(r.refreshEveryMin) * 60 * 1000;
        const last = r.lastRefreshAt ? new Date(r.lastRefreshAt).getTime() : 0;
        if (now - last < every) continue;
        this.classifyRefreshing.add(key);
        // Fire-and-forget (self-caught) so one slow/failing master can't block the others or the tick.
        (async () => {
          try {
            const out = await this.runEmbedMaster({ masterCollection: r.masterCollection, dataSourceKey: r.dataSourceKey, textTemplate: r.textTemplate, llmService: r.llmService || undefined, embedModel: r.model, embedDims: r.dims || undefined, force: false });
            await this.db.getRepository('ptdlClassifyConfig').update({ filterByTk: r.id, values: { lastRefreshAt: new Date() } });
            this.app.log?.info?.(`[ptdl-ai-column] scheduled re-embed ${r.masterCollection}: ${out.embedded}/${out.total}`);
          } catch (e: any) {
            this.app.log?.warn?.(`[ptdl-ai-column] scheduled re-embed ${r.masterCollection} failed: ` + (e?.message || e));
          } finally {
            this.classifyRefreshing.delete(key);
          }
        })();
      }
    };
    // Every 60s — cheap (one filtered query); actual embedding only runs when a master is due.
    this.classifyRefreshTimer = setInterval(() => {
      tick().catch(() => {});
    }, 60 * 1000);
    if (typeof this.classifyRefreshTimer?.unref === 'function') this.classifyRefreshTimer.unref();
  }

  /** Record an auto-run FAILURE into `ptdlAiAutorunLog` so it isn't silent (#1). Best-effort +
   *  self-pruning (14-day TTL) so it can't grow unbounded. Users see failures by putting a normal
   *  block on the `ptdlAiAutorunLog` collection. */
  async logAutorunError(entry: {
    collectionName: string;
    dataSourceKey?: string;
    recordId?: any;
    targetField?: string;
    kind?: string;
    message: string;
  }) {
    try {
      const repo = this.db.getRepository('ptdlAiAutorunLog');
      if (!repo) return;
      await repo.create({
        values: {
          collectionName: entry.collectionName,
          dataSourceKey: entry.dataSourceKey || 'main',
          recordId: entry.recordId == null ? '' : String(entry.recordId),
          targetField: entry.targetField || '',
          kind: entry.kind || '',
          status: 'error',
          message: String(entry.message || '').slice(0, 1000),
        },
      });
      const cutoff = new Date(Date.now() - 14 * 24 * 3600 * 1000);
      await repo.destroy({ filter: { createdAt: { $lt: cutoff } } }).catch(() => {});
    } catch (e: any) {
      this.app.log?.warn?.('[ptdl-ai-column] logAutorunError failed: ' + (e?.message || e));
    }
  }

  /** Load enabled auto-run rules into the cache and make sure each rule's collection has a hook. */
  async loadAutorunRules() {
    try {
      const repo = this.db.getRepository('ptdlAiAutorun');
      const rows = await repo.find({ filter: { enabled: true } });
      this.autorunCache.clear();
      for (const r of rows) {
        const row = r.toJSON ? r.toJSON() : r;
        const cn = row.collectionName;
        if (!cn) continue;
        if (!this.autorunCache.has(cn)) this.autorunCache.set(cn, []);
        this.autorunCache.get(cn)!.push(row);
        this.ensureAutorunListener(cn);
      }
    } catch (e: any) {
      this.app.log?.warn?.('[ptdl-ai-column] loadAutorunRules failed: ' + (e?.message || e));
    }
  }

  /** Attach afterCreate/afterUpdate save-hooks for one collection (idempotent). Everything is wrapped
   *  so it can NEVER produce an unhandled rejection (Node 24 crashes the process on those) — the
   *  afterCommit callback is synchronous and the async work is fully detached + self-caught. */
  ensureAutorunListener(collectionName: string) {
    if (this.autorunListeners.has(collectionName)) return;
    this.autorunListeners.add(collectionName);
    const handler = (isCreate: boolean) => async (model: any, options: any) => {
      try {
        const rules = this.autorunCache.get(collectionName);
        if (!rules || !rules.length) return;
        // Snapshot everything now — the model may be detached/reset by the time we run post-commit.
        const changed: string[] = typeof model.changed === 'function' ? model.changed() || [] : [];
        const pk = model.constructor?.primaryKeyAttribute || 'id';
        const filterByTk = model.get(pk);
        const values = model.toJSON ? model.toJSON() : {};
        // Push onto the throttle queue (#3) instead of firing immediately — coalesced per record so
        // rapid re-saves don't stack, and drained at a fixed concurrency so a burst can't overload.
        const enqueue = () => {
          this.autorunQueue.enqueue(`${collectionName}:${filterByTk}`, () =>
            this.runAutorunRules(collectionName, filterByTk, values, rules, isCreate, changed),
          );
        };
        const tx = options?.transaction;
        // Run AFTER commit (never inside the txn — a nested write would deadlock sqlite). The
        // afterCommit callback returns undefined (sync) so it can't reject the commit; the queue
        // owns the async work + error handling from here.
        if (tx && typeof tx.afterCommit === 'function') tx.afterCommit(() => enqueue());
        else enqueue();
      } catch (e: any) {
        this.app.log?.warn?.('[ptdl-ai-column] autorun hook error: ' + (e?.message || e));
      }
    };
    this.db.on(`${collectionName}.afterCreateWithAssociations`, handler(true));
    this.db.on(`${collectionName}.afterUpdateWithAssociations`, handler(false));
  }

  /** Run each matching rule for a saved record and write the result back with `hooks:false`
   *  (so our own update doesn't re-trigger the hook → no infinite loop). */
  async runAutorunRules(collectionName: string, filterByTk: any, values: Record<string, any>, rules: any[], isCreate: boolean, changed: string[]) {
    if (filterByTk == null) return;
    for (const rule of rules) {
      try {
        const kind = rule.kind || 'generate';
        if (kind !== 'generate' && kind !== 'extract' && kind !== 'extractRows' && kind !== 'image' && kind !== 'voice') continue;
        const runOn = rule.runOn || 'both';
        if (isCreate && runOn === 'update') continue;
        if (!isCreate && runOn === 'create') continue;
        // On update, skip unless a dependency field actually changed (deps empty → always run).
        const deps: string[] = Array.isArray(rule.dependsOn) ? rule.dependsOn : [];
        if (!isCreate && deps.length && changed.length && !deps.some((d) => changed.includes(d))) continue;

        const cfg = rule.config || {};

        // Cost gate (#2): user-configured condition (e.g. only score a lead when status='new').
        if (!matchesCondition(cfg.condition, values)) continue;

        if (kind === 'extract') {
          // Read image/PDF/audio from the source attachment field → fill the mapped target fields.
          const sourceField = cfg.sourceField;
          const fields: ExtractFieldDef[] = Array.isArray(cfg.fields) ? cfg.fields.filter((f: any) => f?.name) : [];
          if (!sourceField || !fields.length) continue;
          const attachment = values[sourceField];
          const hasFile = Array.isArray(attachment) ? attachment.length > 0 : attachment != null && attachment !== '';
          if (!hasFile) continue;
          // onlyWhenEmpty (#2): all mapped targets already filled → nothing to do, skip the call.
          if (cfg.onlyWhenEmpty && fields.every((f) => !isFieldEmpty(values[f.name]))) continue;
          const outValues = await runExtractCore(this.app, {
            llmService: cfg.llmService,
            model: cfg.model,
            system: cfg.system,
            prompt: cfg.prompt,
            values,
            attachment,
            fields,
          });
          const patch: Record<string, any> = {};
          for (const [k, v] of Object.entries(outValues || {})) {
            if (v != null && values[k] !== v) patch[k] = v;
          }
          if (Object.keys(patch).length) {
            await this.db.getRepository(collectionName).update({ filterByTk, values: patch, hooks: false });
          }
          continue;
        }

        if (kind === 'extractRows') {
          await this.runExtractRowsInto(collectionName, filterByTk, values, cfg);
          continue;
        }

        if (kind === 'image' || kind === 'voice') {
          // Generate media (image / TTS voice) and write the attachment into the target field.
          // dependsOn = the prompt's {{field}} tokens, NOT the target field itself, so this write
          // never re-triggers via the dep check (and hooks:false blocks the afterUpdate re-emit).
          if (!String(cfg.prompt || '').trim()) continue;
          // onlyWhenEmpty (#2): media field already has a file → don't regenerate.
          if (cfg.onlyWhenEmpty && !isFieldEmpty(values[rule.targetField])) continue;
          const attachment =
            kind === 'image'
              ? await runImageCore(this.app, { llmService: cfg.llmService, model: cfg.model, prompt: cfg.prompt, values, imageSource: cfg.imageSource })
              : await runVoiceCore(this.app, {
                  provider: cfg.provider,
                  prompt: cfg.prompt,
                  values,
                  llmService: cfg.llmService,
                  model: cfg.model,
                  voice: cfg.voice,
                  style: cfg.style,
                  credName: cfg.credName,
                  voiceId: cfg.voiceId,
                  elevenModel: cfg.elevenModel,
                  speed: cfg.speed,
                });
          if (!attachment) continue;
          // attachmentURL interface stores a bare url string; attachment interface stores record(s).
          const next = cfg.urlMode ? attachment.url : [attachment];
          await this.db.getRepository(collectionName).update({ filterByTk, values: { [rule.targetField]: next }, hooks: false });
          continue;
        }

        // kind === 'generate'
        // onlyWhenEmpty (#2): target already has a value → skip regeneration.
        if (cfg.onlyWhenEmpty && !isFieldEmpty(values[rule.targetField])) continue;
        const out = await runGenerateCore(this.app, { ...cfg, values });
        if (out.value == null) continue;
        if (values[rule.targetField] === out.value) continue; // no change → skip pointless write
        await this.db.getRepository(collectionName).update({
          filterByTk,
          values: { [rule.targetField]: out.value },
          hooks: false,
        });
      } catch (e: any) {
        // #1: don't fail silently — log to server console AND to the queryable ptdlAiAutorunLog.
        this.app.log?.warn?.(`[ptdl-ai-column] autorun (${collectionName}.${rule?.targetField}) failed: ` + (e?.message || e));
        await this.logAutorunError({
          collectionName,
          dataSourceKey: rule?.dataSourceKey,
          recordId: filterByTk,
          targetField: rule?.targetField,
          kind: rule?.kind || 'generate',
          message: e?.message || String(e),
        });
      }
    }
  }

  /** Block B — embed a master collection's rows into the vector cache (idempotent: only rows whose
   *  embed-text changed are re-embedded, unless `force`). Returns how many were (re)embedded. */
  async runEmbedMaster(params: {
    masterCollection: string;
    dataSourceKey?: string;
    textTemplate: string;
    llmService?: string;
    embedModel?: string;
    force?: boolean;
    limit?: number;
    embedDims?: number;
  }): Promise<{ total: number; embedded: number; model: string; capped?: number; dims?: number }> {
    const db = this.db;
    const dsk = params.dataSourceKey || 'main';
    const repo = db.getRepository(params.masterCollection);
    if (!repo) throw new Error(`Collection "${params.masterCollection}" không tồn tại.`);
    // Concurrency guard: a client timeout does NOT abort this action (Koa keeps running), so a resume
    // call fired while the first run is still embedding would read the same `existing` snapshot and
    // `create` duplicate cache rows for the same records. An in-memory per-collection lock makes the
    // overlapping call fail fast instead — the first run embeds everything (up to cap) uninterrupted.
    const lockKey = `${dsk}:${params.masterCollection}`;
    const locks: Set<string> = ((this as any)._embedLocks ||= new Set<string>());
    if (locks.has(lockKey)) throw new Error(`Đang tạo embedding cho "${params.masterCollection}" — đợi lần chạy hiện tại xong rồi thử lại.`);
    locks.add(lockKey);
    try {
    const creds = await getServiceCredentials(db, params.llmService);
    if (!creds || creds.provider !== 'google-genai' || !creds.apiKey) {
      throw new Error('Tạo embedding cần một Google (google-genai) service có API key.');
    }
    const model = normEmbedModel(params.embedModel);
    const coll: any = db.getCollection(params.masterCollection);
    const pk = coll?.model?.primaryKeyAttribute || 'id';
    const cap = Math.min(Number(params.limit) || 20000, 50000);
    const embedDims = Number(params.embedDims) > 0 ? Math.floor(Number(params.embedDims)) : undefined;
    const rows = await repo.find({ limit: cap });
    const totalCount = await repo.count().catch(() => rows.length);
    const capped = totalCount > rows.length ? totalCount - rows.length : 0;

    const cacheRepo = db.getRepository('ptdlClassifyEmbed');
    if (params.force) {
      await cacheRepo.destroy({ filter: { collectionName: params.masterCollection, dataSourceKey: dsk } }).catch(() => {});
    }
    const existing = params.force ? [] : await cacheRepo.find({ filter: { collectionName: params.masterCollection, dataSourceKey: dsk } });
    const exByRec: Record<string, any> = {};
    for (const e of existing) {
      const row = e.toJSON ? e.toJSON() : e;
      exByRec[String(row.recordId)] = row;
    }

    const toEmbed: Array<{ recordId: string; text: string; hash: string; exId?: any }> = [];
    for (const r of rows) {
      const rec = r.toJSON ? r.toJSON() : r;
      const tk = String(rec[pk]);
      const text = renderTemplate(params.textTemplate, rec).trim();
      if (!text) continue;
      const hash = textHash(text + '|' + model);
      const ex = exByRec[tk];
      if (!ex || ex.textHash !== hash) toEmbed.push({ recordId: tk, text, hash, exId: ex?.id });
    }

    // Embed + PERSIST in chunks of 100 (one Google batch call each) rather than embedding all N then
    // writing once at the end. At 12k rows the all-at-end path (a) holds one multi-minute HTTP request
    // open — the client resets (ECONNRESET) and every vector is lost — and (b) can't resume. Persisting
    // each chunk before the next means a dropped connection keeps completed chunks, and because the
    // pre-pass skips rows whose textHash already matches, simply re-running resumes where it stopped.
    const PERSIST_CHUNK = 100;
    for (let base = 0; base < toEmbed.length; base += PERSIST_CHUNK) {
      const group = toEmbed.slice(base, base + PERSIST_CHUNK);
      const vecs = await googleEmbed(creds.apiKey, model, group.map((x) => x.text), creds.baseURL, embedDims);
      for (let i = 0; i < group.length; i++) {
        const item = group[i];
        const values = {
          collectionName: params.masterCollection,
          dataSourceKey: dsk,
          recordId: item.recordId,
          textHash: item.hash,
          vector: vecs[i] || [],
          text: item.text,
          model,
        };
        if (item.exId != null) await cacheRepo.update({ filterByTk: item.exId, values });
        else await cacheRepo.create({ values });
      }
    }
    // Persist the config so the settings tab can list + re-embed this master centrally.
    try {
      const cfgRepo = db.getRepository('ptdlClassifyConfig');
      const key = `${dsk}:${params.masterCollection}`;
      const values = { key, masterCollection: params.masterCollection, dataSourceKey: dsk, textTemplate: params.textTemplate, model, llmService: params.llmService || '', dims: embedDims || null };
      const ex = await cfgRepo.findOne({ filter: { key } });
      if (ex) await cfgRepo.update({ filterByTk: ex.get('id'), values });
      else await cfgRepo.create({ values });
    } catch (e: any) {
      this.app.log?.warn?.('[ptdl-ai-column] classify config upsert failed: ' + (e?.message || e));
    }
    return { total: rows.length, embedded: toEmbed.length, model, ...(capped ? { capped } : {}), ...(embedDims ? { dims: embedDims } : {}) };
    } finally {
      locks.delete(lockKey);
    }
  }

  /** Block B — classify: embed the query, brute-force cosine over the cached master vectors for the
   *  top-K shortlist, then LLM re-rank that shortlist for an accurate best match + confidence.
   *  Returns ranked candidates (with the master label), the best one, and the raw vector shortlist. */
  async runClassify(params: {
    query: string;
    masterCollection: string;
    dataSourceKey?: string;
    llmService?: string;
    model?: string;
    embedModel?: string;
    topK?: number;
    labelTemplate?: string;
    extraPrompt?: string;
  }): Promise<any> {
    const db = this.db;
    const dsk = params.dataSourceKey || 'main';
    if (!params.query || !String(params.query).trim()) throw new Error('query is required');
    const embModel = normEmbedModel(params.embedModel);
    const topK = Math.min(Number(params.topK) || 8, 30);
    const cacheRepo = db.getRepository('ptdlClassifyEmbed');
    const cached = await cacheRepo.find({ filter: { collectionName: params.masterCollection, dataSourceKey: dsk } });

    let scored: Array<{ tk: string; sim: number }> = [];
    let method = 'vector';
    if (cached.length) {
      // Vector path: embed the query (needs a google-genai key) and cosine-rank the cached vectors.
      const creds = await getServiceCredentials(db, params.llmService);
      if (creds && creds.provider === 'google-genai' && creds.apiKey) {
        try {
          const [qv] = await googleEmbed(creds.apiKey, embModel, [String(params.query)], creds.baseURL, embedDimsOf(cached));
          if (qv?.length) {
            scored = cached
              .map((c: any) => {
                const row = c.toJSON ? c.toJSON() : c;
                return { tk: String(row.recordId), sim: cosineSim(qv, row.vector || []) };
              })
              .sort((a, b) => b.sim - a.sim)
              .slice(0, topK);
          }
        } catch (e: any) {
          this.app.log?.warn?.('[ptdl-ai-column] classify query-embed failed → keyword fallback: ' + (e?.message || e));
        }
      }
    }
    if (!scored.length) {
      // Fallback (no embedding index yet, or embedding unavailable/failed): lexical shortlist over the
      // master's text so classify still returns something — the LLM re-rank then does the real match.
      method = 'keyword';
      const cfg = await db.getRepository('ptdlClassifyConfig').findOne({ filter: { key: `${dsk}:${params.masterCollection}` } });
      const tpl = (cfg && (cfg.get ? cfg.get('textTemplate') : (cfg as any).textTemplate)) || params.labelTemplate;
      const collK: any = db.getCollection(params.masterCollection);
      const pkK = collK?.model?.primaryKeyAttribute || 'id';
      const mrows = await db.getRepository(params.masterCollection).find({ limit: 2000 });
      const qTokens = tokenize(String(params.query));
      const all = (mrows || []).map((r: any) => {
        const rec = r.toJSON ? r.toJSON() : r;
        const text = tpl ? renderTemplate(tpl, rec) : Object.values(rec).filter((v) => typeof v === 'string').join(' ');
        return { tk: String(rec[pkK]), sim: lexScore(qTokens, tokenize(text)) };
      });
      const hits = all.filter((x) => x.sim > 0).sort((a, b) => b.sim - a.sim);
      scored = (hits.length ? hits : all).slice(0, topK);
      if (!scored.length) throw new Error(`Master "${params.masterCollection}" không có dữ liệu để đối chiếu.`);
    }

    // Fetch the shortlisted master records for richer re-rank context + labels.
    const coll: any = db.getCollection(params.masterCollection);
    const pk = coll?.model?.primaryKeyAttribute || 'id';
    const ids = scored.map((s) => s.tk);
    const recs = await db.getRepository(params.masterCollection).find({ filter: { [pk]: { $in: ids } } });
    const recByTk: Record<string, any> = {};
    for (const r of recs) {
      const rec = r.toJSON ? r.toJSON() : r;
      recByTk[String(rec[pk])] = rec;
    }
    const labelOf = (tk: string) => {
      const rec = recByTk[tk] || {};
      return params.labelTemplate ? renderTemplate(params.labelTemplate, rec) : JSON.stringify(rec);
    };
    // `write` is the value the client writes into the target field when this candidate is picked
    // (e.g. just the code `{{ma}}`), distinct from the human-readable `label`. Defaults to the label.
    const writeOf = (tk: string) => {
      const rec = recByTk[tk] || {};
      return (params as any).writeTemplate ? renderTemplate((params as any).writeTemplate, rec) : labelOf(tk);
    };

    // Fast path (`rerank:false`): skip the LLM re-rank entirely and trust the vector shortlist —
    // score = vector similarity %. Used by per-row FK resolution where the embedding rank is already
    // accurate; avoids one LLM call PER row/relation (the real latency bottleneck).
    if ((params as any).rerank === false) {
      const outv = scored.map((s) => ({ tk: s.tk, score: Math.round(s.sim * 100), reasoning: '(vector)', label: labelOf(s.tk), write: writeOf(s.tk), record: recByTk[s.tk] }));
      const bestv = outv[0] || null;
      return { candidates: outv, best: bestv, confidence: bestv ? bestv.score : 0, method: cached.length ? 'vector' : 'keyword', vectorTop: scored.map((s) => ({ tk: s.tk, sim: Number(s.sim.toFixed(4)) })), embedModel: embModel };
    }

    // LLM re-rank the shortlist.
    const aiPlugin = this.app.pm.get('ai');
    if (!aiPlugin || !aiPlugin.aiManager) throw new Error('AI plugin (@nocobase/plugin-ai) is not enabled');
    let svc = params.llmService;
    let mdl = params.model;
    if (!svc || !mdl) {
      const resolved = await aiPlugin.aiManager.resolveModel({ llmService: svc, model: mdl });
      svc = resolved.llmService;
      mdl = resolved.model;
    }
    const { provider } = await aiPlugin.aiManager.getLLMService({ llmService: svc, model: mdl });

    const candLines = scored
      .map((s) => `- tk=${s.tk} | ${labelOf(s.tk)} (tương đồng vector: ${(s.sim * 100).toFixed(0)}%)`)
      .join('\n');
    const sys =
      'Bạn là chuyên gia đối chiếu/phân loại dữ liệu. Cho một TRUY VẤN và danh sách ỨNG VIÊN (mỗi ứng viên có mã tk), hãy chấm điểm 0–100 mức khớp của từng ứng viên với truy vấn và giải thích ngắn gọn bằng tiếng Việt. CHỈ dùng các tk đã cho, không bịa. Sắp xếp giảm dần theo điểm.';
    const human =
      `TRUY VẤN: ${params.query}\n` +
      (params.extraPrompt ? `Yêu cầu thêm: ${params.extraPrompt}\n` : '') +
      `\nỨNG VIÊN:\n${candLines}\n\nTrả về danh sách ranked.`;

    let ranked: any[] = [];
    try {
      const result = await provider.invoke({
        messages: [['system', sys], ['human', human]],
        structuredOutput: { schema: buildRankSchema(), name: 'classify_rank', description: 'Ranked candidate matches.' },
      });
      const parsed = result && typeof result === 'object' && 'parsed' in result ? result.parsed : result;
      ranked = Array.isArray(parsed?.ranked) ? parsed.ranked : [];
    } catch (e: any) {
      this.app.log?.warn?.('[ptdl-ai-column] classify re-rank failed, falling back to vector order: ' + (e?.message || e));
    }

    // Keep only known tks; if the LLM returned nothing usable, fall back to the vector shortlist.
    // `record` = the full master row, so the client can set a belongsTo form value that DISPLAYS
    // (id-only would show blank until reload) and persists.
    let out = ranked
      .filter((r) => ids.includes(String(r.tk)))
      .map((r) => ({ tk: String(r.tk), score: Number(r.score) || 0, reasoning: r.reasoning || '', label: labelOf(String(r.tk)), write: writeOf(String(r.tk)), record: recByTk[String(r.tk)] }));
    if (!out.length) {
      out = scored.map((s) => ({ tk: s.tk, score: Math.round(s.sim * 100), reasoning: '(theo tương đồng vector)', label: labelOf(s.tk), write: writeOf(s.tk), record: recByTk[s.tk] }));
    }
    const best = out[0] || null;
    return {
      candidates: out,
      best,
      confidence: best ? best.score : 0,
      method, // 'vector' | 'keyword' (fallback when no embedding index)
      vectorTop: scored.map((s) => ({ tk: s.tk, sim: Number(s.sim.toFixed(4)) })),
      service: svc,
      model: mdl,
      embedModel: embModel,
    };
  }

  /** Batch classify (vector-only, no LLM re-rank) — embed MANY queries against ONE master in a
   *  single embeddings call, cosine each locally, return best per query. Collapses N per-row classify
   *  calls into ~1, the key scale optimization (20 lines → 1 embed call instead of 20). Falls back to
   *  lexical (no API) when the master has no embedding index. Returns results aligned to `queries`. */
  async runClassifyBatch(params: { queries: string[]; masterCollection: string; dataSourceKey?: string; llmService?: string; embedModel?: string }): Promise<Array<{ query: string; best: any }>> {
    const db = this.db;
    const dsk = params.dataSourceKey || 'main';
    // Trim up-front so the dedup key, embed input, and result lookup are ALL the same normalized
    // string — otherwise a query with stray whitespace keys `bestByQuery` one way and looks it up
    // another → that row silently gets no FK (missing-row bug). Results stay index-aligned to input.
    const queries = (params.queries || []).map((q) => String(q ?? '').trim());
    const uniq = [...new Set(queries.filter(Boolean))];
    const coll: any = db.getCollection(params.masterCollection);
    const pk = coll?.model?.primaryKeyAttribute || 'id';
    const bestByQuery: Record<string, { tk: string; score: number }> = {};
    if (uniq.length) {
      const cached = await db.getRepository('ptdlClassifyEmbed').find({ filter: { collectionName: params.masterCollection, dataSourceKey: dsk } });
      if (cached.length) {
        const creds = await getServiceCredentials(db, params.llmService);
        if (creds && creds.provider === 'google-genai' && creds.apiKey) {
          const qvecs = await googleEmbed(creds.apiKey, normEmbedModel(params.embedModel), uniq, creds.baseURL, embedDimsOf(cached)); // ONE batch call
          const cachedVecs = cached.map((c: any) => {
            const r = c.toJSON ? c.toJSON() : c;
            return { tk: String(r.recordId), vec: r.vector || [] };
          });
          uniq.forEach((q, i) => {
            const qv = qvecs[i];
            let bestTk: string | null = null;
            let bestSim = -1;
            for (const cv of cachedVecs) {
              const s = cosineSim(qv, cv.vec);
              if (s > bestSim) {
                bestSim = s;
                bestTk = cv.tk;
              }
            }
            if (bestTk) bestByQuery[q] = { tk: bestTk, score: Math.round(bestSim * 100) };
          });
        }
      }
      if (!Object.keys(bestByQuery).length) {
        // Keyword fallback (no embedding index / no google key) — lexical, zero API.
        const cfg = await db.getRepository('ptdlClassifyConfig').findOne({ filter: { key: `${dsk}:${params.masterCollection}` } });
        const tpl = cfg && (cfg.get ? cfg.get('textTemplate') : (cfg as any).textTemplate);
        const mrows = await db.getRepository(params.masterCollection).find({ limit: 2000 });
        const masterTexts = (mrows || []).map((r: any) => {
          const rec = r.toJSON ? r.toJSON() : r;
          return { tk: String(rec[pk]), toks: tokenize(tpl ? renderTemplate(tpl, rec) : Object.values(rec).filter((v) => typeof v === 'string').join(' ')) };
        });
        uniq.forEach((q) => {
          const qt = tokenize(q);
          let bestTk: string | null = null;
          let bestS = 0;
          for (const mt of masterTexts) {
            const s = lexScore(qt, mt.toks);
            if (s > bestS) {
              bestS = s;
              bestTk = mt.tk;
            }
          }
          if (bestTk) bestByQuery[q] = { tk: bestTk, score: Math.round(bestS * 100) };
        });
      }
    }
    const bestTks = [...new Set(Object.values(bestByQuery).map((b) => b.tk))];
    const recs = bestTks.length ? await db.getRepository(params.masterCollection).find({ filter: { [pk]: { $in: bestTks } } }) : [];
    const recByTk: Record<string, any> = {};
    for (const r of recs) {
      const rec = r.toJSON ? r.toJSON() : r;
      recByTk[String(rec[pk])] = rec;
    }
    return queries.map((q) => {
      const b = bestByQuery[q]; // q already trimmed → same key as bestByQuery
      return { query: q, best: b ? { tk: b.tk, score: b.score, record: recByTk[b.tk] } : null };
    });
  }

  /** DEEP classify (decision-support) — the specialized, config-driven pipeline for HARD "no golden
   *  answer" classification (HS code, ICD, chart-of-accounts, legal categorization…): 1) optional
   *  attribute extraction (caller-defined schema, surfaces `missing_info`), 2) vector/keyword
   *  shortlist (larger topK), 3) LLM scores EVERY candidate with domain criteria → reasoning,
   *  confidence, requires-verification, warnings. Returns rich candidates for a human to pick from —
   *  never an auto-answer. Domain is driven purely by config (`attributes`, `rubric`, `roleHint`,
   *  `displayFields`), so ONE engine solves many domains. */
  async runClassifyDeep(params: {
    query: string;
    masterCollection: string;
    dataSourceKey?: string;
    llmService?: string;
    model?: string;
    embedModel?: string;
    topK?: number;
    attributes?: Array<{ name: string; description?: string }>;
    rubric?: string;
    roleHint?: string;
    displayFields?: string[];
    labelTemplate?: string;
    writeTemplate?: string;
  }): Promise<any> {
    const db = this.db;
    const dsk = params.dataSourceKey || 'main';
    const query = String(params.query || '').trim();
    if (!query) throw new Error('query is required');
    const topK = Math.min(Number(params.topK) || 15, 40);
    const coll: any = db.getCollection(params.masterCollection);
    const pk = coll?.model?.primaryKeyAttribute || 'id';

    // 1) Shortlist — vector if the master is embedded, else lexical keyword.
    const cached = await db.getRepository('ptdlClassifyEmbed').find({ filter: { collectionName: params.masterCollection, dataSourceKey: dsk } });
    let scored: Array<{ tk: string; sim: number }> = [];
    let method = 'vector';
    if (cached.length) {
      const creds = await getServiceCredentials(db, params.llmService);
      if (creds && creds.provider === 'google-genai' && creds.apiKey) {
        const [qv] = await googleEmbed(creds.apiKey, normEmbedModel(params.embedModel), [query], creds.baseURL, embedDimsOf(cached));
        if (qv?.length) scored = cached.map((c: any) => { const r = c.toJSON ? c.toJSON() : c; return { tk: String(r.recordId), sim: cosineSim(qv, r.vector || []) }; }).sort((a, b) => b.sim - a.sim).slice(0, topK);
      }
    }
    if (!scored.length) {
      method = 'keyword';
      const cfg = await db.getRepository('ptdlClassifyConfig').findOne({ filter: { key: `${dsk}:${params.masterCollection}` } });
      const tpl = cfg && (cfg.get ? cfg.get('textTemplate') : (cfg as any).textTemplate);
      const mrows = await db.getRepository(params.masterCollection).find({ limit: 2000 });
      const qTokens = tokenize(query);
      scored = (mrows || []).map((r: any) => { const rec = r.toJSON ? r.toJSON() : r; const text = tpl ? renderTemplate(tpl, rec) : Object.values(rec).filter((v) => typeof v === 'string').join(' '); return { tk: String(rec[pk]), sim: lexScore(qTokens, tokenize(text)) }; }).sort((a, b) => b.sim - a.sim).slice(0, topK);
    }
    if (!scored.length) throw new Error(`Master "${params.masterCollection}" không có ứng viên để phân loại.`);
    const ids = scored.map((s) => s.tk);
    const recs = await db.getRepository(params.masterCollection).find({ filter: { [pk]: { $in: ids } } });
    const recByTk: Record<string, any> = {};
    for (const r of recs) { const rec = r.toJSON ? r.toJSON() : r; recByTk[String(rec[pk])] = rec; }

    const aiPlugin = this.app.pm.get('ai');
    if (!aiPlugin || !aiPlugin.aiManager) throw new Error('AI plugin (@nocobase/plugin-ai) is not enabled');
    let svc = params.llmService, mdl = params.model;
    if (!svc || !mdl) { const rr = await aiPlugin.aiManager.resolveModel({ llmService: svc, model: mdl }); svc = rr.llmService; mdl = rr.model; }
    const { provider } = await aiPlugin.aiManager.getLLMService({ llmService: svc, model: mdl });

    // 2) Attribute extraction (optional, caller-defined schema).
    const attributes = Array.isArray(params.attributes) ? params.attributes.filter((a) => a?.name) : [];
    let attrs: any = null;
    let missingInfo: string[] = [];
    if (attributes.length) {
      try {
        const res = await provider.invoke({
          messages: [['system', `Bạn là ${params.roleHint || 'trợ lý phân loại'}. Trích các thuộc tính theo schema; dùng null nếu input không nêu rõ, KHÔNG đoán. Liệt kê thông tin còn thiếu.`], ['human', `Input: ${query}`]],
          structuredOutput: { schema: buildDeepExtractSchema(attributes), name: 'deep_extract', description: 'Extracted attributes.' },
        });
        const parsed = res && typeof res === 'object' && 'parsed' in res ? res.parsed : res;
        if (parsed && typeof parsed === 'object') { attrs = parsed; missingInfo = Array.isArray(parsed.missing_info) ? parsed.missing_info : []; }
      } catch (e: any) {
        this.app.log?.warn?.('[ptdl-ai-column] deep extract failed: ' + (e?.message || e));
      }
    }

    // 3) Score EVERY candidate with domain criteria + rich judgment.
    const displayFields = Array.isArray(params.displayFields) && params.displayFields.length ? params.displayFields : null;
    const candJson = scored.map((s) => { const rec = recByTk[s.tk] || {}; const view = displayFields ? Object.fromEntries(displayFields.map((f) => [f, rec[f]])) : rec; return { tk: s.tk, ...view, vector_sim: Math.round(s.sim * 100) }; });
    const sys = `Bạn là ${params.roleHint || 'chuyên gia phân loại'} nhiều năm kinh nghiệm. Cho một ITEM và danh sách ỨNG VIÊN (mỗi cái có mã tk + dữ liệu tham chiếu), chấm 0–100 mức khớp TỪNG ứng viên + giải trình; nêu confidence, requires_verification (người dùng cần tự kiểm gì để chốt), warnings (rút từ dữ liệu ứng viên). CHỈ dùng tk đã cho, không bịa.${params.rubric ? ' Tiêu chí chấm: ' + params.rubric : ''}`;
    const human = `ITEM: ${query}\n${attrs ? 'Thuộc tính đã trích: ' + JSON.stringify(attrs) + '\n' : ''}${missingInfo.length ? 'Thiếu: ' + missingInfo.join('; ') + '\n' : ''}\nỨNG VIÊN:\n${JSON.stringify(candJson)}`;
    let ranked: any[] = [];
    let overall = '';
    try {
      const res = await provider.invoke({ messages: [['system', sys], ['human', human]], structuredOutput: { schema: buildDeepScoreSchema(), name: 'deep_score', description: 'Scored candidates.' } });
      const parsed = res && typeof res === 'object' && 'parsed' in res ? res.parsed : res;
      ranked = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
      overall = parsed?.overall_recommendation || '';
    } catch (e: any) {
      this.app.log?.warn?.('[ptdl-ai-column] deep score failed: ' + (e?.message || e));
    }

    const labelOf = (tk: string) => { const rec = recByTk[tk] || {}; return params.labelTemplate ? renderTemplate(params.labelTemplate, rec) : JSON.stringify(rec); };
    const writeOf = (tk: string) => { const rec = recByTk[tk] || {}; return params.writeTemplate ? renderTemplate(params.writeTemplate, rec) : labelOf(tk); };
    let out = ranked
      .filter((r) => ids.includes(String(r.tk)))
      .map((r) => ({ tk: String(r.tk), score: Number(r.score) || 0, reasoning: r.reasoning || '', matchedCriteria: r.matched_criteria || [], unmatchedCriteria: r.unmatched_criteria || [], confidence: r.confidence || 'medium', requiresVerification: r.requires_verification || [], warnings: r.warnings || '', label: labelOf(String(r.tk)), write: writeOf(String(r.tk)), record: recByTk[String(r.tk)] }))
      .sort((a, b) => b.score - a.score);
    if (!out.length) out = scored.slice(0, 5).map((s) => ({ tk: s.tk, score: Math.round(s.sim * 100), reasoning: '(theo tương đồng vector)', matchedCriteria: [], unmatchedCriteria: [], confidence: 'low', requiresVerification: [], warnings: '', label: labelOf(s.tk), write: writeOf(s.tk), record: recByTk[s.tk] }));
    const best = out[0] || null;
    return { attributes: attrs, missingInfo, candidates: out.slice(0, Math.min(topK, 10)), best, overallRecommendation: overall, method, service: svc, model: mdl };
  }

  /** Shape a classify result for writing into a child field: if the field is a belongsTo/hasOne
   *  relation, write the association `{[targetKey]: tk}` (a real FK link to the master record);
   *  otherwise write the plain code string. Lets classify fill either a code column OR a relation. */
  classifyWriteValue(childCollection: string | undefined, field: string, best: any): any {
    if (!childCollection || !best) return best?.write;
    try {
      const f: any = this.db.getCollection(childCollection)?.getField?.(field);
      const opts = f?.options || f || {};
      if (opts.type === 'belongsTo' || opts.type === 'hasOne') {
        return { [opts.targetKey || 'id']: best.tk };
      }
    } catch {
      /* fall through to string */
    }
    return best.write;
  }

  /** AI Multi-row Extract for ONE parent record: read a source (attachment field and/or {{token}}
   *  prompt) → N child rows into a to-many relation, optionally classifying each row against a master
   *  (writing a code OR belongsTo FK). Shared by the server auto-run hook AND the bulk table action
   *  (`extractRowsInto`), so both behave identically. Returns how many child rows were created. */
  async runExtractRowsInto(collectionName: string, filterByTk: any, values: Record<string, any>, cfg: any): Promise<{ created: number; skipped?: string }> {
    const relationField = cfg.relationField;
    const fields: ExtractFieldDef[] = Array.isArray(cfg.fields) ? cfg.fields.filter((f: any) => f?.name) : [];
    if (!relationField || !fields.length) return { created: 0, skipped: 'noconfig' };
    const attachment = cfg.sourceField ? values[cfg.sourceField] : undefined;
    if (cfg.sourceField) {
      const hasFile = Array.isArray(attachment) ? attachment.length > 0 : attachment != null && attachment !== '';
      if (!hasFile) return { created: 0, skipped: 'nofile' };
    }
    const existingChildren = values[relationField];
    if (cfg.onlyWhenEmpty && Array.isArray(existingChildren) && existingChildren.length) return { created: 0, skipped: 'notempty' };

    const rows = await runExtractRowsCore(this.app, { llmService: cfg.llmService, model: cfg.model, system: cfg.system, prompt: cfg.prompt, values, attachment, fields });
    if (!rows.length) return { created: 0 };

    // Child collection = the relation's target (belongsTo columns of the child point at masters).
    let childColl: string | undefined;
    try {
      const relF: any = this.db.getCollection(collectionName)?.getField?.(relationField);
      childColl = (relF?.options || relF || {}).target;
    } catch {
      /* ignore */
    }

    // Unified mapping: resolve N RELATION columns per row — each classifies a raw source field
    // against the relation's target collection → FK link {id: tk}. (target auto-derived below.)
    const relationMaps: any[] = Array.isArray(cfg.relationMaps) ? cfg.relationMaps.filter((rm: any) => rm?.field && rm?.queryField) : [];
    const relTargetOf = (relField: string): string | undefined => {
      try {
        const rf: any = childColl ? this.db.getCollection(childColl)?.getField?.(relField) : null;
        return (rf?.options || rf || {}).target;
      } catch {
        return undefined;
      }
    };
    const applyBest = (row: any, rm: any, best: any, q: string) => {
      const min = Number(rm.minScore) || 0;
      if (best && (best.score || 0) >= min) row[rm.field] = this.classifyWriteValue(childColl, rm.field, best);
      else if (rm.saveRawTo) row[rm.saveRawTo] = q;
    };
    const taskOf = (row: any, rm: any) => {
      const master = rm.target || relTargetOf(rm.field);
      const q = row[rm.queryField];
      return master && q != null && String(q).trim() !== '' ? { row, rm, master, q: String(q) } : null;
    };

    // FAST relations (no rerank): one BATCH embed call PER master (20 lines → 1 call, not 20).
    const fastByMaster = new Map<string, Array<{ row: any; rm: any; q: string }>>();
    for (const row of rows) {
      for (const rm of relationMaps) {
        if (rm.rerank === true) continue;
        const tk = taskOf(row, rm);
        if (!tk) continue;
        if (!fastByMaster.has(tk.master)) fastByMaster.set(tk.master, []);
        fastByMaster.get(tk.master)!.push({ row, rm, q: tk.q });
      }
    }
    for (const [master, items] of fastByMaster) {
      try {
        const results = await this.runClassifyBatch({ queries: items.map((it) => it.q), masterCollection: master, dataSourceKey: 'main', llmService: cfg.llmService });
        items.forEach((it, i) => applyBest(it.row, it.rm, results[i]?.best, it.q));
      } catch (e: any) {
        this.app.log?.warn?.('[ptdl-ai-column] extractRows batch relation resolve failed: ' + (e?.message || e));
      }
    }

    // RERANK relations: per-row classify (LLM), still concurrency-pooled.
    const rerankTasks = [] as Array<{ row: any; rm: any; master: string; q: string }>;
    for (const row of rows) for (const rm of relationMaps) if (rm.rerank === true) {
      const tk = taskOf(row, rm);
      if (tk) rerankTasks.push(tk);
    }
    let ri = 0;
    const relWorker = async () => {
      while (ri < rerankTasks.length) {
        const { row, rm, master, q } = rerankTasks[ri++];
        try {
          const r = await this.runClassify({ query: q, masterCollection: master, dataSourceKey: rm.dataSourceKey || 'main', topK: rm.topK || 8, llmService: cfg.llmService, model: cfg.model, rerank: true } as any);
          applyBest(row, rm, r?.best, q);
        } catch (e: any) {
          this.app.log?.warn?.('[ptdl-ai-column] extractRows rerank resolve failed: ' + (e?.message || e));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(5, rerankTasks.length) }, relWorker));

    // Backward compat: the old single `classify` config (pre-unified-mapping rules).
    const cls = cfg.classify;
    if (cls && cls.master && cls.queryField && cls.targetField) {
      for (const row of rows) {
        const q = row[cls.queryField];
        if (q == null || String(q).trim() === '') continue;
        try {
          const r = await this.runClassify({ query: String(q), masterCollection: cls.master, dataSourceKey: cls.dataSourceKey || 'main', labelTemplate: cls.labelTemplate, writeTemplate: cls.writeTemplate, topK: cls.topK, llmService: cfg.llmService, model: cfg.model, embedModel: cls.embedModel } as any);
          if (r?.best) row[cls.targetField] = this.classifyWriteValue(childColl, cls.targetField, r.best);
        } catch (e: any) {
          this.app.log?.warn?.('[ptdl-ai-column] extractRows per-row classify failed: ' + (e?.message || e));
        }
      }
    }

    const assocRepo = this.db.getRepository(`${collectionName}.${relationField}`, filterByTk);
    if (cfg.mode === 'replace') {
      try {
        await assocRepo.destroy({ truncate: true });
      } catch (e: any) {
        this.app.log?.warn?.('[ptdl-ai-column] extractRows replace-clear failed: ' + (e?.message || e));
      }
    }
    let created = 0;
    const relFieldNames = relationMaps.map((rm) => rm.field);
    const rawSaveCols = relationMaps.map((rm) => rm.saveRawTo).filter(Boolean);
    for (const row of rows) {
      const clean: Record<string, any> = {};
      // `__m_*` = transient match-only fields (extracted just to resolve an FK) → never persisted.
      for (const f of fields) if (!String(f.name).startsWith('__m_') && row[f.name] != null) clean[f.name] = row[f.name];
      for (const rf of relFieldNames) if (row[rf] != null) clean[rf] = row[rf];
      for (const sc of rawSaveCols) if (row[sc] != null) clean[sc] = row[sc];
      if (cls && cls.targetField && row[cls.targetField] != null) clean[cls.targetField] = row[cls.targetField];
      if (Object.keys(clean).length) {
        await assocRepo.create({ values: clean });
        created++;
      }
    }
    return { created };
  }

  async load() {
    // Config store for server-side auto-run rules (see the autorun hook above). Defined + synced at
    // runtime so the plugin is self-contained; harmless if the table already exists.
    this.db.collection({
      name: 'ptdlAiAutorun',
      fields: [
        { type: 'string', name: 'key', unique: true },
        { type: 'string', name: 'collectionName' },
        { type: 'string', name: 'dataSourceKey' },
        { type: 'string', name: 'targetField' },
        { type: 'string', name: 'kind' },
        { type: 'json', name: 'config' },
        { type: 'json', name: 'dependsOn' },
        { type: 'string', name: 'runOn' },
        { type: 'boolean', name: 'enabled' },
      ],
    });
    try {
      await this.db.getCollection('ptdlAiAutorun').sync();
    } catch (e: any) {
      this.app.log?.warn?.('[ptdl-ai-column] ptdlAiAutorun sync failed: ' + (e?.message || e));
    }

    // Failure log (#1) — a NORMAL (visible) collection so users can drop a table block on it to see
    // which server auto-runs failed and why. `title` set so it shows up nicely in the block picker.
    this.db.collection({
      name: 'ptdlAiAutorunLog',
      title: 'AI Autorun Log',
      fields: [
        { type: 'string', name: 'collectionName' },
        { type: 'string', name: 'dataSourceKey' },
        { type: 'string', name: 'recordId' },
        { type: 'string', name: 'targetField' },
        { type: 'string', name: 'kind' },
        { type: 'string', name: 'status' },
        { type: 'text', name: 'message' },
      ],
    });
    try {
      await this.db.getCollection('ptdlAiAutorunLog').sync();
    } catch (e: any) {
      this.app.log?.warn?.('[ptdl-ai-column] ptdlAiAutorunLog sync failed: ' + (e?.message || e));
    }

    // 3rd-party TTS provider credentials (ElevenLabs / Vbee) — Google TTS reuses plugin-ai's
    // llmServices, but these aren't LLM providers so their secrets live here. Admin adds a row per
    // provider (via the settings actions or a block on this collection). Secrets never leave the
    // server: the client picker action returns only {name, provider}.
    this.db.collection({
      name: 'ptdlVoiceProvider',
      title: 'AI Voice Provider',
      fields: [
        { type: 'string', name: 'name', unique: true },
        { type: 'string', name: 'provider' }, // 'elevenlabs' | 'vbee' (google uses llmServices)
        { type: 'text', name: 'apiKey' }, // ElevenLabs
        { type: 'string', name: 'appId' }, // Vbee
        { type: 'text', name: 'token' }, // Vbee
        { type: 'string', name: 'baseURL' },
        { type: 'string', name: 'voiceDefault' },
        { type: 'boolean', name: 'enabled', defaultValue: true },
      ],
    });
    try {
      await this.db.getCollection('ptdlVoiceProvider').sync();
    } catch (e: any) {
      this.app.log?.warn?.('[ptdl-ai-column] ptdlVoiceProvider sync failed: ' + (e?.message || e));
    }

    // Block B (AI Classify) — vector cache: one row per (master collection, record) holding the
    // embedding of that record's searchable text. Built by `embedMaster`, read by `classify` for
    // brute-force cosine top-K (no pgvector needed; nb-local is sqlite). Plugin-owned so master
    // collections stay untouched. `vector` is a json array; `textHash` gates re-embedding.
    this.db.collection({
      name: 'ptdlClassifyEmbed',
      title: 'AI Classify Embeddings',
      fields: [
        { type: 'string', name: 'collectionName' },
        { type: 'string', name: 'dataSourceKey' },
        { type: 'string', name: 'recordId' },
        { type: 'string', name: 'textHash' },
        { type: 'json', name: 'vector' },
        { type: 'text', name: 'text' },
        { type: 'string', name: 'model' },
      ],
    });
    try {
      await this.db.getCollection('ptdlClassifyEmbed').sync();
    } catch (e: any) {
      this.app.log?.warn?.('[ptdl-ai-column] ptdlClassifyEmbed sync failed: ' + (e?.message || e));
    }

    // Persisted embed config per master (so the "AI Provider → Đối chiếu" settings tab can list
    // indexed masters and re-embed centrally — reindex needs the textTemplate/model that built it).
    this.db.collection({
      name: 'ptdlClassifyConfig',
      title: 'AI Classify Config',
      fields: [
        { type: 'string', name: 'key', unique: true }, // `${dsk}:${masterCollection}`
        { type: 'string', name: 'masterCollection' },
        { type: 'string', name: 'dataSourceKey' },
        { type: 'text', name: 'textTemplate' },
        { type: 'string', name: 'model' },
        { type: 'string', name: 'llmService' },
        { type: 'integer', name: 'refreshEveryMin' }, // 0/null = off; else auto re-embed every N minutes
        { type: 'date', name: 'lastRefreshAt' },
        { type: 'integer', name: 'dims' }, // outputDimensionality used for this index (null = model default)
      ],
    });
    try {
      await this.db.getCollection('ptdlClassifyConfig').sync();
    } catch (e: any) {
      this.app.log?.warn?.('[ptdl-ai-column] ptdlClassifyConfig sync failed: ' + (e?.message || e));
    }

    // Deep-classify decision log (human-in-the-loop feedback): which candidate a user picked vs the
    // AI's top suggestion + a note — audit trail + future training signal. A NORMAL (visible)
    // collection so an admin can drop a table block on it to review corrections.
    this.db.collection({
      name: 'ptdlClassifyDecisionLog',
      title: 'AI Classify Decisions',
      fields: [
        { type: 'string', name: 'masterCollection' },
        { type: 'text', name: 'query' },
        { type: 'string', name: 'selectedTk' },
        { type: 'string', name: 'aiTopTk' },
        { type: 'double', name: 'aiTopScore' },
        { type: 'boolean', name: 'overrode' }, // user picked ≠ AI's top
        { type: 'text', name: 'note' },
        { type: 'string', name: 'userId' },
        { type: 'json', name: 'candidates' },
      ],
    });
    try {
      await this.db.getCollection('ptdlClassifyDecisionLog').sync();
    } catch (e: any) {
      this.app.log?.warn?.('[ptdl-ai-column] ptdlClassifyDecisionLog sync failed: ' + (e?.message || e));
    }

    // Refresh the auto-run cache + attach hooks once the app is fully started (all collections loaded).
    this.app.on('afterStart', async () => {
      await this.loadAutorunRules();
      this.startClassifyScheduler();
    });

    this.app.resourceManager.define({
      name: 'ptdlAiColumn',
      actions: {
        generate: async (ctx: any, next: any) => {
          const body = (ctx.action?.params?.values as any) || {};
          try {
            const out = await runGenerateCore(ctx.app, body);
            ctx.body = out;
          } catch (e: any) {
            const msg = e?.message || 'AI generation failed';
            ctx.throw(/required|not enabled|No LLM|Invalid|configured/i.test(msg) ? 400 : 502, msg);
          }
          await next();
        },

        // Register / update a server-side auto-run rule (fires the generation on record create/update
        // from ANY source — automation, API, bulk — not just the form). Called by the field settings
        // when the "server-side" trigger option is enabled.
        setAutorun: async (ctx: any, next: any) => {
          const v = (ctx.action?.params?.values as any) || {};
          const { collectionName, targetField, kind = 'generate', config, dependsOn, runOn = 'both', dataSourceKey = 'main' } = v;
          if (!collectionName || !targetField) ctx.throw(400, 'collectionName and targetField are required');
          const key = `${dataSourceKey}:${collectionName}.${targetField}.${kind}`;
          const repo = ctx.db.getRepository('ptdlAiAutorun');
          const data = { key, collectionName, dataSourceKey, targetField, kind, config: config || {}, dependsOn: dependsOn || [], runOn, enabled: true };
          const existing = await repo.findOne({ filter: { key } });
          if (existing) await repo.update({ filterByTk: existing.get('id'), values: data });
          else await repo.create({ values: data });
          await this.loadAutorunRules();
          ctx.body = { ok: true, key };
          await next();
        },

        // Remove a server-side auto-run rule (when the "server-side" trigger option is turned off).
        removeAutorun: async (ctx: any, next: any) => {
          const v = (ctx.action?.params?.values as any) || {};
          const { collectionName, targetField, kind = 'generate', dataSourceKey = 'main' } = v;
          if (!collectionName || !targetField) ctx.throw(400, 'collectionName and targetField are required');
          const key = `${dataSourceKey}:${collectionName}.${targetField}.${kind}`;
          await ctx.db.getRepository('ptdlAiAutorun').destroy({ filter: { key } });
          await this.loadAutorunRules();
          ctx.body = { ok: true };
          await next();
        },

        // --- 3rd-party TTS provider credentials (ElevenLabs / Vbee) ---
        // List configured voice providers for the field-settings picker. Returns ONLY {name,
        // provider, voiceDefault, enabled} — never the apiKey/token (secrets stay server-side).
        listVoiceProviders: async (ctx: any, next: any) => {
          const rows = await ctx.db.getRepository('ptdlVoiceProvider').find({ filter: { enabled: true }, sort: ['name'] });
          // Return the RAW array — NocoBase's dataWrapping middleware adds the single `{ data }`
          // envelope, so the client reads it as `res.data.data` (an array). Wrapping it here as
          // `{ data: [...] }` double-wraps → client sees `{ data: [...] }` (a non-array object) →
          // `<Table dataSource>` / `.filter()` throw. Matches gsheet-sync's listConnections.
          ctx.body = (rows || []).map((r: any) => {
            const g = (k: string) => (typeof r.get === 'function' ? r.get(k) : r[k]);
            return { name: g('name'), provider: g('provider'), voiceDefault: g('voiceDefault') };
          });
          await next();
        },

        // Create / update a voice-provider credential (upsert by name). For programmatic setup; the
        // admin can equally add rows via a normal block on ptdlVoiceProvider.
        setVoiceProvider: async (ctx: any, next: any) => {
          const v = (ctx.action?.params?.values as any) || {};
          const { name, provider, apiKey, appId, token, baseURL, voiceDefault, enabled = true } = v;
          if (!name || !provider) ctx.throw(400, 'name and provider are required');
          if (!['elevenlabs', 'vbee'].includes(provider)) ctx.throw(400, 'provider must be elevenlabs or vbee');
          const repo = ctx.db.getRepository('ptdlVoiceProvider');
          const data = { name, provider, apiKey, appId, token, baseURL, voiceDefault, enabled };
          const existing = await repo.findOne({ filter: { name } });
          if (existing) await repo.update({ filterByTk: existing.get('id'), values: data });
          else await repo.create({ values: data });
          ctx.body = { ok: true, name };
          await next();
        },

        removeVoiceProvider: async (ctx: any, next: any) => {
          const v = (ctx.action?.params?.values as any) || {};
          if (!v.name) ctx.throw(400, 'name is required');
          await ctx.db.getRepository('ptdlVoiceProvider').destroy({ filter: { name: v.name } });
          ctx.body = { ok: true };
          await next();
        },

        // Recent server auto-run FAILURES (#1) — a guaranteed API path to see errors even without
        // building a block on ptdlAiAutorunLog. Optional filter by collectionName; newest first.
        autorunErrors: async (ctx: any, next: any) => {
          const v = (ctx.action?.params?.values as any) || {};
          const filter: any = {};
          if (v.collectionName) filter.collectionName = v.collectionName;
          const rows = await ctx.db.getRepository('ptdlAiAutorunLog').find({
            filter,
            sort: ['-createdAt'],
            limit: Math.min(Number(v.limit) || 50, 200),
          });
          ctx.body = { data: (rows || []).map((r: any) => (r.toJSON ? r.toJSON() : r)), queueSize: this.autorunQueue.size() };
          await next();
        },

        // --- Block B: AI Classify (vector match to a master collection) ---
        // Build/refresh the embedding cache for a master collection (idempotent; pass force to rebuild).
        embedMaster: async (ctx: any, next: any) => {
          const v = (ctx.action?.params?.values as any) || {};
          if (!v.masterCollection || !v.textTemplate) ctx.throw(400, 'masterCollection and textTemplate are required');
          try {
            ctx.body = await this.runEmbedMaster(v);
          } catch (e: any) {
            const msg = e?.message || 'embedMaster failed';
            ctx.throw(/cần|required|không tồn tại|configured/i.test(msg) ? 400 : 502, msg);
          }
          await next();
        },

        // List indexed masters (for the AI Provider → Đối chiếu settings tab): each config row +
        // its live embedding count.
        classifyStatus: async (ctx: any, next: any) => {
          const cfgs = await ctx.db.getRepository('ptdlClassifyConfig').find({ sort: ['masterCollection'] });
          const cacheRepo = ctx.db.getRepository('ptdlClassifyEmbed');
          const out: any[] = [];
          for (const c of cfgs || []) {
            const r = c.toJSON ? c.toJSON() : c;
            const count = await cacheRepo.count({ filter: { collectionName: r.masterCollection, dataSourceKey: r.dataSourceKey } }).catch(() => 0);
            out.push({ masterCollection: r.masterCollection, dataSourceKey: r.dataSourceKey, textTemplate: r.textTemplate, model: r.model, llmService: r.llmService, count, refreshEveryMin: r.refreshEveryMin || 0, lastRefreshAt: r.lastRefreshAt, updatedAt: r.updatedAt });
          }
          // Raw array — dataWrapping adds the {data} envelope (client reads res.data.data).
          ctx.body = out;
          await next();
        },

        // Re-embed an already-configured master (reads its stored textTemplate/model). force=rebuild all.
        classifyReindex: async (ctx: any, next: any) => {
          const v = (ctx.action?.params?.values as any) || {};
          if (!v.masterCollection) ctx.throw(400, 'masterCollection is required');
          const key = `${v.dataSourceKey || 'main'}:${v.masterCollection}`;
          const cfg = await ctx.db.getRepository('ptdlClassifyConfig').findOne({ filter: { key } });
          if (!cfg) ctx.throw(400, 'Master này chưa có cấu hình embedding — hãy embed lần đầu từ field settings.');
          const c = cfg.toJSON ? cfg.toJSON() : cfg;
          try {
            ctx.body = await this.runEmbedMaster({ masterCollection: c.masterCollection, dataSourceKey: c.dataSourceKey, textTemplate: c.textTemplate, llmService: c.llmService || undefined, embedModel: c.model, embedDims: c.dims || undefined, force: !!v.force });
          } catch (e: any) {
            ctx.throw(502, e?.message || 'reindex failed');
          }
          await next();
        },

        // Set (or turn off) the auto-refresh interval for a master's embedding index.
        classifySchedule: async (ctx: any, next: any) => {
          const v = (ctx.action?.params?.values as any) || {};
          if (!v.masterCollection) ctx.throw(400, 'masterCollection is required');
          const key = `${v.dataSourceKey || 'main'}:${v.masterCollection}`;
          const repo = ctx.db.getRepository('ptdlClassifyConfig');
          const ex = await repo.findOne({ filter: { key } });
          if (!ex) ctx.throw(400, 'Master này chưa có cấu hình embedding.');
          await repo.update({ filterByTk: ex.get('id'), values: { refreshEveryMin: Math.max(0, Number(v.refreshEveryMin) || 0) } });
          ctx.body = { ok: true, refreshEveryMin: Math.max(0, Number(v.refreshEveryMin) || 0) };
          await next();
        },

        // Clear a master's embedding index + its config.
        classifyClear: async (ctx: any, next: any) => {
          const v = (ctx.action?.params?.values as any) || {};
          if (!v.masterCollection) ctx.throw(400, 'masterCollection is required');
          const dsk = v.dataSourceKey || 'main';
          await ctx.db.getRepository('ptdlClassifyEmbed').destroy({ filter: { collectionName: v.masterCollection, dataSourceKey: dsk } }).catch(() => {});
          await ctx.db.getRepository('ptdlClassifyConfig').destroy({ filter: { key: `${dsk}:${v.masterCollection}` } }).catch(() => {});
          ctx.body = { ok: true };
          await next();
        },

        // Batch classify (vector-only): many queries vs one master in a single embeddings call.
        classifyBatch: async (ctx: any, next: any) => {
          const v = (ctx.action?.params?.values as any) || {};
          if (!Array.isArray(v.queries) || !v.masterCollection) ctx.throw(400, 'queries[] and masterCollection are required');
          try {
            ctx.body = { results: await this.runClassifyBatch(v) };
          } catch (e: any) {
            ctx.throw(502, e?.message || 'classifyBatch failed');
          }
          await next();
        },

        // DEEP classify — the specialized decision-support pipeline (attribute extract + domain
        // scoring with reasoning/confidence/verification/warnings over a shortlist). For HARD
        // classification (HS code, ICD, accounting...) where there's no golden answer.
        classifyDeep: async (ctx: any, next: any) => {
          const v = (ctx.action?.params?.values as any) || {};
          if (!v.query || !v.masterCollection) ctx.throw(400, 'query and masterCollection are required');
          try {
            ctx.body = await this.runClassifyDeep(v);
          } catch (e: any) {
            const msg = e?.message || 'classifyDeep failed';
            ctx.throw(/required|not enabled|không có ứng viên/i.test(msg) ? 400 : 502, msg);
          }
          await next();
        },

        // Human-in-the-loop feedback: log which candidate the user finally picked (vs AI's top).
        classifyFeedback: async (ctx: any, next: any) => {
          const v = (ctx.action?.params?.values as any) || {};
          if (!v.masterCollection || v.selectedTk == null) ctx.throw(400, 'masterCollection and selectedTk are required');
          const aiTop = v.aiTopTk != null ? String(v.aiTopTk) : '';
          await ctx.db.getRepository('ptdlClassifyDecisionLog').create({
            values: {
              masterCollection: v.masterCollection,
              query: v.query || '',
              selectedTk: String(v.selectedTk),
              aiTopTk: aiTop,
              aiTopScore: Number(v.aiTopScore) || 0,
              overrode: !!aiTop && aiTop !== String(v.selectedTk),
              note: v.note || '',
              userId: ctx.state?.currentUser?.id != null ? String(ctx.state.currentUser.id) : '',
              candidates: v.candidates || [],
            },
          });
          ctx.body = { ok: true };
          await next();
        },

        // Classify a query text → best-matching master row + confidence + ranked candidates.
        classify: async (ctx: any, next: any) => {
          const v = (ctx.action?.params?.values as any) || {};
          if (!v.query || !v.masterCollection) ctx.throw(400, 'query and masterCollection are required');
          try {
            ctx.body = await this.runClassify(v);
          } catch (e: any) {
            const msg = e?.message || 'classify failed';
            ctx.throw(/cần|required|Chưa có embedding|not enabled|configured/i.test(msg) ? 400 : 502, msg);
          }
          await next();
        },

        // Multi-field extraction: one prompt (+ optional source attachment/image) → N named
        // fields via a single structuredOutput call, e.g. reading an ID card image into
        // {fullName, idNumber, dob, address, ...}. Unlike `generate`, there is no free-text
        // fallback — a reliable named-field split needs the real schema-enforced call.
        extract: async (ctx: any, next: any) => {
          const body = (ctx.action?.params?.values as any) || {};
          const { llmService, model, system, prompt, values = {}, attachment, fields } = body;

          if (!prompt || !String(prompt).trim()) {
            ctx.throw(400, 'prompt is required');
          }
          const fieldDefs: ExtractFieldDef[] = Array.isArray(fields) ? fields.filter((f: any) => f?.name) : [];
          if (!fieldDefs.length) {
            ctx.throw(400, 'at least one target field is required');
          }

          const renderedPrompt = renderTemplate(String(prompt), values);
          const sysText = system ? String(system) : '';

          // AUDIO source (speech-to-text / voice memo → fields): plugin-ai's chat pipeline can't take
          // audio, so route to Google's REST generateContent + responseSchema. Also handles plain
          // transcription — just map one text field with a "phiên âm" prompt. (Verified: gemini-2.5-
          // flash transcribes + extracts from audio.)
          const srcItems = normalizeAttachments(attachment);
          if (srcItems.some((it) => isAudioAttachment(it))) {
            const creds = await getServiceCredentials(ctx.db, llmService);
            if (!creds || creds.provider !== 'google-genai' || !creds.apiKey) {
              ctx.throw(400, 'Trích xuất từ audio hiện cần một service Google (google-genai) có API key.');
            }
            const audioParts: Array<{ mimeType: string; base64: string }> = [];
            for (const it of srcItems) {
              const a = await attachmentToMediaPart(ctx, it);
              if (a) audioParts.push(a);
            }
            if (!audioParts.length) {
              ctx.throw(502, 'Không đọc được file audio nguồn (kiểm tra lại field đính kèm).');
            }
            const audioModel = model && String(model).trim() ? String(model) : 'gemini-2.5-flash';
            let values_out: any;
            try {
              values_out = await googleStructuredFromMedia(creds.apiKey, audioModel, renderedPrompt, sysText, audioParts, fieldDefs, creds.baseURL);
            } catch (e: any) {
              ctx.log?.error?.('[ptdl-ai-column] audio extract failed: ' + (e?.message || e));
              ctx.throw(502, e?.message || 'Audio extraction failed');
            }
            for (const f of fieldDefs) {
              if ((f.type || 'string') === 'string' && typeof values_out?.[f.name] === 'string') {
                values_out[f.name] = stripMarkdown(values_out[f.name], !!f.markdown);
              }
            }
            ctx.body = { values: values_out, raw: JSON.stringify(values_out), service: creds.serviceName, model: audioModel, mode: 'audio' };
            await next();
            return;
          }

          const aiPlugin = ctx.app.pm.get('ai');
          if (!aiPlugin || !aiPlugin.aiManager) {
            ctx.throw(400, 'AI plugin (@nocobase/plugin-ai) is not enabled');
          }

          let svc = llmService;
          let mdl = model;
          if (!svc || !mdl) {
            try {
              const resolved = await aiPlugin.aiManager.resolveModel({ llmService: svc, model: mdl });
              svc = resolved.llmService;
              mdl = resolved.model;
            } catch (e: any) {
              ctx.throw(400, e?.message || 'No LLM service configured. Add one in Settings → AI.');
            }
          }

          let provider: any;
          try {
            ({ provider } = await aiPlugin.aiManager.getLLMService({ llmService: svc, model: mdl }));
          } catch (e: any) {
            ctx.throw(400, e?.message || 'Invalid LLM service/model');
          }

          const rendered = renderTemplate(String(prompt), values);
          const baseSys = system ? String(system) : '';

          // Build vision/file content blocks from the source field (0, 1, or many files —
          // e.g. front+back of an ID card all get sent together in one call).
          const contentBlocks: any[] = [];
          const systemNotes: string[] = [];
          for (const item of normalizeAttachments(attachment)) {
            const parsed = await attachmentToBlock(ctx, provider, item);
            if (!parsed) continue;
            if (parsed.placement === 'system') {
              systemNotes.push(typeof parsed.content === 'string' ? parsed.content : JSON.stringify(parsed.content));
            } else {
              contentBlocks.push(parsed.content);
            }
          }

          const humanContent: any = contentBlocks.length ? [...contentBlocks, { type: 'text', text: rendered }] : rendered;
          const sys = [baseSys, ...systemNotes].filter((s) => s && s.trim()).join('\n\n');
          const messages: any[] = [];
          if (sys.trim()) messages.push(['system', sys.trim()]);
          messages.push(['human', humanContent]);

          const schema = buildExtractSchema(fieldDefs);
          let values_out: any;
          let rawText = '';
          try {
            const result = await provider.invoke({
              messages,
              structuredOutput: { schema, name: 'ai_extract_result', description: 'The extracted field values.' },
            });
            const parsed = result && typeof result === 'object' && 'parsed' in result ? result.parsed : result;
            if (!parsed || typeof parsed !== 'object') {
              ctx.throw(502, 'AI did not return usable structured data');
            }
            values_out = parsed;
            rawText = JSON.stringify(parsed);
            // Strip markdown noise from plain-text fields — but NOT the fields the client detected
            // as markdown-interface targets (fieldDefs[].markdown), which should render it as-is.
            for (const f of fieldDefs) {
              if ((f.type || 'string') === 'string' && typeof values_out[f.name] === 'string') {
                values_out[f.name] = stripMarkdown(values_out[f.name], !!f.markdown);
              }
            }
          } catch (e: any) {
            ctx.log?.error?.('[ptdl-ai-column] extract failed: ' + (e?.message || e));
            ctx.throw(502, e?.message || 'AI extraction failed');
          }

          ctx.body = { values: values_out, raw: rawText, service: svc, model: mdl };
          await next();
        },

        // Multi-row extraction (AI Multi-row Extract): one prompt (+ optional source attachment) → an
        // ARRAY of rows via a single structuredOutput call, e.g. reading a quote PDF into N order-line
        // rows {product, qty, note}. Same shape as `extract` but the schema wraps the field set in a
        // `rows[]` array. The client writes the returned rows into a to-many (sub-table) field.
        extractRows: async (ctx: any, next: any) => {
          const body = (ctx.action?.params?.values as any) || {};
          const { llmService, model, system, prompt, values = {}, attachment, fields } = body;

          if (!prompt || !String(prompt).trim()) {
            ctx.throw(400, 'prompt is required');
          }
          const fieldDefs: ExtractFieldDef[] = Array.isArray(fields) ? fields.filter((f: any) => f?.name) : [];
          if (!fieldDefs.length) {
            ctx.throw(400, 'at least one child field is required');
          }

          const renderedPrompt = renderTemplate(String(prompt), values);
          const sysText = system ? String(system) : '';
          const srcItems = normalizeAttachments(attachment);

          // AUDIO source → Google REST rows path (the chat pipeline can't take audio).
          if (srcItems.some((it) => isAudioAttachment(it))) {
            const creds = await getServiceCredentials(ctx.db, llmService);
            if (!creds || creds.provider !== 'google-genai' || !creds.apiKey) {
              ctx.throw(400, 'Trích nhiều dòng từ audio hiện cần một service Google (google-genai) có API key.');
            }
            const audioParts: Array<{ mimeType: string; base64: string }> = [];
            for (const it of srcItems) {
              const a = await attachmentToMediaPart(ctx, it);
              if (a) audioParts.push(a);
            }
            if (!audioParts.length) ctx.throw(502, 'Không đọc được file audio nguồn.');
            const audioModel = model && String(model).trim() ? String(model) : 'gemini-2.5-flash';
            let out: any;
            try {
              out = await googleStructuredRowsFromMedia(creds.apiKey, audioModel, renderedPrompt, sysText, audioParts, fieldDefs, creds.baseURL);
            } catch (e: any) {
              ctx.log?.error?.('[ptdl-ai-column] audio extractRows failed: ' + (e?.message || e));
              ctx.throw(502, e?.message || 'Audio multi-row extraction failed');
            }
            const rows = postProcessRows(out?.rows, fieldDefs);
            // Key MUST be `lines`, not `rows`: NocoBase's list-response middleware unwraps a
            // top-level `rows` key into `data` (dropping siblings) — see memory. `lines` stays intact.
            ctx.body = { lines: rows, service: creds.serviceName, model: audioModel, mode: 'audio' };
            await next();
            return;
          }

          const aiPlugin = ctx.app.pm.get('ai');
          if (!aiPlugin || !aiPlugin.aiManager) {
            ctx.throw(400, 'AI plugin (@nocobase/plugin-ai) is not enabled');
          }

          let svc = llmService;
          let mdl = model;
          if (!svc || !mdl) {
            try {
              const resolved = await aiPlugin.aiManager.resolveModel({ llmService: svc, model: mdl });
              svc = resolved.llmService;
              mdl = resolved.model;
            } catch (e: any) {
              ctx.throw(400, e?.message || 'No LLM service configured. Add one in Settings → AI.');
            }
          }

          let provider: any;
          try {
            ({ provider } = await aiPlugin.aiManager.getLLMService({ llmService: svc, model: mdl }));
          } catch (e: any) {
            ctx.throw(400, e?.message || 'Invalid LLM service/model');
          }

          // Vision/file blocks from the source attachment field (0, 1, or many files) — same pipeline
          // as `extract`; when there are none, it's a pure text prompt (e.g. a pasted quote).
          const contentBlocks: any[] = [];
          const systemNotes: string[] = [];
          for (const item of srcItems) {
            const parsed = await attachmentToBlock(ctx, provider, item);
            if (!parsed) continue;
            if (parsed.placement === 'system') {
              systemNotes.push(typeof parsed.content === 'string' ? parsed.content : JSON.stringify(parsed.content));
            } else {
              contentBlocks.push(parsed.content);
            }
          }

          const humanContent: any = contentBlocks.length ? [...contentBlocks, { type: 'text', text: renderedPrompt }] : renderedPrompt;
          const sys = [sysText, ...systemNotes].filter((s) => s && s.trim()).join('\n\n');
          const messages: any[] = [];
          if (sys.trim()) messages.push(['system', sys.trim()]);
          messages.push(['human', humanContent]);

          let rows: any[];
          try {
            const result = await provider.invoke({
              messages,
              structuredOutput: { schema: buildRowsSchema(fieldDefs), name: 'ai_extract_rows', description: 'The extracted rows / line items.' },
            });
            const parsed = result && typeof result === 'object' && 'parsed' in result ? result.parsed : result;
            if (!parsed || typeof parsed !== 'object') {
              ctx.throw(502, 'AI did not return usable structured data');
            }
            rows = postProcessRows(parsed.rows, fieldDefs);
          } catch (e: any) {
            ctx.log?.error?.('[ptdl-ai-column] extractRows failed: ' + (e?.message || e));
            ctx.throw(502, e?.message || 'AI multi-row extraction failed');
          }

          // Key MUST be `lines`, not `rows`: NocoBase list-unwraps a top-level `rows` key into `data`.
          ctx.body = { lines: rows, service: svc, model: mdl };
          await next();
        },

        // Bulk helper: run AI Multi-row Extract (+ optional classify) into ONE parent record's
        // relation — used by the "Bulk AI Extract-rows" table action, per selected parent row.
        extractRowsInto: async (ctx: any, next: any) => {
          const v = (ctx.action?.params?.values as any) || {};
          const { collectionName, filterByTk, config } = v;
          if (!collectionName || filterByTk == null || !config) ctx.throw(400, 'collectionName, filterByTk and config are required');
          const rec = await ctx.db.getRepository(collectionName).findOne({ filterByTk });
          if (!rec) ctx.throw(404, 'record not found');
          const values = rec.toJSON ? rec.toJSON() : rec;
          try {
            ctx.body = await this.runExtractRowsInto(collectionName, filterByTk, values, config);
          } catch (e: any) {
            ctx.throw(502, e?.message || 'extractRowsInto failed');
          }
          await next();
        },

        // Media GENERATION (vs generate/extract which are text). Produces an image from a prompt
        // and saves it as a real attachment, returned for the client to drop into an attachment
        // field. Calls the provider's REST API directly (plugin-ai's reuse is chat-only), so it is
        // scoped to google-genai for now (the provider this environment has + verified live).
        generateImage: async (ctx: any, next: any) => {
          const body = (ctx.action?.params?.values as any) || {};
          const { llmService, model, prompt, values = {}, sourceImages } = body;

          if (!prompt || !String(prompt).trim()) {
            ctx.throw(400, 'prompt is required');
          }

          const creds = await getServiceCredentials(ctx.db, llmService);
          if (!creds) {
            ctx.throw(400, 'No LLM service configured. Add a Google (google-genai) service in Settings → AI.');
          }
          if (creds.provider !== 'google-genai') {
            ctx.throw(
              400,
              `Image generation currently supports Google (google-genai) services only — the selected service is "${creds.provider}".`,
            );
          }
          if (!creds.apiKey) {
            ctx.throw(400, 'The selected Google service has no API key configured.');
          }

          const rendered = renderTemplate(String(prompt), values);
          const mdl = model && String(model).trim() ? String(model) : 'gemini-2.5-flash-image';

          // img2img (#5): source image(s) passed from the client (the current value of the chosen
          // attachment field) → sent as input so the model EDITS them instead of generating fresh.
          const inputImages: Array<{ mimeType: string; base64: string }> = [];
          for (const it of normalizeAttachments(sourceImages)) {
            const m = await attachmentToMediaPart(ctx, it);
            if (m) inputImages.push(m);
          }

          let img: { buffer: Buffer; mimetype: string } | null;
          try {
            img = await googleGenerateImage(creds.apiKey, mdl, rendered, creds.baseURL, inputImages);
          } catch (e: any) {
            ctx.log?.error?.('[ptdl-ai-column] image generation failed: ' + (e?.message || e));
            ctx.throw(502, e?.message || 'Image generation failed');
          }
          if (!img) {
            ctx.throw(502, 'The model returned no image (it may have refused the prompt or output text only).');
          }

          let attachment: any;
          try {
            attachment = await saveBufferAsAttachment(ctx.app, img.buffer, img.mimetype, 'ai-image');
          } catch (e: any) {
            ctx.log?.error?.('[ptdl-ai-column] saving generated image failed: ' + (e?.message || e));
            ctx.throw(502, 'Generated the image but could not save it as an attachment: ' + (e?.message || e));
          }

          ctx.body = { attachment, service: creds.serviceName, model: mdl, mimetype: img.mimetype };
          await next();
        },

        // Voice / text-to-speech → save the audio as an attachment. Multi-provider (Google Gemini /
        // ElevenLabs / Vbee) — delegates to runVoiceCore, which branches by `provider` and pulls the
        // right credentials (Google from llmServices; ElevenLabs/Vbee from ptdlVoiceProvider).
        generateVoice: async (ctx: any, next: any) => {
          const body = (ctx.action?.params?.values as any) || {};
          if (!body.prompt || !String(body.prompt).trim()) {
            ctx.throw(400, 'prompt is required');
          }
          let attachment: any;
          try {
            attachment = await runVoiceCore(ctx.app, {
              provider: body.provider,
              prompt: body.prompt,
              values: body.values || {},
              llmService: body.llmService,
              model: body.model,
              voice: body.voice,
              style: body.style ? String(body.style) : undefined,
              credName: body.credName,
              voiceId: body.voiceId,
              elevenModel: body.elevenModel,
              speed: body.speed,
            });
          } catch (e: any) {
            const msg = e?.message || 'Voice generation failed';
            ctx.log?.error?.('[ptdl-ai-column] voice generation failed: ' + msg);
            ctx.throw(/cần|required|Chưa cấu hình|No LLM|configured/i.test(msg) ? 400 : 502, msg);
          }
          ctx.body = { attachment, provider: body.provider || 'google', mimetype: attachment?.mimetype };
          await next();
        },
      },
    });

    // Any logged-in user who can see the form may trigger a generation.
    this.app.acl.allow('ptdlAiColumn', 'generate', 'loggedIn');
    this.app.acl.allow('ptdlAiColumn', 'extract', 'loggedIn');
    this.app.acl.allow('ptdlAiColumn', 'extractRows', 'loggedIn');
    this.app.acl.allow('ptdlAiColumn', 'extractRowsInto', 'loggedIn');
    this.app.acl.allow('ptdlAiColumn', 'generateImage', 'loggedIn');
    this.app.acl.allow('ptdlAiColumn', 'generateVoice', 'loggedIn');
    this.app.acl.allow('ptdlAiColumn', 'setAutorun', 'loggedIn');
    this.app.acl.allow('ptdlAiColumn', 'removeAutorun', 'loggedIn');
    this.app.acl.allow('ptdlAiColumn', 'autorunErrors', 'loggedIn');
    this.app.acl.allow('ptdlAiColumn', 'embedMaster', 'loggedIn');
    this.app.acl.allow('ptdlAiColumn', 'classify', 'loggedIn');
    this.app.acl.allow('ptdlAiColumn', 'classifyBatch', 'loggedIn');
    this.app.acl.allow('ptdlAiColumn', 'classifyDeep', 'loggedIn');
    this.app.acl.allow('ptdlAiColumn', 'classifyFeedback', 'loggedIn');
    this.app.acl.allow('ptdlAiColumn', 'classifyStatus', 'loggedIn');
    this.app.acl.allow('ptdlAiColumn', 'classifyReindex', 'loggedIn');
    this.app.acl.allow('ptdlAiColumn', 'classifyClear', 'loggedIn');
    this.app.acl.allow('ptdlAiColumn', 'classifySchedule', 'loggedIn');
    this.app.acl.allow('ptdlAiColumn', 'listVoiceProviders', 'loggedIn');
    this.app.acl.allow('ptdlAiColumn', 'setVoiceProvider', 'loggedIn');
    this.app.acl.allow('ptdlAiColumn', 'removeVoiceProvider', 'loggedIn');
  }
}

export default PluginAiColumnServer;
