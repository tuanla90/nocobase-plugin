/**
 * App Builder — modern (`/v/`) lane. Hosts the PAGE tier of the compiler (via app.flowEngine +
 * routeRepository, reusing instant-create-page's builders) plus a floating launcher UI.
 *
 * The launcher: paste/load an App-Spec (JSON) → Validate (pure) → Create app (server data tier +
 * client page tier) → get clickable links to the generated pages. Also exposes
 * `window.__ptdlAppBuilder` (buildApp / validateAppSpec / samples) for scripted testing.
 */
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plugin, Icon, icons } from '@nocobase/client-v2';
import { Button, Input, message, Modal, Segmented, Select, Space, Tabs, theme, Tooltip, Typography } from 'antd';
import {
  ToolOutlined, DashboardOutlined, ThunderboltOutlined, NumberOutlined, LineChartOutlined,
  FilterOutlined, EditOutlined, ReloadOutlined, CheckOutlined, FolderOutlined, PlusOutlined,
  EyeOutlined, PlayCircleOutlined, DeleteOutlined, RocketOutlined,
} from '@ant-design/icons';
import { validateAppSpec } from '../shared/appSpec';
import { buildApp, createMenuGroup, createPage, deleteApp, materializeApp } from '../shared/materialize';
import { createDashboard, addWidgetToDashboard } from '../shared/dashboard';
import { ensureLauncherDock } from '../shared/launcherDock';
import { SAMPLE_BAN_HANG } from '../shared/samples';
import SpecPreview from './SpecPreview';
import enUS from '../locale/en-US.json';
import viVN from '../locale/vi-VN.json';

const NS = '@ptdl/plugin-app-builder/client';

/** Render a Lucide icon from the custom-icons registry (`<Icon type="lucide-*">`), guarded by `icons.has()`
 *  so it degrades to an antd fallback when @ptdl/plugin-custom-icons isn't installed. Lucide draws a raw
 *  <svg stroke="currentColor"> → size via fontSize, colour inherited. */
const LIcon: React.FC<{ type: string; fallback?: React.ReactNode; size?: number; style?: React.CSSProperties }> =
  ({ type, fallback = null, size = 14, style }) =>
    Icon && (icons as any)?.has?.(type)
      ? <Icon type={type} style={{ fontSize: size, lineHeight: 0, ...(style || {}) }} />
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

