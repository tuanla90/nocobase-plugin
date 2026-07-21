import React from 'react';
import { AutoComplete, Button, Checkbox, Input, InputNumber, Switch, Popover, Typography } from 'antd';
import { observer, useForm } from '@formily/react';
import { visibleWhen, fi, SEG_PROPS, PreviewBox, registerSettingsKit, st, SegmentedGroup, FieldPickerCascader, getCaretElement, insertAtCaret, getFields } from '@tuanla90/shared';
import { listFunctionNames, evaluateFormula, resultToString } from './formulaEngine';
import { TRIGGER_OPTIONS, splitTriggers } from './formulaKnowledge';
import { applyFormulaFormat, DATE_FORMAT_PRESETS } from './formulaFormat';
import { ComputedRuleEditorField } from './ComputedRuleEditor';
import { t } from './i18n';

/**
 * Shared flow-settings editor components for both the Formula display field and the
 * standalone Formula column. Registered once via registerFormulaComponents(flowSettings)
 * and referenced by string name ('FormulaCodeInput' etc.) in each model's uiSchema.
 */

// Category labels + function-reference lists for the "ƒ" help popover. Vietnamese-source (= i18n key);
// the labels + the HTML row (which embeds Vietnamese "màu") are translated at render via t(). The pure
// function-name rows are identical in both languages, so t() simply returns them unchanged.
const HELP_GROUPS: Array<[string, string]> = [
  ['Văn bản', 'CONCATENATE · TEXTJOIN(sep,bỏ_ô_trống,…) · LEFT · RIGHT · MID · UPPER · LOWER · PROPER · TRIM · LEN · SUBSTITUTE · TEXT · REPT · SPLIT · CONTAINS · STARTSWITH · ENDSWITH'],
  ['Regex', 'REGEXMATCH(text,"mẫu") · REGEXEXTRACT(text,"[0-9]+") · REGEXREPLACE(text,"mẫu","thay"). Lưu ý: \\d \\w \\s phải nhân đôi → "\\\\d+"'],
  ['Danh sách/mảng', 'LIST(a,b,…) · UNIQUE(mảng) · DISTINCT · ANY(mảng) · IN(x,mảng) · SPLIT(text,sep) — đếm phần tử bằng COUNTA'],
  ['Logic', 'IF · IFS · SWITCH · AND · OR · NOT · IFERROR · ISBLANK · ISNUMBER'],
  ['Số', 'SUM · AVERAGE · MIN · MAX · COUNT · ROUND · ROUNDUP · ROUNDDOWN · ABS · MOD · POWER · CEILING · FLOOR'],
  ['Ngày', 'TODAY · NOW · DATE · YEAR · MONTH · DAY · DATEDIF · EDATE · TEXT(date,"dd/mm/yyyy")'],
  ['Tra cứu', 'VLOOKUP · INDEX · MATCH · CHOOSE'],
  ['HTML', 'B · I · U · BR · COLOR(x,màu) · BG · TAG(text,màu) · DOT(màu,size) · LINK(url,text) · IMG(src,size)'],
];

