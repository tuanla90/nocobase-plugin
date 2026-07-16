import React from 'react';
import { Checkbox, Tooltip } from 'antd';
import { FieldModelRenderer } from '@nocobase/flow-engine';

/**
 * Minimal "Bulk edit" field UX — ONE input per field. The core plugin renders a full-width mode
 * select ("Remains the same" / "Changed to" / "Clear") and only shows the value editor after the
 * user picks "Changed to". These patches replace that with:
 *  - the value editor, always visible; empty (placeholder "Remains the same") = keep, typing a
 *    value = change to it, clearing it = back to keep;
 *  - a small "Clear" checkbox = set the field to empty (null) on the selected rows;
 *  - a "↺" reset link (visible only when the field would change) = back to "remains the same" —
 *    needed for editors that can't be emptied by typing (checkbox, radio, select of booleans).
 * Untouched fields keep submitting `undefined` (= remains), so submit semantics are unchanged.
 *
 * Two render paths exist in @nocobase/plugin-action-bulk-edit and both are patched:
 *  1. BulkEditFormItemModel.renderItem() — the bulk edit form items. We wrap the original
 *     output: keep its <FormItem> (name/disabled/fork logic intact) and swap the inner
 *     mode-select control for ours. The control is the FormItem's direct child, so it receives
 *     the injected `value`/`onChange` form binding.
 *  2. BulkEditFieldModel.render() — the standalone bulk-edit field wrapper (field submodel).
 */

function tBulk(key: string): string {
  const i18n = (globalThis as any)?.window?.__nocobase_i18n__;
  return i18n?.t?.(key, { ns: 'action-bulk-edit' }) ?? key;
}

function isEmptyValue(v: any): boolean {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

function extractEventValue(e: any): any {
  return e?.target?.value ?? e?.target?.checked ?? e;
}

/**
 * The single-input control. `writeValue(v)` must push `v` into the form field
 * (undefined = remains, null = clear, anything else = changed to).
 */
function useSmartBulkEdit(writeValue: (v: any) => void) {
  const [val, setVal] = React.useState<any>(null);
  const [clear, setClear] = React.useState(false);
  const changed = clear || !isEmptyValue(val);

  const handleValueChange = (e: any) => {
    const v = extractEventValue(e);
    setVal(v);
    writeValue(isEmptyValue(v) ? undefined : v);
  };

  const handleClearChange = (checked: boolean) => {
    setClear(checked);
    if (checked) writeValue(null);
    else writeValue(isEmptyValue(val) ? undefined : val);
  };

  const reset = () => {
    setVal(null);
    setClear(false);
    writeValue(undefined);
  };

  return { val, clear, changed, handleValueChange, handleClearChange, reset };
}

function SmartLayout({
  editor,
  clear,
  changed,
  onClearChange,
  onReset,
  aclDisabled,
}: {
  editor: React.ReactNode;
  clear: boolean;
  changed: boolean;
  onClearChange: (checked: boolean) => void;
  onReset: () => void;
  aclDisabled?: boolean;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, width: '100%', alignItems: 'center' }}>
      <div style={{ flex: 1, minWidth: 0, opacity: clear ? 0.45 : 1 }}>{editor}</div>
      <Checkbox
        checked={clear}
        disabled={aclDisabled}
        onChange={(e: any) => onClearChange(e.target.checked)}
        style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
      >
        {tBulk('Clear')}
      </Checkbox>
      <Tooltip title={tBulk('Remains the same')}>
        <a
          onClick={changed && !aclDisabled ? onReset : undefined}
          style={{
            flexShrink: 0,
            width: 18,
            textAlign: 'center',
            fontSize: 16,
            lineHeight: 1,
            visibility: changed ? 'visible' : 'hidden',
          }}
        >
          ↺
        </a>
      </Tooltip>
    </div>
  );
}

/**
 * Path 1 control — replaces the core mode-select component INSIDE the original <FormItem>.
 * Receives {formItemModel, field} (from the core element) plus the value/onChange binding the
 * FormItem injects into its direct child.
 */
