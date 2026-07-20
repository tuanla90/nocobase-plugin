/**
 * Reverse geocoding via Nominatim (OpenStreetMap) — coordinates → human address. FREE, no API key,
 * CORS-open so it's a direct client fetch. Honours Nominatim's usage policy: a module-level throttle
 * serialises requests to ≤ 1 per second (on-demand only — NOT for bulk; a browser can't set User-Agent,
 * but the automatic Referer identifies the app, which satisfies the "identify yourself" rule).
 */

let _lastAt = 0;
let _chain: Promise<any> = Promise.resolve();

/** Serialise + throttle to ~1 req/s (Nominatim policy). */
function throttle<T>(fn: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const now = Date.now();
    const wait = Math.max(0, 1000 - (now - _lastAt));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    _lastAt = Date.now();
    return fn();
  };
  const next = _chain.then(run, run);
  // keep the chain alive but don't leak rejections
  _chain = next.then(() => undefined, () => undefined);
  return next;
}

/** Build a compact, VN-friendly address from Nominatim's structured parts (fallback: display_name). */
function composeAddress(data: any): string {
  const a = data?.address || {};
  const parts = [
    [a.house_number, a.road].filter(Boolean).join(' '),
    a.quarter || a.neighbourhood || a.hamlet,
    a.suburb || a.village || a.ward,
    a.city_district || a.district || a.town,
    a.city || a.state_district,
    a.state,
    a.country,
  ].map((s) => (s ? String(s).trim() : '')).filter(Boolean);
  // de-dupe consecutive repeats (Nominatim sometimes repeats city/state)
  const out: string[] = [];
  for (const p of parts) if (out[out.length - 1] !== p) out.push(p);
  const joined = out.join(', ');
  return joined || (data?.display_name ? String(data.display_name) : '');
}

export interface GeocodeOpts {
  lang?: string;      // accept-language, e.g. 'vi'
  timeoutMs?: number;
}

/** Reverse-geocode lat/lng → address string. Returns '' on failure (never throws). */
export async function reverseGeocode(lat: number, lng: number, opts?: GeocodeOpts): Promise<string> {
  if (lat == null || lng == null) return '';
  const lang = opts?.lang || 'vi';
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}` +
    `&lon=${encodeURIComponent(lng)}&zoom=18&addressdetails=1&accept-language=${encodeURIComponent(lang)}`;
  return throttle(async () => {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? 8000) : null;
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl?.signal as any });
      if (!res.ok) return '';
      const data = await res.json();
      return composeAddress(data);
    } catch (_) {
      return '';
    } finally {
      if (timer) clearTimeout(timer);
    }
  });
}
