/**
 * Login configuration editor for the modern (`/v/`) lane — a plain-React port of the classic
 * (`/admin`) Formily pane in `../client/LoginConfiguration.tsx`. It edits the SAME `login_configs`
 * record (type `home`, active/`enabled`), writing the SAME `options` shape the /v/ login page reads
 * (`CustomSignInPageV2` / `normalizeLoginConfig`). No Formily → renders safely inside the /v/
 * settings page. Field labels reuse the existing i18n keys, so vi-VN translations come for free.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '@nocobase/client-v2';
import { useTranslation } from 'react-i18next';
import {
  Alert, Button, Card, Col, ColorPicker, Divider, Input, Row, Segmented, Select, Slider, Space, Spin, Switch, Typography, message,
} from 'antd';
import { GRADIENTS, gradientCss, ACCOUNT_ICONS, PASSWORD_ICONS } from '@tuanla90/shared';

const NAMESPACE = '@tuanla90/plugin-login-lite';

// The REAL /v/ sign-in components, injected by the plugin (client-v2/index.tsx) so the preview
// renders the exact same page the visitor sees — background, opacity, layout, theme all come from
// one source of truth and can't drift. Passed as props (not imported) to avoid an index ⇄ pane
// import cycle. See LoginPreview below.
type PreviewComponents = {
  AuthLayoutRenderV2: React.ComponentType<{ loginConfig?: any; children?: React.ReactNode }>;
  CustomSignInPageV2: React.ComponentType<{ loginConfig?: any }>;
};

// A crash in the reused sign-in components (e.g. a bad embedded-webpage URL, a missing auth context)
// must never take down the whole config screen — contain it and show a muted placeholder instead.
class PreviewErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.warn('[login-lite] preview render error', error);
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

type Options = {
  useSystemName?: 'yes' | 'no';
  customSystemName?: string;
  leftContentType?: 'gradient' | 'image' | 'html' | 'url';
  leftGradient?: string;
  leftImage?: string;
  leftUrl?: string;
  leftHtml?: string;
  loginMethods?: string[];
  copyright?: string;
  icp?: string;
  themeColor?: string;
  themeOpacity?: number;
  fontColor?: string;
  formThemeColor?: string;
  formFontColor?: string;
  buttonBgColor?: string;
  buttonTextColor?: string;
  formLayout?: 'panel' | 'float';
  formPosition?: 'left' | 'center' | 'right';
  showFieldIcons?: boolean;
  redirectPath?: string;
  logoUrl?: string;
  formTheme?: 'custom' | 'dark' | 'light' | 'system';
  accountIcon?: string;
  passwordIcon?: string;
};

const DEFAULTS: Options = {
  useSystemName: 'yes',
  leftContentType: 'gradient',
  leftGradient: 'space',
  themeColor: '#000000',
  fontColor: '#ffffff',
  formThemeColor: 'rgba(255,255,255,0.12)',
  formFontColor: '#ffffff',
  buttonBgColor: 'rgba(255,255,255,0.2)',
  buttonTextColor: '#ffffff',
  formLayout: 'panel',
  formPosition: 'left',
  showFieldIcons: true,
  formTheme: 'custom',
  accountIcon: 'user',
  passwordIcon: 'lock',
  copyright: '<div>Powered by NocoBase</div>',
  icp: '',
};

const GRADIENT_LABELS: Record<string, string> = {
  space: 'Deep space', midnight: 'Midnight', ocean: 'Ocean', violet: 'Violet',
  sunset: 'Sunset', aurora: 'Aurora', emerald: 'Emerald',
};

function toHex(c: any): string {
  return typeof c === 'string' ? c : c?.toHexString?.() || '';
}
function getErrorMessage(error: any, fallback: string): string {
  return error?.response?.data?.errors?.[0]?.message || error?.message || fallback;
}

export function LoginConfigPaneV2({ previewComponents }: { previewComponents?: PreviewComponents } = {}) {
  const app = useApp();
  const { t } = useTranslation(NAMESPACE);
  const api = app.apiClient;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recordId, setRecordId] = useState<number | undefined>();
  const [opt, setOpt] = useState<Options>(DEFAULTS);
  const [error, setError] = useState<string | undefined>();
  const [methods, setMethods] = useState<{ label: string; value: string }[]>([]);

  const load = async () => {
    setLoading(true);
    setError(undefined);
    try {
      const res: any = await api.resource('login_configs').getActiveConfig({ type: 'home' });
      const rec = res?.data?.data ?? res?.data ?? {};
      setRecordId(rec?.id);
      setOpt({ ...DEFAULTS, ...(rec?.options || {}) });
    } catch (e) {
      setOpt(DEFAULTS);
      setError(getErrorMessage(e, t('Failed to fetch login config')));
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // best-effort: list authenticators for the "Open login methods" picker
    api.resource('authenticators')
      .list({ paginate: false })
      .then((res: any) => {
        const rows = res?.data?.data || [];
        setMethods(rows.map((r: any) => ({ label: r.title || r.name, value: r.name })));
      })
      .catch(() => setMethods([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof Options>(k: K, v: Options[K]) => setOpt((o) => ({ ...o, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      if (recordId) {
        await api.resource('login_configs').update({ filterByTk: recordId, values: { options: opt } });
      } else {
        const { data }: any = await api.resource('login_configs').list({ filter: { type: 'home', enabled: true }, paginate: false });
        await Promise.all((data?.data || []).map((c: any) => api.resource('login_configs').update({ filterByTk: c.id, values: { enabled: false } })));
        const created: any = await api.resource('login_configs').create({ values: { type: 'home', enabled: true, title: 'Home', options: opt } });
        setRecordId(created?.data?.data?.id);
      }
      message.success(t('Updated successfully'));
    } catch (e) {
      message.error(getErrorMessage(e, t('Check failed')));
    }
    setSaving(false);
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spin /></div>;
  }

  const cp = (k: keyof Options) => (
    <ColorPicker
      allowClear
      value={(opt[k] as string) || undefined}
      onChange={(c) => set(k, toHex(c) as any)}
      showText
    />
  );
  const label = (s: string, hint?: string) => (
    <div style={{ marginBottom: 4 }}>
      <Typography.Text strong>{t(s)}</Typography.Text>
      {hint ? <div><Typography.Text type="secondary" style={{ fontSize: 12 }}>{t(hint)}</Typography.Text></div> : null}
    </div>
  );

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 460px', minWidth: 360, maxWidth: 640 }}>
        {error ? <Alert type="warning" showIcon message={error} style={{ marginBottom: 12 }} /> : null}

        {/* General */}
        <Card size="small" title={t('General')} style={{ marginBottom: 12 }}>
          {label('Use system name')}
          <Segmented
            value={opt.useSystemName || 'yes'}
            onChange={(v) => set('useSystemName', v as any)}
            options={[{ label: t('Yes'), value: 'yes' }, { label: t('No'), value: 'no' }]}
          />
          {opt.useSystemName === 'no' ? (
            <div style={{ marginTop: 8 }}>
              {label('Custom system name')}
              <Input value={opt.customSystemName} onChange={(e) => set('customSystemName', e.target.value)} />
            </div>
          ) : null}
          <Divider style={{ margin: '12px 0' }} />
          {label('Logo image URL', 'Optional logo shown above the form title. Leave empty to hide.')}
          <Input value={opt.logoUrl} onChange={(e) => set('logoUrl', e.target.value)} placeholder="https://…" />
          {methods.length ? (
            <div style={{ marginTop: 8 }}>
              {label('Open login methods')}
              <Select
                mode="multiple" allowClear style={{ width: '100%' }} options={methods}
                value={opt.loginMethods} onChange={(v) => set('loginMethods', v)}
              />
            </div>
          ) : null}
        </Card>

        {/* Background */}
        <Card size="small" title={t('Background')} style={{ marginBottom: 12 }}>
          {label('Left side content display')}
          <Segmented
            value={opt.leftContentType || 'gradient'}
            onChange={(v) => set('leftContentType', v as any)}
            options={[
              { label: t('Gradient'), value: 'gradient' }, { label: t('Image'), value: 'image' },
              { label: t('HTML embed'), value: 'html' }, { label: t('Webpage embed'), value: 'url' },
            ]}
          />
          <div style={{ marginTop: 8 }}>
            {opt.leftContentType === 'gradient' ? (
              <>
                {label('Gradient preset')}
                <Select
                  style={{ width: '100%' }} value={opt.leftGradient || 'space'} onChange={(v) => set('leftGradient', v)}
                  options={Object.keys(GRADIENTS).map((k) => ({
                    value: k,
                    label: (
                      <Space><span style={{ display: 'inline-block', width: 28, height: 14, borderRadius: 3, background: gradientCss(k) }} />{t(GRADIENT_LABELS[k] || k)}</Space>
                    ),
                  }))}
                />
              </>
            ) : opt.leftContentType === 'image' ? (
              <>
                {label('Left side image URL', 'Leave empty for a built-in gradient')}
                <Input value={opt.leftImage} onChange={(e) => set('leftImage', e.target.value)} placeholder="https://…" />
              </>
            ) : opt.leftContentType === 'url' ? (
              <>
                {label('Webpage embed URL')}
                <Input value={opt.leftUrl} onChange={(e) => set('leftUrl', e.target.value)} placeholder="https://…" />
              </>
            ) : (
              <>
                {label('HTML embed code')}
                <Input.TextArea rows={4} value={opt.leftHtml} onChange={(e) => set('leftHtml', e.target.value)} />
              </>
            )}
          </div>
        </Card>

        {/* Form position & style */}
        <Card size="small" title={t('Form position & style')} style={{ marginBottom: 12 }}>
          {label('Form layout', 'Side panel fills the column height; floating card overlays the background.')}
          <Segmented
            value={opt.formLayout || 'panel'}
            onChange={(v) => set('formLayout', v as any)}
            options={[{ label: t('Side panel (full height)'), value: 'panel' }, { label: t('Floating card'), value: 'float' }]}
          />
          <div style={{ marginTop: 8 }}>
            {label('Form position', 'Center only applies to the floating card; side panel uses left or right.')}
            <Segmented
              value={opt.formPosition || 'left'}
              onChange={(v) => set('formPosition', v as any)}
              options={[{ label: t('Left'), value: 'left' }, { label: t('Center'), value: 'center' }, { label: t('Right'), value: 'right' }]}
            />
          </div>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Switch checked={opt.showFieldIcons !== false} onChange={(v) => set('showFieldIcons', v)} />
            {label('Show input icons', 'Show a leading icon inside the username and password fields')}
          </div>
          {opt.showFieldIcons !== false ? (
            <Row gutter={8}>
              <Col span={12}>{label('Username icon')}
                <Select style={{ width: '100%' }} value={opt.accountIcon || 'user'} onChange={(v) => set('accountIcon', v)}
                  options={Object.keys(ACCOUNT_ICONS).map((k) => ({ value: k, label: k }))} />
              </Col>
              <Col span={12}>{label('Password icon')}
                <Select style={{ width: '100%' }} value={opt.passwordIcon || 'lock'} onChange={(v) => set('passwordIcon', v)}
                  options={Object.keys(PASSWORD_ICONS).map((k) => ({ value: k, label: k }))} />
              </Col>
            </Row>
          ) : null}
        </Card>

        {/* Colors */}
        <Card size="small" title={t('Colors')} style={{ marginBottom: 12 }}>
          {label('Form theme', 'System follows the visitor’s OS light/dark setting. Light / Dark are full presets that override the colors below. Pick Custom to set colors manually.')}
          <Segmented
            value={opt.formTheme || 'custom'}
            onChange={(v) => set('formTheme', v as any)}
            options={[{ label: t('Custom'), value: 'custom' }, { label: t('Light'), value: 'light' }, { label: t('Dark'), value: 'dark' }, { label: t('System'), value: 'system' }]}
          />
          {(!opt.formTheme || opt.formTheme === 'custom') ? (
            <Row gutter={[8, 8]} style={{ marginTop: 10 }}>
              <Col span={12}>{label('Background theme color')}{cp('themeColor')}</Col>
              <Col span={12}>{label('Font color')}{cp('fontColor')}</Col>
              <Col span={12}>{label('Login form theme color')}{cp('formThemeColor')}</Col>
              <Col span={12}>{label('Login form text color')}{cp('formFontColor')}</Col>
              <Col span={12}>{label('Button background color')}{cp('buttonBgColor')}</Col>
              <Col span={12}>{label('Button text color')}{cp('buttonTextColor')}</Col>
              <Col span={24}>
                {label('Background panel opacity', 'Transparency of the form panel background (only applies when the color is a solid hex).')}
                <Slider min={0} max={1} step={0.05} value={opt.themeOpacity ?? 1} onChange={(v) => set('themeOpacity', v)} />
              </Col>
            </Row>
          ) : null}
        </Card>

        {/* Footer & after login */}
        <Card size="small" title={t('Footer')} style={{ marginBottom: 12 }}>
          {label('Copyright / footer text (Markdown)')}
          <Input.TextArea rows={2} value={opt.copyright} onChange={(e) => set('copyright', e.target.value)} />
          <div style={{ marginTop: 8 }}>{label('ICP filing information (Markdown)')}
            <Input.TextArea rows={1} value={opt.icp} onChange={(e) => set('icp', e.target.value)} />
          </div>
          <div style={{ marginTop: 8 }}>{label('Default landing page', 'Path to open after a successful login when no explicit redirect is present. Leave empty to keep the system default.')}
            <Input value={opt.redirectPath} onChange={(e) => set('redirectPath', e.target.value)} placeholder="/admin" />
          </div>
        </Card>

        <Space>
          <Button type="primary" loading={saving} onClick={save}>{t('Submit')}</Button>
          <Button onClick={load} disabled={saving}>{t('Refresh')}</Button>
        </Space>
      </div>

      {/* Live preview */}
      <div style={{ flex: '0 0 340px', position: 'sticky', top: 12 }}>
        <Typography.Text type="secondary">{t('Home configuration')}</Typography.Text>
        <LoginPreview opt={opt} components={previewComponents} />
      </div>
    </div>
  );
}

