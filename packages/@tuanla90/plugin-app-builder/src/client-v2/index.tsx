/**
 * App Builder — modern (`/v/`) lane. Hosts the PAGE tier of the compiler (via app.flowEngine +
 * routeRepository, reusing instant-create-page's builders) plus a floating launcher UI.
 *
 * The launcher: paste/load an App-Spec (JSON) → Validate (pure) → Create app (server data tier +
 * client page tier) → get clickable links to the generated pages. Also exposes
 * `window.__ptdlAppBuilder` (buildApp / validateAppSpec / samples) for scripted testing.
 */
import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plugin, Icon, icons } from '@nocobase/client-v2';
import { Alert, Button, Input, message, Modal, Popover, Progress, Segmented, Select, Space, Tabs, theme, Tooltip, Typography, Upload } from 'antd';
import {
  ToolOutlined, DashboardOutlined, ThunderboltOutlined, NumberOutlined, LineChartOutlined,
  FilterOutlined, EditOutlined, ReloadOutlined, CheckOutlined, FolderOutlined, PlusOutlined,
  PlayCircleOutlined, DeleteOutlined, RocketOutlined, SwapOutlined, UploadOutlined,
} from '@ant-design/icons';
import { validateAppSpec } from '../shared/appSpec';
import { buildApp, createMenuGroup, createPage, deleteApp, importData, materializeApp } from '../shared/materialize';
import { createDashboard, addWidgetToDashboard } from '../shared/dashboard';
import { ensureLauncherDock } from '../shared/launcherDock';
import { SAMPLE_BAN_HANG } from '../shared/samples';
import SpecPreview from './SpecPreview';
import { convertAppSheet, looksLikeAppSheet, type AppSheetSource } from '../shared/appsheetImport';
import enUS from '../locale/en-US.json';
import viVN from '../locale/vi-VN.json';

const NS = '@tuanla90/plugin-app-builder/client';

/** Render a Lucide icon from the custom-icons registry (`<Icon type="lucide-*">`), guarded by `icons.has()`
 *  so it degrades to an antd fallback when @tuanla90/plugin-custom-icons isn't installed. Lucide draws a raw
 *  <svg stroke="currentColor"> → size via fontSize, colour inherited.
 *  `inline-flex` (not the default inline SVG) removes the baseline descender gap that otherwise pushes the
 *  glyph visually ABOVE the text centre; `verticalAlign:-0.125em` matches how antd's own icons sit inline. */
const LIcon: React.FC<{ type: string; fallback?: React.ReactNode; size?: number; style?: React.CSSProperties }> =
  ({ type, fallback = null, size = 14, style }) =>
    Icon && (icons as any)?.has?.(type)
      ? <Icon type={type} style={{ fontSize: size, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', verticalAlign: '-0.125em', ...(style || {}) }} />
      : <>{fallback}</>;

// ── AI-Dashboard side panel — split view (no mask), replicating detail-panel's mechanism WITHOUT importing
//    it. NocoBase's AdminLayout renders a built-in `#nocobase-embed-container` as a FLEX SIBLING of the main
//    content; giving that sibling a width makes the browser reflow the page beside it (true split view, both
//    sides interactive — the dashboard stays fully visible). We portal the panel UI into that container and
//    set its width; on close we reset the width to `auto` (empty container → 0). If the container isn't
//    present (non-admin layout) we fall back to a fixed right-docked host (panel still works, page not shrunk). ──
const EMBED_ID = 'nocobase-embed-container';
const PANEL_WIDTH = 'min(540px, 46vw)';
const AiDashboardPanel: React.FC<{ open: boolean; title: React.ReactNode; onClose: () => void; children: React.ReactNode }> = ({ open, title, onClose, children }) => {
  const { token } = theme.useToken();
  const [host, setHost] = React.useState<HTMLElement | null>(null);
  React.useLayoutEffect(() => {
    if (!open || typeof document === 'undefined') { setHost(null); return; }
    const embed = document.getElementById(EMBED_ID) as HTMLElement | null;
    if (embed) {
      embed.style.width = PANEL_WIDTH; embed.style.minWidth = '0px'; embed.style.maxWidth = '';
      setHost(embed);
      return () => { embed.style.width = 'auto'; embed.style.minWidth = ''; embed.style.maxWidth = ''; };
    }
    const el = document.createElement('div');
    el.setAttribute('data-ptdl-appbuilder-panel', '1');
    Object.assign(el.style, { position: 'fixed', top: '0', right: '0', height: '100vh', width: PANEL_WIDTH, zIndex: '1000' } as CSSStyleDeclaration);
    document.body.appendChild(el);
    setHost(el);
    return () => { try { el.remove(); } catch { /* noop */ } };
  }, [open]);
  if (!open || !host) return null;
  return createPortal(
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: token.colorBgContainer, borderLeft: `1px solid ${token.colorBorderSecondary}`, boxShadow: '-2px 0 8px rgba(0,0,0,0.06)' }}>
      <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: `1px solid ${token.colorSplit}` }}>
        <span style={{ fontWeight: 600, fontSize: token.fontSizeLG }}>{title}</span>
        <Button type="text" size="small" aria-label="Close" onClick={onClose} style={{ marginRight: -6, fontSize: 16, lineHeight: 1 }}>✕</Button>
      </div>
      <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: 16 }}>{children}</div>
    </div>,
    host,
  );
};

/** Reactively read NocoBase v2's "UI editor" (flow-settings) toggle — the floating launcher only shows when
 *  it is ON, so it never clutters normal (non-edit) use. Mirrors the framework's own reader
 *  (@nocobase/client-v2): the "1"/"0" localStorage flag + its custom preference-change event (plus the
 *  native `storage` event so a toggle in another tab is picked up too). */
function useFlowSettingsEnabled(): boolean {
  const read = () => {
    try {
      return typeof window !== 'undefined' && window.localStorage.getItem('NOCOBASE_V2_FLOW_SETTINGS_ENABLED') === '1';
    } catch {
      return false;
    }
  };
  const [on, setOn] = React.useState(read);
  React.useEffect(() => {
    const h = () => setOn(read());
    window.addEventListener('nocobase:v2:flow-settings-preference-change', h);
    window.addEventListener('storage', h);
    return () => {
      window.removeEventListener('nocobase:v2:flow-settings-preference-change', h);
      window.removeEventListener('storage', h);
    };
  }, []);
  return on;
}

// ── ✨ Hover "Edit chart with AI" overlay ────────────────────────────────────────────────────────────
// When the /v/ UI-editor is ON, every Chart / Custom-HTML block on the page gets a small ✨ button
// (revealed on hover). Click → type an instruction → the server rewrites that block's ECharts `raw` /
// HTML code (appBuilder:aiRefineChart) → the block re-renders IN PLACE (no page reload). One-step Undo
// restores the previous code (appBuilder:setChartRaw). Gated to edit mode — blocks only carry
// `data-float-menu-model-uid` (the FULL-block anchor we hook — not the small `data-model-uid` toolbar
// strip) while the float settings menu is active, i.e. UI-editor on.

// Re-apply a block's config flow and redraw from `raw`, WITHOUT a full page reload. Returns false when the
// live model isn't reachable (the caller then falls back to a reload).
async function refreshBlockLive(app: any, uid: string, blockKind: 'chart' | 'html', raw: string): Promise<boolean> {
  const model = app?.flowEngine?.getModel?.(uid);
  if (!model) return false;
  try {
    if (blockKind === 'html') {
      const cur = model.getStepParams?.('customHtmlSettings', 'code') || {};
      model.setStepParams?.('customHtmlSettings', 'code', { ...cur, code: raw });
    } else {
      const cur = model.getStepParams?.('chartSettings', 'configure') || {};
      const opt = (cur.chart && cur.chart.option) || {};
      model.setStepParams?.('chartSettings', 'configure', { chart: { option: { ...opt, mode: 'custom', raw } } });
      try { if (model.props?.chart) model.props.chart.optionRaw = raw; } catch { /* noop */ }
    }
  } catch { /* stepParams shape drift — still try to re-run below */ }
  let ok = false;
  const flowKey = blockKind === 'html' ? 'customHtmlSettings' : 'chartSettings';
  try { if (typeof model.applyFlow === 'function') { await model.applyFlow(flowKey); ok = true; } } catch { /* flow key may differ across versions */ }
  try { if (typeof model.rerender === 'function') { await model.rerender(); ok = true; } } catch { /* noop */ }
  return ok;
}

