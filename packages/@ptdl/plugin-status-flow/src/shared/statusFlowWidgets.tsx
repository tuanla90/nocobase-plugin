import React, { useEffect, useState } from 'react';
import { ColorPicker, Select, Space, Steps, Tag, Tooltip } from 'antd';
import { observer, useForm } from '@formily/react';
import { IconByKey } from '@ptdl/shared';
import { ColorMode, StatusFlowConfig, computeAllowedTargets, statusHex, statusTagColor } from './types';
import { StatusFlowGraphIcon } from './StatusFlowGraphIcon';
import { tt, te } from './i18n';

// Editable widgets for the statusFlow field. All of them share the same contract:
// `baseValue` is the record's stored status (transitions are computed from it, so the user can
// always click back to it before saving), `value` is the current form selection.
export interface StatusWidgetProps {
  options: any[];
  value: any;
  baseValue: any;
  flow: StatusFlowConfig;
  roleNames: string[];
  disabled?: boolean;
  fullWidth?: boolean;
  size?: 'small' | 'middle' | 'large';
  colorMode?: ColorMode;
  monoColor?: string;
  onChange?: (v: any) => void;
  graphIcon?: React.ReactNode;
}

// A pill-style boolean toggle with a lucide icon — used in the settings dialogs instead of a bare
// checkbox. Formily injects value/onChange; icon + label come from x-component-props.
export const IconToggle: React.FC<any> = ({ value, onChange, icon, label }) => {
  const on = !!value;
  return (
    <span
      role="checkbox"
      aria-checked={on}
      onClick={() => onChange?.(!on)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        cursor: 'pointer',
        userSelect: 'none',
        padding: '5px 12px',
        borderRadius: 8,
        fontSize: 13,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
        border: on ? '1px solid #1677ff' : '1px solid rgba(128,128,128,0.3)',
        background: on ? 'rgba(22,119,255,0.1)' : 'transparent',
        color: on ? '#1677ff' : undefined,
        transition: 'all 0.15s',
      }}
    >
      {icon ? <IconByKey type={icon} /> : null}
      {label}
    </span>
  );
};

// ---- Shared settings-dialog schema fragments (reused by the editable + display dialogs, which
// are structurally the same: a widget select, a Size + Color mode row, a row of icon toggles, and
// a live preview). Only the widget options + which toggles differ between the two. ----

// One boolean rendered as a lucide IconToggle (no FormItem label — the toggle shows its own).
export function iconToggleSchema(icon: string, label: string) {
  return { type: 'boolean', 'x-component': IconToggle, 'x-component-props': { icon, label } };
}

// The "Size + Color mode" row (identical in both dialogs).
export function scaleRowSchema() {
  return {
    type: 'void',
    'x-component': Space,
    'x-component-props': { size: 16, wrap: true, align: 'start' },
    properties: {
      sfSize: {
        type: 'string',
        title: te('Size'),
        'x-decorator': 'FormItem',
        'x-decorator-props': { style: { marginBottom: 0 } },
        'x-component': 'Select',
        'x-component-props': { style: { width: 150 } },
        enum: [
          { label: te('Small'), value: 'small' },
          { label: te('Medium'), value: 'middle' },
          { label: te('Large'), value: 'large' },
        ],
      },
      sfColorMode: {
        type: 'string',
        title: te('Color mode'),
        'x-decorator': 'FormItem',
        'x-decorator-props': { style: { marginBottom: 0 } },
        'x-component': 'Select',
        'x-component-props': { style: { width: 220 } },
        enum: [
          { label: te('Colorful (per-status color)'), value: 'colorful' },
          { label: te('Mono (single color)'), value: 'mono' },
        ],
      },
    },
  };
}

// Color picker for the mono color — only shows when Color mode is "mono" (watches the dialog's own
// form). Renders its own label so nothing appears (not even an empty FormItem) in colorful mode.
export const MonoColorField = observer((props: any) => {
  const { value, onChange } = props;
  const form: any = useForm();
  if (form?.values?.sfColorMode !== 'mono') return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <span style={{ fontSize: 13 }}>{tt('Mono color')}</span>
      <ColorPicker
        allowClear
        value={value || undefined}
        onChange={(_c: any, hex: string) => onChange?.(hex)}
        onClear={() => onChange?.('')}
      />
    </div>
  );
});

export function monoColorSchema() {
  return { type: 'string', 'x-component': MonoColorField };
}

