import React from 'react';
import { Button, ConfigProvider } from 'antd';
import { StarOutlined } from '@ant-design/icons';
import { observer, useForm } from '@formily/react';
import { ColorField, SettingsGrid } from '@ptdl/shared';
import { NS, t } from './i18n';

/**
 * Feature A — deep per-button colour.
 *
 * Native ActionModel only exposes `type` + a single (mostly-disabled) `color`. We add a colour config
 * step to the button ⚙ popup and apply it by wrapping the button in a scoped <ConfigProvider> whose
 * Button component tokens antd HONOURS. We deliberately do NOT inject raw CSS: antd buttons ignore
 * injected CSS (even `!important`) — component tokens are the supported override path.
 *
 * Config is stored under the private button prop `ptdlBtnStyle` (stripped before it can reach the DOM).
 */
const STYLE_PROP = 'ptdlBtnStyle';
const PIN_PROP = 'ptdlPin';
const SIZE_PROP = 'ptdlSize';

type BtnStyle = {
  bg?: string;
  color?: string;
  border?: string;
  shadow?: string;
  hoverBg?: string;
  hoverColor?: string;
  borderWidth?: number | string;
  borderStyle?: string;
  borderRadius?: number | string;
  iconColor?: string;
  iconSize?: number | string;
};

// Keys applied via antd component TOKENS (ConfigProvider). The rest (shadow, border width/style/radius,
// icon) are applied as inline style / the antd `styles.icon` prop — no token exists — so they don't
// trigger the ConfigProvider wrapping.
const COLOUR_TOKEN_KEYS = ['bg', 'color', 'border', 'hoverBg', 'hoverColor'];
function hasColourTokens(s: any): boolean {
  return !!s && typeof s === 'object' && COLOUR_TOKEN_KEYS.some((k) => s[k]);
}
/** Inline style: shadow + border width/style/radius (inline beats antd's own border classes). */
function extraStyleOf(s: any): React.CSSProperties {
  const st: any = {};
  if (!s) return st;
  if (s.shadow) st.boxShadow = `0 2px 8px ${s.shadow}`;
  if (s.borderWidth) st.borderWidth = `${s.borderWidth}px`;
  if (s.borderStyle) st.borderStyle = s.borderStyle;
  if (s.borderRadius !== '' && s.borderRadius != null) st.borderRadius = `${s.borderRadius}px`;
  return st;
}
/** antd Button `styles.icon` — icon colour/size (antd 5.21+ semantic style). */
function iconStyleOf(s: any): React.CSSProperties | undefined {
  if (!s) return undefined;
  const st: any = {};
  if (s.iconColor) st.color = s.iconColor;
  if (s.iconSize) st.fontSize = `${s.iconSize}px`;
  return Object.keys(st).length ? st : undefined;
}

function buildButtonTokens(s: BtnStyle): Record<string, any> {
  const tokens: Record<string, any> = {};
  if (s.bg) {
    tokens.defaultBg = s.bg;
    tokens.defaultActiveBg = s.hoverBg || s.bg;
  }
  if (s.color) {
    tokens.defaultColor = s.color;
    tokens.defaultActiveColor = s.hoverColor || s.color;
  }
  if (s.border) {
    tokens.defaultBorderColor = s.border;
    tokens.defaultActiveBorderColor = s.hoverBg || s.border;
  }
  if (s.hoverBg) {
    tokens.defaultHoverBg = s.hoverBg;
    tokens.defaultHoverBorderColor = s.border || s.hoverBg;
  }
  if (s.hoverColor) {
    tokens.defaultHoverColor = s.hoverColor;
  }
  return tokens;
}

/** Live preview inside the colour dialog — reads the sibling form values reactively and renders a sample
 *  button through the SAME ConfigProvider-token path as the real apply (so what you see is what you get). */
