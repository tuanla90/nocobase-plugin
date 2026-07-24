import React, { useEffect, useState } from 'react';
import { GenerateDialog } from './GenerateDialog';
import { fetchRulesFor } from './api';
import { t, te } from './i18n';

// "Sinh dòng" (Generate lines) record action — a CORE-LIKE button (the bind-workflow pattern):
//  - NO custom visibility/render logic: the base ActionModel button renders as-is, so every core
//    feature applies — title/icon/color/type, tooltip, linkage rules (show/hide/disable), ACL, layout.
//    The config guard no longer hides the button; it is the AUTO/default run condition, and the dialog
//    warns + asks for an explicit confirm when a manual run would override it.
//  - The button's OWN setting is exactly one thing: WHICH rule to trigger (remote Select over the
//    collection's enabled configs — auto ones included and labelled "[auto]").
//  - Click (base onClick → dispatchEvent('click') → our click flow) opens the preview→commit dialog.
//
// Implementation notes (fork-safety): record actions in tables render as per-row FORKS. We keep NO
// custom keys in this.props (base renderButton spreads props onto the antd <Button> — they'd leak to
// the DOM) and NO ad-hoc instance fields (ForkFlowModel forwards unknown writes to the master → the
// last-rendered row would win). Instead: the rule key lives in stepParams (shared per button — correct),
// and the dialog opener is a WeakMap keyed by the exact render-time model (the fork), so each row opens
// its own dialog with its own record.

const FLOW_KEY = 'ptdlGenerateLines';
const STEP_KEY = 'settings';

/** render-time model (fork) → open-dialog callback for THAT row. */
const dialogOpeners = new WeakMap<object, (ruleKey: string) => void>();

/** Reads the configured rule key from step params (shared across forks by design). */
function getRuleKey(model: any): string {
  const p = (typeof model?.getStepParams === 'function' ? model.getStepParams(FLOW_KEY, STEP_KEY) : null) ||
    model?.stepParams?.[FLOW_KEY]?.[STEP_KEY] || {};
  return String(p.lgRuleKey || '').trim();
}

/** Mounted next to the button; owns the dialog open-state so the model needs no reactive props. */
const DialogHost: React.FC<{ model: any }> = ({ model }) => {
  const [ruleKey, setRuleKey] = useState<string | null>(null);
  useEffect(() => {
    dialogOpeners.set(model, (k: string) => setRuleKey(k));
    return () => { dialogOpeners.delete(model); };
  }, [model]);
  if (!ruleKey) return null;
  const ctx: any = model.context;
  const collection = ctx?.collection || ctx?.blockModel?.collection;
  const record = ctx?.record;
  const tkField = collection?.filterTargetKey || 'id';
  const tk = record?.[Array.isArray(tkField) ? tkField[0] : tkField];
  const refresh = () => (ctx?.blockModel?.resource?.refresh?.() || ctx?.resource?.refresh?.());
  return (
    <GenerateDialog
      open
      api={ctx?.api}
      ruleKey={ruleKey}
      ruleTitle={typeof model.getTitle === 'function' ? model.getTitle() : undefined}
      filterByTk={tk}
      onClose={() => setRuleKey(null)}
      onDone={refresh}
    />
  );
};

export function defineGenerateLinesActionModel(Base: any) {
  class GenerateLinesActionModel extends Base {
    static scene = 'record';

    defaultProps: any = { title: 'Sinh dòng', type: 'default' };

    // Treated like an Update-class action for ACL-based visibility (a generate writes the record's
    // children + parent bookkeeping) — roles without update on the collection don't get the button.
    getAclActionName() {
      return 'update';
    }

    render() {
      // Base render = the standard core button (props untouched). We only append the dialog host.
      return (
        <>
          {super.render()}
          <DialogHost model={this} />
        </>
      );
    }
  }

  (GenerateLinesActionModel as any).define({
    label: te('Sinh dòng theo quy tắc'),
    sort: 59,
  });

  // Settings: ONLY "which rule". Remote Select — options are the block collection's enabled configs
  // (auto ones labelled). uiSchema-as-function lets us fetch per-collection options with the model ctx.
  (GenerateLinesActionModel as any).registerFlow({
    key: FLOW_KEY,
    title: te('Sinh dòng theo quy tắc'),
    sort: 610,
    steps: {
      [STEP_KEY]: {
        title: te('Bộ sinh cần chạy'),
        uiSchema: async (ctx: any) => {
          const mctx = ctx?.model?.context || {};
          const collection = mctx.collection || mctx.blockModel?.collection;
          const api = mctx.api || ctx?.api;
          let options: Array<{ value: string; label: string }> = [];
          try {
            const rules = await fetchRulesFor(api, collection?.name);
            options = rules.map((r) => ({
              value: r.key,
              label: `${r.trigger === 'auto' ? '[auto] ' : ''}${r.title || r.key}`,
            }));
          } catch {
            /* fall through to the bare input below */
          }
          if (!options.length) {
            // No configs found (or fetch failed) → let the builder type the key by hand.
            return {
              lgRuleKey: {
                type: 'string',
                title: te('Key bộ sinh'),
                'x-decorator': 'FormItem',
                'x-component': 'Input',
              },
            };
          }
          return {
            lgRuleKey: {
              type: 'string',
              title: te('Bộ sinh'),
              'x-decorator': 'FormItem',
              'x-component': 'Select',
              'x-component-props': {
                allowClear: true,
                showSearch: true,
                optionFilterProp: 'label',
                placeholder: t('Chọn bộ sinh của bảng này'),
              },
              enum: options,
            },
          };
        },
        // Params persist in stepParams (read at click time) — nothing to apply to the model.
        handler() { /* noop */ },
      },
    },
  });

  // Click = open the preview→commit dialog for the configured rule, on THIS row's record.
  (GenerateLinesActionModel as any).registerFlow({
    key: 'ptdlGenerateLinesClick',
    on: 'click',
    steps: {
      open: {
        handler(ctx: any) {
          const m = ctx.model;
          const key = getRuleKey(m);
          const msg = ctx.message || m?.context?.message;
          if (!key) {
            msg?.warning?.(t('Nút chưa chọn bộ sinh — mở cấu hình nút → "Bộ sinh cần chạy"'));
            return;
          }
          const opener = dialogOpeners.get(m);
          if (opener) opener(key);
          else msg?.warning?.(t('Không mở được hộp thoại — tải lại trang rồi thử lại'));
        },
      },
    },
  });

  return GenerateLinesActionModel;
}