// ---- Lightweight formula syntax highlighter (regex tokenizer, NO external dependency) ----
// Colors are a small fixed palette tuned for antd Tooltip's dark bubble background (`colorBgSpotlight`,
// which stays dark-near-black regardless of the app's light/dark theme — confirmed no override in the
// branding plugin) — unlike the rest of this plugin's UI, this specific backdrop is NOT theme-dependent,
// so a hardcoded (VS Code Dark+ -like) palette is safe here.
const HL_STRING = '#ce9178'; // "literal text"
const HL_NUMBER = '#b5cea8'; // 42 / TRUE / FALSE
const HL_FN = '#dcdcaa'; // SUM( IF( SELECT(
const HL_REF = '#9cdcfe'; // data.field / table.col
// Alternation order = priority at a given position (regex tries left→right, first success wins):
// string → data.<path> → <table>.<path> → TRUE/FALSE → number → <fn-name>( — everything else (operators,
// punctuation, whitespace, bare unqualified identifiers) is left as plain, uncolored text.
const FORMULA_TOKEN_RE =
  /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(data(?:\.[A-Za-z_$][\w$]*)+)|([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)|(\bTRUE\b|\bFALSE\b)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*(?=\s*\())/gi;

/** Render a formula string with lightweight syntax coloring — strings/field-refs/numbers/function names get
 *  a distinct color, like a code editor. Pure regex tokenizer (no CodeMirror/Prism dependency); unmatched
 *  spans (operators, punctuation, plain identifiers) render as plain text so it degrades gracefully on any
 *  input, including formulas the tokenizer doesn't fully understand. */
export function highlightFormula(formula: string): React.ReactNode {
  if (!formula) return formula;
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  FORMULA_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FORMULA_TOKEN_RE.exec(formula))) {
    if (m.index > last) out.push(formula.slice(last, m.index));
    const [, str, dataPath, dotPath, bool, num, fn] = m;
    const color = str !== undefined ? HL_STRING
      : dataPath !== undefined || dotPath !== undefined ? HL_REF
      : bool !== undefined || num !== undefined ? HL_NUMBER
      : fn !== undefined ? HL_FN
      : undefined;
    out.push(color ? <span key={key++} style={{ color }}>{m[0]}</span> : m[0]);
    last = m.index + m[0].length;
    if (m[0].length === 0) FORMULA_TOKEN_RE.lastIndex++; // safety: never loop on a zero-length match
  }
  if (last < formula.length) out.push(formula.slice(last));
  return out;
}

// Fixed "code editor" chrome (dark, regardless of the app's own light/dark theme) — same reasoning as the
// syntax-highlight palette above: keeping the code surface always-dark means one palette works everywhere,
// with guaranteed contrast, instead of needing a light AND a dark token variant.
const HL_BG = '#1e1e1e';
const HL_FG = '#d4d4d4';
const HL_BORDER = '#3c3c3c';
const HL_PLACEHOLDER = '#6a6a6a';

/** Read-only formula snippet in a small dark "code chip" (table cells, the DAG's active-node line, etc.) —
 *  same syntax colors as the field-hint tooltip, just packaged for inline/compact use. */
export function FormulaCode({ formula, style }: { formula: string; style?: React.CSSProperties }) {
  return (
    <code
      style={{
        display: 'inline-block', maxWidth: '100%', background: HL_BG, color: HL_FG, padding: '3px 7px',
        borderRadius: 4, border: `1px solid ${HL_BORDER}`, fontFamily: 'monospace', fontSize: 12,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word', ...style,
      }}
    >
      {highlightFormula(formula)}
    </code>
  );
}

/**
 * A formula-editing textarea with LIVE syntax highlighting — the classic "poor man's code editor" overlay:
 * a `<pre>` renders the highlighted text in normal flow (so it sets the box's height), and a transparent-text
 * `<textarea>` sits absolutely on top (same font metrics) to receive input — the highlighted `<pre>` shows
 * through, and only the caret is visible over it. No editor dependency (CodeMirror/Monaco) needed.
 * `ref` is forwarded straight to the native `<textarea>` DOM node, so it plugs into the existing
 * `getCaretElement`/`insertAtCaret` "+ Chèn field" helpers unchanged (they accept a raw textarea element).
 */
export const HighlightedTextArea = React.forwardRef<
  HTMLTextAreaElement,
  {
    value?: string;
    onChange: (v: string) => void;
    placeholder?: string;
    minRows?: number;
    style?: React.CSSProperties;
    onFocus?: () => void;
    onBlur?: () => void;
  }
