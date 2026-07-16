/**
 * Current-user name, cached per session. Used to stamp "who took the photo" into the watermark.
 * `auth:check` returns the signed-in user (nickname/username/email) — same call layout-containers uses.
 */

let _cache: string | null = null;
let _inflight: Promise<string> | null = null;

export function getCurrentUserName(api: any): Promise<string> {
  if (_cache != null) return Promise.resolve(_cache);
  if (_inflight) return _inflight;
  _inflight = (async () => {
    try {
      const res = await api?.request?.({ url: 'auth:check' });
      const u = res?.data?.data || {};
      _cache = u.nickname || u.username || u.email || '';
    } catch (_) {
      _cache = '';
    }
    return _cache || '';
  })();
  return _inflight;
}

/** Best-effort synchronous read (empty until getCurrentUserName has resolved once). */
export function currentUserNameSync(): string {
  return _cache || '';
}
