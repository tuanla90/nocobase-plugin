import React from 'react';
import { IconByKey } from '@tuanla90/shared';
import { StatusFlowConfig, computeAllowedTargets, isFlowConfigured } from './types';
import { StatusFlowGraphIcon } from './StatusFlowGraphIcon';
import {
  LockedInitialStatus,
  StatusFlowButtonGroup,
  StatusFlowOptionsPreview,
  StatusFlowPills,
  StatusFlowStatusBar,
  StatusFlowSteps,
  StatusWidgetProps,
  iconToggleSchema,
  monoColorSchema,
  scaleRowSchema,
  togglesRowSchema,
} from './statusFlowWidgets';
import { tt, te } from './i18n';

function rolesOfModel(model: any): string[] {
  const ctx: any = model?.context;
  const names: string[] = (ctx?.user?.roles || []).map((r: any) => r?.name).filter(Boolean);
  const active = ctx?.role;
  for (const r of Array.isArray(active) ? active : [active]) {
    if (typeof r === 'string' && r && !names.includes(r)) names.push(r);
  }
  return names;
}

const WIDGETS: Record<string, React.FC<StatusWidgetProps>> = {
  pills: StatusFlowPills,
  buttons: StatusFlowButtonGroup,
  steps: StatusFlowSteps,
  statusbar: StatusFlowStatusBar,
};

