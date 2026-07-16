/**
 * Shared SERVER-side AI codegen (no React — safe to import from a plugin's server).
 *
 * One stateless LLM turn: NL instruction (+ optional current code + last validation error) → generated
 * code/template for a given `language`. The validate-and-retry LOOP lives on the CLIENT
 * (`AiCodegenButton`), because each surface validates by rendering/compiling in the browser
 * (echarts.init / hb.compile / iframe). The client re-calls this with `current`+`lastError` to fix.
 *
 * LLM path mirrors plugin-formula / plugin-ai-column exactly:
 *   app.pm.get('ai').aiManager → resolveModel → getLLMService → provider.invoke({ messages, structuredOutput }).
 */

export type CodegenLanguage =
  | 'html'
  | 'js'
  | 'css'
  | 'handlebars'
  | 'echarts-option'
  | 'echarts-transform'
  | 'formula'
  | 'token-template';

export interface CodegenContext {
  /** Available fields/columns the generated code may reference. */
  columns?: { name: string; type?: string; title?: string }[];
  /** A few real sample rows so the model bases code on actual data shape. */
  sampleRows?: any[];
  /** Names of helpers available in the target language (e.g. Handlebars helpers). */
  helpers?: string[];
  /** Valid tokens for a token-template surface. */
  tokens?: string[];
  /** Free-form extra guidance appended to the prompt. */
  extra?: string;
}

export interface CodegenReq {
  language: CodegenLanguage;
  instruction: string;
  /** Existing code to FIX/improve instead of writing from scratch. */
  current?: string;
  /** Validation error from the previous attempt — the model must fix it. */
  lastError?: string;
  context?: CodegenContext;
}

export interface CodegenResult {
  code?: string;
  explain?: string;
  error?: string;
}

/** Strip ``` fences / leading `language:` noise that models sometimes wrap code in. */
export function stripFences(s: any): string {
  let t = String(s ?? '').trim();
  const m = t.match(/^```[a-zA-Z0-9]*\s*([\s\S]*?)\s*```$/);
  if (m) t = m[1].trim();
  return t;
}

/** Pull plain text out of whatever shape provider.invoke returns without structuredOutput. */
export function aiExtractText(msg: any): string {
  if (msg == null) return '';
  if (typeof msg === 'string') return msg;
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) return msg.content.map((c: any) => (typeof c === 'string' ? c : c?.text || '')).join('');
  if (typeof msg.text === 'string') return msg.text;
  return String(msg);
}

/** Resolve the app's configured LLM provider (@nocobase/plugin-ai). */
export async function getAiProvider(app: any): Promise<{ provider?: any; error?: string }> {
  const aiPlugin: any = app?.pm?.get?.('ai');
  if (!aiPlugin?.aiManager) return { error: 'Chưa bật/cấu hình AI (@nocobase/plugin-ai)' };
  try {
    const resolved = await aiPlugin.aiManager.resolveModel({});
    const { provider } = await aiPlugin.aiManager.getLLMService({ llmService: resolved.llmService, model: resolved.model });
    return { provider };
  } catch (e: any) {
    return { error: 'Không lấy được model AI: ' + (e?.message || e) };
  }
}

function columnsBlock(ctx?: CodegenContext): string {
  if (!ctx?.columns?.length) return '';
  const lines = ctx.columns.map((c) => `- ${c.name}${c.type ? ` (${c.type})` : ''}${c.title && c.title !== c.name ? ` — ${c.title}` : ''}`);
  return `\n\nCỘT/FIELD CÓ THẬT (chỉ dùng những cái này):\n${lines.join('\n')}`;
}
function sampleBlock(ctx?: CodegenContext): string {
  if (!ctx?.sampleRows?.length) return '';
  let json = '';
  try {
    json = JSON.stringify(ctx.sampleRows.slice(0, 3), null, 0);
  } catch {
    return '';
  }
  if (json.length > 2000) json = json.slice(0, 2000) + '…';
  return `\n\nVÍ DỤ DỮ LIỆU (vài dòng đầu):\n${json}`;
}
function helpersBlock(ctx?: CodegenContext): string {
  if (!ctx?.helpers?.length) return '';
  return `\n\nHELPER CÓ SẴN: ${ctx.helpers.join(', ')}`;
}
function tokensBlock(ctx?: CodegenContext): string {
  if (!ctx?.tokens?.length) return '';
  return `\n\nTOKEN HỢP LỆ: ${ctx.tokens.map((t) => `{{${t}}}`).join(', ')}`;
}

