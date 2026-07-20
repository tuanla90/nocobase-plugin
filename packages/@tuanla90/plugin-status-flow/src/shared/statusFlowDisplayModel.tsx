import React, { useState } from 'react';
import { Popconfirm, Tag, message } from 'antd';
import { StatusFlowGraphIcon } from './StatusFlowGraphIcon';
import {
  OptIcon,
  StatusFlowButtonGroup,
  StatusFlowDisplayPreview,
  StatusFlowPills,
  StatusFlowStatusBar,
  StatusFlowSteps,
  StatusTag,
  iconToggleSchema,
  monoColorSchema,
  scaleRowSchema,
  togglesRowSchema,
} from './statusFlowWidgets';
import { StatusFlowConfig, computeAllowedTargets, declaredTargets, isFlowConfigured, statusTagColor } from './types';
import { tt, te } from './i18n';

// Read-only widget renderers for the view/display side (same widgets as the editable control, but
// disabled — they just show the current status in that visual style).
const DISPLAY_WIDGETS: Record<string, React.FC<any>> = {
  pills: StatusFlowPills,
  buttons: StatusFlowButtonGroup,
  steps: StatusFlowSteps,
  statusbar: StatusFlowStatusBar,
};

// End-user facing extras rendered next to the status tag in table cells / details:
//  - sfShowGraph:   a small ⓘ icon whose popover shows the flow graph with the record's
//    current status highlighted
//  - sfShowButtons: one quick-transition button per target the current user's roles may move
//    to; clicking updates the record via the API (the server hook still validates) and
//    refreshes the block

// `collectionField` is a getter on flow-engine models that reads `this.context.collectionField`.
// That's reliable on a plain top-level TableColumnModel, but NOT guaranteed on a SubTableColumnModel
// or an inner field-model rendered inside a form/detail, where it actually lives on a parent model.
// Walk up a few `.parent` levels so nested status-flow fields still resolve their collectionField.
function resolveCf(model: any): any {
  for (let cur: any = model, i = 0; cur && i < 4; cur = cur.parent, i++) {
    if (cur?.collectionField) return cur.collectionField;
  }
  return null;
}

function rolesOfModel(model: any): string[] {
  const ctx: any = model?.context;
  const names: string[] = (ctx?.user?.roles || []).map((r: any) => r?.name).filter(Boolean);
  const active = ctx?.role;
  for (const r of Array.isArray(active) ? active : [active]) {
    if (typeof r === 'string' && r && !names.includes(r)) names.push(r);
  }
  return names;
}

export const StatusFlowCellExtras: React.FC<{
  model: any;
  value: any;
  flow: StatusFlowConfig;
  tags: React.ReactNode;
}> = ({ model, value, flow, tags }) => {
  const [busy, setBusy] = useState(false);
  const cf: any = resolveCf(model);
  const fieldName: string = cf?.name;
  const enumOptions = cf?.uiSchema?.enum || cf?.options?.uiSchema?.enum || [];
  const showGraph = !!model.props?.sfShowGraph;
  const showButtons = !!model.props?.sfShowButtons;
  const showLog = !!model.props?.sfShowLog;
  const colorMode = model.props?.sfColorMode === 'mono' ? 'mono' : 'colorful';
  const monoColor = model.props?.sfMonoColor;

  const record = model.context?.record;
  const collection: any = model.context?.collection;
  const tkField = collection?.filterTargetKey || 'id';
  const tk = record?.[Array.isArray(tkField) ? tkField[0] : tkField];

  const roleNames = rolesOfModel(model);
  const allValues = enumOptions.map((o: any) => String(o?.value));
  let targets: string[] = [];
  if (showButtons && record && tk !== undefined && value != null && value !== '' && isFlowConfigured(flow)) {
    const allowed = computeAllowedTargets(flow, String(value), roleNames, allValues);
    // root / unfiltered: offer every declared target from the current status
    targets = allowed === null ? declaredTargets(flow, String(value), allValues) : allowed;
  }

  const doTransition = async (target: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await model.context?.api?.request({
        url: `${collection?.name}:update`,
        method: 'post',
        params: { filterByTk: tk },
        data: { [fieldName]: target },
        // Tell @tuanla90/plugin-change-log (if installed) this was a quick-transition tag. Header
        // contract is documented in docs/CHANGE-LOG-NOTES.md; no hard dependency between plugins.
        headers: { 'x-ptdl-change-source': 'quick' },
      });
      const blockModel = model.context?.blockModel;
      await (blockModel?.resource?.refresh?.() || model.context?.resource?.refresh?.());
    } catch (err: any) {
      const msg = err?.response?.data?.errors?.[0]?.message || err?.message || tt('Update failed');
      message.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const graphNode = showGraph ? <StatusFlowGraphIcon enumOptions={enumOptions} flow={flow} current={value} /> : null;

  // Change-log history popover (only if @tuanla90/plugin-change-log is installed — via its bridge
  // global, so status-flow has no hard dependency on it). Small icon-only trigger in the cell.
  const bridge: any = (globalThis as any).__ptdlChangeLog;
  const LogTrigger = showLog && bridge?.ChangeLogTrigger;
  const logNode =
    LogTrigger && collection && tk !== undefined && tk !== null ? (
      <LogTrigger
        api={model.context?.api}
        collectionName={collection.name}
        recordId={tk}
        mode="popover"
        label=""
        buttonProps={{ type: 'text', size: 'small', style: { padding: '0 4px', height: 'auto' } }}
      />
    ) : null;

  const buttonNodes = targets.map((t) => {
    const opt = enumOptions.find((o: any) => String(o?.value) === t);
    const label = opt?.label || t;
    return (
      <Popconfirm
        key={t}
        title={`${tt('Move to')} "${label}"?`}
        okText={tt('Move')}
        onConfirm={(e) => {
          e?.stopPropagation?.();
          doTransition(t);
        }}
        onCancel={(e) => e?.stopPropagation?.()}
      >
        <Tag
          color={statusTagColor(opt?.color, colorMode, monoColor)}
          onClick={(e) => e.stopPropagation()}
          style={{
            cursor: busy ? 'wait' : 'pointer',
            borderStyle: 'dashed',
            opacity: busy ? 0.5 : 0.85,
            marginInlineEnd: 0,
          }}
        >
          → <OptIcon o={opt} />
          {label}
        </Tag>
      </Popconfirm>
    );
  });

  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}
      onClick={(e) => {
        // keep quick-transition/graph interactions from triggering row click-to-open
        if (showGraph || targets.length) e.stopPropagation();
      }}
    >
      {/* status tag, then the actionable quick-transition buttons right next to it, then the
          secondary info icons (flow graph, change-log history) trailing. */}
      <span>{tags}</span>
      {buttonNodes}
      {graphNode}
      {logNode}
    </span>
  );
};

