/**
 * App Builder — modern (`/v/`) lane. Hosts the PAGE tier of the compiler (via app.flowEngine +
 * routeRepository, reusing instant-create-page's builders) plus a floating launcher UI.
 *
 * The launcher: paste/load an App-Spec (JSON) → Validate (pure) → Create app (server data tier +
 * client page tier) → get clickable links to the generated pages. Also exposes
 * `window.__ptdlAppBuilder` (buildApp / validateAppSpec / samples) for scripted testing.
 */
import React, { useState } from 'react';
import { Plugin } from '@nocobase/client-v2';
import { Button, Input, message, Modal, Space, Tooltip, Typography } from 'antd';
import { validateAppSpec } from '../shared/appSpec';
import { buildApp, createMenuGroup, createPage, materializeApp } from '../shared/materialize';
import { SAMPLE_BAN_HANG } from '../shared/samples';
import enUS from '../locale/en-US.json';
import viVN from '../locale/vi-VN.json';

const NS = '@ptdl/plugin-app-builder/client';

function createLauncher(app: any, t: (s: string) => string): React.FC<{ children?: React.ReactNode }> {
  const AppBuilderLauncher: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
    const [open, setOpen] = useState(false);
    const [text, setText] = useState(() => JSON.stringify(SAMPLE_BAN_HANG, null, 2));
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<{ pages: Array<{ title: string; collection: string; url: string; schemaUid: string }> } | null>(null);
    const [desc, setDesc] = useState('');
    const [aiBusy, setAiBusy] = useState(false);
    const [plan, setPlan] = useState<Array<{ tool: string; args: any }> | null>(null);
    const [planBusy, setPlanBusy] = useState(false);
    const [runBusy, setRunBusy] = useState(false);
    const [planLog, setPlanLog] = useState<any[] | null>(null);

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
        const okN = results.filter((r) => r.ok).length;
        (okN === results.length ? message.success : message.warning)(`${okN}/${results.length} ${t('steps ok')}`);
      } catch (e: any) {
        message.error(e?.message || String(e));
      } finally {
        setRunBusy(false);
      }
    };

    return (
      <>
        {children}
        <Tooltip title={t('Build app from spec')} placement="left">
          <Button
            type="primary" shape="round" onClick={() => setOpen(true)}
            style={{ position: 'fixed', right: 20, bottom: 72, zIndex: 1000, boxShadow: '0 4px 14px rgba(0,0,0,0.18)' }}
          >
            🛠 {t('Build app')}
          </Button>
        </Tooltip>
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
            <Button type="primary" loading={aiBusy} onClick={onAiGenerate}>✨ {t('Generate with AI')}</Button>
            <Button loading={planBusy} onClick={onPlan}>🔧 {t('Build/modify step-by-step')}</Button>
          </Space>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 12 }}>
            {t('“Generate” fills the App-Spec below (a new app). “Step-by-step” lets AI plan tool calls — it can also MODIFY an existing app (e.g. add a status field / a page).')}
          </Typography.Paragraph>
          {plan && (
            <div style={{ marginBottom: 14, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 6, padding: 10 }}>
              <Space style={{ marginBottom: 6 }} wrap>
                <Typography.Text strong>{t('Plan')} ({plan.length}):</Typography.Text>
                <Button size="small" type="primary" loading={runBusy} onClick={onRunPlan}>▶ {t('Run plan')}</Button>
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
          <Typography.Paragraph type="secondary" style={{ marginTop: 0, marginBottom: 6, fontSize: 12 }}>
            {t('…or paste / load a demo App-Spec (JSON):')}
          </Typography.Paragraph>
          <Input.TextArea value={text} onChange={(e) => setText(e.target.value)} rows={14} style={{ fontFamily: 'monospace', fontSize: 12 }} />
          <Space style={{ marginTop: 12 }} wrap>
            <Button onClick={() => setText(JSON.stringify(SAMPLE_BAN_HANG, null, 2))}>{t('Load demo')}</Button>
            <Button onClick={onValidate}>{t('Validate')}</Button>
            <Button type="primary" loading={busy} onClick={onBuild}>{t('Create app')}</Button>
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
        // page tier (client) — build the UI
        createMenuGroup: (v) => createMenuGroup(app, v.label, v.icon),
        createPage: (v) => createPage(app, v, v.collectionSpec),
        // whole-app + AI
        apply: (spec) => api('apply', { spec }),
        materialize: (spec) => materializeApp(app, spec),
        buildApp: (spec) => buildApp(app, spec),
        aiGenerate: (v) => api('aiGenerate', v),
        aiPlan: (v) => api('aiPlan', v),
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
