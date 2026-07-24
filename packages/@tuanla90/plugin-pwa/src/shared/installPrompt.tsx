import React, { useEffect, useState } from 'react';
import { Button, Modal, theme } from 'antd';
import { SafeIcon } from './bottomBar';
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

export type InstallPosition = 'pill' | 'banner' | 'bannerTop' | 'fab' | 'avatar';

export interface InstallConfig {
  enabled?: boolean;
  position?: InstallPosition;
  title?: string;
  description?: string;
}

export const INSTALL_DEFAULTS: InstallConfig = {
  enabled: true,
  position: 'pill',
  title: '',
  description: '',
};

const Z = 995; // above the bars (990/991), below antd Modal/Drawer masks (1000)

/** Whether an install suggestion can actually be actioned right now (Chromium prompt or iOS Safari). */
export function useInstallState() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  const ios = isIosSafari();
  const canPrompt = !!deferredPrompt;
  const available = !installed && !isStandalone() && (canPrompt || ios);
  return { available, canPrompt, ios, installed };
}

async function runPrompt(onNeedIosHelp: () => void) {
  if (deferredPrompt) {
    try {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      deferredPrompt = null;
      if (choice?.outcome === 'accepted') installed = true;
      emit();
    } catch (e) {
      // ignore
    }
  } else {
    onNeedIosHelp();
  }
}

const IosHelpModal: React.FC<{ open: boolean; onClose: () => void; icon?: string; themeColor?: string; desc: string }> = ({
  open,
  onClose,
  icon,
  themeColor,
  desc,
}) => {
  const { token } = theme.useToken();
  return (
    <Modal open={open} onCancel={onClose} footer={null} title={t('Install app')} width={360}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
        <IconThumb icon={icon} accent={themeColor || token.colorPrimary} letter="A" />
        <div style={{ color: token.colorTextSecondary, fontSize: 13 }}>{desc}</div>
      </div>
      <ol style={{ paddingLeft: 18, margin: 0, color: token.colorText, fontSize: 14, lineHeight: 1.9 }}>
        <li>{t('Tap the Share button in Safari (the square with an up arrow).')}</li>
        <li>{t('Choose “Add to Home Screen”.')}</li>
        <li>{t('Tap “Add” — the app icon appears on your home screen.')}</li>
      </ol>
    </Modal>
  );
};

const IconThumb: React.FC<{ icon?: string; accent: string; letter: string; size?: number }> = ({ icon, accent, letter, size = 34 }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: Math.round(size * 0.26),
      flex: 'none',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: icon ? '#fff' : accent,
      color: '#fff',
      fontWeight: 700,
      fontSize: Math.round(size * 0.5),
    }}
  >
    {icon ? <img src={icon} alt="" width={size} height={size} style={{ objectFit: 'contain' }} /> : letter}
  </div>
);

/**
 * Floating "Install app" suggestion. Appears when the browser has offered an install prompt
 * (Android/desktop Chromium) or on iOS Safari (manual Share → Add to Home Screen). Hidden once
 * installed, dismissed, already standalone, or when configured to live in the avatar menu.
 */
