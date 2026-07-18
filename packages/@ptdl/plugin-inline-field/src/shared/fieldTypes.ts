/**
 * Inline Field — pure field-type helpers shared by the server action and the client dialog.
 *
 * antd/React/@nocobase-free on purpose so it runs in BOTH the server plugin (node) and the client-v2
 * bundle. The mappings are grounded VERBATIM in @ptdl/plugin-app-builder's `fieldDef` + `relationDef`
 * (packages/@ptdl/plugin-app-builder/src/server/plugin.ts). Supported: scalars, a computed/formula column
 * (via @ptdl/plugin-formula) and to-one/to-many relations (m2o/o2m/m2m). o2o and statusFlow are out of scope.
 */

// The field interfaces the inline creator offers. Scalars have a verified `fieldDef` shape + a default /v/
// renderer; relations go through `relationDef`; computed is a scalar result type + a formula rule.
export type InlineInterface =
  | 'input'
  | 'textarea'
  | 'email'
  | 'phone'
  | 'url'
  | 'number'
  | 'integer'
  | 'percent'
  | 'select'
  | 'multipleSelect'
  | 'date'
  | 'datetime'
  | 'time'
  | 'checkbox'
  | 'color'
  | 'computed'
  | 'm2o'
  | 'o2m'
  | 'm2m'
  | 'icon'
  | 'statusFlow'
  | 'attachmentUrl'
  | 'attachment';

export const INLINE_INTERFACES: InlineInterface[] = [
  'input', 'textarea', 'email', 'phone', 'url',
  'number', 'integer', 'percent',
  'select', 'multipleSelect', 'checkbox', 'statusFlow',
  'date', 'datetime', 'time',
  'm2o', 'o2m', 'm2m',
  'icon', 'color', 'attachmentUrl', 'attachment', 'computed',
];

/** To-one / to-many relation interfaces (built via `relationDef`, not `buildFieldDef`). */
export const RELATION_INTERFACES: InlineInterface[] = ['m2o', 'o2m', 'm2m'];
/** To-many relation interfaces (no `required`, rendered as a sub-table/count column). */
export const TO_MANY_INTERFACES: InlineInterface[] = ['o2m', 'm2m'];

/** Foreign-key column name for a relation field (mirrors app-builder's fkOf). */
export const fkOf = (name: string) => `${name}_id`;

/** Result types a computed column may evaluate to (drives the underlying field's type + renderer). */
export const COMPUTED_RESULT_INTERFACES: InlineInterface[] = ['number', 'integer', 'percent', 'input'];

/** Interfaces that carry an enumerated option list (value/label). */
export const INTERFACES_WITH_OPTIONS: InlineInterface[] = ['select', 'multipleSelect'];

export interface FieldOption {
  value: string;
  label?: string;
}

export interface InlineFieldSpec {
  /** machine name — auto-slugged from `title` when omitted; server also uniquifies it. */
  name?: string;
  /** human label (source language = Vietnamese). */
  title: string;
  interface: InlineInterface;
  /** select / multipleSelect only. String shorthand → {value:s,label:s}. */
  options?: Array<string | FieldOption>;
  required?: boolean;
  unique?: boolean;
  defaultValue?: any;
  /** interface==='computed' only: the Excel-style formula (e.g. `data.qty * data.price`) — materialized
   *  as a @ptdl/plugin-formula rule server-side. */
  expression?: string;
  /** interface==='computed' only: the value type the formula evaluates to (default 'number'). */
  resultInterface?: InlineInterface;
  /** relation (m2o/o2m/m2m) only: the linked collection name. */
  target?: string;
  /** relation only: the reverse field name on the target (auto-derived when omitted). */
  reverseName?: string;
  /** statusFlow only: the ordered states. String shorthand → {label}. First = init, last = end (success);
   *  a linear flow (each → next) is auto-derived. `color` is a Tag colour name (blue/gold/green/red…). */
  states?: Array<string | StatusState>;
}

export interface StatusState {
  label: string;
  color?: string;
}

/** Vietnamese-aware slug → snake_case machine name. 'Ngày sinh'→'ngay_sinh', 'Đơn giá'→'don_gia'. */
export function slugify(s: string): string {
  const out = String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  // NocoBase field names must match /^[a-zA-Z][a-zA-Z0-9_]*$/ — prefix if it would start with a digit.
  const safe = /^[0-9]/.test(out) ? `f_${out}` : out;
  return safe || 'field';
}

/** Normalize an option list to the {value,label} shape (accepts string shorthand). */
export function normalizeOptions(options?: Array<string | FieldOption>): FieldOption[] {
  return (options || [])
    .map((o) => (typeof o === 'string' ? { value: o, label: o } : { value: o.value, label: o.label ?? o.value }))
    .filter((o) => o.value !== undefined && o.value !== '');
}

