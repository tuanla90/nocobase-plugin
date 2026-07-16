import React from 'react';
import { Button, Dropdown, Input, Modal, Space, Tooltip, message } from 'antd';
import { RegistryIcon } from './iconRegistry';
import { OptIcon } from './statusFlowWidgets';
import { TAG_HEX, computeAllowedTargets, declaredTargets, isFlowConfigured } from './types';
import { tt, te } from './i18n';

// UTF-8 safe base64 for the optional transition note (headers must stay ASCII).
function b64utf8(s: string): string {
  try {
    return btoa(unescape(encodeURIComponent(s)));
  } catch (e) {
    return '';
  }
}

// ERPNext-style "Actions ▾" record action: a standalone button for table row actions and
// details/form action bars. The dropdown lists only the transitions the current user may
// perform on THIS record; picking one updates the record (server hook still validates).

function rolesOfModel(model: any): string[] {
  const ctx: any = model?.context;
  const names: string[] = (ctx?.user?.roles || []).map((r: any) => r?.name).filter(Boolean);
  const active = ctx?.role;
  for (const r of Array.isArray(active) ? active : [active]) {
    if (typeof r === 'string' && r && !names.includes(r)) names.push(r);
  }
  return names;
}

const dot = (color?: string) => (
  <span
    style={{
      display: 'inline-block',
      width: 10,
      height: 10,
      borderRadius: '50%',
      background: TAG_HEX[color || 'default'] || TAG_HEX.default,
      marginRight: 6,
      flexShrink: 0,
    }}
  />
);

