import React, { useEffect, useState } from 'react';
import { Button, ColorPicker, Input, Spin, Typography, Upload, message, theme } from 'antd';
import { COLOR_PRESETS, colorToString } from '@tuanla90/shared';
import { t } from './i18n';

// Lane-agnostic PWA logic. Imports NO @nocobase/client* so the same code bundles into both the
// classic `client` lane and the modern `client-v2` lane. Each lane injects its own API-client hook.

const DEFAULT_THEME = '#1677ff';
const DEFAULT_BG = '#ffffff';
const FALLBACK_NAME = 'NocoBase';
const FALLBACK_LETTER = 'N';

// ---------------------------------------------------------------------------
// Manifest / icon generation + injection (uses app.apiClient + DOM only).
// ---------------------------------------------------------------------------

function drawRoundedBase(ctx: CanvasRenderingContext2D, size: number, bg: string) {
  const r = Math.round(size * 0.22);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(size, 0, size, size, r);
  ctx.arcTo(size, size, 0, size, r);
  ctx.arcTo(0, size, 0, 0, r);
  ctx.arcTo(0, 0, size, 0, r);
  ctx.closePath();
  ctx.fill();
}

function letterIcon(size: number, letter: string, themeColor: string): string {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    if (!x) return '';
    drawRoundedBase(x, size, themeColor);
    x.fillStyle = '#ffffff';
    x.font = `600 ${Math.round(size * 0.54)}px -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(letter, size / 2, Math.round(size / 2 + size * 0.04));
    return c.toDataURL('image/png');
  } catch (e) {
    return '';
  }
}

function containedIcon(size: number, img: HTMLImageElement, bg: string): string {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    if (!x || !img.width || !img.height) return '';
    drawRoundedBase(x, size, bg);
    const pad = size * 0.12;
    const box = size - pad * 2;
    const ratio = Math.min(box / img.width, box / img.height);
    const w = img.width * ratio;
    const h = img.height * ratio;
    x.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    return c.toDataURL('image/png');
  } catch (e) {
    return '';
  }
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    } catch (e) {
      resolve(null);
    }
  });
}

async function getConfig(app: any) {
  const cfg: any = { name: '', shortName: '', themeColor: DEFAULT_THEME, backgroundColor: DEFAULT_BG, icon: '' };
  try {
    const res = await app.apiClient.request({ url: 'pwaSettings:list', params: { pageSize: 1, sort: ['id'] } });
    const row = res && res.data && res.data.data && res.data.data[0];
    if (row) {
      cfg.name = (row.name || '').trim();
      cfg.shortName = (row.shortName || '').trim();
      if (row.themeColor) cfg.themeColor = row.themeColor;
      if (row.backgroundColor) cfg.backgroundColor = row.backgroundColor;
      if (row.icon) cfg.icon = row.icon;
    }
  } catch (e) {
    // ignore
  }
  if (!cfg.name) {
    try {
      const res = await app.apiClient.request({ url: 'systemSettings:get' });
      cfg.name = ((res && res.data && res.data.data && res.data.data.title) || '').toString().trim();
    } catch (e) {
      // ignore
    }
  }
  if (!cfg.name) {
    const raw = (document.title || '').trim();
    cfg.name = raw.indexOf(' - ') >= 0 ? raw.split(' - ').pop()!.trim() : raw;
  }
  if (!cfg.name) cfg.name = FALLBACK_NAME;
  if (!cfg.shortName) cfg.shortName = (cfg.name.split(/\s+/)[0] || FALLBACK_NAME).slice(0, 12);
  return cfg;
}

function ensureMeta(key: string, content: string) {
  let m = document.head.querySelector(`meta[name="${key}"]`) as HTMLMetaElement | null;
  if (!m) {
    m = document.createElement('meta');
    m.setAttribute('name', key);
    document.head.appendChild(m);
  }
  m.setAttribute('content', content);
}

function ensureLink(rel: string): HTMLLinkElement {
  let l = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!l) {
    l = document.createElement('link');
    l.rel = rel;
    document.head.appendChild(l);
  }
  return l;
}

let lastKey = '';
let lastManifestUrl = '';

export async function injectPwa(app: any) {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const origin = window.location.origin;
    const cfg = await getConfig(app);
    const key = JSON.stringify([
      cfg.name,
      cfg.shortName,
      cfg.themeColor,
      cfg.backgroundColor,
      (cfg.icon || '').slice(0, 32) + (cfg.icon || '').length,
    ]);
    if (key === lastKey && lastManifestUrl) return;
    lastKey = key;

    const letter = (cfg.name.trim().charAt(0) || FALLBACK_LETTER).toUpperCase();
    let icon192 = '';
    let icon512 = '';
    if (cfg.icon) {
      const img = await loadImage(cfg.icon);
      if (img) {
        icon192 = containedIcon(192, img, cfg.backgroundColor);
        icon512 = containedIcon(512, img, cfg.backgroundColor);
      }
    }
    if (!icon192) icon192 = letterIcon(192, letter, cfg.themeColor);
    if (!icon512) icon512 = letterIcon(512, letter, cfg.themeColor);

    const manifest: any = {
      id: origin + '/',
      name: cfg.name,
      short_name: cfg.shortName,
      description: cfg.name,
      start_url: origin + '/',
      scope: origin + '/',
      display: 'standalone',
      background_color: cfg.backgroundColor,
      theme_color: cfg.themeColor,
      icons: [],
    };
    if (icon192) manifest.icons.push({ src: icon192, sizes: '192x192', type: 'image/png', purpose: 'any' });
    if (icon512) {
      manifest.icons.push({ src: icon512, sizes: '512x512', type: 'image/png', purpose: 'any' });
      manifest.icons.push({ src: icon512, sizes: '512x512', type: 'image/png', purpose: 'maskable' });
    }

    if (lastManifestUrl) {
      try {
        URL.revokeObjectURL(lastManifestUrl);
      } catch (e) {
        // ignore
      }
    }
    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
    const manifestUrl = URL.createObjectURL(blob);
    lastManifestUrl = manifestUrl;

    ensureLink('manifest').href = manifestUrl;
    ensureMeta('theme-color', cfg.themeColor);
    ensureMeta('mobile-web-app-capable', 'yes');
    ensureMeta('apple-mobile-web-app-capable', 'yes');
    ensureMeta('apple-mobile-web-app-status-bar-style', 'default');
    ensureMeta('apple-mobile-web-app-title', cfg.shortName);
    if (icon192) ensureLink('apple-touch-icon').href = icon192;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[plugin-pwa] inject failed', e);
  }
}

/** Run the manifest injection once per app instance, then keep it in sync with the page title. */
export function startPwa(app: any) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if ((window as any).__nbPwaInjected) return;
  (window as any).__nbPwaInjected = true;
  injectPwa(app);
  setTimeout(() => injectPwa(app), 3000);
  const titleEl = document.querySelector('title');
  if (titleEl) {
    try {
      const obs = new MutationObserver(() => injectPwa(app));
      obs.observe(titleEl, { childList: true, characterData: true, subtree: true });
    } catch (e) {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Settings page (factory: each lane injects its API-client hook).
// ---------------------------------------------------------------------------

const DEFAULTS: any = {
  id: null,
  name: '',
  shortName: '',
  themeColor: '#1677ff',
  backgroundColor: '#ffffff',
  icon: '',
};

// background/border are theme tokens applied at the usage site (see PwaSettings) — this fixed
// part only carries the structural (non-color) shell.
const panel: React.CSSProperties = {
  padding: 20,
  maxWidth: 1200,
  margin: '8px auto 16px',
  borderRadius: 8,
};
const fieldLabel: React.CSSProperties = { fontWeight: 500, marginBottom: 6, fontSize: 13 };

// A labeled field cell for the two-column grid.
const Field: React.FC<{ label: React.ReactNode; children: React.ReactNode; grow?: boolean }> = ({
  label,
  children,
  grow,
}) => (
  <div style={{ flex: grow ? 1 : 'none', minWidth: 220 }}>
    <div style={fieldLabel}>{label}</div>
    {children}
  </div>
);

export function createPwaSettings({ useApiClient }: { useApiClient: () => any }): React.FC {
  const PwaSettings: React.FC = () => {
    const { token } = theme.useToken();
    const api = useApiClient();
    const [cfg, setCfg] = useState<any>(DEFAULTS);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
      let alive = true;
      api
        .request({ url: 'pwaSettings:list', params: { pageSize: 1, sort: ['id'] } })
        .then((res: any) => {
          const row = res && res.data && res.data.data && res.data.data[0];
          if (alive && row) setCfg({ ...DEFAULTS, ...row });
        })
        .catch(() => {})
        .finally(() => {
          if (alive) setLoading(false);
        });
      return () => {
        alive = false;
      };
    }, [api]);

    const handleFile = (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          try {
            const size = 512;
            const c = document.createElement('canvas');
            c.width = c.height = size;
            const x = c.getContext('2d');
            if (!x) return;
            const ratio = Math.min(size / img.width, size / img.height);
            const w = img.width * ratio;
            const h = img.height * ratio;
            x.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
            setCfg((p: any) => ({ ...p, icon: c.toDataURL('image/png') }));
          } catch (err) {
            message.error(t('Cannot read this image'));
          }
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    };

    const onSave = async () => {
      setSaving(true);
      try {
        const values = {
          name: cfg.name || '',
          shortName: cfg.shortName || '',
          themeColor: cfg.themeColor || '#1677ff',
          backgroundColor: cfg.backgroundColor || '#ffffff',
          icon: cfg.icon || '',
        };
        if (cfg.id) {
          await api.request({ url: 'pwaSettings:update', method: 'post', params: { filterByTk: cfg.id }, data: values });
        } else {
          const res = await api.request({ url: 'pwaSettings:create', method: 'post', data: values });
          const created = res && res.data && res.data.data;
          if (created && created.id) setCfg((p: any) => ({ ...p, id: created.id }));
        }
        message.success(t('Saved. Reload (Ctrl+Shift+R) to update the installed app.'));
      } catch (e) {
        message.error(t('Save failed'));
      } finally {
        setSaving(false);
      }
    };

    if (loading) {
      return (
        <div style={{ ...panel, background: token.colorBgContainer, border: `0.8px solid ${token.colorBorderSecondary}` }}>
          <Spin />
        </div>
      );
    }

    return (
      <div style={{ ...panel, background: token.colorBgContainer, border: `0.8px solid ${token.colorBorderSecondary}` }}>
        <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
          {t('PWA')}
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 20 }}>
          {t('Configure the app when installing as a PWA (desktop/mobile). Reload the page after saving to update.')}
        </Typography.Paragraph>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
          <Field label={t('App name')} grow>
            <Input value={cfg.name} placeholder="NocoBase" onChange={(e) => setCfg({ ...cfg, name: e.target.value })} />
          </Field>
          <Field label={t('Short name (home screen)')} grow>
            <Input
              value={cfg.shortName}
              placeholder="NocoBase"
              onChange={(e) => setCfg({ ...cfg, shortName: e.target.value })}
            />
          </Field>
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
          <Field label={t('Theme color')}>
            <ColorPicker
              value={cfg.themeColor || '#1677ff'}
              onChange={(c) => setCfg({ ...cfg, themeColor: colorToString(c) })}
              presets={COLOR_PRESETS}
              showText
            />
          </Field>
          <Field label={t('Background color')}>
            <ColorPicker
              value={cfg.backgroundColor || '#ffffff'}
              onChange={(c) => setCfg({ ...cfg, backgroundColor: colorToString(c) })}
              presets={COLOR_PRESETS}
              showText
            />
          </Field>
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={fieldLabel}>{t('Icon')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 16,
                border: `1px dashed ${token.colorBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flex: 'none',
                background: cfg.icon ? cfg.backgroundColor || '#fff' : token.colorFillQuaternary,
              }}
            >
              {cfg.icon ? (
                <img src={cfg.icon} alt="icon" width={72} height={72} style={{ objectFit: 'contain' }} />
              ) : (
                <span style={{ color: token.colorTextQuaternary, fontSize: 12 }}>{t('no icon')}</span>
              )}
            </div>
            <div>
              <Upload
                accept="image/*"
                showUploadList={false}
                beforeUpload={(file) => {
                  handleFile(file as File);
                  return false;
                }}
              >
                <Button>{cfg.icon ? t('Change image') : t('Choose image')}</Button>
              </Upload>
              {cfg.icon ? (
                <Button type="text" danger style={{ marginLeft: 8 }} onClick={() => setCfg({ ...cfg, icon: '' })}>
                  {t('Remove')}
                </Button>
              ) : null}
              <div style={{ color: token.colorTextTertiary, fontSize: 12, marginTop: 6, maxWidth: 320 }}>
                {t('No image → the first letter of the app name on the theme color.')}
              </div>
            </div>
          </div>
        </div>

        <Button type="primary" loading={saving} onClick={onSave}>
          {t('Save')}
        </Button>
      </div>
    );
  };

  return PwaSettings;
}
