import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, Input, Popover, Select, Tooltip } from 'antd';
import { RegistryIconPicker } from '@tuanla90/shared';
import {
  EnumOption,
  KIND_META,
  StatusFlowConfig,
  StatusRow,
  TAG_COLORS,
  TAG_HEX,
  rowsFromField,
  rowsToField,
  slugify,
} from './types';
import { StatusFlowGraphPreview } from './StatusFlowGraphPreview';
import { tt } from './i18n';

// Text input that keeps its own buffer while focused so a parent re-render (this editor is fully
// controlled — every keystroke re-derives `rows` from props) can't clobber the caret or, for the
// key field, silently swallow characters. `validate` drives the red-border feedback; `commitOn`
// picks whether edits flow up live (label) or only once they're valid on blur (key).
const BufferedInput: React.FC<any> = ({ value, onCommit, onBlurExtra, validate, commitOn = 'change', ...rest }) => {
  const [text, setText] = useState<string>(value ?? '');
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value ?? '');
  }, [value]);
  const err = validate ? validate(text) : null;
  return (
    <Input
      {...rest}
      value={text}
      status={err ? 'error' : undefined}
      title={err || rest.title}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        if (commitOn === 'blur') {
          if (err) setText(value ?? '');
          else if (text !== (value ?? '')) onCommit(text);
        }
        onBlurExtra?.(text);
      }}
      onChange={(e: any) => {
        const v = e.target.value;
        setText(v);
        if (commitOn === 'change' && (!validate || !validate(v))) onCommit(v);
      }}
    />
  );
};

// Color swatch popover that closes itself once a color is picked (previously stayed open).
const ColorPopover: React.FC<{ current: string; onPick: (c: string) => void; children: React.ReactNode }> = ({
  current,
  onPick,
  children,
}) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      content={
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 22px)', gap: 8 }}>
          {TAG_COLORS.map((c) => (
            <span
              key={c}
              onClick={() => {
                onPick(c);
                setOpen(false);
              }}
              title={c}
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: TAG_HEX[c] || TAG_HEX.default,
                cursor: 'pointer',
                boxShadow:
                  current === c
                    ? `0 0 0 2px #fff, 0 0 0 4px ${TAG_HEX[c] || TAG_HEX.default}`
                    : 'inset 0 0 0 1px rgba(0,0,0,0.15)',
              }}
            />
          ))}
        </div>
      }
    >
      {children}
    </Popover>
  );
};

export interface StatusFlowConfigEditorProps {
  enumValue?: EnumOption[];
  flowValue?: StatusFlowConfig;
  onChange: (enumValue: EnumOption[], flow: StatusFlowConfig) => void;
  fetchRoles?: () => Promise<Array<{ name: string; title?: string }>>;
}

