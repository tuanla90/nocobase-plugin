/**
 * The single "code" field component: a JS editor with a LIVE PREVIEW beside it
 * (updates as you type, no need to Save) + a collapsible list of helpers.
 * Preview uses the block's real query data (via useFlowModel) when available,
 * otherwise a small sample so you always see something.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
// This plugin now renders antd components via @ptdl/shared (FieldPickerCascader). A DIRECT antd
// import makes nocobase-build externalize `antd` for this client bundle; without a source-level
// antd import, rspack tries to bundle antd from @ptdl/shared and fails on the framework stub.
import 'antd';
import { useFlowSettingsContext } from '@nocobase/flow-engine';
import { theme } from 'antd';
import { renderCustomHtml, HELPERS_REF, SAMPLE_DATA, DEFAULT_JS, getCachedData } from './render';
import { PRESETS } from './presets';
import { FieldPickerCascader, getCaretElement, insertAtCaret, AiCodegenButton, st } from '@ptdl/shared';
import { t } from './i18n';

export const HtmlCodeEditor: React.FC<any> = (props) => {
  const { token } = theme.useToken();
  const { value, onChange } = props;

  // The settings context gives the block model being configured.
  let model: any;
  let api: any;
  try {
    const ctx: any = useFlowSettingsContext();
    model = ctx && ctx.model;
    api = ctx?.app?.apiClient || model?.context?.api || model?.flowEngine?.context?.api || model?.context?.globals?.api;
  } catch (e) {
    model = undefined;
  }
  // Prefer live resource data; fall back to the data the block rendered with
  // (cached by uid), then to a small sample so the preview always shows layout.
  let rows: any[] = [];
  try {
    const r: any = model && model.resource;
    rows = (r && r.getData && r.getData()) || [];
  } catch (e) {
    rows = [];
  }
  if (!rows || !rows.length) rows = getCachedData(model && model.uid);
  const usingSample = !rows || !rows.length;
  if (usingSample) rows = SAMPLE_DATA;

  const [code, setCode] = useState<string>(value != null ? value : DEFAULT_JS);
  useEffect(() => {
    if (value != null && value !== code) setCode(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const [showHelp, setShowHelp] = useState(false);

  // Columns straight from the live query result (or the sample) — no collection lookup
  // needed, and this matches the REAL keys of `data` (post-aggregation/alias), which a
  // schema-based field list wouldn't. Inserts the column name as a quoted JS string
  // (works for both `helpers.sum(data,'col')` and `r['col']`).
  const codeTaRef = useRef<any>(null);
  const columnOptions = useMemo(
    () => Object.keys(rows[0] || {}).map((k) => ({ value: k, label: k, isLeaf: true })),
    [rows],
  );
  const insertColumn = (path: string[]) => {
    const el = getCaretElement(codeTaRef.current);
    insertAtCaret(el, `'${path[0]}'`, code, (v) => {
      setCode(v);
      onChange?.(v);
    });
  };

  const preview = useMemo(() => {
    return renderCustomHtml({ js: code || '', rows, uid: 'preview' });
  }, [code, rows]);

  const handle = (e: any) => {
    const v = e.target.value;
    setCode(v);
    if (onChange) onChange(v);
  };

  // --- AI "viết hộ" wiring -------------------------------------------------------------------------
  // Context = the REAL query columns + a few sample rows (this editor already has live data), so the
  // generated JS references actual keys. Validate = the code compiles as `new Function(...body)` (same
  // signature the renderer uses) — catches the syntax errors the retry loop then fixes.
  const callGenerate = async (req: any) => {
    if (!api?.request) return { error: st('Không có kết nối API') };
    try {
      const res = await api.request({ url: 'customHtmlAi:generate', method: 'post', data: req });
      return res?.data?.data || { error: st('AI không phản hồi') };
    } catch (e: any) {
      return { error: e?.message || String(e) };
    }
  };
  const validateJs = (v: string) => {
    try {
      // eslint-disable-next-line no-new-func
      new Function('data', 'rows', 'helpers', 'scope', v);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  };
  const getAiContext = () => ({
    columns: columnOptions.map((c) => ({ name: c.value })),
    sampleRows: rows.slice(0, 3),
    extra:
      'Đoạn JS PHẢI `return` một chuỗi HTML. Có sẵn: data (object dòng đầu), rows (mảng dòng), ' +
      'helpers (sum/avg/min/max/count/formatNumber/formatDate/icon…), scope. Không import, không async.',
  });

  const box: React.CSSProperties = { flex: '1 1 340px', minWidth: 300 };

  return (
    <div>
      <div style={{ marginBottom: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{t('Mẫu:')}</span>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              setCode(p.code);
              if (onChange) onChange(p.code);
            }}
            style={{
              fontSize: 12,
              padding: '3px 10px',
              border: `1px solid ${token.colorBorderSecondary}`,
              borderRadius: 6,
              background: token.colorBgContainer,
              cursor: 'pointer',
              color: token.colorText,
            }}
          >
            {t(p.label)}
          </button>
        ))}
        <span style={{ marginLeft: 'auto' }}>
          <FieldPickerCascader options={columnOptions} onPick={insertColumn} />
        </span>
        <AiCodegenButton
          language="js"
          placeholder={st('Mô tả khối bạn muốn (vd: thẻ KPI tổng doanh thu + số đơn hàng)')}
          getCurrent={() => code}
          getContext={getAiContext}
          validate={validateJs}
          callGenerate={callGenerate}
          onInsert={(v) => {
            setCode(v);
            onChange?.(v);
          }}
        />
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={box}>
          <div style={{ fontSize: 12, color: token.colorTextTertiary, marginBottom: 4 }}>{t('JavaScript — return chuỗi HTML')}</div>
          <textarea
            ref={codeTaRef}
            value={code}
            onChange={handle}
            spellCheck={false}
            style={{
              width: '100%',
              height: 300,
              boxSizing: 'border-box',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 13,
              lineHeight: 1.5,
              padding: 10,
              border: `1px solid ${token.colorBorderSecondary}`,
              borderRadius: 8,
              resize: 'vertical',
              tabSize: 2,
              background: token.colorBgContainer,
              color: token.colorText,
            }}
          />
        </div>
        <div style={box}>
          <div style={{ fontSize: 12, color: token.colorTextTertiary, marginBottom: 4 }}>
            {t('Xem trước')}{' '}
            {usingSample
              ? t('(dữ liệu mẫu — chạy Run query để lấy dữ liệu thật)')
              : t('({{n}} dòng thật)', { n: rows.length })}
          </div>
          <div
            style={{
              height: 300,
              boxSizing: 'border-box',
              border: `1px solid ${token.colorBorderSecondary}`,
              borderRadius: 8,
              padding: 14,
              overflow: 'auto',
              background: '#fff',
            }}
            dangerouslySetInnerHTML={{ __html: preview }}
          />
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <span
          onClick={() => setShowHelp((s) => !s)}
          style={{ cursor: 'pointer', fontSize: 12.5, color: '#2490ef', userSelect: 'none' }}
        >
          {showHelp ? '▾' : '▸'} {t('Danh sách helpers ({{n}})', { n: HELPERS_REF.length })} &nbsp;·&nbsp; data / rows / count / helpers
        </span>
        {showHelp && (
          <div
            style={{
              marginTop: 6,
              border: '1px solid #eef0f2',
              borderRadius: 8,
              padding: '6px 12px',
              fontSize: 12.5,
              background: '#fafbfc',
            }}
          >
            {HELPERS_REF.map((h) => (
              <div key={h.sig} style={{ padding: '4px 0', borderBottom: '1px dashed #eef0f2' }}>
                <code style={{ color: '#c026d3' }}>{h.sig}</code>
                <span style={{ color: '#737b83' }}> — {t(h.desc)}</span>
              </div>
            ))}
            <div style={{ padding: '6px 0 2px', color: '#737b83' }}>
              {t('Icon: dùng')} <b>{t('bất kỳ tên Lucide')}</b>{' '}
              {t(
                "(kebab-case) — vd 'shopping-cart', 'trending-up', 'calendar-days'… (lấy từ icon-kit; xem tên tại lucide.dev). Không có thì rơi về bộ icon dựng sẵn nhỏ.",
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HtmlCodeEditor;
