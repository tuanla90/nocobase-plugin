/**
 * Shared "AI viết hộ" button + modal. Reused by every code-writing surface (ECharts option,
 * Handlebars template, custom HTML/JS, formula, …).
 *
 * The button owns the whole flow: instruction box → call the plugin's server codegen action → run the
 * surface's own `validate` (render/compile in the browser) → if invalid, re-call with the error fed back
 * (up to `maxTries`) → show the code (editable) + validation status → user clicks "Chèn".
 *
 * i18n: all chrome strings go through the SHARED translator `st` (bilingual via `sharedEnUS` under
 * `SHARED_NS`), so the button matches the host UI's language — consumers already inject `setSharedT`.
 * The plugin supplies the surface-specific bits as props: `callGenerate`, `validate`, `getContext`,
 * `getCurrent`, `onInsert`, and an optional surface-specific `placeholder`. No React/antd is bundled
 * here (both stay external in the @ptdl/shared build), and the icon is inline SVG (no icon package).
 */

import React from 'react';
import { Button, Modal, Input, Alert, Space, Typography, Tag, Tooltip } from 'antd';
import { st } from './i18n';

// Inline "sparkles" icon (Lucide-style, currentColor) — a real icon without depending on
// @ant-design/icons, which the shared build externalizes and some consumer bundles can't resolve.
const AiIcon: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <svg
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ verticalAlign: '-0.125em', ...style }}
  >
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z" />
    <path d="M20 3v4" />
    <path d="M22 5h-4" />
    <path d="M4 17v2" />
    <path d="M5 18H3" />
  </svg>
);

export interface AiValidateResult {
  ok: boolean;
  error?: string;
}

export interface AiCodegenRequest {
  language: string;
  instruction: string;
  current?: string;
  lastError?: string;
  context?: any;
}

export interface AiCodegenButtonProps {
  /** Target language — echarts-option | handlebars | html | js | formula | token-template | … */
  language: string;
  /** Hits the plugin's server action; returns { code, explain } or { error }. */
  callGenerate: (req: AiCodegenRequest) => Promise<{ code?: string; explain?: string; error?: string }>;
  /** Called with the accepted (possibly hand-edited) code. */
  onInsert: (code: string) => void;
  /** Validate the generated code by rendering/compiling it; return { ok, error }. Optional but recommended. */
  validate?: (code: string) => AiValidateResult | Promise<AiValidateResult>;
  /** Render a LIVE preview of the generated code → `{ html }` (shown in a box) or `{ error }`. Optional.
   *  Recomputed whenever the code changes (incl. hand-edits), so the user sees the real output before Chèn. */
  preview?: (code: string) => { html?: string; error?: string } | Promise<{ html?: string; error?: string }>;
  /** Build the codegen context lazily (columns / sampleRows / helpers / tokens). */
  getContext?: () => any;
  /** Existing code to FIX instead of writing fresh. */
  getCurrent?: () => string | undefined;
  /** Surface-specific example hint for the instruction box (already translated by the plugin). */
  placeholder?: string;
  /** Override the button label (defaults to the shared "AI viết hộ"). */
  buttonText?: string;
  size?: 'small' | 'middle' | 'large';
  block?: boolean;
  maxTries?: number;
  modalWidth?: number;
}