function SmartBulkEditControl(props: any) {
  const { formItemModel, field, onChange, value, aclDisabled, ...rest } = props;
  const form = formItemModel?.context?.blockModel?.form;

  const writeValue = (v: any) => {
    // undefined must be an explicit form write (the binding onChange would coerce it);
    // real values go through the FormItem binding so validation/rerender stay standard.
    if (v === undefined) form?.setFieldValue?.(formItemModel?.props?.name, undefined);
    else onChange?.(v);
  };
  const s = useSmartBulkEdit(writeValue);

  const editor = React.isValidElement(field)
    ? React.cloneElement(field as any, {
        ...rest,
        value,
        placeholder: tBulk('Remains the same'),
        onChange: s.handleValueChange,
        disabled: s.clear || (rest as any).disabled,
      })
    : field;

  return (
    <SmartLayout
      editor={editor}
      clear={s.clear}
      changed={s.changed}
      onClearChange={s.handleClearChange}
      onReset={s.reset}
      aclDisabled={aclDisabled}
    />
  );
}

/** Path 2 — full replacement body for BulkEditFieldModel.render(). */
function SmartBulkEditField(props: any) {
  const { fieldModel, formItemModel, bulkEditFieldModel, onChange, aclDisabled, ...rest } = props;
  const form = formItemModel?.context?.blockModel?.form;

  React.useEffect(() => {
    // Same bootstrap as the core component: sync step params down to the field submodel.
    fieldModel?.setStepParams?.(bulkEditFieldModel?.getStepParams?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const writeValue = (v: any) => {
    form?.setFieldValue?.(formItemModel?.props?.name, v);
    if (v !== undefined && v !== null) onChange?.(v);
  };
  const s = useSmartBulkEdit(writeValue);

  const editor = (
    <FieldModelRenderer
      model={fieldModel}
      {...rest}
      placeholder={tBulk('Remains the same')}
      disabled={s.clear || rest.disabled}
      onChange={s.handleValueChange}
    />
  );

  return (
    <SmartLayout
      editor={editor}
      clear={s.clear}
      changed={s.changed}
      onClearChange={s.handleClearChange}
      onReset={s.reset}
      aclDisabled={aclDisabled}
    />
  );
}

function patchFormItemModel(cls: any) {
  if (!cls || cls.__ptdlSmartBulkEdit) return;
  cls.__ptdlSmartBulkEdit = true;
  const origRenderItem = cls.prototype.renderItem;
  if (typeof origRenderItem !== 'function') return;
  cls.prototype.renderItem = function renderItem(...args: any[]) {
    const el = origRenderItem.apply(this, args);
    // Expected shape: <FormItem ...><ModeSelectControl formItemModel field/></FormItem> —
    // swap only the inner control; anything else passes through untouched.
    const inner: any = (el as any)?.props?.children;
    if (!React.isValidElement(el) || !React.isValidElement(inner)) return el;
    const ip: any = (inner as any).props;
    if (!ip?.formItemModel || !ip?.field) return el;
    return React.cloneElement(el as any, {}, React.createElement(SmartBulkEditControl, ip));
  };
}

function patchFieldModel(cls: any) {
  if (!cls || cls.__ptdlSmartBulkEdit) return;
  cls.__ptdlSmartBulkEdit = true;
  cls.prototype.render = function render() {
    const field = this.subModels?.field;
    return React.createElement(SmartBulkEditField, {
      formItemModel: this.parent,
      bulkEditFieldModel: this,
      fieldModel: field,
      ...this.props,
    });
  };
}

/**
 * Patch the bulk-edit models on whatever engine hosts them. The core plugin registers the
 * classes eagerly on the classic lane and via lazy loaders on /v/, and may load after us — so
 * retry for a while before giving up.
 */
export function patchBulkEditSmartField({ flowEngine }: { flowEngine: any }) {
  if (!flowEngine) return;
  const targets: Array<[string, (cls: any) => void]> = [
    ['BulkEditFormItemModel', patchFormItemModel],
    ['BulkEditFieldModel', patchFieldModel],
  ];
  for (const [name, apply] of targets) {
    const attempt = (retries: number) => {
      try {
        const sync = flowEngine.getModelClass?.(name);
        if (sync) return apply(sync);
        const p = flowEngine.getModelClassAsync?.(name);
        if (p?.then) {
          p.then((cls: any) => {
            if (cls) apply(cls);
            else if (retries > 0) setTimeout(() => attempt(retries - 1), 1000);
          }).catch(() => {
            if (retries > 0) setTimeout(() => attempt(retries - 1), 1000);
          });
          return;
        }
      } catch {
        // fall through to retry
      }
      if (retries > 0) setTimeout(() => attempt(retries - 1), 1000);
    };
    attempt(10);
  }
}