>(({ value, onChange, placeholder, minRows = 3, style, onFocus, onBlur }, ref) => {
  const fontSize = (style?.fontSize as number) || 13;
  const lineHeight = 1.55;
  const pad = 8;
  const font: React.CSSProperties = { fontFamily: 'monospace', fontSize, lineHeight, boxSizing: 'border-box' };
  return (
    <div style={{ position: 'relative', minHeight: minRows * fontSize * lineHeight + pad * 2, background: HL_BG, border: `1px solid ${HL_BORDER}`, borderRadius: 6, ...style }}>
      <pre aria-hidden style={{ margin: 0, padding: pad, whiteSpace: 'pre-wrap', wordBreak: 'break-word', minHeight: minRows * fontSize * lineHeight, color: HL_FG, pointerEvents: 'none', ...font }}>
        {value ? highlightFormula(value) : <span style={{ color: HL_PLACEHOLDER }}>{placeholder}</span>}
        {'\n'}
      </pre>
      <textarea
        ref={ref}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        spellCheck={false}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%', resize: 'none', border: 'none',
          outline: 'none', background: 'transparent', color: 'transparent', caretColor: HL_FG, padding: pad, margin: 0, ...font,
        }}
      />
    </div>
  );
});
HighlightedTextArea.displayName = 'HighlightedTextArea';