const ButtonColourPreview: any = observer(() => {
  const form: any = useForm();
  const v: BtnStyle = (form && form.values) || {};
  return (
    <div
      style={{
        padding: '10px 12px',
        background: 'var(--colorFillQuaternary, #fafafa)',
        borderRadius: 6,
        border: '1px dashed #d9d9d9',
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      <ConfigProvider componentSize={(v as any).size || 'middle'} theme={{ components: { Button: buildButtonTokens(v) } }}>
        <Button
          type="default"
          icon={<StarOutlined />}
          style={extraStyleOf(v)}
          styles={iconStyleOf(v) ? { icon: iconStyleOf(v) } : undefined}
        >
          {t('Sample button')}
        </Button>
      </ConfigProvider>
      <span style={{ color: '#999', fontSize: 12 }}>{t('Hover to preview hover colour')}</span>
    </div>
  );
});

export function patchActionColor(deps: { flowEngine: any; tExpr: (s: string, o?: any) => any; lane: string }) {
  const { flowEngine, tExpr, lane } = deps;
  const te = (s: string) => tExpr(s, { ns: NS });

  const bind = (attempt = 0) => {
    const ActionBase: any = flowEngine?.getModelClass?.('ActionModel');
    if (!ActionBase) {
      if (attempt < 15) setTimeout(() => bind(attempt + 1), 800);
      return;
    }
    if (ActionBase.__ptdlColorPatched) return;
    ActionBase.__ptdlColorPatched = true;

    // Register the live-preview + grid components so the uiSchema can reference them by name.
    try {
      flowEngine.flowSettings?.registerComponents?.({ PtdlBtnColourPreview: ButtonColourPreview, PtdlBtnGrid: SettingsGrid });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[action-enh] (${lane}) preview registerComponents failed`, e);
    }

    // 1) Config step — shows up in the per-button ⚙ settings popup (like the native "Button settings").
    try {
      ActionBase.registerFlow({
        key: 'ptdlButtonColour',
        title: te('Button style'),
        sort: 900,
        steps: {
          colour: {
            title: te('Button style'),
            uiMode: { type: 'dialog', props: { width: 540 } },
            uiSchema: {
              preview: {
                type: 'void',
                'x-decorator': 'FormItem',
                'x-decorator-props': { style: { marginBottom: 8 } },
                'x-component': 'PtdlBtnColourPreview',
              },
              // Size + Pin — button behaviour, kept together with colour in this one dialog.
              size: {
                'x-decorator': 'FormItem',
                'x-component': 'Radio.Group',
                'x-component-props': { optionType: 'button', buttonStyle: 'solid' },
                title: te('Size'),
                enum: [
                  { value: 'small', label: te('Small') },
                  { value: 'middle', label: te('Medium') },
                  { value: 'large', label: te('Large') },
                ],
              },
              pin: {
                'x-decorator': 'FormItem',
                'x-component': 'Radio.Group',
                'x-component-props': { optionType: 'button', buttonStyle: 'solid' },
                title: te('Pin button'),
                enum: [
                  { value: 'none', label: te('None') },
                  { value: 'left', label: te('Pin left') },
                  { value: 'right', label: te('Pin right') },
                ],
              },
              // Colours in a 2-column grid: row1 Background|Text, row2 Border|Shadow, row3 Hover BG|Hover text.
              colours: {
                type: 'void',
                'x-component': 'PtdlBtnGrid',
                properties: {
                  bg: { 'x-decorator': 'FormItem', 'x-component': ColorField, title: te('Background') },
                  color: { 'x-decorator': 'FormItem', 'x-component': ColorField, title: te('Text') },
                  border: { 'x-decorator': 'FormItem', 'x-component': ColorField, title: te('Border') },
                  shadow: { 'x-decorator': 'FormItem', 'x-component': ColorField, title: te('Shadow') },
                  hoverBg: { 'x-decorator': 'FormItem', 'x-component': ColorField, title: te('Hover BG') },
                  hoverColor: { 'x-decorator': 'FormItem', 'x-component': ColorField, title: te('Hover text') },
                },
              },
              // Border (width/style/corner) + Icon (size/colour) — a 2-column grid; leave empty = default.
              borderIcon: {
                type: 'void',
                'x-component': 'PtdlBtnGrid',
                properties: {
                  borderStyle: {
                    'x-decorator': 'FormItem',
                    'x-component': 'Select',
                    title: te('Border style'),
                    'x-component-props': { allowClear: true, placeholder: te('Default') },
                    enum: [
                      { value: 'solid', label: te('Solid') },
                      { value: 'dashed', label: te('Dashed') },
                      { value: 'dotted', label: te('Dotted') },
                    ],
                  },
                  borderWidth: {
                    'x-decorator': 'FormItem',
                    'x-component': 'Select',
                    title: te('Border width'),
                    'x-component-props': { allowClear: true, placeholder: te('Default') },
                    enum: [
                      { value: 1, label: '1px' },
                      { value: 2, label: '2px' },
                      { value: 3, label: '3px' },
                    ],
                  },
                  borderRadius: {
                    'x-decorator': 'FormItem',
                    'x-component': 'Select',
                    title: te('Corner'),
                    'x-component-props': { allowClear: true, placeholder: te('Default') },
                    enum: [
                      { value: 0, label: te('Square') },
                      { value: 8, label: te('Rounded') },
                      { value: 999, label: te('Pill') },
                    ],
                  },
                  iconSize: {
                    'x-decorator': 'FormItem',
                    'x-component': 'Select',
                    title: te('Icon size'),
                    'x-component-props': { allowClear: true, placeholder: te('Default') },
                    enum: [
                      { value: 12, label: te('Small') },
                      { value: 16, label: te('Medium') },
                      { value: 20, label: te('Large') },
                    ],
                  },
                  iconColor: { 'x-decorator': 'FormItem', 'x-component': ColorField, title: te('Icon colour') },
                },
              },
            },
            defaultParams(ctx: any) {
              // Initialise ALL keys so form.values has them on first render (reactive proxies don't track
              // keys that don't exist yet — needed for the live preview). Void grid keeps flat paths.
              const s = ctx.model?.props?.[STYLE_PROP] || {};
              return {
                size: ctx.model?.props?.[SIZE_PROP] || 'middle',
                pin: ctx.model?.props?.[PIN_PROP] || 'none',
                bg: s.bg || '',
                color: s.color || '',
                border: s.border || '',
                shadow: s.shadow || '',
                hoverBg: s.hoverBg || '',
                hoverColor: s.hoverColor || '',
                borderStyle: s.borderStyle || '',
                borderWidth: s.borderWidth ?? '',
                borderRadius: s.borderRadius ?? '',
                iconSize: s.iconSize ?? '',
                iconColor: s.iconColor || '',
              };
            },
            handler(ctx: any, params: any) {
              const { size, pin, ...colours } = params || {};
              ctx.model.setProps({
                [STYLE_PROP]: colours,
                [SIZE_PROP]: size || 'middle',
                [PIN_PROP]: pin && pin !== 'none' ? pin : undefined,
              });
            },
          },
        },
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[action-enh] (${lane}) colour flow register failed`, e);
    }

    // 2) Apply — wrap renderButton output. Strip private props always; add the shadow inline-style and,
    //    when a token colour is configured, the ConfigProvider.
    const origRenderButton = ActionBase.prototype.renderButton;
    ActionBase.prototype.renderButton = function patchedRenderButton() {
      const el = origRenderButton.call(this);
      if (!React.isValidElement(el)) return el;
      // Per-button pin → a marker class the block's action-bar CSS uses to push the button to an edge.
      const pin = this.props?.[PIN_PROP];
      const pinCls = pin === 'left' ? 'ptdl-pin-left' : pin === 'right' ? 'ptdl-pin-right' : '';
      const size = this.props?.[SIZE_PROP];
      const s = this.props?.[STYLE_PROP];
      // Strip private props so they never leak onto the DOM <button>; carry the pin class + size + shadow.
      const override: any = { [STYLE_PROP]: undefined, [PIN_PROP]: undefined, [SIZE_PROP]: undefined };
      if (pinCls) {
        const prev = ((el as any).props && (el as any).props.className) || '';
        override.className = `${prev} ${pinCls}`.trim();
      }
      if (size === 'small' || size === 'middle' || size === 'large') {
        override.size = size;
      }
      const extra = extraStyleOf(s);
      if (Object.keys(extra).length) {
        override.style = { ...(((el as any).props && (el as any).props.style) || {}), ...extra };
      }
      const iconStyle = iconStyleOf(s);
      if (iconStyle) {
        const prevStyles = ((el as any).props && (el as any).props.styles) || {};
        override.styles = { ...prevStyles, icon: { ...(prevStyles.icon || {}), ...iconStyle } };
      }
      let btn: any = React.cloneElement(el as any, override);
      if (!hasColourTokens(s)) return btn;
      // Force default type so the default* Button tokens govern the whole look.
      btn = React.cloneElement(btn, { type: 'default' });
      return <ConfigProvider theme={{ components: { Button: buildButtonTokens(s) } }}>{btn}</ConfigProvider>;
    };

    // eslint-disable-next-line no-console
    console.log(`[action-enh] (${lane}) deep-colour patch applied to ActionModel`);
  };

  bind();
}
