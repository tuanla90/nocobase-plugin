import { Plugin } from '@nocobase/server';
import { ComputedManager } from './computed';
import { WindowManager } from './window';
import { ScanManager } from './scan';
import { buildFormulaSystemPrompt } from '../shared/formulaKnowledge';

// LLM output helpers (shared by all AI formula tools).
function stripFences(s: any): string {
  return String(s || '').replace(/```[a-z]*|```/gi, '').trim();
}
function aiExtractText(msg: any): string {
  if (msg == null) return '';
  const c = msg.content !== undefined ? msg.content : msg;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((b: any) => (typeof b === 'string' ? b : b?.text ?? b?.content ?? '')).join('');
  return String(c ?? '');
}

// Server lane. Two features:
//  - Rollup fields: a stored aggregate over a to-many relation that auto-updates when child rows
//    change (rollup.ts).
//  - Computed fields (Phase 1, local): a stored field recomputed from an Excel formula over the SAME
//    row on every save; config lives in the `ptdlComputedRules` collection (computed.ts).
// Everything else in this plugin is client-side.
export class PluginFormulaServer extends Plugin {
  computed: ComputedManager;
  window: WindowManager;
  scan: ScanManager;

  async load() {
    this.computed = new ComputedManager(this.db, this.app.logger);
    this.window = new WindowManager(this.db, this.app.logger);
    this.scan = new ScanManager(this.db, this.app.logger);
    // Same live-refresh convention as computed: when a partition recompute settles, tell clients to refetch.
    this.window.notify = (collections) => {
      try {
        this.app.emit('ws:sendToCurrentApp', { message: { type: 'ptdl:live-refresh', payload: { collections } } });
      } catch (e: any) {
        this.app.logger?.warn?.(`[ptdl-window] ws notify failed: ${e?.message || e}`);
      }
    };
    this.scan.notify = (collections) => {
      try {
        this.app.emit('ws:sendToCurrentApp', { message: { type: 'ptdl:live-refresh', payload: { collections } } });
      } catch (e: any) {
        this.app.logger?.warn?.(`[ptdl-scan] ws notify failed: ${e?.message || e}`);
      }
    };
    // Keep the DERIVED computed columns (avg = value/qty …) in sync after the scan writes its primitives
    // with hooks:false (which wouldn't otherwise re-fire the computed rule) — scoped to the affected rows.
    this.scan.derive = async (collection, ids, fields) => {
      for (const id of ids) for (const f of fields) { try { await this.computed.recomputeOne(collection, id, f); } catch { /* no rule / ignore */ } }
    };
    // When a cascade settles, push a WebSocket signal so clients refetch exactly the affected blocks the
    // MOMENT the recompute is truly done (robust replacement for the client's 220ms optimistic guess —
    // covers large fan-outs that take longer). Reusable convention (shared with other @ptdl live features):
    // broadcast `{ type: 'ptdl:live-refresh', payload: { collections } }` to every client of this app.
    this.computed.notify = (collections) => {
      try {
        this.app.emit('ws:sendToCurrentApp', { message: { type: 'ptdl:live-refresh', payload: { collections } } });
      } catch (e: any) {
        this.app.logger?.warn?.(`[ptdl-computed] ws notify failed: ${e?.message || e}`);
      }
    };

    // --- Computed fields: config store (a "global rule" collection, edited from the column ⚙ UI) ---
    // `title` (+ per-field uiSchema) makes this a NORMAL visible collection, so the user can drop a
    // table/form block on it to view & edit every computed rule in one place (like ptdlAiAutorunLog).
    const ui = (title: string, comp = 'Input', extra: any = {}) => ({
      type: comp === 'Checkbox' ? 'boolean' : 'string',
      title,
      'x-component': comp,
      'x-decorator': 'FormItem',
      ...extra,
    });
    this.db.collection({
      name: 'ptdlComputedRules',
      title: 'Công thức tự tính (Computed rules)',
      fields: [
        { type: 'string', name: 'key', unique: true, uiSchema: ui('Key (auto)', 'Input', { 'x-read-pretty': true }) }, // `${dataSourceKey}:${collectionName}.${targetField}`
        { type: 'string', name: 'dataSourceKey', defaultValue: 'main', uiSchema: ui('Data source') },
        { type: 'string', name: 'collectionName', uiSchema: ui('Bảng (collection)') },
        { type: 'string', name: 'targetField', uiSchema: ui('Cột đích (field số thật)') }, // a REAL stored field
        { type: 'text', name: 'formula', uiSchema: ui('Công thức (data.<field>)', 'Input.TextArea', { 'x-component-props': { autoSize: { minRows: 2 } } }) },
        { type: 'json', name: 'deps' }, // auto-derived server-side; not shown by default
        { type: 'string', name: 'runOn', defaultValue: 'create,update,source', uiSchema: { type: 'string', title: 'Tính khi', 'x-component': 'Select', 'x-decorator': 'FormItem', enum: [{ label: 'Tạo + Sửa + Nguồn (luôn đúng)', value: 'create,update,source' }, { label: 'Tạo + Sửa (mở form là tính, không lan)', value: 'create,update' }, { label: 'Sửa + Nguồn (luôn đúng, không tính lúc tạo)', value: 'update,source' }, { label: 'Chỉ khi tạo (chốt số)', value: 'create' }] } },
        { type: 'boolean', name: 'enabled', defaultValue: true, uiSchema: ui('Bật', 'Checkbox') },
        { type: 'string', name: 'onError', defaultValue: 'null', uiSchema: { type: 'string', title: 'Khi lỗi', 'x-component': 'Select', 'x-decorator': 'FormItem', enum: [{ label: 'Ghi null', value: 'null' }, { label: 'Giữ giá trị cũ', value: 'keep' }] } },
      ],
    });
    try {
      await this.db.getCollection('ptdlComputedRules').sync();
    } catch (e: any) {
      this.app.logger?.warn?.(`[ptdl-computed] ptdlComputedRules sync failed: ${e?.message || e}`);
    }

    // --- Scan/costing rules: config for the stateful ordered-scan mode (FIFO / weighted-average) ---
    this.db.collection({
      name: 'ptdlScanRules',
      title: 'Giá vốn — sổ có trạng thái (Scan rules)',
      fields: [
        { type: 'string', name: 'key', unique: true, uiSchema: ui('Key (auto)', 'Input', { 'x-read-pretty': true }) },
        { type: 'string', name: 'title', uiSchema: ui('Tên') },
        { type: 'string', name: 'collectionName', uiSchema: ui('Bảng sổ (collection)') },
        { type: 'json', name: 'partitionBy' }, // ['product_id','warehouse']
        { type: 'json', name: 'orderBy' }, // [{field:'moved_at',dir:'asc'}, …]
        { type: 'string', name: 'method', defaultValue: 'weighted_avg', uiSchema: { type: 'string', title: 'Chiến lược phân bổ', 'x-component': 'Select', 'x-decorator': 'FormItem', enum: [{ label: 'FIFO', value: 'fifo' }, { label: 'LIFO', value: 'lifo' }, { label: 'FEFO (hết hạn trước)', value: 'fefo' }, { label: 'Bình quân gia quyền', value: 'weighted_avg' }] } },
        { type: 'string', name: 'qtyMode', defaultValue: 'signed', uiSchema: ui('Kiểu nhập lượng') },
        { type: 'string', name: 'qtyField', uiSchema: ui('Cột lượng có dấu (+ vào / − ra)') },
        { type: 'string', name: 'inQtyField', uiSchema: ui('Cột lượng VÀO') },
        { type: 'string', name: 'outQtyField', uiSchema: ui('Cột lượng RA') },
        { type: 'string', name: 'directionField', uiSchema: ui('Cột phân loại (in/out)') },
        { type: 'string', name: 'inValue', uiSchema: ui('Giá trị = VÀO') },
        { type: 'text', name: 'qtyFormula', uiSchema: ui('Công thức lượng', 'Input.TextArea') },
        { type: 'string', name: 'costMode', defaultValue: 'column', uiSchema: ui('Kiểu nhập đơn giá') },
        { type: 'string', name: 'costField', uiSchema: ui('Cột đơn giá (dòng vào)') },
        { type: 'text', name: 'costFormula', uiSchema: ui('Công thức đơn giá', 'Input.TextArea') },
        { type: 'string', name: 'expiryField', uiSchema: ui('Cột hạn dùng (cho FEFO)') },
        { type: 'double', name: 'roundPrecision', uiSchema: ui('Số lẻ làm tròn', 'InputNumber') },
        { type: 'string', name: 'roundMode', defaultValue: 'half_up', uiSchema: ui('Cách làm tròn') },
        { type: 'string', name: 'negativePolicy', defaultValue: 'allow', uiSchema: ui('Xuất quá tồn') },
        { type: 'string', name: 'missingCostPolicy', defaultValue: 'zero', uiSchema: ui('Thiếu đơn giá') },
        { type: 'string', name: 'outRunningQty', uiSchema: ui('Ghi: số dư lượng') },
        { type: 'string', name: 'outRunningValue', uiSchema: ui('Ghi: số dư giá trị') },
        { type: 'string', name: 'outConsumedQty', uiSchema: ui('Ghi: lượng tiêu hao') },
        { type: 'string', name: 'outCogs', uiSchema: ui('Ghi: giá trị tiêu hao (COGS)') },
        { type: 'string', name: 'outConsumedUnitCost', uiSchema: ui('Ghi: đơn giá tiêu hao') },
        { type: 'string', name: 'outUnitCost', uiSchema: ui('Ghi: đơn giá đã định (dòng này)') },
        { type: 'string', name: 'outAvgCost', uiSchema: ui('Ghi: đơn giá bình quân') },
        { type: 'text', name: 'outAllocations', uiSchema: ui('Ghi: truy vết lô (JSON)', 'Input.TextArea') },
        { type: 'boolean', name: 'enabled', defaultValue: true, uiSchema: ui('Bật', 'Checkbox') },
      ],
    });
    try {
      await this.db.getCollection('ptdlScanRules').sync();
    } catch (e: any) {
      this.app.logger?.warn?.(`[ptdl-scan] ptdlScanRules sync failed: ${e?.message || e}`);
    }
    this.app.acl.allow('ptdlScanRules', ['list', 'get'], 'loggedIn');
    this.db.on('ptdlScanRules.beforeCreate', (model: any) => {
      if (!model.get('key')) {
        const c = model.get('collectionName');
        const out = model.get('outCogs') || model.get('outAvgCost') || model.get('outRunningValue') || model.get('outUnitCost') || 'scan';
        if (c) model.set('key', `${c}.${model.get('method') || 'cost'}.${out}`);
      }
    });
    // READ is open to any logged-in user so the in-form ⓘ tooltip can show the formula everywhere. WRITE
    // (create/update/updateOrCreate/destroy) is NOT — it's gated by the `pm.data-source-manager.ptdl-computed`
    // snippet registered below (admins / data-source managers + root only).
    this.app.acl.allow('ptdlComputedRules', ['list', 'get'], 'loggedIn');
    // Auto-fill the unique `key` when a rule is created from a plain block (user only fills
    // collection + field + formula). key = `${dataSourceKey}:${collectionName}.${targetField}`.
    this.db.on('ptdlComputedRules.beforeCreate', (model: any) => {
      if (!model.get('key')) {
        const c = model.get('collectionName');
        const f = model.get('targetField');
        if (c && f) model.set('key', `${model.get('dataSourceKey') || 'main'}:${c}.${f}`);
      }
    });

    // Initial scan/load once all collections (incl. user collections) are loaded.
    this.app.on('afterStart', async () => {
      try {
        this.window.scan();
      } catch (e) {
        this.app.logger?.error?.(`[ptdl-window] initial scan failed: ${(e as any)?.message}`);
      }
      try {
        await this.computed.loadRules();
      } catch (e) {
        this.app.logger?.error?.(`[ptdl-computed] initial load failed: ${(e as any)?.message}`);
      }
      try {
        await this.scan.loadRules();
      } catch (e) {
        this.app.logger?.error?.(`[ptdl-scan] initial load failed: ${(e as any)?.message}`);
      }
    });

    // Reload scan rules + backfill the affected collection when a scan rule row changes.
    const onScanRuleChange = (model: any, options: any) => {
      const col = model?.get?.('collectionName');
      const run = async () => { await this.scan.loadRules(); if (col) await this.scan.recomputeAll({ collection: col }); };
      const t = options?.transaction;
      const go = () => run().catch((e) => this.app.logger?.error?.(`[ptdl-scan] rule-change reload/backfill failed: ${e?.message || e}`));
      if (t && typeof t.afterCommit === 'function') t.afterCommit(go);
      else go();
    };
    this.db.on('ptdlScanRules.afterSave', onScanRuleChange);
    this.db.on('ptdlScanRules.afterDestroy', onScanRuleChange);

    // Re-scan window defs when a field definition changes (field added / edited / removed).
    const rescan = () => {
      try {
        this.window.scan();
      } catch (e) {
        this.app.logger?.error?.(`[ptdl-window] rescan failed: ${(e as any)?.message}`);
      }
    };
    for (const ev of ['fields.afterSave', 'fields.afterCreate', 'fields.afterUpdate', 'fields.afterDestroy']) {
      this.db.on(ev, rescan);
    }

    // When a rule row changes: reload the cache (re-derive deps, re-attach hooks, re-rank) THEN
    // backfill the affected collection so existing rows reflect the new/edited formula immediately.
    // Runs after commit so the rule row is committed before we read it.
    const onRuleChange = (model: any, options: any) => {
      const col = model?.get?.('collectionName');
      const run = async () => {
        await this.computed.loadRules();
        if (col) await this.computed.recomputeAll({ collection: col });
      };
      const t = options?.transaction;
      const go = () => run().catch((e) => this.app.logger?.error?.(`[ptdl-computed] rule-change reload/backfill failed: ${e?.message || e}`));
      if (t && typeof t.afterCommit === 'function') t.afterCommit(go);
      else go();
    };
    this.db.on('ptdlComputedRules.afterSave', onRuleChange);
    this.db.on('ptdlComputedRules.afterDestroy', onRuleChange);

    // Manual backfill / drift fix: POST /api/ptdlComputed:recompute?collection=&field=  (computed formulas)
    // (the old ptdlRollup:recompute was removed — aggregates are computed rules now.)

    // Window/ledger backfill: POST /api/ptdlWindow:recompute?collection=&field=  (one window pass over the table)
    this.app.resourceManager.define({
      name: 'ptdlWindow',
      actions: {
        recompute: async (ctx: any, next: any) => {
          const { collection, field } = ctx.action.params || {};
          const count = await this.window.recomputeAll({ collection, field });
          ctx.body = { recomputed: count };
          await next();
        },
        // Central management page: every window field across all collections (read-only).
        list: async (ctx: any, next: any) => {
          ctx.body = { list: this.window.list() };
          await next();
        },
      },
    });
    // `list` is read-only metadata → any logged-in user (so the settings page loads); `recompute` writes.
    this.app.acl.allow('ptdlWindow', ['recompute', 'list'], 'loggedIn');

    // Scan/costing backfill: POST /api/ptdlScan:recompute?collection=  (re-scan every partition of the rule)
    this.app.resourceManager.define({
      name: 'ptdlScan',
      actions: {
        recompute: async (ctx: any, next: any) => {
          const { collection } = ctx.action.params || {};
          const count = await this.scan.recomputeAll({ collection });
          ctx.body = { recomputed: count };
          await next();
        },
        // Period close / point-in-time: on-hand qty+value per partition as of an optional cutoff (read-only).
        closing: async (ctx: any, next: any) => {
          const { collection, asOf } = ctx.action.params || {};
          ctx.body = { closing: await this.scan.closing({ collection, asOf }) };
          await next();
        },
      },
    });
    this.app.acl.allow('ptdlScan', ['recompute', 'closing'], 'loggedIn');

    this.app.resourceManager.define({
      name: 'ptdlComputed',
      actions: {
        recompute: async (ctx: any, next: any) => {
          const { collection, field } = ctx.action.params || {};
          const count = await this.computed.recomputeAll({ collection, field });
          ctx.body = { recomputed: count };
          await next();
        },
        // Collections whose mutations can change a computed value — the client auto-refreshes page
        // blocks after a mutation on one of these (so numbers update without a manual F5).
        collections: async (ctx: any, next: any) => {
          ctx.body = { collections: this.computed.involvedCollections() };
          await next();
        },
        // Dependency graph (nodes + edges) for the settings-page DAG view.
        graph: async (ctx: any, next: any) => {
          ctx.body = this.computed.graph();
          await next();
        },
        // Live preview: evaluate a formula against one record without writing.
        test: async (ctx: any, next: any) => {
          const v = ctx.action?.params?.values || ctx.action?.params || {};
          ctx.body = await this.computed.testFormula(v.collection, v.formula, v.filterByTk);
          await next();
        },
        // AI formula tools — all self-validate via testFormula: write/fix (aiWrite), suggest N (aiSuggest),
        // explain an existing formula (aiExplain).
        aiWrite: async (ctx: any, next: any) => {
          const v = ctx.action?.params?.values || {};
          ctx.body = await this.aiWriteFormula(v.collection, v.description, v.sampleId, v.fixFormula);
          await next();
        },
        aiSuggest: async (ctx: any, next: any) => {
          const v = ctx.action?.params?.values || {};
          ctx.body = await this.aiSuggestFormulas(v.collection, v.description, v.count || 3, v.sampleId);
          await next();
        },
        aiExplain: async (ctx: any, next: any) => {
          const v = ctx.action?.params?.values || {};
          ctx.body = await this.aiExplainFormula(v.collection, v.formula);
          await next();
        },
      },
    });
    // `collections` runs for EVERY user at client load (loadComputedCollections → auto-refresh list) and
    // returns only metadata, so it stays open to all logged-in users. Everything else on this resource
    // WRITES / recomputes / spends AI credits — gated below.
    this.app.acl.allow('ptdlComputed', ['collections'], 'loggedIn');
    // Editing a computed rule = configuring the data source. Gate all WRITE + editor/AI/recompute actions
    // (on both `ptdlComputedRules` and `ptdlComputed`) behind a data-source-manager snippet, so ONLY admins
    // / data-source managers (roles with pm.* or pm.data-source-manager access) — and root (which bypasses
    // ACL) — can do them. Closes the hole where ANY logged-in user could edit rules or spend AI credits via
    // the API. The client `canEditRules` gate hides the affordance; this is the real server enforcement.
    this.app.acl.registerSnippet({
      name: 'pm.data-source-manager.ptdl-computed',
      actions: [
        'ptdlComputedRules:create',
        'ptdlComputedRules:update',
        'ptdlComputedRules:updateOrCreate',
        'ptdlComputedRules:destroy',
        'ptdlComputed:recompute',
        'ptdlComputed:graph',
        'ptdlComputed:test',
        'ptdlComputed:aiWrite',
        'ptdlComputed:aiSuggest',
        'ptdlComputed:aiExplain',
        'ptdlScanRules:create',
        'ptdlScanRules:update',
        'ptdlScanRules:updateOrCreate',
        'ptdlScanRules:destroy',
        'ptdlScan:recompute',
      ],
    });
  }