// A row of icon toggles (caller passes the { name: iconToggleSchema(...) } map). display:flex makes
// it a block row so the top/bottom margins reliably separate it from the row above and the preview.
export function togglesRowSchema(properties: Record<string, any>) {
  return {
    type: 'void',
    'x-component': Space,
    'x-component-props': {
      size: 16,
      wrap: true,
      align: 'center',
      style: { display: 'flex', marginTop: 14, marginBottom: 14 },
    },
    properties,
  };
}

// Inline status icon (registry key on the option), with a small gap before the label.
export const OptIcon: React.FC<{ o: any }> = ({ o }) =>
  o?.icon ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', marginRight: 5, flexShrink: 0 }}>
      <IconByKey type={o.icon} />
    </span>
  ) : null;

// A single status tag (icon + label) honouring the color mode — reused by table cells / details.
export const StatusTag: React.FC<{
  opt: any;
  colorMode?: ColorMode;
  monoColor?: string;
  style?: React.CSSProperties;
}> = ({ opt, colorMode, monoColor, style }) => (
  <Tag color={statusTagColor(opt?.color, colorMode, monoColor)} style={{ marginInlineEnd: 0, ...style }}>
    <OptIcon o={opt} />
    {opt?.label ?? opt?.value ?? '—'}
  </Tag>
);

// Shared size scale for all widgets.
const SIZES = {
  small: { font: 12, padV: 2, padH: 8, notch: 10, minH: 28 },
  middle: { font: 13, padV: 5, padH: 12, notch: 12, minH: 34 },
  large: { font: 14, padV: 8, padH: 18, notch: 14, minH: 44 },
} as const;

function sizeOf(p: StatusWidgetProps) {
  return SIZES[p.size || 'small'] || SIZES.small;
}

const NOT_REACHABLE = 'Not reachable from the current status (or not allowed for your role)';

function makeSelectable(p: StatusWidgetProps) {
  const allValues = p.options.map((o: any) => String(o?.value));
  const allowed = computeAllowedTargets(p.flow, p.baseValue == null ? null : String(p.baseValue), p.roleNames, allValues);
  return (v: string) => !p.disabled && (allowed === null || v === String(p.baseValue ?? '') || allowed.includes(v));
}

// Create form: the status is not editable — records always start at the initial status.
// Shows the initial tag and makes sure the form value is set so the submit is explicit.
export const LockedInitialStatus: React.FC<{
  options: any[];
  value: any;
  initial?: string;
  colorMode?: ColorMode;
  monoColor?: string;
  onChange?: (v: any) => void;
  graphIcon?: React.ReactNode;
}> = ({ options, value, initial, colorMode, monoColor, onChange, graphIcon }) => {
  const effective = value == null || value === '' ? initial : value;
  useEffect(() => {
    if ((value == null || value === '') && initial) onChange?.(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const opt = options.find((o: any) => String(o?.value) === String(effective));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 30, padding: '3px 0' }}>
      <Tooltip title={tt('New records always start at the initial status')}>
        <Tag color={statusTagColor(opt?.color, colorMode, monoColor)} style={{ marginInlineEnd: 0 }}>
          <OptIcon o={opt} />
          {opt?.label ?? effective ?? '—'}
        </Tag>
      </Tooltip>
      {graphIcon}
    </div>
  );
};

// Tags in flow order: selected solid ●, reachable clickable, the rest dimmed.
export const StatusFlowPills: React.FC<StatusWidgetProps> = (p) => {
  const { options, value, disabled, fullWidth, onChange, graphIcon, colorMode, monoColor } = p;
  const selectable = makeSelectable(p);
  const sz = sizeOf(p);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: fullWidth ? 'nowrap' : 'wrap',
        gap: 2,
        minHeight: sz.minH,
        padding: '3px 0',
        width: fullWidth ? '100%' : undefined,
      }}
    >
      {options.map((o: any, i: number) => {
        const v = String(o?.value);
        const isSelected = value != null && value !== '' && v === String(value);
        const clickable = !isSelected && selectable(v);
        const pill = (
          <Tag
            color={isSelected || clickable ? statusTagColor(o?.color, colorMode, monoColor) : undefined}
            style={{
              cursor: clickable ? 'pointer' : 'default',
              opacity: isSelected ? 1 : clickable ? 0.75 : 0.3,
              fontWeight: isSelected ? 600 : 400,
              borderStyle: isSelected ? 'solid' : 'dashed',
              marginInlineEnd: 0,
              userSelect: 'none',
              fontSize: sz.font,
              lineHeight: `${sz.font + 8}px`,
              padding: `${sz.padV}px ${sz.padH}px`,
              ...(fullWidth
                ? { width: '100%', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis' }
                : {}),
            }}
            onClick={() => clickable && onChange?.(o?.value)}
          >
            {isSelected ? '● ' : ''}
            <OptIcon o={o} />
            {o?.label ?? v}
          </Tag>
        );
        const wrapped = clickable || isSelected ? pill : <Tooltip title={tt(NOT_REACHABLE)}>{pill}</Tooltip>;
        return (
          <React.Fragment key={v}>
            {i > 0 && <span style={{ opacity: 0.3, fontSize: 11, padding: '0 2px', flexShrink: 0 }}>›</span>}
            {fullWidth ? <span style={{ flex: 1, minWidth: 0, display: 'flex' }}>{wrapped}</span> : wrapped}
          </React.Fragment>
        );
      })}
      {graphIcon && <span style={{ marginLeft: 6, flexShrink: 0 }}>{graphIcon}</span>}
    </div>
  );
};

