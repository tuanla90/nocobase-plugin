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
          <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
            {t('Paste an App-Spec (JSON) or load the demo below, then Create.')}
          </Typography.Paragraph>
          <Input.TextArea value={text} onChange={(e) => setText(e.target.value)} rows={16} style={{ fontFamily: 'monospace', fontSize: 12 }} />
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
        // whole-app
        apply: (spec) => api('apply', { spec }),
        materialize: (spec) => materializeApp(app, spec),
        buildApp: (spec) => buildApp(app, spec),
      };
      (window as any).__ptdlAppBuilder = {
        ...tools,
        tools,
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
