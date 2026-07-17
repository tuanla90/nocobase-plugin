/**
 * Best-effort device fingerprint from the BROWSER — the honest subset a web page can read.
 *
 * NOT available in a browser (documented so nobody expects them): IMEI, the real hardware device ID,
 * the phone number, or the public IP (the SERVER sees the IP — needs a server action, not this file).
 * What we CAN read: OS + version, browser + version, device model (Android usually; iOS = "iPhone"),
 * screen/viewport, DPR, timezone, language, plus a *pseudo* device id (a random UUID persisted in
 * localStorage — per browser, cleared with site data; not a hardware identifier).
 */

export interface DeviceInfo {
  os?: string;
  osVersion?: string;
  browser?: string;
  browserVersion?: string;
  model?: string;
  mobile?: boolean;
  screen?: string;
  viewport?: string;
  dpr?: number;
  tz?: string;
  lang?: string;
  deviceId?: string; // pseudo (localStorage UUID) — NOT hardware
  ua?: string;
  ts?: number;
}

export type PlatformKind = 'android' | 'ios' | 'desktop';

function ua(): string {
  try { return navigator.userAgent || ''; } catch (_) { return ''; }
}

export function getPlatform(): PlatformKind {
  const u = ua();
  if (/android/i.test(u)) return 'android';
  if (/iphone|ipad|ipod/i.test(u) || (/(macintosh)/i.test(u) && (navigator as any).maxTouchPoints > 1)) return 'ios';
  return 'desktop';
}

function parseOS(u: string): { os?: string; osVersion?: string } {
  let m;
  if ((m = u.match(/Android\s+([\d.]+)/i))) return { os: 'Android', osVersion: m[1] };
  if ((m = u.match(/(iPhone|iPad|iPod)[^;]*OS\s+([\d_]+)/i))) return { os: 'iOS', osVersion: m[2].replace(/_/g, '.') };
  if ((m = u.match(/Windows NT\s+([\d.]+)/i))) {
    const map: Record<string, string> = { '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7' };
    return { os: 'Windows', osVersion: map[m[1]] || m[1] };
  }
  if ((m = u.match(/Mac OS X\s+([\d_]+)/i))) return { os: 'macOS', osVersion: m[1].replace(/_/g, '.') };
  if (/CrOS/i.test(u)) return { os: 'ChromeOS' };
  if (/Linux/i.test(u)) return { os: 'Linux' };
  return {};
}

function parseBrowser(u: string): { browser?: string; browserVersion?: string } {
  let m;
  if ((m = u.match(/Edg\/([\d.]+)/))) return { browser: 'Edge', browserVersion: m[1] };
  if ((m = u.match(/SamsungBrowser\/([\d.]+)/))) return { browser: 'Samsung Internet', browserVersion: m[1] };
  if ((m = u.match(/OPR\/([\d.]+)/))) return { browser: 'Opera', browserVersion: m[1] };
  if ((m = u.match(/Firefox\/([\d.]+)/))) return { browser: 'Firefox', browserVersion: m[1] };
  if (/(iPhone|iPad).*Version\/([\d.]+).*Safari/i.test(u) && !/CriOS|FxiOS/i.test(u)) {
    m = u.match(/Version\/([\d.]+)/); return { browser: 'Safari', browserVersion: m?.[1] };
  }
  if ((m = u.match(/CriOS\/([\d.]+)/))) return { browser: 'Chrome (iOS)', browserVersion: m[1] };
  if ((m = u.match(/Chrome\/([\d.]+)/))) return { browser: 'Chrome', browserVersion: m[1] };
  if ((m = u.match(/Version\/([\d.]+).*Safari/))) return { browser: 'Safari', browserVersion: m[1] };
  return {};
}

/** Extract an Android device model from the UA (e.g. "SM-G991B"); iOS → generic "iPhone"/"iPad". */
function parseModel(u: string): string | undefined {
  const p = getPlatform();
  if (p === 'ios') {
    if (/ipad/i.test(u)) return 'iPad';
    if (/ipod/i.test(u)) return 'iPod';
    return 'iPhone';
  }
  if (p === 'android') {
    // "…; <MODEL> Build/…" or "…; <MODEL>)" — take the last ;-separated token before Build/close-paren.
    const m = u.match(/Android[^;]*;\s*([^;]*?)(?:\s+Build\/|\))/i);
    if (m && m[1]) {
      const model = m[1].replace(/wv$/i, '').trim();
      // strip a trailing locale like "vi-vn" that some UAs include
      if (model && !/^[a-z]{2}-[a-z]{2}$/i.test(model)) return model;
    }
  }
  return undefined;
}

const DEVICE_ID_KEY = 'ptdl_device_id';

/** Persistent pseudo device id (random UUID in localStorage). NOT a hardware identifier. */
export function getPseudoDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
        ? (crypto as any).randomUUID()
        : 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch (_) {
    return '';
  }
}

function nowSafe(): number { try { return Date.now(); } catch (_) { return 0; } }

export function getDeviceInfo(): DeviceInfo {
  const u = ua();
  const { os, osVersion } = parseOS(u);
  const { browser, browserVersion } = parseBrowser(u);
  let screenStr = '', viewport = '', dpr: number | undefined, tz = '', lang = '', mobile: boolean | undefined;
  try { screenStr = `${window.screen.width}x${window.screen.height}`; } catch (_) { /* ignore */ }
  try { viewport = `${window.innerWidth}x${window.innerHeight}`; } catch (_) { /* ignore */ }
  try { dpr = Math.round((window.devicePixelRatio || 1) * 100) / 100; } catch (_) { /* ignore */ }
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) { /* ignore */ }
  try { lang = navigator.language; } catch (_) { /* ignore */ }
  try { mobile = (navigator as any).userAgentData?.mobile ?? /Mobi|Android|iPhone/i.test(u); } catch (_) { mobile = undefined; }

  return {
    os, osVersion, browser, browserVersion,
    model: parseModel(u),
    mobile, screen: screenStr, viewport, dpr, tz, lang,
    deviceId: getPseudoDeviceId(),
    ua: u,
    ts: nowSafe(),
  };
}

/** One-line summary for a display chip: "Samsung SM-G991B · Android 13 · Chrome". */
export function deviceSummary(d?: DeviceInfo | null): string {
  if (!d) return '';
  const parts = [
    d.model,
    d.os ? `${d.os}${d.osVersion ? ' ' + d.osVersion : ''}` : undefined,
    d.browser,
  ].filter(Boolean);
  return parts.join(' · ');
}
