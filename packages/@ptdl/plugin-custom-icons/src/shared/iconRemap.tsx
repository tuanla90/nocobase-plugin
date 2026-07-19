import React from 'react';
import * as ReactDOM from 'react-dom';
import { Button, Empty, Input, Popover, Space, Table, Tooltip, Upload, theme, message } from 'antd';
// Runtime translator imported as `tt` because this file uses `t` as a local variable (parseCsv).
import { t as tt } from './i18n';

// Dark-mode bridge: antd scopes its theme CSS vars to a hash-class container, so Modal/Popover/Dropdown
// PORTALS (and body-mounted setting roots) escape it and the LIGHT fallback of `var(--colorX, #fff)` wins.
// The theme TOKENS travel through React context even across portals, so we spread these onto each affected
// render root / portal content root, which lets every inner `var(--colorX, …)` resolve to the live theme.
function themeVars(token: any) {
  return {
    '--colorText': token.colorText,
    '--colorTextSecondary': token.colorTextSecondary,
    '--colorTextTertiary': token.colorTextTertiary,
    '--colorTextQuaternary': token.colorTextQuaternary,
    '--colorBorder': token.colorBorder,
    '--colorBorderSecondary': token.colorBorderSecondary,
    '--colorBgContainer': token.colorBgContainer,
    '--colorBgLayout': token.colorBgLayout,
    '--colorFillSecondary': token.colorFillSecondary,
    '--colorFillTertiary': token.colorFillTertiary,
    '--colorFillQuaternary': token.colorFillQuaternary,
    '--colorSplit': token.colorSplit,
    '--colorPrimary': token.colorPrimary,
    '--colorInfo': token.colorInfo,
    '--colorWarning': token.colorWarning,
    '--colorSuccess': token.colorSuccess,
    '--colorError': token.colorError,
  } as React.CSSProperties;
}

// Render a React element into a throwaway detached node and read its HTML — used to extract the antd
// icon's className and the Lucide SVG markup at runtime. We use the host's react-dom (external) legacy
// `render`, which is synchronous on initial mount, rather than react-dom/server (its subpath isn't
// externalized by the NocoBase builder) or react-dom/client's createRoot (async).
function renderMarkup(element: any): string | null {
  if (typeof document === 'undefined') return null;
  const rd: any = ReactDOM as any;
  if (typeof rd.render !== 'function') return null;
  const tmp = document.createElement('div');
  try {
    rd.render(element, tmp);
    const html = tmp.innerHTML;
    try {
      rd.unmountComponentAtNode(tmp);
    } catch (e) {
      /* ignore */
    }
    return html || null;
  } catch (e) {
    return null;
  }
}

/**
 * @ptdl/plugin-icon-remap — override NocoBase's built-in Ant Design icons with Lucide icons.
 *
 * How it works: NocoBase keeps ONE icon registry per client lane — a `Map<lowerName, Component>`
 * (`@nocobase/client(-v2)/components/Icon.tsx`). At startup it bulk-registers every @ant-design/icons
 * export, and the `<Icon type="...">` component looks the name up in that Map AT RENDER TIME. So if we
 * overwrite an entry — e.g. `icons.set('settingoutlined', <lucide proxy>)` — every place that renders
 * that icon *through the registry* shows Lucide instead. This is global per key (can't scope to one
 * spot) and only covers icons drawn via `<Icon type>` (not ones NocoBase imports as raw JSX).
 *
 * We store the replacement as a PROXY component that resolves the target `lucide-*` entry from the same
 * registry at render time — so it doesn't matter whether the Lucide provider (@ptdl/plugin-custom-icons)
 * loaded before or after us. We snapshot the registry once at init so we can (a) preview the true
 * built-in look in the picker and (b) restore the original when a mapping is removed.
 *
 * This file imports NOTHING from @nocobase/client(-v2); the registry (`icons` Map) and the apiClient are
 * injected per lane. Bundles no icon library (consumer of the shared registry).
 */