/**
 * Map an InlineFieldSpec → a NocoBase field-metadata record `{ name, type, interface, uiSchema, ... }`.
 * A straight scalar subset of app-builder's fieldDef (same shapes, verified live there).
 */
export function buildFieldDef(f: InlineFieldSpec): any {
  const uiSchema: any = { title: f.title || f.name };
  if (f.required) uiSchema.required = true;
  const base: any = { name: f.name, interface: f.interface, uiSchema };
  if (f.unique) base.unique = true;
  if (f.defaultValue !== undefined && f.defaultValue !== null && f.defaultValue !== '') base.defaultValue = f.defaultValue;
  const withUi = (extra: any) => {
    Object.assign(uiSchema, extra.uiSchema || {});
    delete extra.uiSchema;
    return { ...base, ...extra };
  };
  switch (f.interface) {
    case 'input': case 'email': case 'phone': case 'url':
      return withUi({ type: 'string', uiSchema: { 'x-component': 'Input' } });
    case 'textarea':
      return withUi({ type: 'text', uiSchema: { 'x-component': 'Input.TextArea' } });
    case 'number':
      return withUi({ type: 'double', uiSchema: { 'x-component': 'InputNumber' } });
    case 'integer':
      return withUi({ type: 'integer', uiSchema: { 'x-component': 'InputNumber' } });
    case 'percent':
      return withUi({ type: 'float', interface: 'percent', uiSchema: { 'x-component': 'InputNumber', 'x-component-props': { addonAfter: '%' } } });
    case 'select':
      return withUi({ type: 'string', interface: 'select', uiSchema: { 'x-component': 'Select', enum: normalizeOptions(f.options) } });
    case 'multipleSelect':
      return withUi({ type: 'array', interface: 'multipleSelect', uiSchema: { 'x-component': 'Select', 'x-component-props': { mode: 'multiple' }, enum: normalizeOptions(f.options) } });
    case 'checkbox':
      return withUi({ type: 'boolean', interface: 'checkbox', uiSchema: { 'x-component': 'Checkbox' } });
    case 'date':
      return withUi({ type: 'date', uiSchema: { 'x-component': 'DatePicker' } });
    case 'datetime':
      return withUi({ type: 'date', interface: 'datetime', uiSchema: { 'x-component': 'DatePicker', 'x-component-props': { showTime: true } } });
    case 'time':
      return withUi({ type: 'time', uiSchema: { 'x-component': 'TimePicker' } });
    case 'color':
      return withUi({ type: 'string', interface: 'color', uiSchema: { 'x-component': 'ColorPicker' } });
    case 'icon':
      return withUi({ type: 'string', interface: 'icon', uiSchema: { 'x-component': 'IconPicker' } });
    case 'attachmentUrl':
      // "Ảnh/Tệp qua URL" — a plain URL string, rendered as a clickable link (Input.URL previews in read).
      return withUi({ type: 'string', interface: 'url', uiSchema: { 'x-component': 'Input.URL' } });
    case 'statusFlow': {
      // Simple status flow: an ordered list of {label,color}. First = init, last = end (success), middle =
      // processing; a LINEAR flow (each → next) is auto-derived. Stored as a select + a `statusFlow` config
      // read by @ptdl/plugin-status-flow (Tag colours + transition enforcement). Grounded in app-builder's
      // fieldDef statusFlow (plain-states branch), extended to carry the per-state colour the user picks.
      const raw = (f.states && f.states.length ? f.states : ['Mới', 'Đang xử lý', 'Xong']);
      const rows: StatusState[] = raw.map((s) => (typeof s === 'string' ? { label: s } : (s || { label: '' })));
      const labels = rows.map((r) => String(r.label || '').trim()).filter(Boolean);
      const keys = labels.map((l) => slugify(l));
      const palette = ['blue', 'gold', 'cyan', 'purple', 'geekblue', 'orange'];
      const enumOpts = rows
        .filter((r) => String(r.label || '').trim())
        .map((r, i) => ({ value: keys[i], label: r.label, color: r.color || (i === labels.length - 1 ? 'green' : i === 0 ? 'blue' : palette[i % palette.length]) }));
      const kinds: Record<string, string> = {};
      const transitions: Record<string, { to: string[] }> = {};
      keys.forEach((k, i) => {
        kinds[k] = i === 0 ? 'init' : i === keys.length - 1 ? 'success' : 'processing';
        if (i < keys.length - 1) transitions[k] = { to: [keys[i + 1]] };
      });
      return withUi({
        type: 'string', interface: 'statusFlow', defaultValue: keys[0],
        uiSchema: { 'x-component': 'Select', enum: enumOpts },
        statusFlow: { initial: keys[0], kinds, transitions, openFrom: {} },
      });
    }
    case 'computed': {
      // A computed column is a REAL field of its result type (default number), maintained by a
      // @ptdl/plugin-formula rule (created server-side) — so mark it read-only (x-read-pretty). Grounded
      // in app-builder's fieldDef, where a computed field is a number column + a ptdlComputedRules rule.
      const rtI = f.resultInterface && f.resultInterface !== 'computed' ? f.resultInterface : 'number';
      const def = buildFieldDef({ ...f, interface: rtI });
      def.uiSchema = { ...(def.uiSchema || {}), 'x-read-pretty': true };
      return def;
    }
    default:
      return withUi({ type: 'string', uiSchema: { 'x-component': 'Input' } });
  }
}