export function AiCodegenButton(props: AiCodegenButtonProps): React.ReactElement {
  const maxTries = props.maxTries || 3;
  const [open, setOpen] = React.useState(false);
  const [instruction, setInstruction] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [code, setCode] = React.useState('');
  const [explain, setExplain] = React.useState('');
  const [status, setStatus] = React.useState<{ ok: boolean; error?: string; tries: number } | null>(null);
  const [err, setErr] = React.useState('');
  const [previewOut, setPreviewOut] = React.useState<{ html?: string; error?: string } | null>(null);

  const reset = () => {
    setCode('');
    setExplain('');
    setStatus(null);
    setErr('');
    setPreviewOut(null);
  };

  // Live preview: recompute whenever the (possibly hand-edited) code changes. Guarded — a throwing
  // preview fn shows as an error box, never crashes the modal.
  const previewFn = props.preview;
  React.useEffect(() => {
    let alive = true;
    if (!previewFn || !code.trim()) {
      setPreviewOut(null);
      return;
    }
    Promise.resolve()
      .then(() => previewFn(code))
      .then((p) => { if (alive) setPreviewOut(p || null); })
      .catch((e: any) => { if (alive) setPreviewOut({ error: e?.message || String(e) }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const run = async () => {
    if (!instruction.trim() && !props.getCurrent?.()) {
      setErr(st('Hãy mô tả bạn muốn gì'));
      return;
    }
    setBusy(true);
    reset();
    let lastError: string | undefined;
    let gen = '';
    let expl = '';
    let fin: { ok: boolean; error?: string; tries: number } | null = null;
    try {
      const context = props.getContext?.();
      for (let i = 0; i < maxTries; i++) {
        const current = i === 0 ? props.getCurrent?.() : gen;
        const res = await props.callGenerate({ language: props.language, instruction: instruction.trim(), current, lastError, context });
        if (res?.error) {
          setErr(res.error);
          return;
        }
        gen = res.code || '';
        expl = res.explain || '';
        if (!gen) {
          setErr(st('AI không trả về code'));
          return;
        }
        let v: AiValidateResult = { ok: true };
        if (props.validate) {
          try {
            v = await props.validate(gen);
          } catch (e: any) {
            v = { ok: false, error: e?.message || String(e) };
          }
        }
        fin = { ok: v.ok, error: v.error, tries: i + 1 };
        if (v.ok) break;
        lastError = v.error || 'invalid';
      }
      setCode(gen);
      setExplain(expl);
      setStatus(fin);
    } finally {
      setBusy(false);
    }
  };

  const insert = () => {
    if (!code.trim()) return;
    props.onInsert(code);
    setOpen(false);
    reset();
    setInstruction('');
  };

  return (
    <>
      <Tooltip title={st('Để AI viết hộ từ mô tả')}>
        <Button size={props.size || 'small'} block={props.block} icon={<AiIcon />} onClick={() => setOpen(true)}>
          {props.buttonText || st('AI viết hộ')}
        </Button>
      </Tooltip>
      <Modal
        open={open}
        title={
          <span>
            <AiIcon style={{ marginRight: 6 }} />
            {st('AI viết hộ')}
          </span>
        }
        width={props.modalWidth || 720}
        onCancel={() => {
          setOpen(false);
          reset();
        }}
        okText={st('Chèn')}
        okButtonProps={{ disabled: !code.trim() }}
        onOk={insert}
        cancelText={st('Đóng')}
        destroyOnClose
        styles={{ body: { maxHeight: '66vh', overflowY: 'auto' } }}
      >
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Input.TextArea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={props.placeholder || st('Mô tả bạn muốn (vd: biểu đồ, thẻ KPI, mẫu in, công thức…)')}
            autoSize={{ minRows: 2, maxRows: 4 }}
            onPressEnter={(e) => {
              if ((e as any).ctrlKey || (e as any).metaKey) {
                e.preventDefault();
                run();
              }
            }}
          />
          <Button type="primary" icon={<AiIcon />} loading={busy} onClick={run}>
            {code ? st('Viết lại') : st('Sinh code')}
          </Button>

          {err ? <Alert type="error" showIcon message={err} /> : null}

          {code ? (
            <>
              {status ? (
                status.ok ? (
                  <Tag color="success">
                    {status.tries > 1 ? st('Đã kiểm: hợp lệ (sau {{n}} lần)', { n: status.tries }) : st('Đã kiểm: hợp lệ')}
                  </Tag>
                ) : (
                  <Alert
                    type="warning"
                    showIcon
                    message={st('Chưa chạy đúng sau {{n}} lần — bạn có thể sửa tay rồi Chèn', { n: status.tries })}
                    description={status.error ? <Typography.Text code>{String(status.error).slice(0, 300)}</Typography.Text> : null}
                  />
                )
              ) : null}
              {explain ? (
                <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                  {explain}
                </Typography.Paragraph>
              ) : null}
              {props.preview ? (
                <div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {st('Xem trước')}
                  </Typography.Text>
                  <div
                    style={{
                      border: '1px solid #efefef',
                      borderRadius: 8,
                      padding: 12,
                      marginTop: 4,
                      background: '#fafafa',
                      minHeight: 56,
                      maxHeight: 280,
                      overflow: 'auto',
                    }}
                  >
                    {previewOut?.error ? (
                      <Alert
                        type="error"
                        showIcon
                        message={st('Lỗi khi chạy')}
                        description={<Typography.Text code>{String(previewOut.error).slice(0, 300)}</Typography.Text>}
                      />
                    ) : previewOut?.html ? (
                      <div dangerouslySetInnerHTML={{ __html: previewOut.html }} />
                    ) : (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        …
                      </Typography.Text>
                    )}
                  </div>
                </div>
              ) : null}
              <Input.TextArea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoSize={{ minRows: 6, maxRows: 18 }}
                spellCheck={false}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {st('Bạn có thể chỉnh tay trước khi Chèn.')}
              </Typography.Text>
            </>
          ) : null}
        </Space>
      </Modal>
    </>
  );
}