let iconsMap: Map<string, any> | null = null;
// One-time snapshot of the registry BEFORE any override — the source of truth for "the original icon".
let initialSnapshot: Map<string, any> | null = null;
// Source keys (lowercased) we've currently overridden, so we can restore ones later removed.
const applied = new Set<string>();
// Bumped on every apply so the settings preview re-renders live.
let version = 0;
const versionListeners = new Set<() => void>();
function bumpVersion() {
  version++;
  versionListeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      /* ignore */
    }
  });
}
function useVersion() {
  const [, setV] = React.useState(version);
  React.useEffect(() => {
    const fn = () => setV(version);
    versionListeners.add(fn);
    return () => {
      versionListeners.delete(fn);
    };
  }, []);
}

export function initRegistry(icons: Map<string, any>) {
  iconsMap = icons || null;
  if (iconsMap && !initialSnapshot) {
    // Capture originals once, before we mutate anything.
    initialSnapshot = new Map(iconsMap);
  }
}

// Render a registry icon straight from the map (bypasses <Icon> to avoid recursing through overrides).
function RawIcon({ mapKey, from, style }: { mapKey?: string; from?: Map<string, any> | null; style?: any }) {
  const src = from || iconsMap;
  if (!mapKey || !src) return null;
  const C = src.get(mapKey.toLowerCase());
  return C ? React.createElement(C, { style }) : <span style={{ color: 'var(--colorTextQuaternary, #bbb)', ...style }}>▢</span>;
}

// A proxy that renders the mapped Lucide component, resolved LIVE from the registry each render.
function makeProxy(lucideKey: string) {
  const key = lucideKey.toLowerCase();
  const Proxy = (props: any) => {
    const C = iconsMap?.get(key);
    return C ? React.createElement(C, props) : null;
  };
  (Proxy as any).__ptdlIconProxy = lucideKey;
  return Proxy;
}

type RemapRow = { sourceKey: string; lucideKey: string };

// ---- CSS-mask override (covers icons NocoBase HARD-CODES as JSX, not just registry ones) --------
// Ant Design icons always render as `<span class="anticon anticon-<name>"><svg/></span>` — regardless
// of whether they came through the registry or a direct JSX import. So we ALSO inject a stylesheet
// that hides the built-in glyph and paints the Lucide shape as a currentColor mask on that class. This
// is what lets header-chrome icons (gear, user, +, help…) actually change — the registry override alone
// can't touch those. The class is read from the ORIGINAL antd component's own markup (robust to word
// boundaries the lowercased registry key loses, e.g. "appstore-add"). The Lucide SVG is rendered from
// the registry component; used only as an alpha mask, so its stroke color is irrelevant.
const CSS_ID = 'ptdl-icon-remap-css';

function svgToDataUri(markup: string): string {
  return `data:image/svg+xml,${encodeURIComponent(markup).replace(/'/g, '%27').replace(/"/g, '%22')}`;
}

function lucideMarkup(lucideKey: string): string | null {
  const C = iconsMap?.get(String(lucideKey).toLowerCase());
  if (!C) return null;
  const html = renderMarkup(React.createElement(C, { width: 24, height: 24 }));
  if (!html) return null;
  const m = html.match(/<svg[\s\S]*<\/svg>/);
  return m ? m[0] : null;
}

// The `anticon-<name>` suffix antd puts on the rendered element for a given icon component.
function antdClassFor(sourceKey: string): string | null {
  const C = initialSnapshot?.get(String(sourceKey).toLowerCase());
  if (!C) return null;
  const html = renderMarkup(React.createElement(C));
  if (!html) return null;
  const m = html.match(/anticon-([a-z0-9-]+)/);
  return m ? m[1] : null;
}