  /** Resolve the app's configured LLM provider (@nocobase/plugin-ai, same path as plugin-ai-column). */
  private async getAiProvider(): Promise<{ provider?: any; error?: string }> {
    const aiPlugin: any = this.app.pm.get('ai');
    if (!aiPlugin?.aiManager) return { error: 'Chưa bật/cấu hình AI (@nocobase/plugin-ai)' };
    try {
      const resolved = await aiPlugin.aiManager.resolveModel({});
      const { provider } = await aiPlugin.aiManager.getLLMService({ llmService: resolved.llmService, model: resolved.model });
      return { provider };
    } catch (e: any) {
      return { error: 'Không lấy được model AI: ' + (e?.message || e) };
    }
  }

  /** One LLM turn → {formula, explanation}. Structured output with a plain-text fallback. */
  private async invokeFormula(provider: any, system: string, human: string): Promise<{ formula: string; explanation: string }> {
    const schema = {
      type: 'object',
      properties: {
        formula: { type: 'string', description: 'Biểu thức công thức, không markdown.' },
        explanation: { type: 'string', description: 'Giải thích ngắn gọn tiếng Việt (1 câu).' },
      },
      required: ['formula'],
    };
    let parsed: any = null;
    try {
      const result = await provider.invoke({ messages: [['system', system], ['human', human]], structuredOutput: { schema, name: 'formula', description: 'Công thức + giải thích.' } });
      parsed = result && typeof result === 'object' && 'parsed' in result ? result.parsed : result;
    } catch {
      /* model may not support structured output → fall through to plain text */
    }
    let formula = stripFences(parsed?.formula);
    let explanation = String(parsed?.explanation || '');
    if (!formula) {
      const msg = await provider.invoke({ messages: [['system', system + '\n\nTrả về DUY NHẤT biểu thức công thức trên 1 dòng — KHÔNG giải thích, KHÔNG markdown.'], ['human', human]] });
      formula = stripFences(aiExtractText(msg));
      explanation = '';
    }
    return { formula, explanation };
  }