const LANG_RULES: Record<CodegenLanguage, string> = {
  'echarts-option': [
    'Bạn viết MỘT biểu thức JavaScript trả về object `option` của Apache ECharts (echarts v5).',
    'Output CHỈ là object literal bắt đầu bằng `{` và kết thúc bằng `}` — KHÔNG `option =`, KHÔNG markdown, KHÔNG giải thích trong code.',
    'Biến `echarts` có sẵn nếu cần. Dùng đúng tên cột trong dữ liệu để map series/axis.',
  ].join(' '),
  'echarts-transform': [
    'Bạn viết THÂN một hàm JavaScript: nhận `data` (mảng dòng) và `echarts`, TRẢ VỀ object `option` của ECharts v5.',
    'Chỉ code, kết thúc bằng `return {...}`. KHÔNG markdown, KHÔNG khai báo `function`.',
  ].join(' '),
  handlebars: [
    'Bạn viết mẫu Handlebars (HTML) để IN một bản ghi ra giấy/PDF.',
    'Dùng `{{field}}` cho giá trị, `{{#each quanhe}}…{{/each}}` cho danh sách con, và CHỈ các helper được liệt kê.',
    'Trả về HTML thuần (có thể kèm <style>), KHÔNG markdown, KHÔNG ```.',
  ].join(' '),
  html: [
    'Bạn viết HTML (kèm CSS trong <style> nếu cần) cho một khối hiển thị.',
    'Nếu cần logic, giữ tối giản. KHÔNG markdown, KHÔNG ```, chỉ HTML.',
  ].join(' '),
  js: [
    'Bạn viết THÂN một đoạn JavaScript. Các biến `data` (object), `rows` (mảng), `helpers`, `scope` có sẵn.',
    'Chỉ code, KHÔNG markdown, KHÔNG ```.',
  ].join(' '),
  css: 'Bạn viết CSS thuần. KHÔNG markdown, KHÔNG ```.',
  formula: 'Bạn viết một biểu thức công thức kiểu Excel (một dòng). KHÔNG markdown.',
  'token-template': [
    'Bạn viết MỘT chuỗi template dùng token `{{field}}` (có thể kèm filter, vd `{{price | number:2}}`).',
    'CHỈ dùng token hợp lệ được liệt kê. Trả về đúng một dòng template, KHÔNG markdown.',
  ].join(' '),
};

/** Build the (system, human) messages for a codegen request. */
export function buildCodegenPrompt(req: CodegenReq): { system: string; human: string } {
  const ctx = req.context;
  const system =
    (LANG_RULES[req.language] || LANG_RULES.js) +
    columnsBlock(ctx) +
    sampleBlock(ctx) +
    helpersBlock(ctx) +
    tokensBlock(ctx) +
    (ctx?.extra ? `\n\n${ctx.extra}` : '');

  let human: string;
  if (req.current && req.lastError) {
    human =
      `Code hiện tại:\n${req.current}\n\n` +
      `Chạy thử bị LỖI: ${req.lastError}\n\n` +
      `Sửa lại cho CHẠY ĐÚNG, giữ nguyên ý định` +
      (req.instruction?.trim() ? ` (${req.instruction.trim()})` : '') +
      `. Trả code mới.`;
  } else if (req.current) {
    human = `Sửa/cải thiện code sau theo yêu cầu: ${req.instruction}\n\nCode hiện tại:\n${req.current}`;
  } else {
    human = `Yêu cầu: ${req.instruction}`;
  }
  return { system, human };
}

/** One codegen turn → { code, explain } (or { error }). Stateless; client drives validate+retry. */
export async function generateCode(app: any, req: CodegenReq): Promise<CodegenResult> {
  if (!req?.instruction?.trim() && !req?.current) return { error: 'Thiếu mô tả' };
  const { provider, error } = await getAiProvider(app);
  if (error) return { error };
  const { system, human } = buildCodegenPrompt(req);
  const schema = {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'Đoạn code/template được sinh — KHÔNG markdown.' },
      explain: { type: 'string', description: 'Giải thích ngắn gọn tiếng Việt (1 câu).' },
    },
    required: ['code'],
  };
  try {
    let code = '';
    let explain = '';
    try {
      const result = await provider.invoke({ messages: [['system', system], ['human', human]], structuredOutput: { schema, name: 'code', description: 'Code + giải thích.' } });
      const parsed = result && typeof result === 'object' && 'parsed' in result ? (result as any).parsed : result;
      code = stripFences(parsed?.code);
      explain = String(parsed?.explain || '');
    } catch {
      /* model may not support structured output → plain-text fallback below */
    }
    if (!code) {
      const msg = await provider.invoke({ messages: [['system', system + '\n\nTrả về DUY NHẤT code — KHÔNG giải thích, KHÔNG markdown.'], ['human', human]] });
      code = stripFences(aiExtractText(msg));
      explain = '';
    }
    if (!code) return { error: 'AI không trả về code' };
    return { code, explain };
  } catch (e: any) {
    return { error: 'Gọi AI lỗi: ' + (e?.message || e) };
  }
}
