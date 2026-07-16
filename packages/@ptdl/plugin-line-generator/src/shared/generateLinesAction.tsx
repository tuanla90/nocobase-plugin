import React, { useEffect, useState } from 'react';
import { Button, Dropdown, Tooltip } from 'antd';
import { GenerateDialog } from './GenerateDialog';
import { fetchRulesFor, guardPasses, RuleMeta } from './api';
import { t, te } from './i18n';

// "Sinh dòng" (Generate lines) record action. Discovers which generators apply to the record's
// collection, hides itself unless at least one applies AND its guard passes, and opens a
// preview→commit dialog. With >1 applicable generator it offers a dropdown.

const GenerateButton: React.FC<{
  api: any;
  collectionName: string;
  record: any;
  tk: any;
  pinnedKey?: string;
  label: React.ReactNode;
  btnProps: any;
  onDone?: () => void;
}> = ({ api, collectionName, record, tk, pinnedKey, label, btnProps, onDone }) => {
  const [rules, setRules] = useState<RuleMeta[] | null>(null);
  const [active, setActive] = useState<RuleMeta | null>(null);

  useEffect(() => {
    let live = true;
    if (!collectionName) { setRules([]); return; }
    fetchRulesFor(api, collectionName).then((rs) => {
      if (!live) return;
      setRules(pinnedKey ? rs.filter((r) => r.key === pinnedKey) : rs);
    });
    return () => { live = false; };
  }, [api, collectionName, pinnedKey]);

  if (!rules) return null;
  // Only show generators whose guard passes for THIS record.
  const applicable = rules.filter((r) => guardPasses(r.guard, record));
  if (!applicable.length || tk == null) return null;

  const open = (r: RuleMeta) => setActive(r);
  const dialog = active ? (
    <GenerateDialog
      open={!!active}
      api={api}
      ruleKey={active.key}
      ruleTitle={active.title}
      filterByTk={tk}
      onClose={() => setActive(null)}
      onDone={onDone}
    />
  ) : null;

  if (applicable.length === 1) {
    return (
      <>
        <Button {...btnProps} onClick={(e: any) => { e?.stopPropagation?.(); open(applicable[0]); }}>{label}</Button>
        {dialog}
      </>
    );
  }
  return (
    <>
      <Dropdown
        trigger={['click']}
        menu={{ items: applicable.map((r) => ({ key: r.key, label: r.title })), onClick: ({ key }) => open(applicable.find((r) => r.key === key)!) }}
      >
        <Button {...btnProps} onClick={(e: any) => e?.stopPropagation?.()}>{label}</Button>
      </Dropdown>
      {dialog}
    </>
  );
};

export function defineGenerateLinesActionModel(Base: any) {
  class GenerateLinesActionModel extends Base {
    static scene = 'record';

    defaultProps: any = { title: 'Sinh dòng' };

    getAclActionName() {
      return 'update';
    }

    render() {
      const { lgRuleKey, tooltip, title, children, ...btnProps }: any = (this as any).props || {};
      const ctx: any = (this as any).context;
      const collection = ctx?.collection || ctx?.blockModel?.collection;
      const record = ctx?.record;
      const tkField = collection?.filterTargetKey || 'id';
      const tk = record?.[Array.isArray(tkField) ? tkField[0] : tkField];
      const resolved = (typeof (this as any).getTitle === 'function' ? (this as any).getTitle() : title) || 'Sinh dòng';
      const label = children || (typeof resolved === 'string' ? t(resolved) : resolved);
      const refresh = () => (ctx?.blockModel?.resource?.refresh?.() || ctx?.resource?.refresh?.());
      const btn = (
        <GenerateButton
          api={ctx?.api}
          collectionName={collection?.name}
          record={record}
          tk={tk}
          pinnedKey={lgRuleKey || undefined}
          label={label}
          btnProps={btnProps}
          onDone={refresh}
        />
      );
      return tooltip ? <Tooltip title={tooltip}>{btn}</Tooltip> : btn;
    }
  }

  (GenerateLinesActionModel as any).define({
    label: te('Sinh dòng theo quy tắc'),
    sort: 59,
  });

  (GenerateLinesActionModel as any).registerFlow({
    key: 'ptdlGenerateLines',
    title: te('Sinh dòng theo quy tắc'),
    sort: 610,
    steps: {
      settings: {
        title: te('Cấu hình bộ sinh'),
        uiSchema: {
          lgRuleKey: {
            type: 'string',
            title: te('Key bộ sinh (trống = tự nhận theo bảng)'),
            'x-decorator': 'FormItem',
            'x-component': 'Input',
          },
        },
        handler(ctx: any, params: any) {
          ctx.model.setProps({ lgRuleKey: params.lgRuleKey });
        },
      },
    },
  });

  return GenerateLinesActionModel;
}
