import React from 'react';
import { Select, Tag } from 'antd';
import { connect, mapReadPretty, useField } from '@formily/react';
import { useAPIClient, useCollection } from '@nocobase/client';
import { IconByKey } from '@tuanla90/shared';
import { StatusFlowConfig, TAG_HEX, computeAllowedTargets, isFlowConfigured } from '../shared/types';

// Editable + read-pretty x-component for the legacy /admin (Formily-schema) forms and tables.
// The /v/ lane and classic flow-engine blocks already filter transitions via StatusFlowFieldModel;
// this closes the last gap — the classic SchemaComponent (TableV2 / legacy form) select, which
// otherwise offers every status regardless of the current one or the user's role.
//
// Everything is best-effort: if the collection field / flow config / record context can't be
// resolved, it degrades to a plain, unfiltered Select so a form never breaks. The server hook
// stays the authority — this is UX only.

interface FlowCtx {
  flow?: StatusFlowConfig;
  enumOptions: any[];
}

// Resolve the statusFlow config + enum for the field this component is rendering.
function useFlowCtx(): FlowCtx {
  const field: any = useField();
  let collection: any;
  try {
    collection = useCollection();
  } catch (e) {
    collection = undefined;
  }
  const name = field?.props?.name ?? field?.address?.segments?.slice(-1)?.[0];
  const cf = name ? collection?.getField?.(name) : undefined;
  const flow: StatusFlowConfig | undefined = cf?.options?.statusFlow ?? cf?.statusFlow;
  const enumOptions: any[] = cf?.uiSchema?.enum ?? cf?.options?.uiSchema?.enum ?? [];
  return { flow, enumOptions };
}

// Active role(s) for client-side filtering. `api.auth.role` is the header-selected role and is
// synchronous; unknown / union roles stay permissive (empty list) and let the server decide.
function useRoleNames(): string[] {
  let api: any;
  try {
    api = useAPIClient();
  } catch (e) {
    api = undefined;
  }
  const role = api?.auth?.role;
  return role && role !== '__union__' ? [String(role)] : [];
}

const colorDot = (color?: string) => (
  <span
    style={{
      display: 'inline-block',
      width: 9,
      height: 9,
      borderRadius: '50%',
      background: TAG_HEX[color || 'default'] || TAG_HEX.default,
      marginRight: 6,
      flexShrink: 0,
    }}
  />
);

const StatusFlowSelectEditable: React.FC<any> = (props) => {
  const { value, onChange, ...rest } = props;
  const field: any = useField();
  const { flow, enumOptions } = useFlowCtx();
  const roleNames = useRoleNames();

  // The stored status (edit form) or the default (create form) — transitions are computed from
  // it, so the current value is always kept selectable even after the user changes the dropdown.
  const base = field?.initialValue ?? value;
  const allValues = enumOptions.map((o: any) => String(o?.value));

  let opts = enumOptions;
  try {
    if (flow && isFlowConfigured(flow) && base != null && base !== '') {
      const allowed = computeAllowedTargets(flow, String(base), roleNames, allValues);
      if (allowed !== null) {
        const keep = new Set([String(base), ...allowed]);
        opts = enumOptions.filter((o: any) => keep.has(String(o?.value)));
      }
    }
  } catch (e) {
    opts = enumOptions;
  }

  return (
    <Select
      {...rest}
      value={value ?? undefined}
      onChange={onChange}
      options={opts.map((o: any) => ({
        value: o?.value,
        label: (
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            {colorDot(o?.color)}
            {o?.icon ? (
              <span style={{ display: 'inline-flex', marginRight: 5 }}>
                <IconByKey type={o.icon} />
              </span>
            ) : null}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{o?.label ?? o?.value}</span>
          </span>
        ),
      }))}
    />
  );
};

const StatusFlowSelectReadPretty: React.FC<any> = (props) => {
  const { value } = props;
  const { enumOptions } = useFlowCtx();
  if (value == null || value === '') return <span />;
  const opt = enumOptions.find((o: any) => String(o?.value) === String(value));
  return (
    <Tag color={opt?.color} style={{ marginInlineEnd: 0 }}>
      {opt?.icon ? (
        <span style={{ display: 'inline-flex', marginRight: 5 }}>
          <IconByKey type={opt.icon} />
        </span>
      ) : null}
      {opt?.label ?? String(value)}
    </Tag>
  );
};

// connect + mapReadPretty is the Formily-canonical wiring: value/onChange are injected from the
// field, and the read-pretty variant is swapped in automatically when the field pattern is
// read-pretty (details blocks, table cells rendered by the legacy SchemaComponent).
export const StatusFlowSelect: any = connect(
  StatusFlowSelectEditable,
  mapReadPretty(StatusFlowSelectReadPretty),
);