export function defineStatusTransitionActionModel(Base: any) {
  class StatusTransitionActionModel extends Base {
    static scene = 'record';

    defaultProps: any = {
      type: 'primary',
      title: tt('Actions'),
    };

    getAclActionName() {
      return 'update';
    }

    // When the collection has more than one statusFlow field and none was picked in the action
    // settings, don't silently fall back to the first one (surprising if it's the wrong field) —
    // report it as ambiguous instead so render() can show a clear reason.
    getStatusField(): { field: any; ambiguous: boolean } {
      const ctx: any = (this as any).context;
      const collection = ctx?.collection || ctx?.blockModel?.collection;
      const fields = collection?.getFields?.() || [];
      const sfFields = fields.filter((f: any) => (f?.options?.interface ?? f?.interface) === 'statusFlow');
      const wanted = (this as any).props?.sfFieldName;
      if (wanted) return { field: sfFields.find((f: any) => f.name === wanted), ambiguous: false };
      if (sfFields.length > 1) return { field: undefined, ambiguous: true };
      return { field: sfFields[0], ambiguous: false };
    }

    async applyTransition(field: any, target: string, targetLabel: React.ReactNode) {
      const ctx: any = (this as any).context;
      const collection = ctx?.collection || ctx?.blockModel?.collection;
      const record = ctx?.record;
      const tkField = collection?.filterTargetKey || 'id';
      const tk = record?.[Array.isArray(tkField) ? tkField[0] : tkField];
      const askNote = !!(this as any).props?.sfAskNote;

      // note passed through a base64 header so @ptdl/plugin-change-log (if installed) records the
      // reason; source='action' tags this transition's origin. No hard dependency on that plugin.
      const run = async (note?: string) => {
        const headers: any = { 'x-ptdl-change-source': 'action' };
        if (note && note.trim()) headers['x-ptdl-change-note'] = b64utf8(note.trim());
        try {
          await ctx?.api?.request({
            url: `${collection?.name}:update`,
            method: 'post',
            params: { filterByTk: tk },
            data: { [field.name]: target },
            headers,
          });
          await (ctx?.blockModel?.resource?.refresh?.() || ctx?.resource?.refresh?.());
        } catch (err: any) {
          const msg = err?.response?.data?.errors?.[0]?.message || err?.message || tt('Update failed');
          message.error(msg);
        }
      };

      // No dialog only when neither a confirm nor a note is requested.
      if ((this as any).props?.sfConfirm === false && !askNote) return run();

      let note = '';
      Modal.confirm({
        title: <span>{tt('Move to')} {targetLabel}?</span>,
        content: askNote ? (
          <Input.TextArea
            autoSize={{ minRows: 2, maxRows: 5 }}
            placeholder={tt('Reason (optional)')}
            style={{ marginTop: 8 }}
            onChange={(e) => {
              note = e.target.value;
            }}
          />
        ) : null,
        okText: tt('Move'),
        onOk: () => run(note),
      });
    }

    render() {
      const {
        sfFieldName,
        sfConfirm,
        sfAskNote,
        iconOnly,
        tooltip,
        title,
        children,
        ...btnProps
      }: any = (this as any).props || {};
      void sfFieldName;
      void sfConfirm;
      void sfAskNote;
      void iconOnly;

      const { field, ambiguous } = this.getStatusField();
      const ctx: any = (this as any).context;
      const record = ctx?.record;
      const flow = field?.options?.statusFlow;
      const enumOptions: any[] = field?.uiSchema?.enum || field?.options?.uiSchema?.enum || [];

      let disabledReason = '';
      let items: any[] = [];
      if (ambiguous) {
        disabledReason = tt('Multiple status fields on this collection — select one in the action settings');
      } else if (!field) {
        disabledReason = tt('No Status Flow field on this collection');
      } else if (!record) {
        disabledReason = tt('No record context');
      } else {
        const current = record[field.name];
        const allValues = enumOptions.map((o: any) => String(o?.value));
        const roleNames = rolesOfModel(this);
        let targets = computeAllowedTargets(flow, current == null ? null : String(current), roleNames, allValues);
        if (targets === null) {
          targets = isFlowConfigured(flow)
            ? declaredTargets(flow, String(current), allValues)
            : allValues.filter((v) => v !== String(current));
        }
        if (!targets.length) {
          disabledReason = tt('No transition available from the current status');
        } else {
          const curOpt = enumOptions.find((o: any) => String(o?.value) === String(current));
          items = [
            {
              key: '__current',
              disabled: true,
              label: (
                <span style={{ fontSize: 12, opacity: 0.65, display: 'inline-flex', alignItems: 'center' }}>
                  {dot(curOpt?.color)}
                  <OptIcon o={curOpt} />
                  {curOpt?.label ?? (current == null || current === '' ? '—' : String(current))}
                </span>
              ),
            },
            { type: 'divider' },
            ...targets.map((t) => {
              const o = enumOptions.find((opt: any) => String(opt?.value) === t);
              return {
                key: t,
                label: (
                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                    {dot(o?.color)}
                    <OptIcon o={o} />
                    {o?.label ?? t}
                  </span>
                ),
              };
            }),
          ];
        }
      }

      const label = children || (typeof (this as any).getTitle === 'function' ? (this as any).getTitle() : title) || tt('Actions');
      const button = (
        <Button {...btnProps} disabled={!!disabledReason || btnProps.disabled}>
          {label}
          <RegistryIcon type="lucide-chevron-down" fallback="DownOutlined" style={{ fontSize: 12 }} />
        </Button>
      );

      if (disabledReason) {
        return <Tooltip title={tooltip || disabledReason}>{button}</Tooltip>;
      }
      const dropdown = (
        <Dropdown
          trigger={['click']}
          menu={{
            items,
            onClick: ({ key, domEvent }: any) => {
              domEvent?.stopPropagation?.();
              const o = enumOptions.find((opt: any) => String(opt?.value) === key);
              this.applyTransition(
                field,
                key,
                <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                  {dot(o?.color)}
                  <OptIcon o={o} />
                  {o?.label ?? key}
                </span>,
              );
            },
          }}
        >
          {button}
        </Dropdown>
      );
      return tooltip ? <Tooltip title={tooltip}>{dropdown}</Tooltip> : dropdown;
    }
  }

  (StatusTransitionActionModel as any).define({
    label: te('Status transition'),
    sort: 55,
  });

  (StatusTransitionActionModel as any).registerFlow({
    key: 'ptdlStatusTransition',
    title: te('Status transition'),
    sort: 600,
    steps: {
      settings: {
        title: te('Status transition settings'),
        uiSchema: (ctx: any) => {
          const collection = ctx?.model?.context?.collection || ctx?.model?.context?.blockModel?.collection;
          const fields = (collection?.getFields?.() || []).filter(
            (f: any) => (f?.options?.interface ?? f?.interface) === 'statusFlow',
          );
          return {
            sfFieldName: {
              type: 'string',
              title: te('Status field'),
              'x-decorator': 'FormItem',
              'x-component': 'Select',
              enum: fields.map((f: any) => ({
                label: f?.uiSchema?.title || f?.options?.uiSchema?.title || f.name,
                value: f.name,
              })),
            },
            sfRowToggles: {
              type: 'void',
              'x-component': Space,
              'x-component-props': { size: 24, wrap: true, align: 'start', style: { display: 'flex' } },
              properties: {
                sfConfirm: {
                  type: 'boolean',
                  title: te('Confirm before moving'),
                  'x-decorator': 'FormItem',
                  'x-decorator-props': { style: { marginBottom: 0 } },
                  'x-component': 'Checkbox',
                },
                sfAskNote: {
                  type: 'boolean',
                  title: te('Ask for a note/reason'),
                  'x-decorator': 'FormItem',
                  'x-decorator-props': { style: { marginBottom: 0 } },
                  'x-component': 'Checkbox',
                },
              },
            },
          };
        },
        defaultParams: {
          sfConfirm: true,
          sfAskNote: false,
        },
        handler(ctx: any, params: any) {
          ctx.model.setProps({
            sfFieldName: params.sfFieldName,
            sfConfirm: params.sfConfirm !== false,
            sfAskNote: !!params.sfAskNote,
          });
        },
      },
    },
  });

  return StatusTransitionActionModel;
}
