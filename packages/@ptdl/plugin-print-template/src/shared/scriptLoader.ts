// Inject UMD script/css assets shipped inside this plugin package.
//
// CRITICAL: the NocoBase page runs requirejs, so window.define exists. Every UMD
// bundle (alasql, grapesjs, its plugins) prefers the AMD branch when it sees
// define.amd — it would register an anonymous AMD module (requirejs then throws
// "Mismatched anonymous define") and NEVER set its window global. Stash `define`
// for the duration of each script load.
import { t } from './i18n';

const scriptCache = new Map<string, Promise<void>>();

export function loadScriptClean(src: string): Promise<void> {
  if (!scriptCache.has(src)) {
    scriptCache.set(
      src,
      new Promise<void>((resolve, reject) => {
        const w = window as any;
        const prevDefine = w.define;
        w.define = undefined;
        const restore = () => {
          w.define = prevDefine;
        };
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => {
          restore();
          resolve();
        };
        s.onerror = () => {
          restore();
          scriptCache.delete(src);
          reject(new Error(t('Không tải được {{src}}', { src })));
        };
        document.head.appendChild(s);
      }),
    );
  }
  return scriptCache.get(src)!;
}

const cssCache = new Map<string, Promise<void>>();

/** Await this — initialising a widget before its stylesheet lands breaks layout
 *  (GrapesJS canvas came up blank until a fullscreen toggle forced a reflow). */
export function loadCssOnce(href: string): Promise<void> {
  if (!cssCache.has(href)) {
    cssCache.set(
      href,
      new Promise<void>((resolve) => {
        const l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = href;
        l.onload = () => resolve();
        l.onerror = () => resolve(); // missing css shouldn't dead-lock the editor
        document.head.appendChild(l);
      }),
    );
  }
  return cssCache.get(href)!;
}
