import React, { useLayoutEffect, useRef } from 'react';
import { css, cx } from '@emotion/css';
import { observer } from '@formily/react';

const CONFIG_PROP = 'ptdlActionBar';
const PIN_PROP = 'ptdlPin';

function modelHasPins(model: any): boolean {
  const actions = (model && model.subModels && model.subModels.actions) || [];
  if (!Array.isArray(actions)) return false;
  return actions.some((a: any) => {
    const p = a && a.props && a.props[PIN_PROP];
    return p === 'left' || p === 'right';
  });
}

/**
 * Feature B — per-block action-bar layout, for two block shapes:
 *  - kind 'form'  → one antd `<Space>` action row. We tag it `.ptdl-ab-space` and style THAT.
 *  - kind 'table' → the toolbar is an outer `display:flex; justify-content:space-between` div holding TWO
 *                   `<Space>` groups (native left/right split). We tag the OUTER flex `.ptdl-ab-toolbar`
 *                   and drive ITS justify/direction (our `!important` beats the inline space-between).
 *
 * `.ant-space` is a plain flex div → CSS layout on it works (the antd gotcha is button internals only).
 *
 * Model: direction + hArrange (horizontal) / vArrange (vertical). The native default differs by kind:
 * a form packs left, a table splits (space-between) — so "active" is measured against that per-kind default.
 * Per-button pin (`.ptdl-pin-left/right`, set by the renderButton patch) is pushed to the edge with
 * `margin-inline:auto`.
 */
export type ActionBarConfig = {
  direction?: 'horizontal' | 'vertical';
  hArrange?: 'left' | 'center' | 'right' | 'between' | 'around' | 'fill';
  vArrange?: 'left' | 'center' | 'right' | 'fill';
};

/** The native horizontal default: form packs left, table splits (space-between). */
export function nativeHArrange(kind?: string): string {
  return kind === 'table' ? 'between' : 'left';
}

/** "Active" (worth wrapping) when it deviates from the native default for this kind. */
export function hasActionBarConfig(cfg: any, kind?: string): cfg is ActionBarConfig {
  if (!cfg || typeof cfg !== 'object') return false;
  if (cfg.direction === 'vertical') return true;
  return (cfg.hArrange || nativeHArrange(kind)) !== nativeHArrange(kind);
}

const H_JUSTIFY: Record<string, string> = {
  left: 'flex-start',
  center: 'center',
  right: 'flex-end',
  between: 'space-between',
  around: 'space-around',
  fill: 'space-between', // fill isn't meaningful for a 2-group toolbar → treat as split
};
const V_ALIGN: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end', fill: 'stretch' };

function buildFormCss(cfg: ActionBarConfig, hasPins: boolean): string {
  const vertical = cfg.direction === 'vertical';
  const S = '& .ptdl-ab-space';
  const lines: string[] = [];
  if (vertical) {
    const arr = cfg.vArrange || 'left';
    lines.push(
      `${S}{display:flex !important;flex-direction:column !important;width:100% !important;align-items:${V_ALIGN[arr] || 'flex-start'} !important;}`,
    );
    if (arr === 'fill') {
      lines.push(`${S} .ant-space-item{width:100% !important;}`);
      lines.push(`${S} .ant-space-item .ant-btn{width:100% !important;}`);
    }
  } else {
    const arr = cfg.hArrange || 'left';
    if (arr === 'fill') {
      lines.push(`${S}{display:flex !important;width:100% !important;}`);
      lines.push(`${S} .ant-space-item{flex:1 1 0 !important;}`);
      lines.push(`${S} .ant-space-item .ant-btn{width:100% !important;}`);
    } else {
      lines.push(`${S}{display:flex !important;width:100% !important;justify-content:${H_JUSTIFY[arr] || 'flex-start'} !important;}`);
    }
  }
  if (hasPins) {
    if (!vertical) lines.push(`${S}{display:flex !important;width:100% !important;}`);
    lines.push(`${S} .ant-space-item:has(.ptdl-pin-right){margin-inline-start:auto !important;}`);
    lines.push(`${S} .ant-space-item:has(.ptdl-pin-left){margin-inline-end:auto !important;}`);
  }
  return lines.join('\n');
}