// Odoo-style status bar: joined chevron arrows. Past steps are tinted, the current one is
// solid in its status color, reachable ones highlight on hover. Made to sit at the top of a
// form as a big transition header (use size large + full width).
export const StatusFlowStatusBar: React.FC<StatusWidgetProps> = (p) => {
  const { options, value, flow, fullWidth, onChange, graphIcon, colorMode, monoColor } = p;
  const selectable = makeSelectable(p);
  const sz = SIZES[p.size || 'large'] || SIZES.large; // this widget defaults to large
  const notch = sz.notch;
  const idx = options.findIndex((o: any) => value != null && value !== '' && String(o?.value) === String(value));
  void flow;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: sz.minH, padding: '3px 0', width: '100%' }}>
      <div style={{ display: 'flex', flex: fullWidth ? 1 : undefined, minWidth: 0, filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.06))' }}>
        {options.map((o: any, i: number) => {
          const v = String(o?.value);
          const hex = statusHex(o?.color, colorMode, monoColor);
          const isSelected = i === idx;
          const isDone = idx >= 0 && i < idx;
          const clickable = !isSelected && selectable(v);
          const seg = (
            <div
              onClick={() => clickable && onChange?.(o?.value)}
              style={{
                position: 'relative',
                flex: fullWidth ? 1 : undefined,
                minWidth: 0,
                padding: `${sz.padV}px ${sz.padH + notch}px`,
                marginLeft: i === 0 ? 0 : -(notch - 3),
                fontSize: sz.font,
                lineHeight: `${sz.font + 8}px`,
                fontWeight: isSelected ? 600 : 500,
                textAlign: 'center',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                userSelect: 'none',
                cursor: clickable ? 'pointer' : 'default',
                background: isSelected ? hex : isDone ? hex + '2E' : 'rgba(128,128,128,0.12)',
                color: isSelected ? '#fff' : isDone ? hex : clickable ? hex : undefined,
                opacity: isSelected || isDone || clickable ? 1 : 0.45,
                clipPath:
                  i === 0
                    ? `polygon(0 0, calc(100% - ${notch}px) 0, 100% 50%, calc(100% - ${notch}px) 100%, 0 100%)`
                    : `polygon(0 0, calc(100% - ${notch}px) 0, 100% 50%, calc(100% - ${notch}px) 100%, 0 100%, ${notch}px 50%)`,
              }}
            >
              <OptIcon o={o} />
              {o?.label ?? v}
            </div>
          );
          return clickable || isSelected ? (
            <React.Fragment key={v}>{seg}</React.Fragment>
          ) : (
            <Tooltip key={v} title={tt(NOT_REACHABLE)}>
              {seg}
            </Tooltip>
          );
        })}
      </div>
      {graphIcon && <span style={{ flexShrink: 0 }}>{graphIcon}</span>}
    </div>
  );
};