/**
 * Map an InlineFieldSpec relation (m2o/o2m/m2m) → a NocoBase relation field record. Grounded VERBATIM in
 * app-builder's `relationDef`: belongsTo (m2o) / hasMany (o2m) / belongsToMany (m2m), foreign keys via
 * `fkOf`. The o2m's reverse belongsTo on the child is created separately (server-side).
 */
export function relationDef(sourceColl: string, spec: InlineFieldSpec): any {
  const uiSchema: any = { title: spec.title || spec.name, 'x-component': 'AssociationField' };
  const base: any = { collectionName: sourceColl, name: spec.name, target: spec.target, uiSchema };
  switch (spec.interface) {
    case 'm2o':
      return { ...base, type: 'belongsTo', interface: 'm2o', foreignKey: fkOf(spec.name as string), targetKey: 'id', uiSchema: { ...uiSchema, 'x-component-props': { multiple: false } } };
    case 'o2m':
      return { ...base, type: 'hasMany', interface: 'o2m', foreignKey: fkOf(spec.reverseName || sourceColl), sourceKey: 'id', targetKey: 'id', uiSchema: { ...uiSchema, 'x-component-props': { multiple: true } } };
    case 'm2m':
      return { ...base, type: 'belongsToMany', interface: 'm2m', through: `t_${sourceColl}_${spec.target}`, foreignKey: fkOf(sourceColl), otherKey: fkOf(spec.target as string), sourceKey: 'id', targetKey: 'id', uiSchema: { ...uiSchema, 'x-component-props': { multiple: true } } };
    default:
      return { ...base, type: 'belongsTo', interface: 'm2o', foreignKey: fkOf(spec.name as string), targetKey: 'id' };
  }
}

/**
 * NocoBase `attachment` field (upload files to the file-manager `attachments` collection). Canonical
 * belongsToMany shape — the `uiSchema['x-use-component-props']: 'useAttachmentFieldProps'` binding is what
 * wires the storage rules (verified from file-manager's own migration 20240613110121). The junction is
 * created by the collection-manager hooks; keys mirror app-builder's m2m (`fkOf`).
 */
export function attachmentDef(sourceColl: string, spec: InlineFieldSpec): any {
  const name = spec.name as string;
  return {
    collectionName: sourceColl, name,
    type: 'belongsToMany', interface: 'attachment', target: 'attachments',
    through: `t_${sourceColl}_${name}`, foreignKey: fkOf(sourceColl), otherKey: fkOf(name),
    sourceKey: 'id', targetKey: 'id',
    uiSchema: {
      type: 'array', title: spec.title || name,
      'x-component': 'Upload.Attachment',
      'x-component-props': { action: 'attachments:create', multiple: true },
      'x-use-component-props': 'useAttachmentFieldProps',
    },
  };
}

/**
 * interface → default display renderer model class (the /v/ table column's field sub-model). FALLBACK
 * only: the client resolves via the framework's own `getDefaultBindingByField` first (so @ptdl field
 * widgets / overrides win), and drops to this map when that can't answer. Taken from app-builder's
 * quickView DISPLAY_BY_INTERFACE (verified live).
 */
export const DISPLAY_BY_INTERFACE: Record<string, string> = {
  input: 'DisplayTextFieldModel', email: 'DisplayTextFieldModel', phone: 'DisplayTextFieldModel',
  url: 'DisplayTextFieldModel', textarea: 'DisplayTextFieldModel', attachmentUrl: 'DisplayTextFieldModel',
  number: 'DisplayNumberFieldModel', integer: 'DisplayNumberFieldModel', percent: 'DisplayPercentFieldModel',
  select: 'DisplayEnumFieldModel', multipleSelect: 'DisplayEnumFieldModel', statusFlow: 'DisplayEnumFieldModel',
  checkbox: 'DisplayCheckboxFieldModel',
  date: 'DisplayDateTimeFieldModel', datetime: 'DisplayDateTimeFieldModel', time: 'DisplayTimeFieldModel',
  color: 'DisplayColorFieldModel', icon: 'DisplayIconFieldModel', computed: 'DisplayNumberFieldModel',
  // relations + attachment: to-one shows the related title; to-many/attachment fall back to text (the
  // framework resolver picks the sub-table / attachment renderer first). Mirrors quickView's map.
  m2o: 'DisplayTextFieldModel', o2m: 'DisplayTextFieldModel', m2m: 'DisplayTextFieldModel',
  attachment: 'DisplayTextFieldModel',
};