type OverlayChart = { uid: string; title: string; blockKind: 'chart' | 'html'; el: HTMLElement };

const ChartAiButton: React.FC<{
  chart: OverlayChart; open: boolean; busy: boolean; instr: string; canUndo: boolean;
  t: (s: string) => string;
  onOpenChange: (o: boolean) => void; onInstr: (s: string) => void; onRefine: () => void; onUndo: () => void;
}> = ({ chart, open, busy, instr, canUndo, t, onOpenChange, onInstr, onRefine, onUndo }) => {
  const content = (
    <div style={{ width: 264 }} onClick={(e) => e.stopPropagation()}>
      <Typography.Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
        ✨ {t('Edit with AI')}{chart.title ? ` — ${chart.title}` : ''}
      </Typography.Text>
      <Input.TextArea
        autoFocus value={instr} onChange={(e) => onInstr(e.target.value)} rows={3} disabled={busy}
        placeholder={t('e.g. switch to a column chart, blue, add % labels')}
        onPressEnter={(e) => { if ((e as any).ctrlKey || (e as any).metaKey) { e.preventDefault(); onRefine(); } }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <Button size="small" disabled={!canUndo || busy} onClick={onUndo}
          icon={<LIcon type="lucide-undo2" fallback={<span>↶</span>} size={13} />}>
          {t('Undo')}
        </Button>
        <Button size="small" type="primary" loading={busy} onClick={onRefine}>{t('Apply')}</Button>
      </div>
    </div>
  );
  // top-centre of the chart (user's choice) — the native block toolbar (drag / linkage / ⚙ menu) sits TOP-right, so centre is clear
  return (
    <div className={'ptdl-chart-ai-btn' + (open ? ' ptdl-open' : '')} style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 20 }}>
      <Popover open={open} onOpenChange={onOpenChange} trigger="click" placement="bottom" content={content}>
        <Button size="small" type="primary" ghost
          icon={<LIcon type="lucide-sparkles" fallback={<span>✨</span>} size={14} />}
          style={{ background: 'rgba(255,255,255,0.94)', boxShadow: '0 2px 8px rgba(0,0,0,0.18)' }}>
          {t('AI')}
        </Button>
      </Popover>
    </div>
  );
};