// The preview IS the real sign-in page, contained in a box and fed the LIVE (unsaved) form values —
// so it can never drift from what the visitor sees. Every setting (background gradient/image/HTML/
// embedded-webpage, form-panel transparency `themeOpacity`, layout, position, theme, logo) is applied
// by the same `AuthLayoutRenderV2` + `CustomSignInPageV2` the login route renders.
function LoginPreview({ opt, components }: { opt: Options; components?: PreviewComponents }) {
  const { t } = useTranslation(NAMESPACE);
  // `options` holds the live config; `__previewLive` tells AuthLayoutRenderV2 to render at 100% inside
  // this box (not 100vw/100vh) and CustomSignInPageV2 to skip its document.title / ?redirect side
  // effects. Recomputed on every edit → background + opacity + everything update instantly.
  const previewConfig = useMemo(() => ({ options: opt, __previewLive: true }), [opt]);

  const frame: React.CSSProperties = {
    marginTop: 6,
    height: 360,
    borderRadius: 10,
    overflow: 'hidden',
    border: '1px solid rgba(0,0,0,0.1)',
    position: 'relative',
  };

  if (!components) {
    return <div style={frame} />;
  }
  const { AuthLayoutRenderV2, CustomSignInPageV2 } = components;

  const fallback = (
    <div
      style={{
        ...frame,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'rgba(0,0,0,0.45)',
        fontSize: 12,
        background: 'rgba(0,0,0,0.03)',
      }}
    >
      {t('Preview unavailable')}
    </div>
  );

  return (
    <PreviewErrorBoundary fallback={fallback}>
      <div style={frame}>
        <AuthLayoutRenderV2 loginConfig={previewConfig}>
          <CustomSignInPageV2 loginConfig={previewConfig} />
        </AuthLayoutRenderV2>
      </div>
    </PreviewErrorBoundary>
  );
}

export default LoginConfigPaneV2;