export const InstallPrompt: React.FC<{
  config?: InstallConfig;
  icon?: string;
  themeColor?: string;
  bottomOffset?: number;
}> = ({ config, icon, themeColor, bottomOffset = 0 }) => {
  const { token } = theme.useToken();
  const [dismissed, setDismissed] = useState(isDismissed());
  const [iosOpen, setIosOpen] = useState(false);
  const { available } = useInstallState();

  if (config?.enabled === false) return null;
  const position = config?.position || 'pill';
  if (position === 'avatar') return null; // rendered inside the user-center dropdown instead
  if (!available || dismissed) return null;

  const accent = themeColor || token.colorPrimary;
  const title = (config?.title && config.title.trim()) || t('Install app');
  const desc = (config?.description && config.description.trim()) || t('Add to your home screen for quick access.');
  const letter = (title.trim().charAt(0) || 'A').toUpperCase();

  const doInstall = () => runPrompt(() => setIosOpen(true));
  const dismiss = () => {
    markDismissed();
    setDismissed(true);
  };
  const iosModal = <IosHelpModal open={iosOpen} onClose={() => setIosOpen(false)} icon={icon} themeColor={themeColor} desc={desc} />;

  const closeBtn = (
    <button
      type="button"
      onClick={dismiss}
      title={t('Dismiss')}
      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: token.colorTextTertiary, fontSize: 18, lineHeight: 1, padding: '2px 4px', flex: 'none' }}
    >
      ×
    </button>
  );

  if (position === 'fab') {
    return (
      <>
        <button
          type="button"
          onClick={doInstall}
          title={title}
          style={{
            position: 'fixed',
            left: 16,
            bottom: `calc(${bottomOffset + 16}px + env(safe-area-inset-bottom))`,
            zIndex: Z,
            width: 48,
            height: 48,
            borderRadius: '50%',
            border: 'none',
            background: accent,
            color: '#fff',
            cursor: 'pointer',
            boxShadow: '0 6px 18px rgba(0,0,0,0.28)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <SafeIcon type="downloadoutlined" size={20} />
        </button>
        {iosModal}
      </>
    );
  }

  if (position === 'banner' || position === 'bannerTop') {
    const top = position === 'bannerTop';
    return (
      <>
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            top: top ? 0 : undefined,
            bottom: top ? undefined : bottomOffset,
            zIndex: Z,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 14px',
            background: token.colorBgElevated,
            borderTop: top ? undefined : `1px solid ${token.colorBorderSecondary}`,
            borderBottom: top ? `1px solid ${token.colorBorderSecondary}` : undefined,
            boxShadow: top ? '0 4px 16px rgba(0,0,0,0.08)' : '0 -4px 16px rgba(0,0,0,0.08)',
          }}
        >
          <IconThumb icon={icon} accent={accent} letter={letter} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: token.colorText }}>{title}</div>
            <div style={{ fontSize: 12, color: token.colorTextTertiary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{desc}</div>
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
        <IconThumb icon={icon} accent={accent} letter={letter} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.15, color: token.colorText }}>{title}</div>
          <div style={{ fontSize: 11, color: token.colorTextTertiary, lineHeight: 1.2, maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {desc}
          </div>
        </div>
        <Button type="primary" size="small" shape="round" onClick={doInstall} style={{ background: accent, borderColor: accent, flex: 'none' }}>
          {t('Install')}
        </Button>
        {closeBtn}
      </div>
      {iosModal}
    </>
  );
};

/**
 * Compact inline install control for embedding inside a menu (e.g. the avatar dropdown). Renders
 * nothing when install isn't available. No dismiss button — it lives inside a menu the user opens.
 */
export const InstallInline: React.FC<{ icon?: string; themeColor?: string; title?: string; description?: string; onDone?: () => void }> = ({
  icon,
  themeColor,
  title,
  description,
  onDone,
}) => {
  const { token } = theme.useToken();
  const [iosOpen, setIosOpen] = useState(false);
  const { available } = useInstallState();
  if (!available) return null;

  const accent = themeColor || token.colorPrimary;
  const label = (title && title.trim()) || t('Install app');
  const desc = (description && description.trim()) || t('Add to your home screen for quick access.');
  const letter = (label.trim().charAt(0) || 'A').toUpperCase();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          runPrompt(() => setIosOpen(true));
          onDone?.();
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          padding: '8px 10px',
          border: 'none',
          borderRadius: 8,
          background: 'transparent',
          cursor: 'pointer',
          textAlign: 'left',
          color: token.colorText,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = token.colorFillTertiary)}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <IconThumb icon={icon} accent={accent} letter={letter} size={28} />
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span>
          <span style={{ fontSize: 11, color: token.colorTextTertiary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{desc}</span>
        </span>
      </button>
      <IosHelpModal open={iosOpen} onClose={() => setIosOpen(false)} icon={icon} themeColor={themeColor} desc={desc} />
    </>
  );
};