function rebuildCss(list: RemapRow[]) {
  if (typeof document === 'undefined') return;
  let el = document.getElementById(CSS_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = CSS_ID;
    document.head.appendChild(el);
  }
  const blocks: string[] = [];
  let ok = 0;
  let total = 0;
  for (const r of list || []) {
    if (!r?.sourceKey || !r?.lucideKey) continue;
    total++;
    const cls = antdClassFor(r.sourceKey);
    const mk = lucideMarkup(r.lucideKey);
    if (!cls || !mk) {
      // eslint-disable-next-line no-console
      console.warn('[icon-remap] css skip', r.sourceKey, '→', r.lucideKey, { antdClass: cls, lucideSvg: !!mk });
      continue;
    }
    ok++;
    const uri = svgToDataUri(mk);
    blocks.push(
      `.anticon.anticon-${cls} > svg{display:none!important}` +
        `.anticon.anticon-${cls}::before{content:"";display:inline-block;width:1em;height:1em;vertical-align:-0.125em;` +
        `background-color:currentColor;-webkit-mask:url("${uri}") center/contain no-repeat;mask:url("${uri}") center/contain no-repeat;}`,
    );
  }
  el.textContent = blocks.join('\n');
  // eslint-disable-next-line no-console
  console.log(`[icon-remap] css mask rules built: ${ok}/${total}`);
}

// Apply a full desired mapping list: override wanted keys, restore ones no longer present.
export function applyRemaps(list: RemapRow[]) {
  if (!iconsMap) return;
  const want = new Map<string, string>();
  for (const r of list || []) {
    if (r?.sourceKey && r?.lucideKey) want.set(String(r.sourceKey).toLowerCase(), r.lucideKey);
  }
  // Restore previously-applied keys that are no longer wanted.
  for (const src of Array.from(applied)) {
    if (!want.has(src)) {
      const orig = initialSnapshot?.get(src);
      if (orig) iconsMap.set(src, orig);
      else iconsMap.delete(src);
      applied.delete(src);
    }
  }
  // Apply / refresh wanted keys (registry path — for icons drawn via <Icon type>).
  for (const [src, lucideKey] of want) {
    iconsMap.set(src, makeProxy(lucideKey));
    applied.add(src);
  }
  // CSS path — for hard-coded antd icons (and a harmless belt-and-suspenders for registry ones).
  rebuildCss(list);
  bumpVersion();
}

// SQLite (esp. on Windows) transiently throws `SQLITE_BUSY: database is locked` → HTTP 500 under any
// write contention. The save flow fires several writes in a row, so wrap each request in a short retry.
async function reqRetry(api: any, opts: any, attempts = 4): Promise<any> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await api.request(opts);
    } catch (e: any) {
      lastErr = e;
      const status = e?.response?.status ?? e?.status;
      const msg = String(e?.response?.data?.errors?.[0]?.message || e?.message || '');
      const retryable = status === 500 || /busy|locked|timeout/i.test(msg);
      if (!retryable || i === attempts - 1) break;
      await new Promise((r) => setTimeout(r, 150 * (i + 1)));
    }
  }
  throw lastErr;
}

export async function loadAndApply(api: any) {
  if (!api?.request) return;
  try {
    const res = await api.request({ url: 'ptdlIconRemaps:list', params: { pageSize: 500 } });
    const rows: RemapRow[] = res?.data?.data || [];
    applyRemaps(rows);
    // eslint-disable-next-line no-console
    console.log('[icon-remap] applied', rows.length, 'mapping(s)');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[icon-remap] load failed (table may be new/empty)', e);
  }
}

// ---- Registry icon picker (popover grid), filtered to antd (source) or lucide (target) ----------
const hasSuffix = (k: string) => /(?:outlined|filled|twotone)$/.test(k);
function keysFor(mode: 'antd' | 'lucide', q: string): string[] {
  const src = initialSnapshot || iconsMap;
  if (!src) return [];
  const ql = q.trim().toLowerCase();
  const all = Array.from(src.keys());
  const isAliasDup = (k: string) => !hasSuffix(k) && (src.has(`${k}outlined`) || src.has(`${k}filled`) || src.has(`${k}twotone`));
  if (mode === 'lucide') {
    return all.filter((k) => k.startsWith('lucide-') && !isAliasDup(k) && k.includes(ql)).sort();
  }
  // antd: no dash + real icon (suffix present) → excludes lucide and the bogus utility exports.
  return all.filter((k) => !k.includes('-') && hasSuffix(k) && k.includes(ql)).sort();
}

