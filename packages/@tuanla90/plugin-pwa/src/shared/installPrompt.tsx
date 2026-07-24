import React, { useEffect, useState } from 'react';
import { Button, Modal, theme } from 'antd';
import { t } from './i18n';

// ---------------------------------------------------------------------------
// PWA install ("Add to Home Screen") capture + suggestion UI. Lane-agnostic:
// imports NO @nocobase/client* so the same code bundles into both the classic
// `client` lane and the modern `client-v2` lane.
// ---------------------------------------------------------------------------

// The browser fires `beforeinstallprompt` ONCE, and often BEFORE React mounts. We must capture it at
// plugin load() time (as early as possible) and stash the event so a later button click can call
// prompt(). A module-level store + subscriber set lets the React overlay react to the late event.
let deferredPrompt: any = null;
let installed = false;
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      // ignore
    }
  });
}

let captureStarted = false;
/** Attach the beforeinstallprompt / appinstalled listeners once, as early as possible. */
export function initInstallCapture(): void {
  if (typeof window === 'undefined') return;
  if (captureStarted) return;
  captureStarted = true;
  window.addEventListener('beforeinstallprompt', (e: any) => {
    e.preventDefault(); // suppress Chrome's mini-infobar; we surface our own trigger
    deferredPrompt = e;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    emit();
  });
}

/** True when the page is already running as an installed app (any platform). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return (
      window.matchMedia?.('(display-mode: standalone)')?.matches ||
      (window.navigator as any)?.standalone === true ||
      (typeof document !== 'undefined' && document.referrer.startsWith('android-app://'))
    );
  } catch (e) {
    return false;
  }
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iDevice = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ masquerades as Mac — detect a touch-capable "Mac" too.
  const iPadOS = navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1;
  return iDevice || iPadOS;
}
function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return isIOS() && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome/.test(ua);
}

const DISMISS_KEY = 'pwa-install-dismissed-at';
const DISMISS_DAYS = 14;
function isDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return !!at && Date.now() - at < DISMISS_DAYS * 86400000;
  } catch (e) {
    return false;
  }
}
function markDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch (e) {
    // ignore
  }
}

export interface InstallConfig {
  enabled?: boolean;
  position?: 'pill' | 'banner';
  title?: string;
  description?: string;
}

export const INSTALL_DEFAULTS: InstallConfig = {
  enabled: true,
  position: 'pill',
  title: '',
  description: '',
};

const Z = 995; // above the bottom bar (990), below antd Modal/Drawer masks (1000)

/**
 * Floating "Install app" suggestion. Appears when the browser has offered an install prompt
 * (Android/desktop Chromium) or on iOS Safari (which never fires beforeinstallprompt → manual
 * Share → Add to Home Screen instructions). Hidden once installed, dismissed, or already standalone.
 */
export const InstallPrompt: React.FC<{
  config?: InstallConfig;
  icon?: string;
  themeColor?: string;
  bottomOffset?: number;
}> = ({ config, icon, themeColor, bottomOffset = 0 }) => {
  const { token } = theme.useToken();
  const [, force] = useState(0);
  const [dismissed, setDismissed] = useState(isDismissed());
  const [iosOpen, setIosOpen] = useState(false);

  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  if (config?.enabled === false) return null;
  if (installed || isStandalone() || dismissed) return null;

  const canPrompt = !!deferredPrompt;
  const ios = isIosSafari();
  // Nothing actionable unless Chromium captured a prompt OR we can show iOS instructions.
  if (!canPrompt && !ios) return null;

  const accent = themeColor || token.colorPrimary;
  const title = (config?.title && config.title.trim()) || t('Install app');
  const desc = (config?.description && config.description.trim()) || t('Add to your home screen for quick access.');

  const doInstall = async () => {
    if (canPrompt) {
      try {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        deferredPrompt = null;
        if (choice?.outcome === 'accepted') installed = true;
        emit();
      } catch (e) {
        // ignore
      }
    } else if (ios) {
      setIosOpen(true);
    }
  };
  const dismiss = () => {
    markDismissed();
    setDismissed(true);
  };

  const IconThumb = (
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: 9,
        flex: 'none',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: icon ? '#fff' : accent,
        color: '#fff',
        fontWeight: 700,
        fontSize: 17,
      }}
    >
      {icon ? (
        <img src={icon} alt="" width={34} height={34} style={{ objectFit: 'contain' }} />
      ) : (
        (title.trim().charAt(0) || 'A').toUpperCase()
      )}
    </div>
  );

  const closeBtn = (
    <button
      type="button"
      onClick={dismiss}
      title={t('Dismiss')}
      style={{
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: token.colorTextTertiary,
        fontSize: 18,
        lineHeight: 1,
        padding: '2px 4px',
        flex: 'none',
      }}
    >
      ×
    </button>
  );

  const iosModal = (
    <Modal
      open={iosOpen}
      onCancel={() => setIosOpen(false)}
      footer={null}
      title={t('Install app')}
      width={360}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
        {IconThumb}
        <div style={{ color: token.colorTextSecondary, fontSize: 13 }}>{desc}</div>
      </div>
      <ol style={{ paddingLeft: 18, margin: 0, color: token.colorText, fontSize: 14, lineHeight: 1.9 }}>
        <li>{t('Tap the Share button in Safari (the square with an up arrow).')}</li>
        <li>{t('Choose “Add to Home Screen”.')}</li>
        <li>{t('Tap “Add” — the app icon appears on your home screen.')}</li>
      </ol>
    </Modal>
  );

  if (config?.position === 'banner') {
    return (
      <>
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: bottomOffset,
            zIndex: Z,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 14px',
            background: token.colorBgElevated,
            borderTop: `1px solid ${token.colorBorderSecondary}`,
            boxShadow: '0 -4px 16px rgba(0,0,0,0.08)',
          }}
        >
          {IconThumb}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: token.colorText }}>{title}</div>
            <div
              style={{
                fontSize: 12,
                color: token.colorTextTertiary,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {desc}
            </div>
          </div>
          <Button type="primary" size="small" onClick={doInstall} style={{ background: accent, borderColor: accent }}>
            {t('Install')}
          </Button>
          {closeBtn}
        </div>
        {iosModal}
      </>
    );
  }

  // Default: floating pill, bottom-center, lifted above the bottom bar.
  return (
    <>
      <div
        style={{
          position: 'fixed',
          left: '50%',
          transform: 'translateX(-50%)',
          bottom: bottomOffset + 14,
          zIndex: Z,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          maxWidth: 'calc(100vw - 24px)',
          padding: '7px 8px 7px 10px',
          background: token.colorBgElevated,
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: 999,
          boxShadow: '0 6px 24px rgba(0,0,0,0.16)',
        }}
      >
        {IconThumb}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.15, color: token.colorText }}>{title}</div>
          <div
            style={{
              fontSize: 11,
              color: token.colorTextTertiary,
              lineHeight: 1.2,
              maxWidth: 190,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {desc}
          </div>
        </div>
        <Button
          type="primary"
          size="small"
          shape="round"
          onClick={doInstall}
          style={{ background: accent, borderColor: accent, flex: 'none' }}
        >
          {t('Install')}
        </Button>
        {closeBtn}
      </div>
      {iosModal}
    </>
  );
};
