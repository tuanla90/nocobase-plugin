import React from 'react';
import { Button, Card, Input, Modal, Space, Upload, message, theme } from 'antd';

/**
 * @ptdl/plugin-branding — Import / Export. One portable JSON bundle carrying every branding config
 * (skin / typography / header-nav) AND the NocoBase Theme Editor themes (`themeConfig` antd tokens).
 * Export → download + copy; Import → paste/upload → server upserts everything → reload to apply.
 * Server actions: `brandingConfigs:exportBundle` / `brandingConfigs:importBundle` (admin only).
 */

let _api: any = null;
let _t: (s: string) => string = (s) => s;
export function initBackupUi(deps: { apiClient: any; t?: (s: string) => string }) {
  _api = deps.apiClient || _api;
  if (deps.t) _t = deps.t;
}

function download(name: string, text: string) {
  try {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    /* ignore — the textarea is the copy fallback */
  }
}

export function BrandingBackupPage() {
  const { token } = theme.useToken();
  const [exported, setExported] = React.useState('');
  const [importText, setImportText] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const doExport = async () => {
    if (!_api?.request) return;
    setBusy(true);
    try {
      const res = await _api.request({ url: 'brandingConfigs:exportBundle' });
      const data = res?.data?.data || res?.data || {};
      const json = JSON.stringify(data, null, 2);
      setExported(json);
      const stamp = String(data.exportedAt || '').slice(0, 10) || 'export';
      download(`branding-theme-${stamp}.json`, json);
      const nThemes = Array.isArray(data.themes) ? data.themes.length : 0;
      const nBrand = data.branding ? Object.keys(data.branding).length : 0;
      message.success(`${_t('Exported')} — ${nBrand} ${_t('branding')} · ${nThemes} ${_t('themes')}`);
    } catch (e) {
      message.error(_t('Export failed'));
    }
    setBusy(false);
  };

  const runImport = async (bundle: any) => {
    setBusy(true);
    try {
      const res = await _api.request({ url: 'brandingConfigs:importBundle', method: 'post', data: bundle });
      const r = res?.data?.data || res?.data || {};
      message.success(`${_t('Imported')} — ${r.brandingCount || 0} ${_t('branding')} · ${r.themeCount || 0} ${_t('themes')}`);
      Modal.confirm({
        title: _t('Reload now?'),
        content: _t('Reload the page to apply the imported theme for this session.'),
        okText: _t('Reload'),
        cancelText: _t('Later'),
        onOk: () => window.location.reload(),
      });
    } catch (e) {
      message.error(_t('Import failed'));
    }
    setBusy(false);
  };

  const doImport = () => {
    let parsed: any;
    try {
      parsed = JSON.parse(importText);
    } catch (e) {
      message.error(_t('Invalid JSON'));
      return;
    }
    if (!parsed || typeof parsed !== 'object' || (!parsed.branding && !parsed.themes)) {
      message.error(_t('This is not a theme bundle.'));
      return;
    }
    Modal.confirm({
      title: _t('Import this theme?'),
      content: _t('It overwrites the current branding and theme-editor settings for everyone. This cannot be undone — export the current one first as a backup.'),
      okText: _t('Import'),
      okButtonProps: { danger: true },
      cancelText: _t('Cancel'),
      onOk: () => runImport(parsed),
    });
  };

  const onPickFile = (file: any) => {
    const reader = new FileReader();
    reader.onload = () => setImportText(String(reader.result || ''));
    reader.readAsText(file);
    return false; // stop antd from uploading
  };

  const copy = () => {
    try {
      navigator.clipboard?.writeText(exported);
      message.success(_t('Copied'));
    } catch (e) {
      /* clipboard blocked — user can select the textarea manually */
    }
  };

  const monoStyle: React.CSSProperties = { marginTop: 12, fontFamily: "'SFMono-Regular',Consolas,Menlo,monospace", fontSize: 12 };

  return (
    <div style={{ padding: 20, maxWidth: 1440, margin: '0 auto' }}>
      <h2 style={{ marginTop: 0, marginBottom: 4 }}>{_t('Import / export')}</h2>
      <p style={{ color: token.colorTextTertiary, margin: '0 0 16px' }}>
        {_t('Back up or move a full look between instances: the branding tabs (skin, typography, header/logo) and the Theme Editor themes travel together in one JSON file.')}
      </p>

      {/* Export | Import side by side to use the width. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16, alignItems: 'start' }}>
      <Card size="small" title={_t('Export')} style={{ marginBottom: 0 }}>
        <Space wrap>
          <Button type="primary" loading={busy} onClick={doExport}>
            {_t('Export theme')}
          </Button>
          {exported ? <Button onClick={copy}>{_t('Copy')}</Button> : null}
        </Space>
        {exported ? <Input.TextArea value={exported} readOnly autoSize={{ minRows: 4, maxRows: 12 }} style={monoStyle} /> : null}
      </Card>

      <Card size="small" title={_t('Import')}>
        <Space wrap>
          <Upload accept="application/json,.json" beforeUpload={onPickFile} showUploadList={false}>
            <Button>{_t('Choose file…')}</Button>
          </Upload>
          <span style={{ color: token.colorTextQuaternary, fontSize: 12 }}>{_t('…or paste the exported JSON below')}</span>
        </Space>
        <Input.TextArea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder={'{ "_ptdlTheme": 1, "branding": { … }, "themes": [ … ] }'}
          autoSize={{ minRows: 4, maxRows: 12 }}
          style={monoStyle}
        />
        <div style={{ marginTop: 12 }}>
          <Button type="primary" danger loading={busy} disabled={!importText.trim()} onClick={doImport}>
            {_t('Import')}
          </Button>
        </div>
      </Card>
      </div>
    </div>
  );
}
