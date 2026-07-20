import { SOURCE_HEADER } from './types';

// Label UI-originated single-record writes so the change-log Source column can tell a form/UI save
// apart from a raw API/script call. Installs ONE idempotent axios request interceptor on the app's
// apiClient that stamps `x-ptdl-change-source: form` on `<coll>:create` / `<coll>:update` requests —
// but ONLY when no more-specific source is already present:
//   - status-flow already sends 'quick'/'action' on its transitions → we never overwrite it;
//   - `:updateMany` (bulk) is excluded by the regex, so the server still infers 'bulk';
//   - a true external API call / workflow / migration has no browser interceptor → stays 'api'/'system'.
// The header is already CORS-accepted (status-flow + the change-note header use the same channel).
export function installChangeSourceInterceptor(app: any): void {
  try {
    const axios: any = app?.apiClient?.axios;
    if (!axios?.interceptors?.request || axios.__ptdlChangeSrc) return;
    axios.__ptdlChangeSrc = true;
    axios.interceptors.request.use((config: any) => {
      try {
        const url = String(config?.url || '');
        const method = String(config?.method || 'get').toLowerCase();
        if (method === 'post' && /:(create|update)(\?|$)/.test(url)) {
          config.headers = config.headers || {};
          if (!config.headers[SOURCE_HEADER]) config.headers[SOURCE_HEADER] = 'form';
        }
      } catch (e) {
        /* never break a request over labeling */
      }
      return config;
    });
  } catch (e) {
    /* best-effort — labeling must never break the app */
  }
}