function createChartAiOverlay(app: any, t: (s: string) => string): React.FC<{ children?: React.ReactNode }> {
  const ChartAiOverlay: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
    const editMode = useFlowSettingsEnabled();
    const [charts, setCharts] = useState<OverlayChart[]>([]);
    const [openUid, setOpenUid] = useState<string | null>(null);
    const [instr, setInstr] = useState('');
    const [busy, setBusy] = useState(false);
    const [prevRaw, setPrevRaw] = useState<Record<string, string>>({}); // uid → code BEFORE last AI edit (for Undo)
    const pageRef = React.useRef<string>('');

    // hover-reveal CSS for the ✨ button, injected once
    React.useEffect(() => {
      const id = 'ptdl-chart-ai-style';
      if (document.getElementById(id)) return;
      const s = document.createElement('style');
      s.id = id;
      s.textContent = '.ptdl-chart-ai-btn{opacity:0;pointer-events:none;transition:opacity .15s ease}[data-float-menu-model-uid]:hover>.ptdl-chart-ai-btn,.ptdl-chart-ai-btn.ptdl-open{opacity:1;pointer-events:auto}';
      document.head.appendChild(s);
    }, []);

    const pageUid = () => { try { return (window.location.pathname.match(/\/v\/[^/]+\/([^/?#]+)/) || [])[1] || ''; } catch { return ''; } };

    // Match each chart uid to its on-screen block element; drop those not currently rendered.
    const resolve = React.useCallback((list: Array<{ uid: string; title: string; blockKind: 'chart' | 'html' }>) => {
      const out: OverlayChart[] = [];
      for (const c of list) {
        const el = document.querySelector(`[data-float-menu-model-uid="${c.uid}"]`) as HTMLElement | null;
        if (el) out.push({ ...c, el });
      }
      setCharts((prev) => (prev.length === out.length && prev.every((p, i) => p.uid === out[i].uid && p.el === out[i].el) ? prev : out));
    }, []);

    // Load the page's chart list once, then keep re-matching DOM nodes on a light interval (charts render
    // async + flow re-renders can swap nodes; a page nav re-loads the list). Active only in edit mode.
    React.useEffect(() => {
      if (!editMode) { setCharts([]); setOpenUid(null); return; }
      let stop = false;
      let listCache: Array<{ uid: string; title: string; blockKind: 'chart' | 'html' }> = [];
      const reload = async () => {
        const pu = pageUid(); pageRef.current = pu;
        try {
          const res = await app.apiClient.request({ url: 'appBuilder:listCharts', method: 'post', data: { pageSchemaUid: pu } }).then((r: any) => r?.data?.data ?? r?.data);
          listCache = (res?.charts || []).map((c: any) => ({ uid: c.uid, title: c.title || t('Chart'), blockKind: c.blockKind === 'html' ? 'html' : 'chart' }));
        } catch { listCache = []; }
        if (!stop) resolve(listCache);
      };
      reload();
      const iv = window.setInterval(() => {
        if (stop) return;
        if (pageUid() !== pageRef.current) { reload(); return; }
        resolve(listCache);
      }, 1500);
      return () => { stop = true; window.clearInterval(iv); };
    }, [editMode, resolve, t]);

    const onRefine = async (c: OverlayChart) => {
      const instruction = instr.trim();
      if (!instruction) { message.warning(t('Type what to change')); return; }
      setBusy(true);
      try {
        const res = await app.apiClient
          .request({ url: 'appBuilder:aiRefineChart', method: 'post', data: { chartUid: c.uid, instruction } })
          .then((r: any) => r?.data?.data ?? r?.data);
        if (!res?.ok) { message.error(res?.error || t('AI could not edit the chart')); return; }
        setPrevRaw((m) => ({ ...m, [c.uid]: res.prevRaw || '' }));
        setInstr('');
        message.success(res.explain || t('Chart updated'));
        const live = await refreshBlockLive(app, c.uid, c.blockKind, res.raw);
        if (!live) { message.info(t('Reloading to show the change…')); setTimeout(() => { try { window.location.reload(); } catch { /* noop */ } }, 900); }
      } catch (e: any) {
        message.error(e?.message || String(e));
      } finally { setBusy(false); }
    };

    const onUndo = async (c: OverlayChart) => {
      const raw = prevRaw[c.uid];
      if (raw == null) return;
      setBusy(true);
      try {
        const res = await app.apiClient
          .request({ url: 'appBuilder:setChartRaw', method: 'post', data: { chartUid: c.uid, raw } })
          .then((r: any) => r?.data?.data ?? r?.data);
        if (!res?.ok) { message.error(res?.error || t('Could not undo')); return; }
        setPrevRaw((m) => { const n = { ...m }; delete n[c.uid]; return n; });
        message.success(t('Reverted to the previous version'));
        const live = await refreshBlockLive(app, c.uid, c.blockKind, raw);
        if (!live) setTimeout(() => { try { window.location.reload(); } catch { /* noop */ } }, 900);
      } catch (e: any) {
        message.error(e?.message || String(e));
      } finally { setBusy(false); }
    };

    return (
      <>
        {children}
        {editMode && charts.map((c) => createPortal(
          <ChartAiButton
            chart={c} open={openUid === c.uid} busy={busy} instr={openUid === c.uid ? instr : ''}
            canUndo={prevRaw[c.uid] != null} t={t}
            onOpenChange={(o) => { setOpenUid(o ? c.uid : null); if (o) setInstr(''); }}
            onInstr={setInstr} onRefine={() => onRefine(c)} onUndo={() => onUndo(c)}
          />, c.el, c.uid,
        ))}
      </>
    );
  };
  return ChartAiOverlay;
}

function createLauncher(app: any, t: (s: string) => string): React.FC<{ children?: React.ReactNode }> {
  const AppBuilderLauncher: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
    const [open, setOpen] = useState(false);
    const editMode = useFlowSettingsEnabled();
    // The shared draggable/collapsible launcher dock — the two buttons portal into it (see launcherDock.ts).
    const [dockEl, setDockEl] = useState<HTMLElement | null>(null);
    React.useEffect(() => { if (editMode) setDockEl(ensureLauncherDock()); }, [editMode]);
    const [text, setText] = useState(() => JSON.stringify(SAMPLE_BAN_HANG, null, 2));
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<{ pages: Array<{ title: string; collection: string; url: string; schemaUid: string }> } | null>(null);
    const [progress, setProgress] = useState<{ phase: string; label: string; done: number; total: number } | null>(null);
    // AppSheet import: when the JSON box holds an AppSheet blob, offer a one-click convert → App-Spec.
    // sourcePlan (docId+tab per collection) is kept so "Import data" can pull the Google Sheets afterwards.
    const [sourcePlan, setSourcePlan] = useState<AppSheetSource[] | null>(null);
    const [asReport, setAsReport] = useState<{ computedOk: number; computedFlag: number; dashboards: number; dynamicEnums: number; attachments: number; menuTables: string[] } | null>(null);
    const [desc, setDesc] = useState('');
    const [aiBusy, setAiBusy] = useState(false);
    const [plan, setPlan] = useState<Array<{ tool: string; args: any }> | null>(null);
    const [planBusy, setPlanBusy] = useState(false);
    const [runBusy, setRunBusy] = useState(false);
    const [planLog, setPlanLog] = useState<any[] | null>(null);
    const [lastArtifacts, setLastArtifacts] = useState<{ collections?: string[]; pages?: any[]; groups?: any[] } | null>(null);
    const [delBusy, setDelBusy] = useState(false);
    const [refineBusy, setRefineBusy] = useState(false);
    // Build-app modal is split into 3 tabs: 'new' (describe → create/refine one spec), 'existing' (AI plans
    // edits to the ALREADY-built app), 'json' (raw App-Spec editor). Tab 2 has its own input so it doesn't
    // fight tab 1's description box.
    const [appTab, setAppTab] = useState<'new' | 'existing' | 'json'>('new');
    const [planDesc, setPlanDesc] = useState('');
    // 📊 Dashboard launcher (separate flow: pick a collection → AI designs KPI + charts + filter board)
    const [dashOpen, setDashOpen] = useState(false);
    const [dashColl, setDashColl] = useState<string | undefined>(undefined);
    const [dashDesc, setDashDesc] = useState('');
    const [dashBusy, setDashBusy] = useState(false);
    const [dashResult, setDashResult] = useState<{ url: string; pageSchemaUid?: string; title: string; widgets: any[]; charts?: Array<{ uid: string; title?: string; chartType?: string }> } | null>(null);
    // Open a generated page via CLIENT-SIDE routing (not a full <a href> reload) so the launcher panel + the
    // just-generated result survive. Falls back to a normal navigation if the router isn't reachable.
    const goToPage = (pageSchemaUid?: string, fallbackUrl?: string) => {
      try { if (pageSchemaUid && app.router?.navigate) { app.router.navigate(`/admin/${pageSchemaUid}`); return; } } catch { /* fall through */ }
      try { if (fallbackUrl) window.location.assign(fallbackUrl); } catch { /* ignore */ }
    };
    const [chartRefine, setChartRefine] = useState<Record<string, string>>({}); // chartUid → instruction text
    const [chartRefineBusy, setChartRefineBusy] = useState<string | null>(null); // chartUid currently refining
    // ✏️ Refine an EXISTING chart (any dashboard in the app), not just one just generated.
    const [existingCharts, setExistingCharts] = useState<Array<{ uid: string; title: string; chartType: string; collection: string }> | null>(null);
    const [existingBusy, setExistingBusy] = useState(false);
    const [pickChart, setPickChart] = useState<string | undefined>(undefined);
    const [pickInstr, setPickInstr] = useState('');
    const [pickBusy, setPickBusy] = useState(false);
    // ＋ Add a NEW widget (chart/score/filter) to the dashboard you're viewing.
    const [addInstr, setAddInstr] = useState('');
    const [addBusy, setAddBusy] = useState(false);
    const [chartScope, setChartScope] = useState<'page' | 'app'>('page'); // list charts on THIS page vs whole app
    // 🔽 Manual "add a filter column" — pick field(s) from THIS dashboard's collection (+ optional display
    //    name) and drop them in as a filter bar wired to every chart/KPI. dashInfo = the dashboardFields payload.
    const [dashInfo, setDashInfo] = useState<{ gridUid: string; collection: string; chartUids: string[]; scoreUids: string[]; nextSort: number; fields: Array<{ name: string; title: string; interface?: string; type?: string }> } | null>(null);
    const [dashInfoBusy, setDashInfoBusy] = useState(false);
    const [pickFilterFields, setPickFilterFields] = useState<string[]>([]);
    const [filterLabels, setFilterLabels] = useState<Record<string, string>>({}); // field name → custom display name
    const [addFilterBusy, setAddFilterBusy] = useState(false);
    // the /v/ page schemaUid from the URL (…/v/admin/<uid>) — used to scope the chart list to this dashboard
    const currentPageUid = () => { try { return (window.location.pathname.match(/\/v\/[^/]+\/([^/?#]+)/) || [])[1] || ''; } catch { return ''; } };
    // Existing menu GROUPS the dashboard can be placed under (else it becomes a top-level menu item).
    const [dashGroup, setDashGroup] = useState<number | undefined>(undefined);
    const [menuGroups, setMenuGroups] = useState<Array<{ value: number; label: string }>>([]);
    React.useEffect(() => {
      if (!dashOpen) return;
      (async () => {
        try {
          const res = await app.apiClient.resource('desktopRoutes').list({ filter: { type: 'group' }, pageSize: 200, sort: ['sort'] }).then((r: any) => r?.data?.data ?? r?.data ?? []);
          setMenuGroups((res || []).map((g: any) => ({ value: g.id, label: String(g.title || `#${g.id}`).replace(/\{\{\s*t\(["']([^"']+)["']\)\s*\}\}/, '$1') })));
        } catch { setMenuGroups([]); }
      })();
    }, [dashOpen]);

    // User data collections to offer as the dashboard source (skip system/hidden ones).
    const collections = React.useMemo(() => {
      try {
        const ds = app.dataSourceManager?.getDataSource?.('main') || app.dataSourceManager?.dataSources?.get?.('main');
        const cm = ds?.collectionManager || ds;
        const list: any[] = cm?.getCollections?.() || (ds?.collections ? Array.from(ds.collections.values()) : []);
        return list
          .filter((c: any) => c && c.name && !c.options?.hidden && !/^(ptdl|ui|workflow|users|roles|desktop|mobile|application|storages|attachments|jobs|ai|llm|localization|theme|notification|authenticators|collections|fields|dataSources|systemSettings|tokenControl)/.test(c.name))
          .map((c: any) => { const title = c.title || c.options?.title; return { value: c.name, label: title && title !== c.name ? `${title} (${c.name})` : c.name }; })
          .sort((a, b) => a.label.localeCompare(b.label));
      } catch { return []; }
    }, [dashOpen]);

    // 📊 collection (+optional hint) → AI designs a DashboardSpec (server), then materialize it (client).
    const onDashboard = async () => {
      if (!dashColl) { message.warning(t('Pick a collection first')); return; }
      setDashBusy(true); setDashResult(null);
      try {
        const ai = await app.apiClient
          .request({ url: 'appBuilder:aiDashboard', method: 'post', data: { collection: dashColl, description: dashDesc } })
          .then((r: any) => r?.data?.data ?? r?.data);
        if (!ai?.ok) { message.error(ai?.error || t('AI could not design a dashboard')); return; }
        if (dashGroup) ai.spec.parentId = dashGroup; // place under the chosen menu group (else top-level)
        const built = await createDashboard(app, ai.spec);
        setDashResult({ url: built.url, pageSchemaUid: built.pageSchemaUid, title: ai.spec.title, widgets: ai.spec.widgets || [], charts: built.charts });
        setChartRefine({});
        message.success(ai.explain || t('Dashboard created'));
      } catch (e: any) {
        message.error(e?.message || String(e));
      } finally {
        setDashBusy(false);
      }
    };
    // ✏️ Chat-refine ONE chart's ECharts code (server rewrites its `raw` in place). Change shows on next
    // load of the dashboard — which the user opens via the link below, so no reload needed.
    const onRefineChart = async (chartUid: string) => {
      const instruction = (chartRefine[chartUid] || '').trim();
      if (!instruction) { message.warning(t('Type what to change')); return; }
      setChartRefineBusy(chartUid);
      try {
        const res = await app.apiClient
          .request({ url: 'appBuilder:aiRefineChart', method: 'post', data: { chartUid, instruction } })
          .then((r: any) => r?.data?.data ?? r?.data);
        if (!res?.ok) { message.error(res?.error || t('AI could not edit the chart')); return; }
        setChartRefine((m) => ({ ...m, [chartUid]: '' }));
        message.success(res.explain || t('Chart updated — open/reload the dashboard to see it'));
      } catch (e: any) {
        message.error(e?.message || String(e));
      } finally {
        setChartRefineBusy(null);
      }
    };
    // Load existing charts to refine — scoped to THIS dashboard page by default, or the whole app.
    const loadExistingCharts = async (scope: 'page' | 'app' = chartScope) => {
      setExistingBusy(true);
      try {
        const pageSchemaUid = scope === 'page' ? currentPageUid() : '';
        const res = await app.apiClient.request({ url: 'appBuilder:listCharts', method: 'post', data: { pageSchemaUid } }).then((r: any) => r?.data?.data ?? r?.data);
        if (!res?.ok) { message.error(res?.error || t('Could not list charts')); return; }
        setExistingCharts(res.charts || []);
        setPickChart(undefined);
        if (!res.charts?.length) message.info(scope === 'page' ? t('No charts on this page — switch to “Whole app” or open a dashboard') : t('No charts found — generate a dashboard first'));
      } catch (e: any) {
        message.error(e?.message || String(e));
      } finally {
        setExistingBusy(false);
      }
    };
    const onRefineExisting = async () => {
      if (!pickChart) { message.warning(t('Choose a chart first')); return; }
      if (!pickInstr.trim()) { message.warning(t('Type what to change')); return; }
      setPickBusy(true);
      try {
        const res = await app.apiClient
          .request({ url: 'appBuilder:aiRefineChart', method: 'post', data: { chartUid: pickChart, instruction: pickInstr } })
          .then((r: any) => r?.data?.data ?? r?.data);
        if (!res?.ok) { message.error(res?.error || t('AI could not edit the chart')); return; }
        setPickInstr('');
        // If the chart is on THIS page (scope=page), auto-reload so the change shows without a manual F5.
        // (A single chart block can't be re-rendered in isolation — its model lives in the page's own flow
        // context, unreachable from this launcher — so a page reload is the reliable refresh.)
        if (chartScope === 'page' && currentPageUid()) {
          message.success((res.explain || t('Chart updated')) + ' — ' + t('reloading…'));
          setTimeout(() => { try { window.location.reload(); } catch { /* noop */ } }, 1100);
        } else {
          message.success(res.explain || t('Chart updated — reload the dashboard page to see it'));
        }
      } catch (e: any) {
        message.error(e?.message || String(e));
      } finally {
        setPickBusy(false);
      }
    };
    // ＋ AI designs ONE widget from the description + adds it to the dashboard you're currently viewing.
    const onAddWidget = async () => {
      const pageSchemaUid = currentPageUid();
      if (!pageSchemaUid) { message.warning(t('Open a dashboard page first')); return; }
      if (!addInstr.trim()) { message.warning(t('Describe the widget to add')); return; }
      setAddBusy(true);
      try {
        const ai = await app.apiClient
          .request({ url: 'appBuilder:aiAddWidget', method: 'post', data: { pageSchemaUid, description: addInstr } })
          .then((r: any) => r?.data?.data ?? r?.data);
        if (!ai?.ok) { message.error(ai?.error || t('AI could not design a widget')); return; }
        const res = await addWidgetToDashboard(app, ai);
        if (!res.ok) { message.error(res.error || t('Could not add the widget')); return; }
        setAddInstr('');
        message.success((ai.explain || t('Widget added')) + ' — ' + t('reloading…'));
        setTimeout(() => { try { window.location.reload(); } catch { /* noop */ } }, 1100);
      } catch (e: any) {
        message.error(e?.message || String(e));
      } finally {
        setAddBusy(false);
      }
    };
    // 🔽 Load THIS dashboard's grid info + filterable fields (no AI), for the manual filter-column picker.
    const loadDashInfo = async () => {
      const pageSchemaUid = currentPageUid();
      if (!pageSchemaUid) { message.warning(t('Open a dashboard page first')); return; }
      setDashInfoBusy(true);
      try {
        const res = await app.apiClient
          .request({ url: 'appBuilder:dashboardFields', method: 'post', data: { pageSchemaUid } })
          .then((r: any) => r?.data?.data ?? r?.data);
        if (!res?.ok) { message.error(res?.error || t('Could not read the dashboard fields')); return; }
        setDashInfo(res);
        setPickFilterFields([]); setFilterLabels({});
        if (!res.fields?.length) message.info(t('No filterable fields found'));
      } catch (e: any) {
        message.error(e?.message || String(e));
      } finally {
        setDashInfoBusy(false);
      }
    };
    // Build a filter widget from the picked field(s) + label overrides → insert it (reuses addWidgetToDashboard).
    const onAddFilterFields = async () => {
      if (!dashInfo) return;
      if (!pickFilterFields.length) { message.warning(t('Pick at least one field')); return; }
      setAddFilterBusy(true);
      try {
        const labels: Record<string, string> = {};
        pickFilterFields.forEach((fn) => { const v = (filterLabels[fn] || '').trim(); if (v) labels[fn] = v; });
        const widget = { kind: 'filter' as const, fields: pickFilterFields, ...(Object.keys(labels).length ? { filterLabels: labels } : {}) };
        const res = await addWidgetToDashboard(app, { widget, gridUid: dashInfo.gridUid, collection: dashInfo.collection, chartUids: dashInfo.chartUids, scoreUids: dashInfo.scoreUids, nextSort: dashInfo.nextSort });
        if (!res.ok) { message.error(res.error || t('Could not add the widget')); return; }
        setPickFilterFields([]); setFilterLabels({});
        message.success(t('Filter added') + ' — ' + t('reloading…'));
        setTimeout(() => { try { window.location.reload(); } catch { /* noop */ } }, 1100);
      } catch (e: any) {
        message.error(e?.message || String(e));
      } finally {
        setAddFilterBusy(false);
      }
    };

    const parse = (): any => {
      try { return JSON.parse(text); } catch (e: any) { message.error(t('Invalid JSON') + ': ' + e.message); return null; }
    };
    const onValidate = () => {
      const spec = parse(); if (!spec) return;
      const r = validateAppSpec(spec);
      if (r.ok) message.success(t('Spec is valid') + (r.warnings.length ? ` · ${r.warnings.length} ⚠` : ''));
      else message.error(`${r.errors.length}: ` + r.errors.slice(0, 3).map((e) => e.message).join(' · '));
    };
    // 📤 Upload a JSON file into the editor — an AppSheet `loadApp` blob (downloaded from the browser) OR a
    // plain App-Spec JSON. We only READ the file into `text`; the existing `asBlob` memo then auto-detects an
    // AppSheet blob and shows the "Convert → App-Spec" banner (no duplicate convert logic here). `file.text()`
    // with a FileReader fallback keeps it working on older engines; a multi-MB AppSheet blob loads fine.
    const readFileText = (file: File): Promise<string> =>
      typeof (file as any).text === 'function'
        ? (file as any).text()
        : new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(String(fr.result || ''));
            fr.onerror = () => reject(fr.error || new Error('read failed'));
            fr.readAsText(file);
          });
    const onUploadFile = async (file: File) => {
      try {
        if (file.size > 25 * 1024 * 1024) { message.error(t('File too large (max 25MB)')); return; }
        const content = (await readFileText(file)).trim();
        if (!content) { message.error(t('The file is empty')); return; }
        setText(content);
        // Nudge the user toward the right next step based on what the file looks like (no auto-convert).
        try {
          const obj = JSON.parse(content);
          if (looksLikeAppSheet(obj) && !Array.isArray(obj?.collections)) message.success(t('AppSheet file loaded — click “Convert → App-Spec”'));
          else if (Array.isArray(obj?.collections)) message.success(t('App-Spec loaded — Validate then Create app'));
          else message.info(t('File loaded into the editor'));
        } catch { message.warning(t('Loaded, but this is not valid JSON — check the file')); }
      } catch (e: any) {
        message.error(t('Could not read the file') + ': ' + (e?.message || String(e)));
      }
    };
    // Is the JSON box currently an AppSheet blob (not already an App-Spec)? Gates the Convert banner.
    const asBlob = useMemo(() => { try { const o = JSON.parse(text); return looksLikeAppSheet(o) && !Array.isArray(o?.collections) ? o : null; } catch { return null; } }, [text]);
    const onConvertAppSheet = () => {
      if (!asBlob) return;
      try {
        const { spec, sourcePlan: sp, report } = convertAppSheet(asBlob);
        setText(JSON.stringify(spec, null, 2));
        setSourcePlan(sp);
        setAsReport({ computedOk: report.computedOk.length, computedFlag: report.computedFlag.length, dashboards: report.dashboards, dynamicEnums: report.dynamicEnums.length, attachments: report.attachments.length, menuTables: report.menuTables });
        message.success(`${t('Converted')}: ${spec.collections.length} ${t('tables')}, ${report.computedOk.length} ${t('formulas')}, ${report.dashboards} dashboard`);
      } catch (e: any) { message.error(t('AppSheet convert failed') + ': ' + (e?.message || e)); }
    };
    // Import data from the AppSheet Google Sheets (after building). Needs the sourcePlan from a convert.
    const onImportData = async () => {
      const spec = parse(); if (!spec || !sourcePlan) return;
      setBusy(true); setProgress({ phase: 'page', label: t('Importing data…'), done: 0, total: 1 });
      try {
        const res = await importData(app, spec, sourcePlan, (p) => setProgress({ phase: 'import', label: p.label, done: p.done, total: p.total }));
        const bad = res.results.filter((r: any) => r?.error);
        const retriedNote = res.retried?.length ? ` · ${res.retried.length} ${t('had a hiccup, auto-retried')}` : '';
        message[bad.length ? 'warning' : 'success'](`${t('Imported')} ${res.rows} ${t('rows')}, ${res.linked} ${t('links')}${bad.length ? ` · ${bad.length} ${t('sheets failed (see console)')}` : ''}${retriedNote}`);
        if (bad.length) console.warn('[app-builder] import issues:', bad);
      } catch (e: any) { message.error(e?.message || String(e)); }
      finally { setBusy(false); setProgress(null); }
    };
    const onBuild = async () => {
      const spec = parse(); if (!spec) return;
      const r = validateAppSpec(spec);
      if (!r.ok) { message.error(r.errors.slice(0, 3).map((e) => e.message).join(' · ')); return; }
      setBusy(true); setResult(null); setProgress({ phase: 'collection', label: t('Starting…'), done: 0, total: 1 });
      try {
        const res = await buildApp(app, spec, (p) => setProgress(p));
        setResult(res);
        setLastArtifacts({ collections: (spec.collections || []).map((c: any) => c.name), pages: res.pages, groups: res.groups });
        const errs = (res.data?.errors || []) as string[];
        if (errs.length) message.warning(`${t('Created')} ${res.pages.length} ${t('pages')} — ${errs.length} ${t('items skipped (see console)')}`), console.warn('[app-builder] build issues:', errs);
        else message.success(`${t('Created')} ${res.pages.length} ${t('pages')}`);
      } catch (e: any) {
        message.error(e?.message || String(e));
      } finally {
        setBusy(false); setProgress(null);
      }
    };
    // ✨ Describe → App-Spec via NocoBase's own AI (server action appBuilder:aiGenerate). Fills the JSON
    // box below so the user reviews before Create.
    const onAiGenerate = async () => {
      if (!desc.trim()) { message.warning(t('Describe your app first')); return; }
      // "Generate" REPLACES the editor with a brand-new app spec. If the editor already holds a real spec
      // (not the untouched demo), confirm first — accidentally regenerating instead of refining wipes it.
      let hasSpec = false;
      try { const cur = JSON.parse(text); hasSpec = Array.isArray(cur?.collections) && cur.collections.length > 0 && text !== JSON.stringify(SAMPLE_BAN_HANG, null, 2); } catch { /* not valid JSON → let it regenerate */ }
      if (hasSpec) {
        const go = await new Promise<boolean>((resolve) => Modal.confirm({
          title: t('Replace the current spec?'),
          content: t('“Generate” builds a NEW app and REPLACES the spec in the editor. To ADD to the current spec instead, Cancel and use “Refine spec (AI)” at the bottom (e.g. “add a teachers table”).'),
          okText: t('Generate new'), cancelText: t('Cancel'), okButtonProps: { danger: true },
          onOk: () => resolve(true), onCancel: () => resolve(false),
        }));
        if (!go) return;
      }
      setAiBusy(true);
      try {
        const res = await app.apiClient
          .request({ url: 'appBuilder:aiGenerate', method: 'post', data: { description: desc } })
          .then((r: any) => r?.data?.data ?? r?.data);
        if (!res?.ok) { message.error(res?.error || t('AI could not generate a spec')); return; }
        setText(JSON.stringify(res.spec, null, 2));
        message.success(res.explain || t('Spec generated — review then Create app'));
      } catch (e: any) {
        message.error(e?.message || String(e));
      } finally {
        setAiBusy(false);
      }
    };
    // ✏️ Chat-refine the CURRENT spec: AI keeps it and applies just the requested change, then re-fills the
    // box. Flow: preview → see something to fix → type the change → Refine → re-preview → Create.
    const onRefine = async () => {
      const spec = parse(); if (!spec) return;
      if (!desc.trim()) { message.warning(t('Type what to change')); return; }
      setRefineBusy(true);
      try {
        const res = await app.apiClient
          .request({ url: 'appBuilder:aiRefine', method: 'post', data: { spec, instruction: desc } })
          .then((r: any) => r?.data?.data ?? r?.data);
        if (!res?.ok) { message.error(res?.error || t('AI could not refine the spec')); return; }
        setText(JSON.stringify(res.spec, null, 2));
        setDesc('');
        message.success(res.explain || t('Spec updated — review then Create app'));
      } catch (e: any) {
        message.error(e?.message || String(e));
      } finally {
        setRefineBusy(false);
      }
    };
    // 🔧 Agentic: instruction → AI plans a sequence of tool calls (build new OR modify existing app,
    // using the live state as its eyes). Preview the steps, then Run executes them one by one.
    const onPlan = async () => {
      if (!planDesc.trim()) { message.warning(t('Describe your app first')); return; }
      setPlanBusy(true); setPlan(null); setPlanLog(null);
      try {
        const res = await app.apiClient
          .request({ url: 'appBuilder:aiPlan', method: 'post', data: { instruction: planDesc } })
          .then((r: any) => r?.data?.data ?? r?.data);
        if (!res?.ok) { message.error(res?.error || t('AI could not plan')); return; }
        setPlan(res.steps);
        message.success(res.explain || t('Plan ready — review then Run'));
      } catch (e: any) {
        message.error(e?.message || String(e));
      } finally {
        setPlanBusy(false);
      }
    };
    const onRunPlan = async () => {
      if (!plan) return;
      setRunBusy(true);
      try {
        const results: any[] = await (window as any).__ptdlAppBuilder.runPlan(plan);
        setPlanLog(results);
        // collect artifacts THIS plan created, for the delete/undo button
        const arts: any = { collections: [], pages: [], groups: [] };
        results.forEach((r) => {
          if (!r.ok) return;
          if (r.tool === 'createCollection' && r.out?.name) arts.collections.push(r.out.name);
          else if (r.tool === 'createPage' && r.out?.schemaUid) arts.pages.push({ schemaUid: r.out.schemaUid });
          else if (r.tool === 'createMenuGroup' && r.out != null) arts.groups.push({ id: r.out });
        });
        if (arts.collections.length || arts.pages.length) setLastArtifacts(arts);
        const okN = results.filter((r) => r.ok).length;
        (okN === results.length ? message.success : message.warning)(`${okN}/${results.length} ${t('steps ok')}`);
      } catch (e: any) {
        message.error(e?.message || String(e));
      } finally {
        setRunBusy(false);
      }
    };
    const onDeleteApp = async () => {
      if (!lastArtifacts) return;
      setDelBusy(true);
      try {
        const out = await deleteApp(app, lastArtifacts);
        message.success(`${t('Deleted')}: ${out.collections} collection · ${out.pages} ${t('pages')}`);
        setLastArtifacts(null); setResult(null); setPlan(null); setPlanLog(null);
      } catch (e: any) {
        message.error(e?.message || String(e));
      } finally {
        setDelBusy(false);
      }
    };

    // ── Shared bits of the Build-app modal, reused across its tabs ──────────────────────────────
    // Is there a real spec in the editor right now? Gates the "Edit spec" (refine) button.
    let hasCurrentSpec = false;
    try { const cur = JSON.parse(text); hasCurrentSpec = Array.isArray(cur?.collections) && cur.collections.length > 0; } catch { /* invalid JSON = nothing to refine */ }
    // Visual App-Spec preview (used on the "New module" tab).
    const specPreviewNode = (
      <div style={{ maxHeight: 420, overflow: 'auto', paddingRight: 4 }}>
        {(() => {
          try { return <SpecPreview spec={JSON.parse(text)} />; }
          catch (e: any) { return <Typography.Text type="danger">{t('Invalid JSON')}: {String(e?.message || e)}</Typography.Text>; }
        })()}
      </div>
    );
    // Create-app / Delete buttons + created-pages result — shown on both spec tabs (New module + JSON).
    const phaseLabel = (ph: string) => ({ collection: t('Table'), relation: t('Relation'), computed: t('Formula'), seed: t('Demo data'), page: t('Page'), dashboard: t('Dashboard'), import: t('Importing'), done: '' } as Record<string, string>)[ph] || '';
    const renderCreateActions = () => (
      <>
        <Space style={{ marginTop: 12 }} wrap>
          <Button type="primary" loading={busy} onClick={onBuild} icon={<LIcon type="lucide-rocket" fallback={<RocketOutlined />} />}>{t('Create app')}</Button>
          {/* After a convert, the sourcePlan lets us pull the AppSheet Google Sheets straight in. */}
          {sourcePlan && (
            <Button loading={busy} onClick={onImportData} icon={<LIcon type="lucide-download" fallback={<FolderOutlined />} />}>{t('Import data from sheets')}</Button>
          )}
          {lastArtifacts && (
            <Button danger loading={delBusy} onClick={onDeleteApp} icon={<LIcon type="lucide-trash" fallback={<DeleteOutlined />} />}>{t('Delete the app I just built')}</Button>
          )}
        </Space>
        {/* Live progress — the build now runs one item at a time (no monolithic call that times out). */}
        {busy && progress && (
          <div style={{ marginTop: 12 }}>
            <Progress percent={Math.round((progress.done / Math.max(1, progress.total)) * 100)} size="small" status="active" />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {progress.done}/{progress.total} · {phaseLabel(progress.phase)} <b>{progress.label}</b>
            </Typography.Text>
          </div>
        )}
        {result && (
          <div style={{ marginTop: 16 }}>
            <Typography.Text strong>{t('Created pages')}:</Typography.Text>
            <ul style={{ marginTop: 6 }}>
              {result.pages.map((p) => (
                <li key={p.schemaUid}>
                  <a href={p.url}>{p.title}</a> — <code>{p.collection}</code>
                </li>
              ))}
            </ul>
          </div>
        )}
      </>
    );

    return (
      <>
        {children}
        {editMode && (
          <>
        {dockEl && createPortal(
          <Tooltip title={t('Build app from spec')} placement="left">
            <Button
              type="primary" shape="round" onClick={() => setOpen(true)}
              icon={<LIcon type="lucide-hammer" fallback={<ToolOutlined />} size={15} />}
              style={{ boxShadow: '0 4px 14px rgba(0,0,0,0.18)' }}
            >
              {t('Build app')}
            </Button>
          </Tooltip>, dockEl)}
        <Modal open={open} onCancel={() => setOpen(false)} width={800} title={t('Build app from spec')} footer={null} destroyOnClose>
          <Tabs
            activeKey={appTab}
            onChange={(k) => setAppTab(k as 'new' | 'existing' | 'json')}
            items={[
              {
                key: 'new',
                label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><LIcon type="lucide-sparkles" fallback={<ThunderboltOutlined />} size={14} />{t('New module')}</span>,
                children: (
                  <>
                    <Input.TextArea
                      value={desc}
                      onChange={(e) => setDesc(e.target.value)}
                      rows={3}
                      placeholder={t('e.g. App quản lý bán hàng: khách hàng, sản phẩm, đơn hàng có dòng chi tiết + trạng thái đơn')}
                      style={{ marginBottom: 8 }}
                    />
                    <Space style={{ marginBottom: 8 }} wrap>
                      <Button type="primary" loading={aiBusy} onClick={onAiGenerate} icon={<LIcon type="lucide-sparkles" fallback={<ThunderboltOutlined />} />}>{t('Create new spec')}</Button>
                      <Button loading={refineBusy} onClick={onRefine} disabled={!hasCurrentSpec} icon={<LIcon type="lucide-wand-sparkles" fallback={<EditOutlined />} />}>{t('Edit spec')}</Button>
                    </Space>
                    <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 10 }}>
                      {t('“Create new spec” builds a fresh app (replaces the spec). “Edit spec” applies your text to the current spec.')}
                    </Typography.Paragraph>
                    {specPreviewNode}
                    {renderCreateActions()}
                  </>
                ),
              },
              {
                key: 'existing',
                label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><LIcon type="lucide-wrench" fallback={<ToolOutlined />} size={14} />{t('Modify running app')}</span>,
                children: (
                  <>
                    <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
                      {t('Change the app that is ALREADY built — AI plans the steps (add a table, a status field, a page…); review them, then Run.')}
                    </Typography.Paragraph>
                    <Input.TextArea
                      value={planDesc}
                      onChange={(e) => setPlanDesc(e.target.value)}
                      rows={3}
                      placeholder={t('e.g. add a Teachers table and a page for it; add a status field to Orders')}
                      style={{ marginBottom: 8 }}
                    />
                    <Button type="primary" loading={planBusy} onClick={onPlan} icon={<LIcon type="lucide-list-checks" fallback={<ToolOutlined />} />}>{t('Plan the change')}</Button>
                    {plan && (
                      <div style={{ marginTop: 14, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 6, padding: 10 }}>
                        <Space style={{ marginBottom: 6 }} wrap>
                          <Typography.Text strong>{t('Plan')} ({plan.length}):</Typography.Text>
                          <Button type="primary" loading={runBusy} onClick={onRunPlan} icon={<LIcon type="lucide-play" fallback={<PlayCircleOutlined />} />}>{t('Run plan')}</Button>
                        </Space>
                        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12, maxHeight: 220, overflow: 'auto' }}>
                          {plan.map((s, i) => {
                            const log = planLog?.[i];
                            return (
                              <li key={i} style={{ color: log ? (log.ok ? '#389e0d' : '#cf1322') : undefined }}>
                                <code>{s.tool}</code>(<span style={{ opacity: 0.75 }}>{s.args?.collection || s.args?.name || s.args?.title || s.args?.label || ''}</span>)
                                {log ? (log.ok ? ' ✓' : ` ✕ ${log.error || ''}`) : ''}
                              </li>
                            );
                          })}
                        </ol>
                      </div>
                    )}
                  </>
                ),
              },
              {
                key: 'json',
                label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><LIcon type="lucide-braces" fallback={<EditOutlined />} size={14} />JSON</span>,
                children: (
                  <>
                    <Space style={{ marginBottom: 8 }} wrap>
                      <Button onClick={() => setText(JSON.stringify(SAMPLE_BAN_HANG, null, 2))} icon={<LIcon type="lucide-folder-open" fallback={<FolderOutlined />} />}>{t('Load demo')}</Button>
                      {/* Upload a JSON file straight into the editor — reuses the existing detect/convert flow (asBlob → Convert banner). */}
                      <Upload accept=".json,.txt,application/json" showUploadList={false} beforeUpload={(file) => { onUploadFile(file as File); return false; }}>
                        <Button icon={<LIcon type="lucide-upload" fallback={<UploadOutlined />} />}>{t('Upload file')}</Button>
                      </Upload>
                      <Button onClick={onValidate} icon={<LIcon type="lucide-circle-check" fallback={<CheckOutlined />} />}>{t('Validate')}</Button>
                    </Space>
                    <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: -2, marginBottom: 8 }}>
                      {t('Upload an App-Spec JSON file, or an AppSheet loadApp file (downloaded from the browser).')}
                    </Typography.Paragraph>
                    {/* Paste an AppSheet app-definition blob → one-click convert to App-Spec (no CLI). */}
                    {asBlob && (
                      <Alert type="info" showIcon style={{ marginBottom: 8 }}
                        message={t('AppSheet app detected')}
                        description={t('This looks like an AppSheet app-definition. Convert it to an App-Spec you can review and build.')}
                        action={<Button size="small" type="primary" onClick={onConvertAppSheet} icon={<LIcon type="lucide-arrow-left-right" fallback={<SwapOutlined />} />}>{t('Convert → App-Spec')}</Button>}
                      />
                    )}
                    {asReport && !asBlob && (
                      <Alert type="success" showIcon style={{ marginBottom: 8 }}
                        message={`${t('Converted from AppSheet')} — ${asReport.computedOk} ${t('formulas')} ✓${asReport.computedFlag ? ` · ${asReport.computedFlag} ⚠` : ''} · ${asReport.dashboards} dashboard`}
                        description={
                          <span style={{ fontSize: 12 }}>
                            {asReport.dynamicEnums > 0 && <div>⚠ {asReport.dynamicEnums} {t('dynamic dropdowns → free text (need config tables)')}</div>}
                            {asReport.attachments > 0 && <div>⚠ {asReport.attachments} {t('attachments → text path')}</div>}
                            {asReport.menuTables.length > 0 && <div>🔲 {t('virtual-menu tables skipped')}: {asReport.menuTables.join(', ')}</div>}
                            {sourcePlan && <div>📥 {t('Ready to import data from')} {new Set(sourcePlan.map((s) => s.docId).filter(Boolean)).size} {t('sheet(s) after building')}</div>}
                          </span>
                        }
                      />
                    )}
                    <Input.TextArea value={text} onChange={(e) => setText(e.target.value)} rows={10} style={{ fontFamily: 'monospace', fontSize: 12 }} />
                    {/* Preview the pasted spec right here (same visual as the New-module tab) — no need to switch tabs. */}
                    {hasCurrentSpec && (
                      <div style={{ marginTop: 12 }}>
                        <Typography.Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                          <LIcon type="lucide-eye" fallback={<CheckOutlined />} size={13} /> {t('Preview')}
                        </Typography.Text>
                        {specPreviewNode}
                      </div>
                    )}
                    {renderCreateActions()}
                  </>
                ),
              },
            ]}
          />
        </Modal>
        {dockEl && createPortal(
          <Tooltip title={t('Generate a dashboard with AI')} placement="left">
            <Button
              type="primary" shape="round" onClick={() => setDashOpen(true)}
              icon={<LIcon type="lucide-layout-dashboard" fallback={<DashboardOutlined />} size={15} />}
              style={{ boxShadow: '0 4px 14px rgba(0,0,0,0.18)' }}
            >
              {t('Dashboard')}
            </Button>
          </Tooltip>, dockEl)}
        <AiDashboardPanel
          open={dashOpen} onClose={() => setDashOpen(false)}
          title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><LIcon type="lucide-layout-dashboard" fallback={<DashboardOutlined />} size={16} />{t('AI Dashboard')}</span>}
        >
          <Tabs
            defaultActiveKey="create"
            items={[
              {
                key: 'create',
                label: (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><LIcon type="lucide-sparkles" fallback={<ThunderboltOutlined />} />{t('Create')}</span>),
                children: (
                  <>
                    <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 10 }}>
                      {t('Pick a table — AI designs KPI cards + charts + a filter bar from its fields.')}
                    </Typography.Paragraph>
                    <Select showSearch value={dashColl} onChange={setDashColl} placeholder={t('Choose a table…')} options={collections} optionFilterProp="label" style={{ width: '100%', marginBottom: 8 }} />
                    <Input value={dashDesc} onChange={(e) => setDashDesc(e.target.value)} onPressEnter={onDashboard} placeholder={t('Optional: what to focus on — e.g. revenue by month, status breakdown')} style={{ marginBottom: 8 }} />
                    <Select
                      allowClear showSearch value={dashGroup} onChange={setDashGroup} optionFilterProp="label"
                      placeholder={t('Menu group (optional — else a top-level item)')} options={menuGroups}
                      style={{ width: '100%', marginBottom: 10 }}
                      suffixIcon={<LIcon type="lucide-folder" fallback={<FolderOutlined />} />}
                    />
                    <Button type="primary" block loading={dashBusy} onClick={onDashboard} disabled={!dashColl} icon={<LIcon type="lucide-sparkles" fallback={<ThunderboltOutlined />} />}>
                      {t('Generate dashboard (AI)')}
                    </Button>
                    {dashResult && (
                      <div style={{ marginTop: 16 }}>
                        <Typography.Text strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <LIcon type="lucide-check" fallback={<CheckOutlined />} style={{ color: '#52c41a' }} />
                          <a href={dashResult.url} onClick={(e) => { e.preventDefault(); goToPage(dashResult.pageSchemaUid, dashResult.url); }}>{dashResult.title}</a>
                        </Typography.Text>
                        <ul style={{ marginTop: 6, fontSize: 12, paddingLeft: 2, listStyle: 'none' }}>
                          {dashResult.widgets.map((w, i) => {
                            const meta = w.kind === 'score'
                              ? { icon: 'lucide-hash', fb: <NumberOutlined />, text: `${w.label} — ${w.measure?.aggregation}(${w.measure?.field})` }
                              : w.kind === 'chart'
                              ? { icon: 'lucide-line-chart', fb: <LineChartOutlined />, text: `${w.title} — ${w.chartType}` }
                              : { icon: 'lucide-filter', fb: <FilterOutlined />, text: `${t('Filter')}: ${(w.fields || []).join(', ')}` };
                            return (
                              <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '3px 0' }}>
                                <LIcon type={meta.icon} fallback={meta.fb} size={13} style={{ color: 'var(--colorTextTertiary, #999)' }} />
                                <span>{meta.text}</span>
                              </li>
                            );
                          })}
                        </ul>
                        {dashResult.charts && dashResult.charts.length > 0 && (
                          <div style={{ marginTop: 10, borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 10 }}>
                            <Typography.Text strong style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <LIcon type="lucide-pencil" fallback={<EditOutlined />} size={13} />{t('Edit a chart with AI')}:
                            </Typography.Text>
                            {dashResult.charts.map((c) => (
                              <Space.Compact key={c.uid} style={{ width: '100%', marginTop: 6 }}>
                                <Input
                                  addonBefore={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><LIcon type={c.chartType === 'html' ? 'lucide-hash' : 'lucide-line-chart'} fallback={c.chartType === 'html' ? <NumberOutlined /> : <LineChartOutlined />} size={12} />{c.title || c.chartType || 'chart'}</span>}
                                  value={chartRefine[c.uid] || ''}
                                  onChange={(e) => setChartRefine((m) => ({ ...m, [c.uid]: e.target.value }))}
                                  onPressEnter={() => onRefineChart(c.uid)}
                                  placeholder={t('e.g. turn into a bar chart, add data labels, green line')}
                                  disabled={chartRefineBusy === c.uid}
                                />
                                <Button loading={chartRefineBusy === c.uid} onClick={() => onRefineChart(c.uid)} icon={<LIcon type="lucide-wand-sparkles" fallback={<EditOutlined />} />} />
                              </Space.Compact>
                            ))}
                            <Typography.Paragraph type="secondary" style={{ fontSize: 11, marginTop: 6, marginBottom: 0 }}>
                              {t('The chart’s ECharts code is rewritten in place — open the dashboard above to see it (or edit it manually in the chart’s Configure panel).')}
                            </Typography.Paragraph>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ),
              },
              {
                key: 'edit',
                label: (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><LIcon type="lucide-pencil" fallback={<EditOutlined />} />{t('Edit dashboard')}</span>),
                children: (
                  <>
                    <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid rgba(128,128,128,0.2)' }}>
                      <Typography.Text strong style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <LIcon type="lucide-plus" fallback={<PlusOutlined />} size={13} />{t('Add a widget to THIS dashboard')}
                      </Typography.Text>
                      <Typography.Paragraph type="secondary" style={{ fontSize: 11, margin: '3px 0 6px' }}>
                        {t('Open the dashboard, then describe a chart/KPI/filter to add — the AI builds and inserts it.')}
                      </Typography.Paragraph>
                      <Space.Compact style={{ width: '100%' }}>
                        <Input value={addInstr} onChange={(e) => setAddInstr(e.target.value)} onPressEnter={onAddWidget} placeholder={t('e.g. add a revenue-by-quarter bar chart, add a filter by customer')} disabled={addBusy} />
                        <Button type="primary" loading={addBusy} onClick={onAddWidget} icon={<LIcon type="lucide-plus" fallback={<PlusOutlined />} />}>{t('Add')}</Button>
                      </Space.Compact>
                    </div>
                    {/* 🔽 Manual filter-column picker — pick field(s) + optional display name → one filter bar wired to every chart/KPI. */}
                    <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid rgba(128,128,128,0.2)' }}>
                      <Typography.Text strong style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <LIcon type="lucide-filter" fallback={<FilterOutlined />} size={13} />{t('Add a filter column (manual)')}
                      </Typography.Text>
                      <Typography.Paragraph type="secondary" style={{ fontSize: 11, margin: '3px 0 6px' }}>
                        {t('Open the dashboard, load its fields, then pick field(s) to add as a filter bar — set a display name if you like.')}
                      </Typography.Paragraph>
                      {!dashInfo ? (
                        <Button loading={dashInfoBusy} onClick={loadDashInfo} icon={<LIcon type="lucide-refresh-cw" fallback={<ReloadOutlined />} />}>{t('Load fields')}</Button>
                      ) : (
                        <>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                            <Select
                              mode="multiple" showSearch value={pickFilterFields} onChange={setPickFilterFields} optionFilterProp="label"
                              placeholder={t('Choose field(s) to filter by…')}
                              options={dashInfo.fields.map((f) => ({ value: f.name, label: `${f.title} · ${f.name}` }))}
                              style={{ flex: 1, minWidth: 200 }}
                            />
                            <Button loading={dashInfoBusy} onClick={loadDashInfo} icon={<LIcon type="lucide-refresh-cw" fallback={<ReloadOutlined />} />} title={t('Reload')} />
                          </div>
                          {pickFilterFields.length > 0 && (
                            <div style={{ marginBottom: 6 }}>
                              {pickFilterFields.map((fn) => {
                                const f = dashInfo.fields.find((x) => x.name === fn);
                                return (
                                  <div key={fn} style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '4px 0' }}>
                                    <span style={{ fontSize: 11, minWidth: 92, maxWidth: 92, color: 'var(--colorTextTertiary, #999)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={fn}>{fn}</span>
                                    <Input size="small" value={filterLabels[fn] || ''} onChange={(e) => setFilterLabels((m) => ({ ...m, [fn]: e.target.value }))} placeholder={f?.title || fn} />
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          <Button type="primary" loading={addFilterBusy} onClick={onAddFilterFields} disabled={!pickFilterFields.length} icon={<LIcon type="lucide-plus" fallback={<PlusOutlined />} />}>{t('Add filter')}</Button>
                        </>
                      )}
                    </div>
                    <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: '0 0 8px' }}>
                      {t('Or refine an existing chart: pick any chart already on a dashboard and describe the change — the AI rewrites it.')}
                    </Typography.Paragraph>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                      <Segmented value={chartScope} onChange={(val) => { const s = val as 'page' | 'app'; setChartScope(s); if (existingCharts) loadExistingCharts(s); }} options={[{ label: t('This page'), value: 'page' }, { label: t('Whole app'), value: 'app' }]} />
                      <Button loading={existingBusy} onClick={() => loadExistingCharts()} icon={<LIcon type="lucide-refresh-cw" fallback={<ReloadOutlined />} />}>
                        {existingCharts ? t('Reload') : t('Load charts')}
                      </Button>
                      {existingCharts && <Typography.Text type="secondary" style={{ fontSize: 11 }}>{existingCharts.length} {t('chart(s)')}</Typography.Text>}
                    </div>
                    {existingCharts && (
                      <>
                        <Select showSearch value={pickChart} onChange={setPickChart} optionFilterProp="label" placeholder={t('Choose a chart…')} options={existingCharts.map((c) => ({ value: c.uid, label: `${c.title} · ${c.chartType}${c.collection ? ' · ' + c.collection : ''}` }))} style={{ width: '100%', marginBottom: 8 }} notFoundContent={t('No charts found — generate a dashboard first')} />
                        <Space.Compact style={{ width: '100%' }}>
                          <Input value={pickInstr} onChange={(e) => setPickInstr(e.target.value)} onPressEnter={onRefineExisting} placeholder={t('e.g. turn into a bar chart, add data labels, green line')} disabled={pickBusy} />
                          <Button type="primary" loading={pickBusy} onClick={onRefineExisting} disabled={!pickChart} icon={<LIcon type="lucide-wand-sparkles" fallback={<EditOutlined />} />}>
                            {t('Refine')}
                          </Button>
                        </Space.Compact>
                        <Typography.Paragraph type="secondary" style={{ fontSize: 11, marginTop: 6, marginBottom: 0 }}>
                          {t('Reload the dashboard page to see the change.')}
                        </Typography.Paragraph>
                      </>
                    )}
                  </>
                ),
              },
            ]}
          />
        </AiDashboardPanel>
          </>
        )}
      </>
    );
  };
  return AppBuilderLauncher;
}

export class PluginAppBuilderClientV2 extends Plugin {
  async load() {
    const app: any = this.app;
    try {
      app.i18n?.addResources?.('en-US', NS, enUS);
      app.i18n?.addResources?.('vi-VN', NS, viVN);
    } catch { /* i18n best-effort */ }
    const t = (s: string) => { try { return app.i18n.t(s, { ns: NS }); } catch { return s; } };

    // ── Tool catalog: each app-building primitive as an individually-callable function, for step-by-step
    //    orchestration (AI tool-calling / scripts / power users). Data-tier tools hit the server actions;
    //    page-tier tools run client-side via flowEngine. `callTool(name, args)` is a generic dispatcher. ──
    try {
      const api = (op: string, data: any) =>
        app.apiClient.request({ url: `appBuilder:${op}`, method: 'post', data }).then((r: any) => r?.data?.data ?? r?.data);
      const tools: Record<string, (args: any) => any> = {
        // data tier (server) — create data model / field types / status flow / formulas / seed
        createCollection: (v) => api('createCollection', v),
        addField: (v) => api('addField', v),
        addRelation: (v) => api('addRelation', v),
        addComputed: (v) => api('addComputed', v),
        addStatusFlow: (v) => api('addStatusFlow', v),
        seed: (v) => api('seed', v),
        describeApp: (v) => api('describeApp', v || {}),
        validate: (spec) => validateAppSpec(spec),
        // delete / modify (guardrailed)
        dropField: (v) => api('dropField', v),
        dropCollection: (v) => api('dropCollection', v),
        renameField: (v) => api('renameField', v),
        deleteApp: (v) => deleteApp(app, v),
        // page tier (client) — build the UI
        createMenuGroup: (v) => createMenuGroup(app, v.label, v.icon),
        createPage: (v) => createPage(app, v, v.collectionSpec),
        // whole-app + AI
        apply: (spec) => api('apply', { spec }),
        materialize: (spec) => materializeApp(app, spec),
        buildApp: (spec) => buildApp(app, spec),
        aiGenerate: (v) => api('aiGenerate', v),
        aiPlan: (v) => api('aiPlan', v),
        // dashboard tier (client) — build a /v/ analytics page (score cards + ECharts charts + filter)
        createDashboard: (spec) => createDashboard(app, spec),
        aiDashboard: (v) => api('aiDashboard', v),
        aiRefineChart: (v) => api('aiRefineChart', v),
        listCharts: (v) => api('listCharts', v || {}),
      };
      // Execute an AI-planned sequence of tool calls step-by-step (data tools → server, page tools → client).
      const runPlan = async (steps: Array<{ tool: string; args: any }>) => {
        const results: any[] = [];
        for (const s of steps || []) {
          try {
            if (!tools[s.tool]) throw new Error('unknown tool ' + s.tool);
            results.push({ tool: s.tool, ok: true, out: await tools[s.tool](s.args) });
          } catch (e: any) {
            results.push({ tool: s.tool, ok: false, error: e?.message || String(e) });
          }
        }
        return results;
      };
      (window as any).__ptdlAppBuilder = {
        ...tools,
        tools,
        runPlan,
        callTool: (name: string, args: any) => (tools[name] ? tools[name](args) : Promise.reject(new Error('unknown tool: ' + name))),
        toolNames: Object.keys(tools),
        samples: { banHang: SAMPLE_BAN_HANG },
        validateAppSpec,
      };
    } catch { /* non-browser */ }

    try {
      app.addProvider(createLauncher(app, t));
    } catch { /* never break client load over the launcher */ }

    try {
      app.addProvider(createChartAiOverlay(app, t)); // ✨ hover-to-edit-with-AI on every chart (edit mode only)
    } catch { /* never break client load over the overlay */ }
  }
}

export default PluginAppBuilderClientV2;