  /** AI drafts (or FIXES, if `fixFormula` set) a formula, then SELF-VALIDATES via `testFormula`,
   *  retrying with the error fed back — up to 3 tries. */
  async aiWriteFormula(collection: string, description: string, sampleId?: any, fixFormula?: string): Promise<any> {
    if (!collection) return { error: 'Thiếu bảng' };
    if (!fixFormula && !description?.trim()) return { error: 'Thiếu mô tả' };
    const { provider, error } = await this.getAiProvider();
    if (error) return { error };
    const system = buildFormulaSystemPrompt(this.computed.describeCollection(collection));
    let human: string;
    if (fixFormula) {
      const t0 = await this.computed.testFormula(collection, fixFormula, sampleId);
      human = `Sửa công thức sau cho CHẠY ĐÚNG (giữ nguyên ý định):\n${fixFormula}\n` +
        (t0?.error ? `Lỗi hiện tại: ${t0.error}` : '(hiện chạy được — chỉ chỉnh nếu thật cần)') +
        (description?.trim() ? `\nGhi chú thêm: ${description}` : '');
    } else {
      human = `Yêu cầu: ${description}`;
    }
    let formula = '', explanation = '', test: any = null, tries = 0;
    for (let i = 0; i < 3; i++) {
      tries++;
      try {
        ({ formula, explanation } = await this.invokeFormula(provider, system, human));
      } catch (e: any) {
        return { error: 'Gọi AI lỗi: ' + (e?.message || e), formula, tries };
      }
      if (!formula) return { error: 'AI không trả về công thức', tries };
      test = await this.computed.testFormula(collection, formula, sampleId);
      if (!test?.error) break; // valid → done
      human = `Công thức bạn vừa cho: ${formula}\nChạy thử bị LỖI: ${test.error}\nSửa lại, CHỈ dùng field/quan hệ/bảng CÓ THẬT trong schema. Trả công thức mới.`;
    }
    return { formula, explanation, test, tries };
  }

