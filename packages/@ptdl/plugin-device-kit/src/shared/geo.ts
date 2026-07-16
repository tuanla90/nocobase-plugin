/**
 * Geolocation helpers — thin, dependency-free wrapper over the browser Geolocation API.
 * Used by the GPS Location field (📍 button) and by the Camera widget (to stamp coordinates
 * into the watermark + write metadata into a sibling Location field).
 */

export interface GeoFix {
  lat: number;
  lng: number;
  accuracy?: number; // metres (radius of 68% confidence)
  ts: number;        // epoch ms of the fix
  src?: 'gps' | 'camera' | 'manual';
  address?: string;  // optional reverse-geocoded label (filled later, P2)
}

export type GeoError =
  | { code: 'unsupported' }
  | { code: 'denied' }
  | { code: 'unavailable' }
  | { code: 'timeout' }
  | { code: 'unknown'; message?: string };

/**
 * Resolve the current position. Rejects with a typed GeoError so callers can show the right
 * localized guidance (permission denied vs timeout vs no-hardware).
 *
 * NOTE: requires a secure context (HTTPS or localhost). On Railway (HTTPS) this is satisfied.
 */
export function getCurrentFix(opts?: {
  enableHighAccuracy?: boolean;
  timeoutMs?: number;
  maximumAgeMs?: number;
}): Promise<GeoFix> {
  return new Promise((resolve, reject) => {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (!nav || !nav.geolocation) {
      reject({ code: 'unsupported' } as GeoError);
      return;
    }
    nav.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: round(pos.coords.latitude, 6),
          lng: round(pos.coords.longitude, 6),
          accuracy: pos.coords.accuracy != null ? Math.round(pos.coords.accuracy) : undefined,
          ts: pos.timestamp || nowSafe(),
          src: 'gps',
        });
      },
      (err) => {
        // GeolocationPositionError.code: 1 PERMISSION_DENIED, 2 POSITION_UNAVAILABLE, 3 TIMEOUT
        const code = err && (err as any).code;
        if (code === 1) reject({ code: 'denied' } as GeoError);
        else if (code === 2) reject({ code: 'unavailable' } as GeoError);
        else if (code === 3) reject({ code: 'timeout' } as GeoError);
        else reject({ code: 'unknown', message: err?.message } as GeoError);
      },
      {
        enableHighAccuracy: opts?.enableHighAccuracy !== false,
        timeout: opts?.timeoutMs ?? 12000,
        maximumAge: opts?.maximumAgeMs ?? 0,
      },
    );
  });
}

function nowSafe(): number {
  try { return Date.now(); } catch (_) { return 0; }
}

export function round(n: number, dp: number): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

/** Format a fix for compact display: "10.7769, 106.7009 (±12m)". */
export function formatFix(fix?: GeoFix | null, opts?: { showAccuracy?: boolean }): string {
  if (!fix || fix.lat == null || fix.lng == null) return '';
  const base = `${fix.lat}, ${fix.lng}`;
  if (opts?.showAccuracy !== false && fix.accuracy != null) return `${base} (±${fix.accuracy}m)`;
  return base;
}

/** A Google Maps link for a fix (no API key needed). */
export function mapsUrl(fix?: GeoFix | null): string {
  if (!fix || fix.lat == null || fix.lng == null) return '';
  return `https://www.google.com/maps?q=${fix.lat},${fix.lng}`;
}

/**
 * Parse a manual entry: accepts "lat,lng" / "lat lng" or a pasted Google-Maps URL
 * (…?q=lat,lng, /@lat,lng,zoom, or /place/…/@lat,lng). Returns null if nothing usable.
 */
export function parseLocation(input?: string): GeoFix | null {
  if (!input || typeof input !== 'string') return null;
  const s = input.trim();
  if (!s) return null;

  // Google Maps URL forms.
  let m =
    s.match(/[?&]q=(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/) ||
    s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/) ||
    s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (!m) {
    // Plain "lat,lng" / "lat lng".
    m = s.match(/^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/);
  }
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: round(lat, 6), lng: round(lng, 6), ts: nowSafe(), src: 'manual' };
}

/** Colour bucket by accuracy for the status dot (thresholds in metres). */
export function accuracyBucket(accuracy?: number, good = 25, ok = 100): 'good' | 'ok' | 'poor' | 'none' {
  if (accuracy == null) return 'none';
  if (accuracy <= good) return 'good';
  if (accuracy <= ok) return 'ok';
  return 'poor';
}