// Formula textarea + a "ƒ" help popover + an INLINE "✨ AI viết hộ" panel (no modal). When the uiSchema
// passes `collection`+`getApi` (display-field / column models), the AI writes/fixes straight into the
// field via the proven server writer `ptdlComputed:aiWrite` (NL → formula, self-validated via
// testFormula) — the form's own Preview box re-evaluates automatically, so it all stays on one screen.
export function FormulaCodeInput(props: any) {
  const { value, onChange } = props;
  // IMPORTANT: the apiClient arrives as a getter `getApi()`, NOT as a plain `api` object. Passing the
  // client object through a flow-engine `x-component-props` strips its methods during schema compile
  // (only functions/strings survive — that is why the field picker was disabled and AI said "Missing
  // collection or API connection": `props.api` was a methodless clone with no `.request`). A closure
  // survives, so we call it to get the real client. Fall back to a direct `api` prop for any other caller.
  const api = (typeof props.getApi === 'function' ? props.getApi() : null) || props.api;
  const hasApi = !!(props.collection && api?.request);
  const taRef = React.useRef<any>(null);
  // Insert `data.<path>` at the caret (or append). For a to-many relation path (e.g. items.amount)
  // the user wraps it in SUM/AVERAGE… — the ƒ help documents `SUM(data.rel.field)`.
  const insertColumn = (path: string[]) => {
    if (!path?.length) return;
    const token = `data.${path.join('.')}`;
    insertAtCaret(getCaretElement(taRef.current), token, value || '', (v) => onChange?.(v));
  };

  // ---- Inline AI (no popup). Writes/fixes the formula straight into the field; the form's Preview box
  //      re-evaluates on its own, so the whole loop (describe → write/fix → see result) is one screen.
  const [aiOpen, setAiOpen] = React.useState(false);
  const [instr, setInstr] = React.useState('');
  const [aiBusy, setAiBusy] = React.useState(false);
  const [aiMsg, setAiMsg] = React.useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const callAi = async (url: string, extra: Record<string, any>) => {
    try {
      const res = await api.request({
        url,
        method: 'post',
        data: { collection: props.collection, dataSourceKey: props.dataSourceKey, ...extra },
      });
      const d = res?.data?.data || {};
      if (d.error) return { error: d.error };
      if (!d.formula) return { error: st('AI không trả về công thức') };
      // Surface the ACTUAL computed result the server already evaluated (testFormula → test.value).
      let note = '';
      if (d.test?.error) note = `⚠️ ${d.test.error}`;
      else if (d.test && 'value' in d.test) {
        const s = resultToString(d.test.value);
        const shown = s && s.length > 140 ? `${s.slice(0, 140)}…` : s || '—';
        note = `✓ ${st('chạy thử OK')} → ${t('kết quả mẫu')}: ${shown}`;
      } else note = `✓ ${st('chạy thử OK')}`;
      return { code: d.formula, note: [d.explanation, note].filter(Boolean).join(' — '), ok: !d.test?.error };
    } catch (e: any) {
      return { error: e?.response?.data?.errors?.[0]?.message || e?.message || String(e) };
    }
  };

  const runAi = async (mode: 'write' | 'fix' | 'convert') => {
    if (!hasApi) { setAiMsg({ type: 'err', text: st('Thiếu bảng hoặc kết nối API') }); return; }
    if (mode === 'write' && !instr.trim()) { setAiMsg({ type: 'err', text: t('Hãy mô tả bạn muốn tính') }); return; }
    if (mode === 'convert' && !instr.trim()) { setAiMsg({ type: 'err', text: st('Dán công thức AppSheet vào ô trên') }); return; }
    setAiBusy(true);
    setAiMsg(null);
    let r: any;
    if (mode === 'convert') r = await callAi('ptdlComputed:aiConvert', { appsheet: instr.trim() });
    else if (mode === 'fix') r = await callAi('ptdlComputed:aiWrite', { description: instr.trim(), fixFormula: value || '' });
    else r = await callAi('ptdlComputed:aiWrite', { description: instr.trim() });
    setAiBusy(false);
    if (r.error) { setAiMsg({ type: 'err', text: r.error }); return; }
    onChange?.(r.code); // write into the field → the Preview box updates itself
    setAiMsg({ type: r.ok ? 'ok' : 'err', text: r.note });
  };

  let fnCount = 0;
  try { fnCount = listFunctionNames().length; } catch (_) { fnCount = 0; }
  const help = (
    <div style={{ width: 460, maxHeight: 340, overflow: 'auto' }}>
      <Typography.Paragraph style={{ marginBottom: 8 }}>
        <b>data</b> = {t('bản ghi dòng hiện tại')}. {t('VD')} <code>data.name</code>, <code>data.customer.name</code>.<br />
        <b>&amp;</b> = {t('nối chuỗi (Excel). Cộng dồn quan hệ:')} <code>SUM(data.order_ids.amount)</code>. {t('Viết HOA/thường đều được.')}
      </Typography.Paragraph>
      {HELP_GROUPS.map(([title, fns]) => (
        <div key={title} style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#888' }}>{t(title)}</div>
          <div style={{ fontSize: 12, fontFamily: 'monospace' }}>{t(fns)}</div>
        </div>
      ))}
      <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>{t('Tổng cộng {{count}} hàm (formulajs + HTML helpers).', { count: fnCount })}</div>
    </div>
  );
  return (
    <div>
      <Input.TextArea
        ref={taRef}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        rows={4}
        placeholder={t('VD: CONCATENATE("<b>", data.name, "</b>")\nhoặc: IF(data.stock>0, TAG("Còn","green"), TAG("Hết","red"))')}
        style={{ fontFamily: 'monospace', fontSize: 13 }}
      />
      <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {hasApi ? (
          <FieldPickerCascader
            api={api}
            collectionName={props.collection}
            dataSourceKey={props.dataSourceKey}
            includeToMany
            onPick={insertColumn}
          />
        ) : null}
        <Popover content={help} trigger="click" placement="bottomLeft" title={t('Hàm & cú pháp')}>
          <a style={{ fontSize: 12 }}>ƒ {t('Danh sách hàm & cú pháp')}</a>
        </Popover>
        {hasApi ? (
          <a style={{ fontSize: 12 }} onClick={() => setAiOpen((o) => !o)}>
            ✨ {st('AI viết hộ')} {aiOpen ? '▴' : '▾'}
          </a>
        ) : null}
      </div>

      {hasApi && aiOpen ? (
        <div
          style={{
            marginTop: 8,
            padding: 10,
            border: '1px solid var(--colorBorderSecondary, #f0f0f0)',
            borderRadius: 8,
            background: 'var(--colorFillQuaternary, #fafafa)',
          }}
        >
          <Input.TextArea
            value={instr}
            onChange={(e) => setInstr(e.target.value)}
            autoSize={{ minRows: 2, maxRows: 4 }}
            placeholder={st('Mô tả bạn muốn tính (vd: tổng tiền = số lượng × đơn giá) — HOẶC dán công thức AppSheet rồi bấm "Chuyển từ AppSheet"')}
            onPressEnter={(e: any) => {
              if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                runAi('write');
              }
            }}
          />
          <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button type="primary" size="small" loading={aiBusy} onClick={() => runAi('write')}>
              ✨ {t('Sinh công thức')}
            </Button>
            <Button size="small" loading={aiBusy} onClick={() => runAi('convert')} title={st('Dán công thức AppSheet vào ô trên rồi bấm đây')}>
              ⇄ {st('Chuyển từ AppSheet')}
            </Button>
            <Button size="small" loading={aiBusy} disabled={!String(value || '').trim()} onClick={() => runAi('fix')}>
              {t('Sửa công thức hiện tại')}
            </Button>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>{t('Ctrl+Enter để sinh nhanh')}</Typography.Text>
          </div>
          {aiMsg ? (
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                whiteSpace: 'pre-wrap',
                color: aiMsg.type === 'err' ? '#cf1322' : 'var(--colorTextSecondary, #666)',
              }}
            >
              {aiMsg.text}
            </div>
          ) : null}
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--colorTextTertiary, #999)' }}>
            {t('Công thức được ghi thẳng vào ô trên — xem kết quả ở khung Xem trước.')}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Live preview: evaluate the current formula against a real sample record from the collection,
// re-rendering as the user edits (observer → useForm). loadSample is provided by the uiSchema.
export const FormulaPreview = observer((props: any) => {
  const form: any = useForm();
  const v = form?.values || {};
  const [sample, setSample] = React.useState<any>(null);
  const [state, setState] = React.useState<'loading' | 'none' | 'ok'>('loading');
  React.useEffect(() => {
    let alive = true;
    const load = props.loadSample;
    if (typeof load !== 'function') { setState('none'); return; }
    Promise.resolve(load())
      .then((s: any) => { if (!alive) return; if (s) { setSample(s); setState('ok'); } else setState('none'); })
      .catch(() => { if (alive) setState('none'); });
    return () => { alive = false; };
  }, []);
  const formula = String(v.formula || '').trim();
  const record = sample || {};
  const align = (v.align || 'left') as any;
  let body: React.ReactNode = <span style={{ color: '#bbb' }}>—</span>;
  if (formula) {
    const res = evaluateFormula(formula, record);
    if ('error' in res) {
      body = <span style={{ color: '#cf1322', fontFamily: 'monospace', fontSize: 12 }}>#ERR {res.error.message}</span>;
    } else {
      const fmt = applyFormulaFormat(res.value, {
        fmtType: v.fmtType, fmtThousands: v.fmtNumber?.thousands, fmtDecimals: v.fmtNumber?.decimals, fmtDate: v.fmtDate,
      });
      const text = fmt !== null ? fmt : resultToString(res.value);
      if (text === '' || res.value === null || res.value === undefined) body = <span style={{ color: '#bbb' }}>{t('(trống)')}</span>;
      else if (fmt === null && v.renderHtml !== false) body = <div style={{ textAlign: align }} dangerouslySetInnerHTML={{ __html: text }} />;
      else body = <div style={{ textAlign: align }}>{text}</div>;
    }
  }
  const note = state === 'loading' ? t('Đang tải bản ghi mẫu…')
    : state === 'none' ? t('Chưa có bản ghi mẫu — data.* sẽ trống')
    : t('Kết quả trên bản ghi đầu tiên của bảng');
  return (
    <PreviewBox label={props.label || t('Xem trước')}>
      <div style={{ minHeight: 22, fontSize: 14 }}>{body}</div>
      <div style={{ fontSize: 11, color: 'var(--colorTextQuaternary, #bbb)', marginTop: 8 }}>{note}</div>
    </PreviewBox>
  );
});

export function AlignSeg(props: any) {
  return (
    <SegmentedGroup
      size="small"
      {...SEG_PROPS}
      value={props.value || 'left'}
      onChange={(v) => props.onChange?.(v)}
      options={[
        { label: t('Trái'), value: 'left' },
        { label: t('Giữa'), value: 'center' },
        { label: t('Phải'), value: 'right' },
      ]}
    />
  );
}

export function RenderHtmlSwitch(props: any) {
  return <Switch size="small" checked={props.value !== false} onChange={(c) => props.onChange?.(c)} />;
}

// Multi-check trigger control for the computed-value ⚙ flow (matches the settings page). value = comma-string.
export function TriggerCheckboxes(props: any) {
  const { value, onChange } = props;
  const options = TRIGGER_OPTIONS.map((o) => ({ ...o, label: t(o.label) }));
  return <Checkbox.Group options={options} value={splitTriggers(value)} onChange={(vals) => onChange?.((vals as string[]).join(','))} />;
}

let registered = false;
export function registerFormulaComponents(flowSettings: any) {
  if (!flowSettings || registered) return;
  try {
    // registerSettingsKit also registers SettingsGrid + CollapsibleSection (kit house style).
    registerSettingsKit(flowSettings, { FormulaCodeInput, AlignSeg, RenderHtmlSwitch, TriggerCheckboxes, ComputedRuleEditorField, FmtTypeSeg, FmtNumberOpts, FmtDateInput, FormulaPreview });
    registered = true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[formula] register components failed', e);
  }
}

// The shared uiSchema fragment (formula + renderHtml + align) used by both models' settings step.
// ---- format kết quả (Number/Date) ----
export function FmtTypeSeg(props: any) {
  return (
    <SegmentedGroup
      size="small"
      {...SEG_PROPS}
      value={props.value || 'auto'}
      onChange={(v) => props.onChange?.(v)}
      options={[
        { label: t('Auto'), value: 'auto' },
        { label: t('Số'), value: 'number' },
        { label: t('Ngày'), value: 'date' },
      ]}
    />
  );
}

/** Gộp 2 option số vào 1 control: { thousands, decimals } — tránh nhiều field reaction. */
export function FmtNumberOpts(props: any) {
  const v = props.value || {};
  const set = (patch: any) => props.onChange?.({ ...v, ...patch });
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 16 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#666' }}>
        {t('Ngăn cách nghìn')}
        <Switch size="small" checked={!!v.thousands} onChange={(b) => set({ thousands: b || undefined })} />
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#666' }}>
        {t('Số thập phân')}
        <InputNumber
          size="small"
          min={0}
          max={6}
          value={v.decimals}
          onChange={(n) => set({ decimals: n === null || n === undefined ? undefined : n })}
          style={{ width: 70 }}
        />
      </span>
    </span>
  );
}