function buildTableCss(cfg: ActionBarConfig, hasPins: boolean): string {
  const vertical = cfg.direction === 'vertical';
  const T = '& .ptdl-ab-toolbar';
  const lines: string[] = [];
  if (vertical) {
    const arr = cfg.vArrange || 'fill';
    lines.push(`${T}{flex-direction:column !important;align-items:${V_ALIGN[arr] || 'stretch'} !important;}`);
    lines.push(`${T} .ant-space{flex-direction:column !important;width:100% !important;}`);
    if (arr === 'fill') lines.push(`${T} .ant-space .ant-space-item .ant-btn{width:100% !important;}`);
  } else {
    const arr = cfg.hArrange || 'between';
    lines.push(`${T}{justify-content:${H_JUSTIFY[arr] || 'space-between'} !important;}`);
  }
  if (hasPins) {
    lines.push(`${T} .ant-space-item:has(.ptdl-pin-right){margin-inline-start:auto !important;}`);
    lines.push(`${T} .ant-space-item:has(.ptdl-pin-left){margin-inline-end:auto !important;}`);
  }
  return lines.join('\n');
}

/** Inline flex styles that mirror the horizontal/vertical logic — used by the settings-dialog live preview. */
export function previewBarStyle(cfg: ActionBarConfig): { container: React.CSSProperties; item: React.CSSProperties } {
  const vertical = cfg.direction === 'vertical';
  const container: React.CSSProperties = { display: 'flex', gap: 8, width: '100%' };
  const item: React.CSSProperties = {};
  if (vertical) {
    const arr = cfg.vArrange || 'left';
    container.flexDirection = 'column';
    container.alignItems = V_ALIGN[arr] || 'flex-start';
    if (arr === 'fill') item.width = '100%';
  } else {
    const arr = cfg.hArrange || 'left';
    if (arr === 'fill') item.flex = '1 1 0';
    else container.justifyContent = H_JUSTIFY[arr] || 'flex-start';
  }
  return { container, item };
}

/** Find the block's action-bar Space(s): a `.ant-space` that directly hosts action buttons, not in a table. */
function findActionSpaces(root: HTMLElement): HTMLElement[] {
  const all = Array.from(root.querySelectorAll<HTMLElement>('.ant-space'));
  return all.filter((s) => {
    if (s.closest('.ant-table')) return false; // sub-table / row-action cells
    if (!s.querySelector(':scope > .ant-space-item .ant-btn, :scope > .ant-space-item button')) return false;
    if (s.querySelector(':scope .ptdl-ab-space')) return false; // innermost only
    return true;
  });
}

/**
 * Rendered ALWAYS by the patched block (never gated), and is itself an `observer` reading the config from
 * the model — so it re-applies when `props.ptdlActionBar` / a button's pin changes even when the (heavy)
 * host block doesn't re-render. The wrapper is layout-transparent (`display:contents`); only the descendant
 * selectors (`.ptdl-ab-space` / `.ptdl-ab-toolbar`, tagged in the effect) take effect.
 */
export const ActionBarLayout: any = observer(
  ({ model, kind, children }: { model: any; kind?: string; children: React.ReactNode }) => {
    const cfg: ActionBarConfig = (model && model.props ? model.props[CONFIG_PROP] : undefined) || {};
    const hasPins = modelHasPins(model);
    const isTable = kind === 'table';
    const active = hasActionBarConfig(cfg, kind) || hasPins;
    const ref = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
      const root = ref.current;
      if (!root || !active) return;
      const marked: HTMLElement[] = [];
      try {
        const spaces = findActionSpaces(root);
        if (isTable) {
          const toolbar = spaces[0]?.parentElement || null;
          if (toolbar && spaces.every((s) => s.parentElement === toolbar) && getComputedStyle(toolbar).display === 'flex') {
            toolbar.classList.add('ptdl-ab-toolbar');
            marked.push(toolbar);
          }
        } else {
          for (const s of spaces) {
            s.classList.add('ptdl-ab-space');
            marked.push(s);
          }
        }
      } catch (_) {
        /* ignore */
      }
      return () => marked.forEach((el) => el.classList.remove('ptdl-ab-space', 'ptdl-ab-toolbar'));
    });

    const styles = !active
      ? 'display:contents;'
      : `display:contents;\n${isTable ? buildTableCss(cfg, hasPins) : buildFormCss(cfg, hasPins)}`;
    return (
      <div ref={ref} className={cx('ptdl-actionbar', css(styles))}>
        {children}
      </div>
    );
  },
);