// Joined segmented buttons; the selected one is solid in its status color.
export const StatusFlowButtonGroup: React.FC<StatusWidgetProps> = (p) => {
  const { options, value, disabled, fullWidth, onChange, graphIcon, colorMode, monoColor } = p;
  const selectable = makeSelectable(p);
  const sz = sizeOf(p);
  const last = options.length - 1;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: sz.minH, padding: '3px 0', width: fullWidth ? '100%' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'stretch', flex: fullWidth ? 1 : undefined, minWidth: 0 }}>
        {options.map((o: any, i: number) => {
          const v = String(o?.value);
          const hex = statusHex(o?.color, colorMode, monoColor);
          const isSelected = value != null && value !== '' && v === String(value);
          const clickable = !isSelected && selectable(v);
          const btn = (
            <div
              onClick={() => clickable && onChange?.(o?.value)}
              style={{
                padding: `${sz.padV}px ${sz.padH}px`,
                fontSize: sz.font,
                lineHeight: `${sz.font + 8}px`,
                textAlign: 'center',
                flex: fullWidth ? 1 : undefined,
                minWidth: 0,
                border: `1px solid ${isSelected || clickable ? hex : 'rgba(128,128,128,0.35)'}`,
                borderLeftWidth: i === 0 ? 1 : 0,
                borderTopLeftRadius: i === 0 ? 6 : 0,
                borderBottomLeftRadius: i === 0 ? 6 : 0,
                borderTopRightRadius: i === last ? 6 : 0,
                borderBottomRightRadius: i === last ? 6 : 0,
                background: isSelected ? hex : 'transparent',
                color: isSelected ? '#fff' : clickable ? hex : undefined,
                opacity: isSelected || clickable ? 1 : 0.35,
                cursor: clickable ? 'pointer' : 'default',
                fontWeight: isSelected ? 600 : 400,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                userSelect: 'none',
              }}
            >
              <OptIcon o={o} />
              {o?.label ?? v}
            </div>
          );
          return clickable || isSelected ? (
            <React.Fragment key={v}>{btn}</React.Fragment>
          ) : (
            <Tooltip key={v} title={tt(NOT_REACHABLE)}>
              {btn}
            </Tooltip>
          );
        })}
      </div>
      {graphIcon && <span style={{ flexShrink: 0 }}>{graphIcon}</span>}
    </div>
  );
};

// Interactive preview rendered INSIDE the "Status flow options" settings dialog: it watches
// the dialog's own form values (formily) and re-renders the chosen widget live. Clicking
// around is local state only — nothing is saved until the dialog's OK.
export const StatusFlowOptionsPreview = observer((props: any) => {
  const { enumOptions = [], flow = {} } = props;
  const form: any = useForm();
  const style = form?.values?.sfEditorStyle || 'select';
  const fullWidth = !!form?.values?.sfFullWidth;
  const showGraph = !!form?.values?.sfShowGraph;
  const size = form?.values?.sfSize || 'small';
  const colorMode: ColorMode = form?.values?.sfColorMode === 'mono' ? 'mono' : 'colorful';
  const monoColor = form?.values?.sfMonoColor;
  // Demo a MIDDLE status (not the initial) so steps/status-bar show both past + upcoming states —
  // easier to picture than everything sitting at step 1.
  const baseValue = enumOptions[Math.floor(enumOptions.length / 2)]?.value ?? flow?.initial ?? enumOptions[0]?.value;
  const [val, setVal] = useState<any>(baseValue);

  if (!enumOptions.length) {
    return (
      <div style={{ fontSize: 12, opacity: 0.55, padding: '4px 0' }}>
        {tt("Configure the field's statuses first to see a preview.")}
      </div>
    );
  }

  const graphIcon = showGraph ? <StatusFlowGraphIcon enumOptions={enumOptions} flow={flow} current={val} /> : null;
  const common: StatusWidgetProps = {
    options: enumOptions,
    value: val,
    baseValue,
    flow,
    roleNames: [],
    fullWidth,
    size,
    colorMode,
    monoColor,
    onChange: setVal,
    graphIcon,
  };

  let widget: React.ReactNode;
  if (style === 'pills') widget = <StatusFlowPills {...common} />;
  else if (style === 'buttons') widget = <StatusFlowButtonGroup {...common} />;
  else if (style === 'steps') widget = <StatusFlowSteps {...common} />;
  else if (style === 'statusbar') widget = <StatusFlowStatusBar {...common} />;
  else {
    const allValues = enumOptions.map((o: any) => String(o?.value));
    const allowed = computeAllowedTargets(flow, baseValue == null ? null : String(baseValue), [], allValues);
    const opts =
      allowed === null
        ? enumOptions
        : enumOptions.filter((o: any) => String(o?.value) === String(baseValue) || allowed.includes(String(o?.value)));
    widget = (
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Select
          size="small"
          style={{ flex: 1, minWidth: 0 }}
          value={val}
          onChange={setVal}
          options={opts.map((o: any) => ({
            value: o?.value,
            label: (
              <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                <OptIcon o={o} />
                {o?.label ?? o?.value}
              </span>
            ),
          }))}
        />
        {graphIcon}
      </span>
    );
  }

  return (
    <div style={{ border: '1px dashed rgba(128,128,128,0.35)', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 11, opacity: 0.55, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6 }}>
        {tt('Preview — interactive, nothing is saved')}
      </div>
      {widget}
      <div style={{ fontSize: 11, opacity: 0.5, marginTop: 6 }}>
        {tt('Transitions are demoed as if the record were at')} "
        {enumOptions.find((o: any) => String(o?.value) === String(baseValue))?.label ?? baseValue}".
      </div>
    </div>
  );
});