  /** AI suggests N alternative formulas (different approaches) for a description; each is validated. */
  async aiSuggestFormulas(collection: string, description: string, count = 3, sampleId?: any): Promise<any> {
    if (!collection || !description?.trim()) return { error: 'Thiếu bảng hoặc mô tả' };
    const { provider, error } = await this.getAiProvider();
    if (error) return { error };
    const n = Math.max(2, Math.min(4, Number(count) || 3));
    const system = buildFormulaSystemPrompt(this.computed.describeCollection(collection)) +
      `\n\nĐưa ra ${n} PHƯƠNG ÁN công thức KHÁC NHAU (cách tiếp cận / hàm khác nhau) cho cùng yêu cầu, kèm giải thích ngắn từng phương án.`;
    const schema = {
      type: 'object',
      properties: { options: { type: 'array', items: { type: 'object', properties: { formula: { type: 'string' }, explanation: { type: 'string' } }, required: ['formula'] } } },
      required: ['options'],
    };
    let options: any[] = [];
    try {
      const result = await provider.invoke({ messages: [['system', system], ['human', `Yêu cầu: ${description}`]], structuredOutput: { schema, name: 'options', description: `${n} phương án công thức.` } });
      const parsed = result && typeof result === 'object' && 'parsed' in result ? result.parsed : result;
      options = Array.isArray(parsed?.options) ? parsed.options : [];
    } catch (e: any) {
      return { error: 'Gọi AI lỗi: ' + (e?.message || e) };
    }
    options = options.slice(0, n).map((o: any) => ({ formula: stripFences(o?.formula), explanation: String(o?.explanation || '') })).filter((o: any) => o.formula);
    if (!options.length) return { error: 'AI không trả về phương án nào' };
    for (const o of options) o.test = await this.computed.testFormula(collection, o.formula, sampleId);
    return { options };
  }

  /** AI explains an existing formula in plain Vietnamese (no re-writing). */
  async aiExplainFormula(collection: string, formula: string): Promise<any> {
    if (!collection || !formula?.trim()) return { error: 'Thiếu bảng hoặc công thức' };
    const { provider, error } = await this.getAiProvider();
    if (error) return { error };
    const system = 'Bạn giải thích 1 công thức "computed field" cho người dùng cuối: NGẮN GỌN tiếng Việt (2–4 câu), nói rõ nó TÍNH GÌ và ý nghĩa từng phần. KHÔNG viết lại công thức.\n\n' +
      buildFormulaSystemPrompt(this.computed.describeCollection(collection));
    try {
      const msg = await provider.invoke({ messages: [['system', system], ['human', `Giải thích công thức này: ${formula}`]] });
      return { explanation: aiExtractText(msg).trim() };
    } catch (e: any) {
      return { error: 'Gọi AI lỗi: ' + (e?.message || e) };
    }
  }
}

export default PluginFormulaServer;