// Base is the lane's DisplayEnumFieldModel; the subclass keeps its Tag rendering and adds the
// two opt-in extras via column settings (flow step below).
export function defineStatusFlowDisplayModel(Base: any) {
  class StatusFlowDisplayFieldModel extends Base {
    public renderComponent(value: any) {
      const cf: any = resolveCf(this);
      const flow = cf?.options?.statusFlow;
      const { sfShowGraph, sfShowButtons, sfShowLog, sfColorMode, sfDisplayStyle, sfSize, sfMonoColor } =
        (this as any).props || {};
      if (!flow) return super.renderComponent(value);

      const enumOptions = cf?.uiSchema?.enum || cf?.options?.uiSchema?.enum || [];
      const mode = sfColorMode === 'mono' ? 'mono' : 'colorful';
      const opt = enumOptions.find((o: any) => String(o?.value) === String(value));
      const empty = value == null || value === '';

      let tags: React.ReactNode;
      const Widget = !empty && sfDisplayStyle && DISPLAY_WIDGETS[sfDisplayStyle];
      if (Widget) {
        // Read-only visual widget (pills / buttons / steps / status bar): disabled so nothing is
        // clickable — it just shows the current status in that style.
        tags = (
          <Widget
            options={enumOptions}
            value={value}
            baseValue={value}
            flow={flow}
            roleNames={[]}
            disabled
            colorMode={mode}
            monoColor={sfMonoColor}
            size={sfSize || 'small'}
          />
        );
      } else {
        // Default: our colored tag (per-status icon + color mode); base render for empty value.
        tags = empty ? super.renderComponent(value) : <StatusTag opt={opt} colorMode={mode} monoColor={sfMonoColor} />;
      }

      if (!sfShowGraph && !sfShowButtons && !sfShowLog) return tags;
      return <StatusFlowCellExtras model={this} value={value} flow={flow} tags={tags} />;
    }
  }

  (StatusFlowDisplayFieldModel as any).define?.({ label: te('Status flow') });

  (StatusFlowDisplayFieldModel as any).registerFlow({
    key: 'ptdlStatusFlowDisplay',
    title: te('Status flow'),
    sort: 620,
    steps: {
      settings: {
        title: te('Display style'),
        uiSchema: (ctx: any) => {
          const cf: any = resolveCf(ctx?.model);
          const flow = cf?.options?.statusFlow || {};
          const enumOptions = cf?.uiSchema?.enum || cf?.options?.uiSchema?.enum || [];
          return {
          sfDisplayStyle: {
            type: 'string',
            title: te('Display as'),
            'x-decorator': 'FormItem',
            'x-component': 'Select',
            enum: [
              { label: te('Tag (default)'), value: 'tag' },
              { label: te('Pills'), value: 'pills' },
              { label: te('Button group'), value: 'buttons' },
              { label: te('Steps'), value: 'steps' },
              { label: te('Status bar'), value: 'statusbar' },
            ],
          },
          // Shared Size + Color mode row (same fragment as the editable dialog).
          sfRowScale: scaleRowSchema(),
          sfMonoColor: monoColorSchema(),
          // IconToggle renders its `label` prop directly in React → runtime tt (not a compiled schema title).
          sfRowToggles: togglesRowSchema({
            sfShowGraph: iconToggleSchema('lucide-workflow', tt('Flow graph')),
            sfShowButtons: iconToggleSchema('lucide-mouse-pointer-click', tt('Quick actions')),
            sfShowLog: iconToggleSchema('lucide-history', tt('Change log')),
          }),
          sfDisplayPreview: {
            type: 'void',
            'x-component': StatusFlowDisplayPreview,
            'x-component-props': { enumOptions, flow },
          },
          };
        },
        defaultParams: {
          sfDisplayStyle: 'tag',
          sfSize: 'small',
          sfColorMode: 'colorful',
          sfMonoColor: '',
          sfShowGraph: false,
          sfShowButtons: false,
          sfShowLog: false,
        },
        handler(ctx: any, params: any) {
          ctx.model.setProps({
            sfDisplayStyle: params.sfDisplayStyle || 'tag',
            sfSize: params.sfSize || 'small',
            sfColorMode: params.sfColorMode === 'mono' ? 'mono' : 'colorful',
            sfMonoColor: params.sfMonoColor || '',
            sfShowGraph: !!params.sfShowGraph,
            sfShowButtons: !!params.sfShowButtons,
            sfShowLog: !!params.sfShowLog,
          });
        },
      },
    },
  });

  return StatusFlowDisplayFieldModel;
}