// Editable control for statusFlow fields. Base is the lane's SelectFieldModel; the dropdown
// only offers valid transitions for the current user, create forms are locked to the initial
// status, and settings can switch the widget (pills / button group / steps) and/or add the
// flow-graph icon. Client-side filtering is UX only — the server hook is the authority.
export function defineStatusFlowFieldModel(Base: any) {
  class StatusFlowFieldModel extends Base {
    getFlowConfig(): { flow?: StatusFlowConfig; name?: string; enumOptions: any[] } {
      const cf: any = (this as any).context?.collectionField;
      return {
        flow: cf?.options?.statusFlow,
        name: cf?.name,
        enumOptions: cf?.uiSchema?.enum || cf?.options?.uiSchema?.enum || [],
      };
    }

    isInCreateForm(): boolean {
      const ctx: any = (this as any).context;
      const blockModel = ctx?.blockModel;
      try {
        const CreateFormModel = (this as any).flowEngine?.getModelClass?.('CreateFormModel');
        if (CreateFormModel) return blockModel instanceof CreateFormModel;
      } catch (e) {
        // fall through to the duck check
      }
      // CreateFormModel marks its resource as a new record; other blocks (edit, quick edit) don't.
      return blockModel?.resource?.isNewRecord === true && !ctx?.record?.id;
    }

    render() {
      const { flow, name, enumOptions } = this.getFlowConfig();
      const props: any = (this as any).props;
      const record = (this as any).context?.record;
      const baseValue = record && name ? record[name] : undefined;
      const roleNames = rolesOfModel(this);
      const allValues = enumOptions.map((o: any) => String(o?.value));

      const graphIcon =
        flow && props?.sfShowGraph ? (
          <StatusFlowGraphIcon enumOptions={enumOptions} flow={flow} current={props?.value ?? baseValue} />
        ) : null;

      const colorMode = props?.sfColorMode === 'mono' ? 'mono' : 'colorful';
      const monoColor = props?.sfMonoColor;

      // Create form: locked to the initial status.
      if (flow && isFlowConfigured(flow) && this.isInCreateForm()) {
        return (
          <LockedInitialStatus
            options={enumOptions}
            value={props?.value}
            initial={flow.initial}
            colorMode={colorMode}
            monoColor={monoColor}
            onChange={(v) => props?.onChange?.(v)}
            graphIcon={graphIcon}
          />
        );
      }

      // Alternative widgets replace the select entirely.
      const Widget = flow ? WIDGETS[props?.sfEditorStyle] : undefined;
      if (Widget) {
        return (
          <Widget
            options={enumOptions}
            value={props?.value}
            baseValue={baseValue ?? props?.value}
            flow={flow!}
            roleNames={roleNames}
            disabled={props?.disabled}
            fullWidth={!!props?.sfFullWidth}
            size={props?.sfSize}
            colorMode={colorMode}
            monoColor={monoColor}
            onChange={(v) => props?.onChange?.(v)}
            graphIcon={graphIcon}
          />
        );
      }

      // Dropdown: same select as core, filtered to current + allowed transitions, with the
      // per-status icon injected into the option label (core renders the label as-is).
      let el: any = super.render();
      try {
        if (flow && el?.props?.options) {
          let options: any[] = el.props.options;
          if (baseValue != null) {
            const allowed = computeAllowedTargets(flow, String(baseValue), roleNames, allValues);
            if (allowed !== null) {
              const keep = new Set([String(baseValue), ...allowed]);
              options = options.filter((o: any) => keep.has(String(o?.value)));
            }
          }
          const iconByValue = new Map(
            enumOptions.filter((o: any) => o?.icon).map((o: any) => [String(o.value), o.icon]),
          );
          if (iconByValue.size) {
            options = options.map((o: any) => {
              const ic = iconByValue.get(String(o?.value));
              if (!ic) return o;
              return {
                ...o,
                label: (
                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span style={{ display: 'inline-flex', marginRight: 5 }}>
                      <IconByKey type={ic} />
                    </span>
                    {o.label}
                  </span>
                ),
              };
            });
          }
          if (options !== el.props.options) el = React.cloneElement(el, { options });
        }
      } catch (e) {
        // fall through with the unfiltered element
      }
      if (!graphIcon) return el;
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ flex: 1, minWidth: 0 }}>{el}</span>
          {graphIcon}
        </span>
      );
    }
  }

  (StatusFlowFieldModel as any).define?.({ label: te('Status flow') });

  (StatusFlowFieldModel as any).registerFlow({
    key: 'ptdlStatusFlowEditable',
    title: te('Status flow'),
    sort: 620,
    steps: {
      settings: {
        title: te('Display style'),
        uiSchema: (ctx: any) => {
          const cf: any = ctx?.model?.context?.collectionField;
          const flow = cf?.options?.statusFlow || {};
          const enumOptions = cf?.uiSchema?.enum || cf?.options?.uiSchema?.enum || [];
          return {
            sfEditorStyle: {
              type: 'string',
              title: te('Widget'),
              'x-decorator': 'FormItem',
              'x-component': 'Select',
              enum: [
                { label: te('Dropdown (default)'), value: 'select' },
                { label: te('Status pills (click to move)'), value: 'pills' },
                { label: te('Button group'), value: 'buttons' },
                { label: te('Steps'), value: 'steps' },
                { label: te('Status bar (Odoo style)'), value: 'statusbar' },
              ],
            },
            // Shared Size + Color mode row (same fragment as the display dialog).
            sfRowScale: scaleRowSchema(),
            sfMonoColor: monoColorSchema(),
            // IconToggle renders its `label` prop directly in React → runtime t (not a compiled schema title).
            sfRowToggles: togglesRowSchema({
              sfFullWidth: iconToggleSchema('lucide-move-horizontal', tt('Full width')),
              sfShowGraph: iconToggleSchema('lucide-workflow', tt('Flow graph')),
            }),
            sfPreview: {
              type: 'void',
              'x-component': StatusFlowOptionsPreview,
              'x-component-props': { enumOptions, flow },
            },
          };
        },
        defaultParams: {
          sfEditorStyle: 'select',
          sfSize: 'small',
          sfColorMode: 'colorful',
          sfMonoColor: '',
          sfFullWidth: false,
          sfShowGraph: false,
        },
        handler(ctx: any, params: any) {
          ctx.model.setProps({
            sfEditorStyle: params.sfEditorStyle || 'select',
            sfSize: params.sfSize || 'small',
            sfColorMode: params.sfColorMode === 'mono' ? 'mono' : 'colorful',
            sfMonoColor: params.sfMonoColor || '',
            sfFullWidth: !!params.sfFullWidth,
            sfShowGraph: !!params.sfShowGraph,
          });
        },
      },
    },
  });

  return StatusFlowFieldModel;
}