function RegistryPicker({ mode, value, onChange }: { mode: 'antd' | 'lucide'; value?: string; onChange: (k?: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const { token } = theme.useToken();
  const tv = themeVars(token);
  const keys = keysFor(mode, q);
  const CAP = 120;
  const shown = keys.slice(0, CAP);
  const over = keys.length - shown.length;
  // Preview the picked icon: source (antd) from the snapshot; target (lucide) from live map.
  const previewFrom = mode === 'antd' ? initialSnapshot : iconsMap;
  const content = (
    <div style={{ width: 340, ...tv }}>
      <Input size="small" allowClear placeholder={tt('Search {{lib}}… e.g. setting, home', { lib: mode === 'antd' ? 'Ant Design' : 'Lucide' })} value={q} onChange={(e: any) => setQ(e.target.value)} />
      <div style={{ maxHeight: 260, overflow: 'auto', marginTop: 8 }}>
        {shown.length === 0 ? (
          <div style={{ color: token.colorTextTertiary, padding: 8 }}>{tt('No match')}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4 }}>
            {shown.map((k) => {
              const active = k === value;
              return (
                <button
                  key={k}
                  type="button"
                  title={k}
                  onClick={() => {
                    onChange(k);
                    setOpen(false);
                  }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 30, fontSize: 18, border: active ? '1px solid #1677ff' : '1px solid transparent', borderRadius: 6, background: active ? 'rgba(22,119,255,0.12)' : 'transparent', cursor: 'pointer' }}
                >
                  <RawIcon mapKey={k} from={previewFrom} />
                </button>
              );
            })}
          </div>
        )}
        {over > 0 ? <div style={{ fontSize: 12, color: token.colorTextTertiary, marginTop: 4 }}>{tt('+{{over}} more — type to narrow', { over })}</div> : null}
      </div>
    </div>
  );
  return (
    <Popover open={open} onOpenChange={setOpen} trigger="click" placement="bottomLeft" content={content}>
      <Button size="small" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 150, justifyContent: 'flex-start' }}>
        {value ? <RawIcon mapKey={value} from={previewFrom} /> : <span style={{ color: token.colorTextQuaternary }}>＋</span>}
        <span style={{ fontSize: 12, color: value ? undefined : token.colorTextTertiary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || tt('Select…')}</span>
      </Button>
    </Popover>
  );
}

// ---- The Settings pane (factory so each lane can inject its own apiClient) ----------------------
type FormRow = { id?: number; sourceKey: string; lucideKey: string; _k: string };
let rowSeq = 0;
const nextK = () => `row-${rowSeq++}`;

// --- CSV portability (carry a mapping between NocoBase instances) --------------------------------
function rowsToCsv(rows: FormRow[]): string {
  const valid = rows.filter((r) => r.sourceKey && r.lucideKey);
  return ['sourceKey,lucideKey', ...valid.map((r) => `${r.sourceKey},${r.lucideKey}`)].join('\r\n');
}

function parseCsv(text: string): FormRow[] {
  const out: FormRow[] = [];
  (text || '').split(/\r?\n/).forEach((line) => {
    const t = line.trim();
    if (!t) return;
    const cells = t.split(',').map((s) => (s || '').trim().replace(/^"|"$/g, ''));
    const [a, b] = cells;
    if (!a || !b) return;
    if (a.toLowerCase() === 'sourcekey' && b.toLowerCase() === 'lucidekey') return; // header row
    out.push({ sourceKey: a, lucideKey: b, _k: nextK() });
  });
  return out;
}