export function FmtDateInput(props: any) {
  return (
    <AutoComplete
      size="small"
      style={{ width: 220 }}
      value={props.value || 'DD/MM/YYYY'}
      onChange={(v) => props.onChange?.(v)}
      options={DATE_FORMAT_PRESETS.map((f) => ({ value: f }))}
      placeholder="DD/MM/YYYY HH:mm"
    />
  );
}

// x-reactions PHẢI là function (không {{$deps}} — compileUiSchema sẽ nổ $deps is not defined).
// visibleWhen('fmtType', want) từ @tuanla90/shared: rx(v => v.fmtType === want) → field.setState({visible}).

// Resolve a model's collectionField, walking up `.parent` (mirrors the same fix in computedRuleClient.tsx's
// registerComputedRuleFlow) — a field model rendered inside a form/sub-table doesn't always carry
// `collectionField` directly on itself; it can live on a parent (e.g. FormItemModel). Duplicated locally
// (not imported) to avoid a circular import (computedRuleClient.tsx already imports THIS file).
function resolveCf(model: any): any {
  for (let cur: any = model, i = 0; cur && i < 4; cur = cur.parent, i++) {
    if (cur?.collectionField) return cur.collectionField;
  }
  return null;
}

// The shared uiSchema fragment (formula + renderHtml + align + format) used by both models' settings step.
export function formulaStepUiSchema(t: (s: string) => any, ctx?: any) {
  // Resolve the collection so the preview can load a real sample row (data.*). Works for both the
  // display-field model (bound field → its collection) and the virtual column (table collection).
  const model = ctx?.model;
  const cf = resolveCf(model);
  const coll = model?.context?.collection || model?.collection || cf?.collection;
  const api = ctx?.app?.apiClient || model?.context?.api || model?.flowEngine?.context?.api;
  const collName = coll?.name || cf?.collectionName;
  const dsKey = coll?.dataSourceKey || cf?.dataSourceKey;
  const loadSample = async () => {
    if (!api || !collName) return null;
    // Append the collection's relations (one level) so `data.<rel>.<field>` resolves in the preview —
    // otherwise a formula like SUM(data.items.amount) errors with "reading 'amount' of undefined"
    // because the plain :list omits relation data. Only real relation fields are appended (safe).
    let appends: string[] = [];
    try {
      const REL = new Set(['belongsTo', 'hasOne', 'hasMany', 'belongsToMany']);
      const fields = await getFields(api, collName, dsKey);
      appends = (fields || []).filter((f: any) => REL.has(f.type) && f.target).map((f: any) => f.name);
    } catch (_) {
      /* no field metadata → fetch without appends */
    }
    try {
      const res = await api.request({
        url: `${collName}:list`, method: 'get',
        params: { pageSize: 1, ...(appends.length ? { appends } : {}) },
        headers: dsKey ? { 'X-Data-Source': dsKey } : undefined,
      });
      return res?.data?.data?.[0] || null;
    } catch (_) {
      return null;
    }
  };
  return {
    preview: {
      type: 'void',
      'x-decorator': 'FormItem', 'x-decorator-props': { style: { marginBottom: 10 } },
      'x-component': 'FormulaPreview', 'x-component-props': { loadSample, label: t('Xem trước') },
    },
    formula: {
      type: 'string',
      title: t('Công thức'),
      'x-decorator': 'FormItem',
      'x-decorator-props': { style: { marginBottom: 8 } },
      'x-component': 'FormulaCodeInput',
      // collection + getApi let FormulaCodeInput show the field picker + "AI viết hộ" button. api is
      // passed as a CLOSURE (getApi) not a bare object: schema compilation strips methods off a plain
      // object in x-component-props (functions survive), so a bare `api` reached the component without
      // `.request` → picker disabled + "Missing collection or API connection".
      'x-component-props': { collection: collName, getApi: () => api, dataSourceKey: dsKey },
    },
    display: {
      type: 'void', 'x-component': 'CollapsibleSection', 'x-component-props': { title: t('Hiển thị') },
      properties: {
        grid: {
          type: 'void', 'x-component': 'SettingsGrid',
          'x-component-props': { minColWidth: 180, style: { alignItems: 'end' } },
          properties: {
            align: fi(t('Căn lề'), 'AlignSeg'),
            renderHtml: fi(t('Kết xuất HTML'), 'RenderHtmlSwitch', {
              type: 'boolean',
              decoratorProps: { tooltip: t('Hiển thị kết quả dạng HTML (in đậm, màu, TAG…). Tắt để hiện văn bản thuần.') },
            }),
          },
        },
      },
    },
    format: {
      type: 'void', 'x-component': 'CollapsibleSection', 'x-component-props': { title: t('Định dạng') },
      properties: {
        fmtType: fi(t('Kiểu'), 'FmtTypeSeg', {
          decoratorProps: { tooltip: t('Auto giữ nguyên kết quả công thức. Số/Ngày định dạng lại giá trị số hoặc ngày.') },
        }),
        fmtNumber: fi(t('Định dạng số'), 'FmtNumberOpts', { type: 'object', reactions: visibleWhen('fmtType', 'number') }),
        fmtDate: fi(t('Định dạng ngày'), 'FmtDateInput', { reactions: visibleWhen('fmtType', 'date') }),
      },
    },
  };
}