function createLauncher(app: any, t: (s: string) => string): React.FC<{ children?: React.ReactNode }> {
  const AppBuilderLauncher: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
    const [open, setOpen] = useState(false);
    const editMode = useFlowSettingsEnabled();
    // The shared draggable/collapsible launcher dock — the two buttons portal into it (see launcherDock.ts).
    const [dockEl, setDockEl] = useState<HTMLElement | null>(null);
    React.useEffect(() => { if (editMode) setDockEl(ensureLauncherDock()); }, [editMode]);
    const [specView, setSpecView] = useState<'preview' | 'json'>('preview');
    const [text, setText] = useState(() => JSON.stringify(SAMPLE_BAN_HANG, null, 2));
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<{ pages: Array<{ title: string; collection: string; url: string; schemaUid: string }> } | null>(null);
    const [desc, setDesc] = useState('');
    const [aiBusy, setAiBusy] = useState(false);
    const [plan, setPlan] = useState<Array<{ tool: string; args: any }> | null>(null);
    const [planBusy, setPlanBusy] = useState(false);
    const [runBusy, setRunBusy] = useState(false);
    const [planLog, setPlanLog] = useState<any[] | null>(null);
    const [lastArtifacts, setLastArtifacts] = useState<{ collections?: string[]; pages?: any[]; groups?: any[] } | null>(null);
    const [delBusy, setDelBusy] = useState(false);
    const [refineText, setRefineText] = useState('');
    const [refineBusy, setRefineBusy] = useState(false);
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

    const parse = (): any => {
      try { return JSON.parse(text); } catch (e: any) { message.error(t('Invalid JSON') + ': ' + e.message); return null; }
    };
    const onValidate = () => {
      const spec = parse(); if (!spec) return;
      const r = validateAppSpec(spec);
      if (r.ok) message.success(t('Spec is valid') + (r.warnings.length ? ` · ${r.warnings.length} ⚠` : ''));
      else message.error(`${r.errors.length}: ` + r.errors.slice(0, 3).map((e) => e.message).join(' · '));
    };
    const onBuild = async () => {
      const spec = parse(); if (!spec) return;
      const r = validateAppSpec(spec);
      if (!r.ok) { message.error(r.errors.slice(0, 3).map((e) => e.message).join(' · ')); return; }
      setBusy(true); setResult(null);
      try {
        const res = await buildApp(app, spec);
        setResult(res);
        setLastArtifacts({ collections: (spec.collections || []).map((c: any) => c.name), pages: res.pages, groups: res.groups });
        message.success(`${t('Created')} ${res.pages.length} ${t('pages')}`);
      } catch (e: any) {
        message.error(e?.message || String(e));
      } finally {
        setBusy(false);
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
      if (!refineText.trim()) { message.warning(t('Type what to change')); return; }
      setRefineBusy(true);
      try {
        const res = await app.apiClient
          .request({ url: 'appBuilder:aiRefine', method: 'post', data: { spec, instruction: refineText } })
          .then((r: any) => r?.data?.data ?? r?.data);
        if (!res?.ok) { message.error(res?.error || t('AI could not refine the spec')); return; }
        setText(JSON.stringify(res.spec, null, 2));
        setRefineText('');
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
      if (!desc.trim()) { message.warning(t('Describe your app first')); return; }
      setPlanBusy(true); setPlan(null); setPlanLog(null);
      try {
        const res = await app.apiClient
          .request({ url: 'appBuilder:aiPlan', method: 'post', data: { instruction: desc } })
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
          <Typography.Text strong>✨ {t('Describe → build with AI')}</Typography.Text>
          <Input.TextArea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={2}
            placeholder={t('e.g. App quản lý bán hàng: khách hàng, sản phẩm, đơn hàng có dòng chi tiết + trạng thái đơn')}
            style={{ margin: '6px 0 8px' }}
          />
          <Space style={{ marginBottom: 8 }} wrap>
            <Button type="primary" loading={aiBusy} onClick={onAiGenerate} icon={<LIcon type="lucide-sparkles" fallback={<ThunderboltOutlined />} />}>{t('Generate with AI')}</Button>
            <Button loading={planBusy} onClick={onPlan} icon={<LIcon type="lucide-list-checks" fallback={<ToolOutlined />} />}>{t('Build/modify step-by-step')}</Button>
          </Space>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 12 }}>
            {t('“Generate” fills the App-Spec below (a new app). “Step-by-step” lets AI plan tool calls — it can also MODIFY an existing app (e.g. add a status field / a page).')}
          </Typography.Paragraph>
          {plan && (
            <div style={{ marginBottom: 14, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 6, padding: 10 }}>
              <Space style={{ marginBottom: 6 }} wrap>
                <Typography.Text strong>{t('Plan')} ({plan.length}):</Typography.Text>
                <Button type="primary" loading={runBusy} onClick={onRunPlan} icon={<LIcon type="lucide-play" fallback={<PlayCircleOutlined />} />}>{t('Run plan')}</Button>
              </Space>
              <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12, maxHeight: 170, overflow: 'auto' }}>
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
          <Space style={{ marginTop: 0, marginBottom: 8, width: '100%', justifyContent: 'space-between' }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('…or paste / load a demo App-Spec:')}</Typography.Text>
            <Segmented
              size="small"
              value={specView}
              onChange={(v) => setSpecView(v as 'preview' | 'json')}
              options={[{ label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><LIcon type="lucide-eye" fallback={<EyeOutlined />} size={12} />{t('Preview')}</span>, value: 'preview' }, { label: 'JSON', value: 'json' }]}
            />
          </Space>
          {specView === 'json' ? (
            <Input.TextArea value={text} onChange={(e) => setText(e.target.value)} rows={14} style={{ fontFamily: 'monospace', fontSize: 12 }} />
          ) : (
            <div style={{ maxHeight: 480, overflow: 'auto', paddingRight: 4 }}>
              {(() => {
                try {
                  return <SpecPreview spec={JSON.parse(text)} />;
                } catch (e: any) {
                  return <Typography.Text type="danger">{t('Invalid JSON')}: {String(e?.message || e)}</Typography.Text>;
                }
              })()}
            </div>
          )}
          <Space.Compact style={{ width: '100%', marginTop: 10 }}>
            <Input
              value={refineText}
              onChange={(e) => setRefineText(e.target.value)}
              placeholder={t('Chat to edit this spec — e.g. add a Notes column to Customers')}
              onPressEnter={onRefine}
              disabled={refineBusy}
            />
            <Button loading={refineBusy} onClick={onRefine} icon={<LIcon type="lucide-wand-sparkles" fallback={<EditOutlined />} />}>{t('Refine spec (AI)')}</Button>
          </Space.Compact>
          <Space style={{ marginTop: 12 }} wrap>
            <Button onClick={() => setText(JSON.stringify(SAMPLE_BAN_HANG, null, 2))}>{t('Load demo')}</Button>
            <Button onClick={onValidate}>{t('Validate')}</Button>
            <Button type="primary" loading={busy} onClick={onBuild} icon={<LIcon type="lucide-rocket" fallback={<RocketOutlined />} />}>{t('Create app')}</Button>
            {lastArtifacts && (
              <Button danger loading={delBusy} onClick={onDeleteApp} icon={<LIcon type="lucide-trash" fallback={<DeleteOutlined />} />}>{t('Delete the app I just built')}</Button>
            )}
          </Space>
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
                                  addonBefore={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><LIcon type="lucide-line-chart" fallback={<LineChartOutlined />} size={12} />{c.title || c.chartType || 'chart'}</span>}
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
  }
}

export default PluginAppBuilderClientV2;