function downloadCsv(filename: string, csv: string) {
  if (typeof document === 'undefined') return;
  // Prepend a UTF-8 BOM so Excel opens it cleanly.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function createIconRemapPane(deps: { getApi: () => any }) {
  const IconRemapPane: React.FC = () => {
    useVersion(); // re-render previews when overrides change
    const [rows, setRows] = React.useState<FormRow[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    const { token } = theme.useToken();
    const tv = themeVars(token);

    const load = React.useCallback(async () => {
      setLoading(true);
      try {
        const api = deps.getApi();
        const res = await api.request({ url: 'ptdlIconRemaps:list', params: { pageSize: 500, sort: ['id'] } });
        const list = (res?.data?.data || []).map((r: any) => ({ id: r.id, sourceKey: r.sourceKey, lucideKey: r.lucideKey, _k: nextK() }));
        setRows(list);
      } catch (e) {
        setRows([]);
      }
      setLoading(false);
    }, []);

    React.useEffect(() => {
      load();
    }, [load]);

    const update = (k: string, patch: Partial<FormRow>) => setRows((rs) => rs.map((r) => (r._k === k ? { ...r, ...patch } : r)));
    const remove = (k: string) => setRows((rs) => rs.filter((r) => r._k !== k));
    const add = () => setRows((rs) => [...rs, { sourceKey: '', lucideKey: '', _k: nextK() }]);

    const exportCsv = () => {
      const valid = rows.filter((r) => r.sourceKey && r.lucideKey);
      if (!valid.length) {
        message.warning(tt('No complete mappings to export.'));
        return;
      }
      downloadCsv('icon-remap.csv', rowsToCsv(rows));
    };

    // Read a picked CSV into the form (replaces current rows). User still clicks Save to persist.
    const importCsv = (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = parseCsv(String(reader.result || ''));
          if (!parsed.length) {
            message.warning(tt('No valid rows found in the CSV (expected: sourceKey,lucideKey).'));
            return;
          }
          // Dedupe by sourceKey (last wins).
          const byKey = new Map<string, FormRow>();
          parsed.forEach((r) => byKey.set(r.sourceKey, r));
          setRows(Array.from(byKey.values()));
          message.success(tt('Imported {{n}} mapping(s) — click Save to apply.', { n: byKey.size }));
        } catch (e: any) {
          message.error(tt('Failed to parse CSV: {{err}}', { err: e?.message || tt('unknown') }));
        }
      };
      reader.readAsText(file);
    };

    const save = async () => {
      setSaving(true);
      try {
        const api = deps.getApi();
        const valid = rows.filter((r) => r.sourceKey && r.lucideKey);
        // Dedupe by sourceKey (last wins) — a key can only map to one icon.
        const byKey = new Map<string, FormRow>();
        valid.forEach((r) => byKey.set(r.sourceKey, r));
        const finalRows = Array.from(byKey.values());
        const keep = new Set(finalRows.map((r) => r.sourceKey));
        // Current server state, keyed by sourceKey (avoids updateOrCreate — it mis-selects a phantom
        // column on this unique field in NocoBase 2.1.19; plain list/create/update work fine).
        const serverRes = await reqRetry(api, { url: 'ptdlIconRemaps:list', params: { pageSize: 500 } });
        const serverRows = serverRes?.data?.data || [];
        const serverByKey = new Map<string, any>();
        serverRows.forEach((s: any) => serverByKey.set(s.sourceKey, s));
        // Delete server rows dropped from the form.
        for (const s of serverRows) {
          if (!keep.has(s.sourceKey)) {
            await reqRetry(api, { url: 'ptdlIconRemaps:destroy', method: 'post', params: { filterByTk: s.id } });
          }
        }
        // Create new / update changed rows.
        for (const r of finalRows) {
          const found = serverByKey.get(r.sourceKey);
          if (found) {
            if (found.lucideKey !== r.lucideKey) {
              await reqRetry(api, { url: 'ptdlIconRemaps:update', method: 'post', params: { filterByTk: found.id }, data: { lucideKey: r.lucideKey } });
            }
          } else {
            await reqRetry(api, { url: 'ptdlIconRemaps:create', method: 'post', data: { sourceKey: r.sourceKey, lucideKey: r.lucideKey } });
          }
        }
        applyRemaps(finalRows);
        message.success(tt('Icon mappings saved. Refresh (Ctrl+Shift+R) to update icons everywhere.'));
        await load();
      } catch (e: any) {
        message.error(tt('Save failed: {{err}}', { err: e?.response?.data?.errors?.[0]?.message || e?.message || tt('unknown') }));
      }
      setSaving(false);
    };

    const columns = [
      {
        title: tt('Built-in icon (Ant Design)'),
        key: 'src',
        width: 210,
        render: (_: any, r: FormRow) => <RegistryPicker mode="antd" value={r.sourceKey} onChange={(k) => update(r._k, { sourceKey: k || '' })} />,
      },
      { title: '', key: 'arrow', width: 30, render: () => <span style={{ color: token.colorTextTertiary }}>→</span> },
      {
        title: tt('Replace with (Lucide)'),
        key: 'dst',
        width: 210,
        render: (_: any, r: FormRow) => <RegistryPicker mode="lucide" value={r.lucideKey} onChange={(k) => update(r._k, { lucideKey: k || '' })} />,
      },
      {
        title: tt('Result'),
        key: 'preview',
        width: 90,
        render: (_: any, r: FormRow) => (
          <Space>
            <RawIcon mapKey={r.sourceKey} from={initialSnapshot} />
            <span style={{ color: token.colorTextQuaternary }}>→</span>
            <span style={{ fontSize: 16 }}>
              <RawIcon mapKey={r.lucideKey} from={iconsMap} />
            </span>
          </Space>
        ),
      },
      {
        title: '',
        key: 'rm',
        width: 40,
        render: (_: any, r: FormRow) => (
          <Tooltip title={tt('Remove')}>
            <Button size="small" danger type="text" onClick={() => remove(r._k)}>
              ✕
            </Button>
          </Tooltip>
        ),
      },
    ];

    return (
      <div
        style={{
          padding: 20,
          maxWidth: 1200,
          margin: '8px auto 16px',
          background: 'var(--colorBgContainer, #fff)',
          border: '0.8px solid var(--colorBorderSecondary, #f0f0f0)',
          borderRadius: 8,
          ...tv,
        }}
      >
        <h2 style={{ marginTop: 0 }}>{tt('Icon remap')}</h2>
        <p style={{ color: 'var(--colorTextSecondary, #888)', marginTop: 0 }}>
          {tt('Replace a built-in Ant Design icon with a Lucide icon — everywhere it appears (menu icons, settings icons, field icons, action buttons, and the header chrome). Overrides are global per icon and apply to both the classic (/admin) and modern (/v/) clients. After saving, hard-refresh (Ctrl+Shift+R) to update every icon.')}
        </p>
        <Table
          size="small"
          rowKey="_k"
          loading={loading}
          columns={columns as any}
          dataSource={rows}
          pagination={false}
          locale={{ emptyText: <Empty description={tt('No mappings yet')} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        />
        <Space style={{ marginTop: 16 }} wrap>
          <Button onClick={add}>{tt('+ Add mapping')}</Button>
          <Button type="primary" loading={saving} onClick={save}>
            {tt('Save')}
          </Button>
          <Button onClick={load} disabled={saving}>
            {tt('Reload')}
          </Button>
          <span style={{ width: 1, height: 20, background: 'var(--colorSplit, #eee)', display: 'inline-block', margin: '0 4px' }} />
          <Button onClick={exportCsv}>⬇ {tt('Download CSV')}</Button>
          <Upload
            accept=".csv,text/csv"
            showUploadList={false}
            beforeUpload={(file: any) => {
              importCsv(file as File);
              return Upload.LIST_IGNORE;
            }}
          >
            <Button>⬆ {tt('Import CSV')}</Button>
          </Upload>
        </Space>
        <p style={{ color: 'var(--colorTextTertiary, #999)', fontSize: 12, marginTop: 8 }}>
          {tt('CSV columns:')} <code>sourceKey,lucideKey</code> {tt('(e.g.')}{' '}
          <code>SettingOutlined,lucide-settings</code>
          {tt('). Import replaces the table below; click')} <b>{tt('Save')}</b>{' '}
          {tt('to apply on this instance.')}
        </p>
      </div>
    );
  };
  return IconRemapPane;
}