// Role titles come as raw i18n templates like `{{t("Admin")}}` — translate via the host i18n
// when available, otherwise strip down to the key.
function tr(label: any): string {
  const s = typeof label === 'string' ? label : String(label ?? '');
  const m = s.match(/^\s*\{\{\s*t\(\s*(['"`])(.*?)\1/);
  if (m) {
    try {
      const t = (window as any).__nocobase_i18n__?.t;
      const translated = typeof t === 'function' ? t(m[2]) : undefined;
      if (typeof translated === 'string' && translated) return translated;
    } catch (e) {
      // fall back to the raw key
    }
    return m[2];
  }
  return s;
}

const smallLabel: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.6,
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

// Controlled editor: one table row per status (label / key / color / kind / next statuses / roles)
// plus an "Initial status" select. Every change writes BOTH uiSchema.enum and statusFlow back.
export const StatusFlowConfigEditor: React.FC<StatusFlowConfigEditorProps> = (props) => {
  const { enumValue, flowValue, onChange, fetchRoles } = props;
  const rows = useMemo(() => rowsFromField(enumValue, flowValue), [enumValue, flowValue]);
  const [roleOptions, setRoleOptions] = useState<Array<{ label: string; value: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    fetchRoles?.()
      .then((roles) => {
        if (cancelled) return;
        setRoleOptions(
          (roles || [])
            .filter((r) => r?.name && r.name !== 'root')
            .map((r) => ({ label: tr(r.title) || r.name, value: r.name })),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // initial is derived from the row whose Kind is "Initial" (single source of truth).
  // A flow without any Initial row would be invalid — silently promote the topmost
  // "In progress" row (or the first row) instead of blocking the save.
  const emit = (nextRows: StatusRow[]) => {
    let out = nextRows;
    if (out.length && !out.some((r) => r.kind === 'init')) {
      const idx = Math.max(
        0,
        out.findIndex((r) => r.kind === 'processing'),
      );
      out = out.map((r, i) => (i === idx ? { ...r, kind: 'init' } : r));
    }
    const { enumValue: e, flow } = rowsToField(out);
    onChange(e, flow);
  };

  const updateRow = (index: number, patch: Partial<StatusRow>) => {
    let next = rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
    // Kind "Initial" is the single source of the initial status — demote any other row.
    if (patch.kind === 'init') {
      next = next.map((r, i) => (i !== index && r.kind === 'init' ? { ...r, kind: 'processing' } : r));
    }
    // Renaming a value must not break references from other rows.
    if (patch.value !== undefined && patch.value !== rows[index].value) {
      const oldV = rows[index].value;
      const newV = patch.value;
      for (const r of next) r.to = r.to.map((v) => (v === oldV ? newV : v));
    }
    emit(next);
  };

  // On leaving the label field, seed the key from the label while the key is still the auto value.
  const maybeSlugKey = (index: number, labelText: string) => {
    const r = rows[index];
    if (!r) return;
    if (labelText && /^status_\d+_*$/.test(r.value)) {
      const slug = slugify(labelText);
      if (slug && !rows.some((x, j) => j !== index && x.value === slug)) updateRow(index, { value: slug });
    }
  };

  const keyError = (index: number) => (v: string): string | null => {
    const t = String(v || '').trim();
    if (!t) return tt('Key cannot be empty');
    if (rows.some((r, j) => j !== index && r.value === t)) return tt('Another status already uses this key');
    return null;
  };

  const addRow = () => {
    const kind: StatusRow['kind'] = rows.length === 0 ? 'init' : 'processing';
    const meta = KIND_META.find((k) => k.value === kind)!;
    let value = `status_${rows.length + 1}`;
    while (rows.some((r) => r.value === value)) value += '_';
    emit([...rows, { value, label: '', color: meta.color, kind, to: [], toAll: false, fromAll: false, roles: [] }]);
  };

  const removeRow = (index: number) => {
    const removed = rows[index].value;
    const next = rows
      .filter((_, i) => i !== index)
      .map((r) => ({ ...r, to: r.to.filter((v) => v !== removed) }));
    emit(next);
  };

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const dropMove = (from: number, to: number) => {
    setDragIndex(null);
    setOverIndex(null);
    if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return;
    const next = [...rows];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    emit(next);
  };

  const colorDot = (c: string, size = 12) => (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: TAG_HEX[c] || TAG_HEX.default,
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)',
        flexShrink: 0,
      }}
    />
  );

  // Plain dot + text — no <Tag> inside <Select> (nested borders looked bad and clipped).
  const dotLabel = (color: string, text: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
      {colorDot(color, 10)}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>
    </span>
  );

  const statusOptions = (self?: string) =>
    rows
      .filter((r) => r.value && r.value !== self)
      .map((r) => ({
        label: dotLabel(r.color, r.label || r.value),
        value: r.value,
      }));

  // Single source of truth: the (first) row whose kind is "Initial".
  const effectiveInitial = rows.find((r) => r.kind === 'init')?.value || rows[0]?.value;

  const hasGraph = rows.filter((r) => r.value).length >= 2;

  return (
    <div>
      {hasGraph && (
        <div
          style={{
            border: '1px solid rgba(128,128,128,0.18)',
            background: 'rgba(128,128,128,0.04)',
            borderRadius: 8,
            padding: '10px 12px 2px',
            marginBottom: 10,
          }}
        >
          <div style={{ ...smallLabel, marginBottom: 6, letterSpacing: 0.3, textTransform: 'uppercase', fontSize: 11 }}>
            {tt('Flow preview')}
          </div>
          <StatusFlowGraphPreview
            rows={rows}
            initial={effectiveInitial}
            roleLabel={(name) => roleOptions.find((r) => r.value === name)?.label || name}
          />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((row, i) => {
          const accent = TAG_HEX[row.color] || TAG_HEX.default;
          return (
            <div
              key={i}
              onDragOver={(e) => {
                if (dragIndex === null) return;
                e.preventDefault();
                if (overIndex !== i) setOverIndex(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) dropMove(dragIndex, i);
              }}
              style={{
                border: overIndex === i && dragIndex !== null && dragIndex !== i
                  ? '1px dashed rgba(22,119,255,0.8)'
                  : '1px solid rgba(128,128,128,0.22)',
                borderLeft: `3px solid ${accent}`,
                borderRadius: 8,
                padding: '8px 10px',
                opacity: dragIndex === i ? 0.4 : 1,
              }}
            >
              {/* row 1: identity */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span
                  draggable
                  onDragStart={(e) => {
                    setDragIndex(i);
                    e.dataTransfer.effectAllowed = 'move';
                    try {
                      e.dataTransfer.setData('text/plain', String(i));
                    } catch (err) {
                      // some browsers require setData for DnD to start; ignore failures
                    }
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                  title={tt('Drag to reorder')}
                  style={{ cursor: 'grab', opacity: 0.45, fontSize: 14, lineHeight: 1, userSelect: 'none', flexShrink: 0 }}
                >
                  ⠿
                </span>
                <span style={{ ...smallLabel, width: 16, textAlign: 'right' }}>{i + 1}.</span>
                <ColorPopover current={row.color} onPick={(c) => updateRow(i, { color: c })}>
                  <span style={{ cursor: 'pointer', display: 'inline-flex', padding: 2 }} title={tt('Color')}>
                    {colorDot(row.color, 16)}
                  </span>
                </ColorPopover>
                <Tooltip title={tt('Icon (optional)')}>
                  <span style={{ display: 'inline-flex', flexShrink: 0 }}>
                    <RegistryIconPicker value={row.icon} onChange={(ic: string) => updateRow(i, { icon: ic })} />
                  </span>
                </Tooltip>
                <BufferedInput
                  size="small"
                  placeholder={tt('Status name')}
                  value={row.label}
                  style={{ flex: '2 1 160px', minWidth: 140, fontWeight: 500 }}
                  onCommit={(v: string) => updateRow(i, { label: v })}
                  onBlurExtra={(text: string) => maybeSlugKey(i, text)}
                />
                <BufferedInput
                  size="small"
                  placeholder={tt('key')}
                  value={row.value}
                  commitOn="blur"
                  validate={keyError(i)}
                  style={{ flex: '1 1 100px', minWidth: 90, maxWidth: 150, fontFamily: 'monospace', fontSize: 12, opacity: 0.8 }}
                  onCommit={(v: string) => updateRow(i, { value: String(v).trim() })}
                />
                <Select
                  size="small"
                  style={{ width: 150, flexShrink: 0 }}
                  value={row.kind}
                  onChange={(kind) => updateRow(i, { kind })}
                  popupMatchSelectWidth={false}
                  options={KIND_META.map((k) => ({
                    value: k.value,
                    label: dotLabel(k.color, tt(k.label)),
                  }))}
                />
                <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                  <Tooltip title={tt('Remove status')}>
                    <Button size="small" type="text" danger onClick={() => removeRow(i)}>
                      ✕
                    </Button>
                  </Tooltip>
                </span>
              </div>
              {/* row 2: transitions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8, paddingLeft: 24 }}>
                <span style={smallLabel}>{tt('Can move to')}</span>
                <Select
                  size="small"
                  mode="multiple"
                  style={{ flex: '2 1 220px', minWidth: 180 }}
                  placeholder={tt('— final status (no transitions) —')}
                  value={row.toAll ? ['*'] : row.to}
                  onChange={(vals: string[]) => {
                    if (vals.includes('*') && !row.toAll) {
                      updateRow(i, { toAll: true, to: [] });
                    } else {
                      updateRow(i, { toAll: false, to: vals.filter((v) => v !== '*') });
                    }
                  }}
                  options={[
                    { label: <span style={{ fontWeight: 600 }}>✳ {tt('Any status')}</span>, value: '*' },
                    ...statusOptions(row.value),
                  ]}
                />
                <Tooltip title={tt('Every status can move INTO this one — for Archived / Cancelled style statuses. Roles below gate who may do it.')}>
                  <Checkbox
                    checked={row.fromAll}
                    onChange={(e) => updateRow(i, { fromAll: e.target.checked })}
                    style={{ fontSize: 12, opacity: 0.85 }}
                  >
                    <span style={{ fontSize: 12 }}>↩ {tt('from any')}</span>
                  </Checkbox>
                </Tooltip>
                {(row.to.length > 0 || row.toAll || row.fromAll) && (
                  <>
                    <span style={smallLabel}>{tt('by roles')}</span>
                    <Select
                      size="small"
                      mode="multiple"
                      style={{ flex: '1 1 160px', minWidth: 140 }}
                      placeholder={tt('everyone')}
                      value={row.roles}
                      onChange={(roles) => updateRow(i, { roles })}
                      options={roleOptions}
                    />
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
        <Button size="small" type="dashed" onClick={addRow}>
          + {tt('Add status')}
        </Button>
      </div>
      <div style={{ fontSize: 12, opacity: 0.55, marginTop: 6 }}>
        {tt('The status whose kind is "Initial" is where new records start · empty "Can move to" = final status · empty roles = everyone may move · rules are enforced server-side')}
      </div>
    </div>
  );
};