// antd Steps: numbered pipeline with connectors; done steps are checked, a selected fail-kind
// status renders as error. Reachable steps are clickable.
export const StatusFlowSteps: React.FC<StatusWidgetProps> = (p) => {
  const { options, value, flow, onChange, graphIcon } = p;
  const selectable = makeSelectable(p);
  const sz = sizeOf(p);
  const idx = options.findIndex((o: any) => value != null && value !== '' && String(o?.value) === String(value));
  const kinds = flow?.kinds || {};
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: sz.minH, padding: '4px 0' }}>
      <Steps
        size={p.size === 'small' || !p.size ? 'small' : 'default'}
        style={{ flex: 1, minWidth: 0 }}
        onChange={(n: number) => {
          const o = options[n];
          if (!o) return;
          const v = String(o.value);
          if (v !== String(value ?? '') && selectable(v)) onChange?.(o.value);
        }}
        items={options.map((o: any, i: number) => {
          const v = String(o?.value);
          const isSelected = i === idx;
          const clickable = !isSelected && selectable(v);
          const failSelected = isSelected && kinds[v] === 'fail';
          return {
            title: (
              <span style={{ fontSize: sz.font, opacity: isSelected || clickable ? 1 : 0.45 }}>
                <OptIcon o={o} />
                {o?.label ?? v}
              </span>
            ),
            status: isSelected ? (failSelected ? 'error' : 'process') : idx >= 0 && i < idx ? 'finish' : 'wait',
            disabled: !clickable,
          };
        })}
      />
      {graphIcon && <span style={{ flexShrink: 0 }}>{graphIcon}</span>}
    </div>
  );
};

// Read-only preview for the DISPLAY settings dialog: renders the chosen display style (tag / pills
// / buttons / steps / status bar) at the chosen size + color mode with a sample status, mirroring
// how the cell will look. Watches the dialog's own form values (formily).
export const StatusFlowDisplayPreview = observer((props: any) => {
  const { enumOptions = [], flow = {} } = props;
  const form: any = useForm();
  const style = form?.values?.sfDisplayStyle || 'tag';
  const size = form?.values?.sfSize || 'small';
  const colorMode: ColorMode = form?.values?.sfColorMode === 'mono' ? 'mono' : 'colorful';
  const monoColor = form?.values?.sfMonoColor;

  if (!enumOptions.length) {
    return (
      <div style={{ fontSize: 12, opacity: 0.55, padding: '4px 0' }}>{tt('Configure statuses first to preview.')}</div>
    );
  }

  // Demo a middle status (not the initial) so widgets like steps show past + upcoming states.
  const val = enumOptions[Math.floor(enumOptions.length / 2)]?.value ?? flow?.initial ?? enumOptions[0]?.value;
  const opt = enumOptions.find((o: any) => String(o?.value) === String(val));
  const WIDGETS_RO: Record<string, React.FC<StatusWidgetProps>> = {
    pills: StatusFlowPills,
    buttons: StatusFlowButtonGroup,
    steps: StatusFlowSteps,
    statusbar: StatusFlowStatusBar,
  };
  const W = WIDGETS_RO[style];
  const widget = W ? (
    <W options={enumOptions} value={val} baseValue={val} flow={flow} roleNames={[]} disabled colorMode={colorMode} monoColor={monoColor} size={size} />
  ) : (
    <StatusTag opt={opt} colorMode={colorMode} monoColor={monoColor} />
  );

  return (
    <div style={{ border: '1px dashed rgba(128,128,128,0.35)', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 11, opacity: 0.55, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6 }}>
        {tt('Preview')}
      </div>
      {widget}
    </div>
  );
});
