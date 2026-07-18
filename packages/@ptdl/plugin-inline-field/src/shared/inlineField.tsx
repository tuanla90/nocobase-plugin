import React from 'react';
import { Input, Select, Switch, Button, message, theme } from 'antd';
import {
  SettingRow, IconByKey, setIconRegistry, FieldPickerCascader, insertAtCaret, getCaretElement,
  TAG_COLORS, TAG_HEX,
} from '@ptdl/shared';
import {
  InlineFieldSpec, InlineInterface, StatusState, INTERFACES_WITH_OPTIONS, COMPUTED_RESULT_INTERFACES,
  RELATION_INTERFACES, TO_MANY_INTERFACES, DISPLAY_BY_INTERFACE, slugify,
} from './fieldTypes';

/**
 * Inline Field — the /v/ entry point: a "Thêm cột mới" item in a Table block's ⚙ settings menu that opens
 * a small dialog to DEFINE a new field (scalar OR a computed/formula column), then creates it (server) and
 * drops the column into the very block being edited — no trip to the Collection Manager.
 *
 * Grounded end-to-end in verified framework internals (all read from nb-local 2.1.19 source):
 *  · entry point + custom dialog component = the exact pattern of @ptdl/plugin-conditional-format
 *    (TableBlockModel.registerFlow + flowSettings.registerComponents), which is live-verified.
 *  · attaching the column = the native "Fields" button's own sequence (AddSubModelButton):
 *    createModelAsync → addSubModel(instance) → afterAddAsSubModel → save.
 *  · client metadata refresh = DataSourceManager.reload({keys}) → Collection.getField(name).
 *  · computed columns = a @ptdl/plugin-formula rule created server-side (mirrors app-builder).
 * Icons: Lucide via the shared icon registry (setIconRegistry + IconByKey) — no emoji/glyphs.
 * Lane: /v/ only (classic has no TableBlockModel). CRASH-SAFE: every framework touch is guarded.
 */

// i18n namespace for this plugin's client strings.
export const NS = '@ptdl/plugin-inline-field/client';

// Runtime translator for React render strings — injected from the app i18n in registerInlineField.
// Falls back to the KEY (which IS the Vietnamese source string) so an unset/absent locale renders VN.
let runtimeT: ((s: string, o?: any) => string) | null = null;
function rt(s: string, o?: any): string {
  if (!runtimeT) return s;
  try {
    const out = runtimeT(s, o);
    return out && typeof out === 'string' ? out : s;
  } catch (_) {
    return s;
  }
}

// Lucide glyph by registry key (custom-icons plugin ships the full set); inherits size/color.
// Fixed square box + centered so the SVG never sits off-baseline next to text.
const LIcon: React.FC<{ name: string; size?: number; color?: string }> = ({ name, size = 14, color }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, lineHeight: 0, fontSize: size, color, flex: 'none' }}>
    <IconByKey type={name} />
  </span>
);

// A muted hint line: the icon is vertically centered on the FIRST text line (its box height == the text
// line-height), fixing the "float-up" that a flex-start row + a zero-height icon box otherwise causes.
const HL_LH = 18; // hint line-height (px) for the 12px text
const HintLine: React.FC<{ icon: string; color?: string; iconSize?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({ icon, color, iconSize = 13, style, children }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, lineHeight: `${HL_LH}px`, color, ...style }}>
    <span style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: iconSize, height: HL_LH, fontSize: iconSize, color, lineHeight: 0 }}>
      <IconByKey type={icon} />
    </span>
    <span>{children}</span>
  </div>
);

// APIClient for the field-reference cascader. Passing it through x-component-props strips its methods
// (flow-engine clones the schema), so it's injected module-level from the uiSchema ctx before the dialog
// renders — the exact pattern @ptdl/plugin-conditional-format uses for its field pickers.
let injectedApi: any = null;

// ── the "define a field" dialog body (a controlled Formily x-component) ───────────────────────────
// interface → friendly label (VN source) + which group it sits under, for the type <Select>.
const TYPE_GROUPS: { key: string; label: string; items: InlineInterface[] }[] = [
  { key: 'text', label: 'Văn bản', items: ['input', 'textarea', 'email', 'phone', 'url'] },
  { key: 'number', label: 'Số', items: ['number', 'integer', 'percent'] },
  { key: 'choice', label: 'Lựa chọn', items: ['select', 'multipleSelect', 'checkbox', 'statusFlow'] },
  { key: 'datetime', label: 'Ngày/giờ', items: ['date', 'datetime', 'time'] },
  { key: 'relation', label: 'Quan hệ', items: ['m2o', 'o2m', 'm2m'] },
  { key: 'media', label: 'Media & tệp', items: ['icon', 'color', 'attachmentUrl', 'attachment'] },
  { key: 'other', label: 'Khác', items: ['computed'] },
];
const TYPE_LABEL: Record<InlineInterface, string> = {
  input: 'Văn bản (1 dòng)', textarea: 'Văn bản (nhiều dòng)', email: 'Email', phone: 'Điện thoại', url: 'Liên kết (URL)',
  number: 'Số thập phân', integer: 'Số nguyên', percent: 'Phần trăm',
  select: 'Một lựa chọn', multipleSelect: 'Nhiều lựa chọn', checkbox: 'Có/Không', statusFlow: 'Luồng trạng thái',
  date: 'Ngày', datetime: 'Ngày giờ', time: 'Giờ',
  m2o: 'Liên kết 1 bản ghi', o2m: 'Danh sách bản ghi con', m2m: 'Nhiều–nhiều',
  icon: 'Biểu tượng', color: 'Màu', attachmentUrl: 'Ảnh/Tệp (URL)', attachment: 'Tệp đính kèm (upload)',
  computed: 'Tự tính (công thức)',
};
// Short helper text under the type row for relation choices (each maps to a distinct NocoBase relation).
const RELATION_HINT: Record<string, string> = {
  m2o: 'Mỗi dòng trỏ tới 1 bản ghi của bảng kia (belongsTo).',
  o2m: 'Mỗi dòng có nhiều bản ghi con ở bảng kia (hasMany) — tự tạo liên kết ngược.',
  m2m: 'Nối nhiều–nhiều qua bảng trung gian (belongsToMany).',
};
// interface → Lucide key (dropdown option accent).
const TYPE_ICON: Record<string, string> = {
  input: 'lucide-type', textarea: 'lucide-align-left', email: 'lucide-mail', phone: 'lucide-phone', url: 'lucide-link',
  number: 'lucide-hash', integer: 'lucide-hash', percent: 'lucide-percent',
  select: 'lucide-list', multipleSelect: 'lucide-list-checks', checkbox: 'lucide-square-check', statusFlow: 'lucide-workflow',
  date: 'lucide-calendar', datetime: 'lucide-calendar-clock', time: 'lucide-clock',
  m2o: 'lucide-link2', o2m: 'lucide-list-tree', m2m: 'lucide-network',
  icon: 'lucide-shapes', color: 'lucide-palette', attachmentUrl: 'lucide-image', attachment: 'lucide-paperclip',
  computed: 'lucide-sigma',
};
const RESULT_LABEL: Record<string, string> = { number: 'Số', integer: 'Số nguyên', percent: 'Phần trăm', input: 'Văn bản' };
// Short helper under the type row for the config-less media/tệp types.
const TYPE_HINT: Record<string, string> = {
  icon: 'Chọn biểu tượng (bộ Lucide) khi nhập.',
  attachmentUrl: 'Dán URL ảnh/tệp có sẵn; bảng hiện link bấm được.',
  attachment: 'Tải tệp lên (cần plugin File manager) — lưu vào bảng attachments.',
};

// ── status-flow states editor (simple: which states + which colour; first=init, last=end) ─────────
const STATUS_COLORS = TAG_COLORS.filter((c) => c !== 'default');
const DEFAULT_STATES: StatusState[] = [
  { label: 'Mới', color: 'blue' },
  { label: 'Đang xử lý', color: 'gold' },
  { label: 'Xong', color: 'green' },
];

const StatesEditor: React.FC<{ value?: StatusState[]; onChange: (v: StatusState[]) => void }> = ({ value, onChange }) => {
  const { token } = theme.useToken();
  const states = value && value.length ? value : DEFAULT_STATES;
  const muted = token.colorTextTertiary;
  const set = (i: number, p: Partial<StatusState>) => onChange(states.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const add = () => onChange([...states, { label: '', color: STATUS_COLORS[states.length % STATUS_COLORS.length] }]);
  const remove = (i: number) => onChange(states.length > 2 ? states.filter((_, j) => j !== i) : states);
  const colorOptions = STATUS_COLORS.map((c) => ({
    value: c,
    label: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 12, height: 12, borderRadius: 3, background: TAG_HEX[c] || '#d9d9d9' }} />
        {c}
      </span>
    ),
  }));
  return (
    <div style={{ flex: 1 }}>
      {states.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ width: 56, flex: 'none', fontSize: 11, color: muted }}>
            {i === 0 ? rt('bắt đầu') : i === states.length - 1 ? rt('kết thúc') : `#${i + 1}`}
          </span>
          <Input value={s.label} placeholder={rt('Tên trạng thái')} onChange={(e) => set(i, { label: e.target.value })} style={{ flex: 1 }} />
          <Select value={s.color} onChange={(c) => set(i, { color: c })} options={colorOptions} style={{ width: 132, flex: 'none' }} />
          <span role="button" onClick={() => remove(i)} title={rt('Xoá')} style={{ cursor: states.length > 2 ? 'pointer' : 'not-allowed', flex: 'none', display: 'inline-flex', color: muted, opacity: states.length > 2 ? 1 : 0.4 }}>
            <LIcon name="lucide-x" size={15} />
          </span>
        </div>
      ))}
      <Button size="small" type="dashed" onClick={add} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <LIcon name="lucide-plus" size={13} />{rt('Thêm trạng thái')}
      </Button>
      <HintLine icon="lucide-info" color={muted} style={{ marginTop: 6 }}>
        {rt('Trạng thái ĐẦU = bắt đầu, CUỐI = kết thúc; chuyển tuần tự theo thứ tự.')}
      </HintLine>
    </div>
  );
};

const LW = 96;
const ROW: React.CSSProperties = { gap: 10, marginBottom: 14, alignItems: 'center' };
const HINT: React.CSSProperties = { fontSize: 12 };

const InlineFieldForm: React.FC<{
  value?: InlineFieldSpec;
  onChange?: (v: InlineFieldSpec) => void;
  existingNames?: string[];
  collectionName?: string;
  dataSourceKey?: string;
}> = (props) => {
  const { token } = theme.useToken();
  const taRef = React.useRef<any>(null);
  const spec: InlineFieldSpec = props.value || ({ interface: 'input', title: '' } as InlineFieldSpec);
  const [nameEdited, setNameEdited] = React.useState<boolean>(!!spec.name);
  const [showAdv, setShowAdv] = React.useState<boolean>(false);
  const patch = (p: Partial<InlineFieldSpec>) => props.onChange?.({ ...spec, ...p });

  const iface = (spec.interface || 'input') as InlineInterface;
  const withOptions = INTERFACES_WITH_OPTIONS.includes(iface);
  const isComputed = iface === 'computed';
  const isRelation = RELATION_INTERFACES.includes(iface);
  const isToMany = TO_MANY_INTERFACES.includes(iface);
  const isStatusFlow = iface === 'statusFlow';
  const isAttachment = iface === 'attachment';
  const showRequired = !isComputed && !isToMany && !isAttachment && !isStatusFlow;
  const nameCollision = !!spec.name && (props.existingNames || []).includes(spec.name);

  const [collOpts, setCollOpts] = React.useState<{ value: string; label: string }[]>([]);
  const [preview, setPreview] = React.useState<{ value?: any; error?: string; recordId?: any } | null>(null);
  const [previewing, setPreviewing] = React.useState(false);

  // Load the linkable collections (only when a relation type is active) — user-defined, non-system tables.
  React.useEffect(() => {
    if (!isRelation || !injectedApi || collOpts.length) return;
    let alive = true;
    injectedApi.request({ url: 'collections:list', params: { paginate: false } })
      .then((r: any) => {
        if (!alive) return;
        const list = (r?.data?.data || [])
          .filter((c: any) => c?.name && !c.hidden && c.template !== 'view')
          .map((c: any) => {
            const raw = c.title || c.name;
            const t = String(raw).replace(/\{\{\s*t\(["']([^"']+)["']\)\s*\}\}/, '$1');
            return { value: c.name, label: t !== c.name ? `${t} (${c.name})` : c.name };
          });
        setCollOpts(list);
      })
      .catch(() => { /* leave empty */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRelation]);

  const setTitle = (title: string) => {
    const next: Partial<InlineFieldSpec> = { title };
    if (!nameEdited) next.name = slugify(title); // keep the machine name in lockstep until hand-edited
    patch(next);
  };

  // Insert a `data.<path>` reference at the textarea caret — the SAME helper plugin-formula's computed-rule
  // editor uses (getCaretElement handles the antd Input.TextArea ref shape).
  const pickField = (path: string[]) =>
    insertAtCaret(getCaretElement(taRef.current), 'data.' + path.join('.'), spec.expression || '', (v: string) => patch({ expression: v }));

  // Preview: run the formula against the collection's first record via plugin-formula's own test endpoint.
  const runPreview = async () => {
    const formula = String(spec.expression || '').trim();
    if (!formula) { message.warning(rt('Hãy nhập công thức')); return; }
    if (!injectedApi || !props.collectionName) { setPreview({ error: rt('Không gọi được máy chủ') }); return; }
    setPreviewing(true); setPreview(null);
    try {
      const res = await injectedApi.request({ url: 'ptdlComputed:test', method: 'post', data: { collection: props.collectionName, formula } });
      setPreview(res?.data?.data || res?.data || { error: rt('Không có kết quả') });
    } catch (e: any) {
      const msg = e?.response?.data?.errors?.[0]?.message || e?.message;
      setPreview({ error: /404/.test(String(msg || e)) ? rt('Cần cài plugin Công thức để xem trước') : String(msg || e) });
    }
    setPreviewing(false);
  };

  const typeOptions = TYPE_GROUPS.map((g) => ({
    label: rt(g.label),
    options: g.items.map((it) => ({ label: rt(TYPE_LABEL[it]), value: it })),
  }));

  const optionValues = (spec.options || []).map((o) => (typeof o === 'string' ? o : o.value));
  const muted = token.colorTextTertiary;

  return (
    <div>
      {/* subtle one-line intro (dialog title already reads "Thêm cột mới") */}
      <HintLine icon="lucide-info" color={muted} style={{ marginBottom: 14 }}>
        {rt('Field được tạo trên bảng và thêm cột vào đây ngay.')}
      </HintLine>

      <SettingRow label={rt('Tên cột')} labelWidth={LW} style={ROW}>
        <Input
          autoFocus
          value={spec.title || ''}
          placeholder={rt('VD: Ghi chú, Đơn giá…')}
          onChange={(e) => setTitle(e.target.value)}
          style={{ flex: 1 }}
        />
      </SettingRow>

      <SettingRow label={rt('Loại dữ liệu')} labelWidth={LW} style={ROW}>
        <Select
          value={iface}
          onChange={(v: InlineInterface) => patch({
            interface: v,
            ...(INTERFACES_WITH_OPTIONS.includes(v) ? {} : { options: undefined }),
            ...(v === 'statusFlow' && !(spec.states && spec.states.length) ? { states: DEFAULT_STATES } : {}),
          })}
          options={typeOptions}
          style={{ flex: 1 }}
          showSearch
          optionFilterProp="label"
          optionRender={(opt) => (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <LIcon name={TYPE_ICON[opt.value as string] || 'lucide-square'} size={14} color={muted} />
              {opt.label}
            </span>
          )}
        />
      </SettingRow>

      {TYPE_HINT[iface] && (
        <HintLine icon={TYPE_ICON[iface]} color={muted} style={{ marginLeft: LW + 10, marginTop: -6, marginBottom: 12 }}>
          {rt(TYPE_HINT[iface])}
        </HintLine>
      )}

      {isStatusFlow && (
        <SettingRow label={rt('Trạng thái')} labelWidth={LW} style={{ ...ROW, alignItems: 'flex-start', marginBottom: 6 }}>
          <StatesEditor value={spec.states as StatusState[]} onChange={(v) => patch({ states: v })} />
        </SettingRow>
      )}

      {isRelation && (
        <>
          <SettingRow label={rt('Bảng liên kết')} labelWidth={LW} style={{ ...ROW, marginBottom: 6 }}>
            <Select
              value={spec.target}
              onChange={(v: string) => patch({ target: v })}
              options={collOpts}
              placeholder={rt('Chọn bảng để liên kết')}
              style={{ flex: 1 }}
              showSearch
              optionFilterProp="label"
              notFoundContent={rt('(không có bảng)')}
            />
          </SettingRow>
          <HintLine icon={TYPE_ICON[iface]} color={muted} style={{ marginLeft: LW + 10, marginBottom: 12 }}>
            {rt(RELATION_HINT[iface] || '')}
          </HintLine>
        </>
      )}

      {withOptions && (
        <SettingRow label={rt('Lựa chọn')} labelWidth={LW} style={ROW}>
          <Select
            mode="tags"
            value={optionValues}
            onChange={(vals: string[]) => patch({ options: vals })}
            placeholder={rt('Gõ rồi Enter để thêm lựa chọn')}
            style={{ flex: 1 }}
            open={false}
            suffixIcon={null}
            tokenSeparators={[',']}
          />
        </SettingRow>
      )}

      {/* computed: result type + formula + one-click field references */}
      {isComputed && (
        <>
          <SettingRow label={rt('Kết quả')} labelWidth={LW} style={ROW}>
            <Select
              value={spec.resultInterface || 'number'}
              onChange={(v: InlineInterface) => patch({ resultInterface: v })}
              options={COMPUTED_RESULT_INTERFACES.map((r) => ({ value: r, label: rt(RESULT_LABEL[r]) }))}
              style={{ flex: 1 }}
            />
          </SettingRow>
          <SettingRow label={rt('Công thức')} labelWidth={LW} style={{ ...ROW, alignItems: 'flex-start', marginBottom: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <FieldPickerCascader
                  api={injectedApi}
                  collectionName={props.collectionName}
                  dataSourceKey={props.dataSourceKey}
                  includeToMany
                  maxDepth={4}
                  onPick={pickField}
                  label={
                    <span style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <LIcon name="lucide-plus" size={13} />{rt('Chèn field/quan hệ')}
                    </span>
                  }
                />
                <a
                  onClick={() => { if (!previewing) runPreview(); }}
                  style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 5, ...(previewing ? { opacity: 0.6, pointerEvents: 'none' } : {}) }}
                >
                  <LIcon name="lucide-play" size={13} />{previewing ? rt('Đang thử…') : rt('Xem thử')}
                </a>
              </div>
              <Input.TextArea
                ref={taRef}
                value={spec.expression || ''}
                onChange={(e) => { patch({ expression: e.target.value }); if (preview) setPreview(null); }}
                placeholder="data.so_luong * data.don_gia"
                autoSize={{ minRows: 2, maxRows: 6 }}
                style={{ fontFamily: 'monospace', fontSize: 12.5 }}
              />
              {preview && (
                <HintLine
                  icon={preview.error ? 'lucide-circle-alert' : 'lucide-circle-check'}
                  color={preview.error ? token.colorError : token.colorSuccess}
                  style={{ marginTop: 8 }}
                >
                  {preview.error
                    ? <span>{preview.error}</span>
                    : <span><b>{rt('Kết quả')}: </b>{preview.value === null || preview.value === undefined ? '—' : String(preview.value)}{preview.recordId != null ? ` (#${preview.recordId})` : ''}</span>}
                </HintLine>
              )}
              <HintLine icon="lucide-function-square" color={muted} style={{ marginTop: 6 }}>
                {rt('Tham chiếu cột bằng data.<tên_máy>; bấm "Chèn field" để chọn (cả quan hệ).')}
              </HintLine>
            </div>
          </SettingRow>
        </>
      )}

      {showRequired && (
        <SettingRow label={rt('Bắt buộc')} labelWidth={LW} style={{ ...ROW, marginBottom: 6 }}>
          <Switch size="small" checked={!!spec.required} onChange={(v) => patch({ required: v })} />
          <span style={{ ...HINT, color: muted }}>{rt('Không được để trống khi nhập')}</span>
        </SettingRow>
      )}

      <a
        style={{ fontSize: 12.5, marginLeft: LW + 10, display: 'inline-flex', alignItems: 'center', gap: 4 }}
        onClick={() => setShowAdv((s) => !s)}
      >
        <LIcon name={showAdv ? 'lucide-chevron-down' : 'lucide-chevron-right'} size={13} />
        {showAdv ? rt('Ẩn nâng cao') : rt('Nâng cao')}
      </a>

      {showAdv && (
        <SettingRow label={rt('Mã field')} labelWidth={LW} style={{ ...ROW, marginTop: 12, marginBottom: 4 }}>
          <Input
            value={spec.name || ''}
            placeholder="snake_case"
            status={nameCollision ? 'warning' : undefined}
            onChange={(e) => { setNameEdited(true); patch({ name: e.target.value }); }}
            style={{ flex: 1 }}
          />
          <span style={{ ...HINT, color: muted, whiteSpace: 'nowrap' }}>{rt('tên kỹ thuật, không dấu')}</span>
        </SettingRow>
      )}
      {nameCollision && (
        <HintLine icon="lucide-triangle-alert" color={token.colorWarning} style={{ marginLeft: LW + 10, marginTop: 2 }}>
          {rt('Mã field đã tồn tại — hệ thống sẽ tự thêm hậu tố.')}
        </HintLine>
      )}
    </div>
  );
};

// ── field-creation + column-attach logic ─────────────────────────────────────────────────────────
/** Resolve the /v/ display renderer model for a freshly-created field: framework default first (so
 *  @ptdl field widgets / overrides win), then the interface fallback map. */
function resolveDisplayModel(engine: any, collection: any, name: string, iface: string): string {
  try {
    const Cls = engine?.getModelClass?.('TableColumnModel');
    const field = collection?.getField?.(name);
    const b = Cls?.getDefaultBindingByField?.(engine?.context, field, { fallbackToTargetTitleField: true });
    if (b?.modelName) return b.modelName;
  } catch (_) {
    /* fall through to the map */
  }
  return DISPLAY_BY_INTERFACE[iface] || 'DisplayTextFieldModel';
}

/** Create the field on the server, refresh client metadata, then attach the column to THIS block. */
async function createFieldAndColumn(blockModel: any, spec: InlineFieldSpec, app: any): Promise<void> {
  const collection = blockModel?.collection;
  const collectionName = collection?.name;
  const ds = collection?.dataSourceKey || 'main';
  const engine = app?.flowEngine || blockModel?.flowEngine;
  const api = blockModel?.context?.api || app?.apiClient;

  if (!collectionName || !api) { message.error(rt('Không xác định được bảng của khối này')); return; }
  const title = String(spec?.title || '').trim();
  // This step's handler AUTO-APPLIES on every TableBlock render with defaultParams (title:'' — the user
  // hasn't opened the dialog), so a missing title here just means "nothing to create yet", NOT a user
  // validation failure. Return SILENTLY — a toast here fires "Please enter a column name" on every page
  // load (the reported bug). The dialog's own form guards a real empty submit; the create path needs a title.
  if (!title) return;
  if (!spec?.interface) { message.error(rt('Hãy chọn loại dữ liệu')); return; }
  if (INTERFACES_WITH_OPTIONS.includes(spec.interface) && !(spec.options && spec.options.length)) {
    message.error(rt('Loại "lựa chọn" cần ít nhất 1 giá trị'));
    return;
  }
  if (spec.interface === 'computed' && !String(spec.expression || '').trim()) {
    message.error(rt('Hãy nhập công thức'));
    return;
  }
  if (RELATION_INTERFACES.includes(spec.interface) && !String(spec.target || '').trim()) {
    message.error(rt('Hãy chọn bảng liên kết'));
    return;
  }
  if (spec.interface === 'statusFlow') {
    const labels = (spec.states || []).map((s) => (typeof s === 'string' ? s : s?.label)).filter((l) => String(l || '').trim());
    if (labels.length < 2) { message.error(rt('Luồng trạng thái cần ít nhất 2 trạng thái có tên')); return; }
  }

  const hide = message.loading(rt('Đang tạo cột…'), 0);
  try {
    const res = await api.request({
      url: 'ptdlInlineField:createField',
      method: 'post',
      data: { collection: collectionName, field: { ...spec, title } },
    });
    const body = res?.data?.data || res?.data || {};
    const name = body.name;
    if (!name) throw new Error('server did not return a field name');

    // Refresh client collection metadata so getField(name) resolves + the field is pickable everywhere.
    try { await app?.dataSourceManager?.reload?.({ keys: [ds] }); } catch (_) { /* best-effort */ }
    const coll2 =
      app?.dataSourceManager?.getDataSource?.(ds)?.getCollection?.(collectionName) || collection;
    // Computed → its RESULT type; attachmentUrl → a plain 'url' field; else the interface itself.
    const displayIface = spec.interface === 'computed' ? (spec.resultInterface || 'number')
      : spec.interface === 'attachmentUrl' ? 'url'
      : spec.interface;
    const use = resolveDisplayModel(engine, coll2, name, displayIface);
    const fieldInit = { dataSourceKey: ds, collectionName, fieldPath: name };

    // Attach the column the SAME way the native "Fields" button does (AddSubModelButton):
    // createModelAsync (runs the model's flows) → addSubModel(instance) → afterAddAsSubModel → save.
    const col = await engine.createModelAsync({
      parentId: blockModel.uid,
      subKey: 'columns',
      subType: 'array',
      use: 'TableColumnModel',
      stepParams: {
        fieldSettings: { init: fieldInit },
        tableColumnSettings: { title: { title } },
      },
      subModels: { field: { use, stepParams: { fieldSettings: { init: fieldInit } } } },
    });
    blockModel.addSubModel('columns', col);
    await col.afterAddAsSubModel?.();
    await col.save();
    col.isNew = false;

    // Cosmetic: slot the new data column just before the row-actions column (fixed right anyway).
    try {
      const cols = blockModel.mapSubModels('columns', (c: any) => c) || [];
      const actions = cols.find((c: any) => c && c !== col && /Actions/i.test(c?.constructor?.name || ''));
      if (actions && engine?.moveModel) engine.moveModel(col.uid, actions.uid);
    } catch (_) { /* ordering is cosmetic */ }

    hide();
    if (body.computedSkipped) {
      message.warning(rt('Đã tạo cột nhưng chưa bật công thức: cần cài plugin Công thức'));
    } else {
      message.success(rt('Đã thêm cột "{{title}}"', { title }));
    }
  } catch (e: any) {
    hide();
    // eslint-disable-next-line no-console
    console.warn('[inline-field] create failed', e);
    message.error(rt('Tạo cột thất bại') + ': ' + (e?.message || String(e)));
  }
}

// ── registration ─────────────────────────────────────────────────────────────────────────────────
type Deps = {
  flowEngine: any;
  flowSettings?: any;
  tExpr?: (s: string, o?: any) => any;
  app?: any;
  Icon?: any;
  icons?: Map<string, any>;
};

export function registerInlineField({ flowEngine, flowSettings, tExpr, app, Icon, icons }: Deps) {
  if (!flowEngine || typeof flowEngine.getModelClass !== 'function') return;
  const TableBlockModel: any = flowEngine.getModelClass('TableBlockModel');
  if (!TableBlockModel) return; // classic lane — no table block model

  const i18n = app?.i18n || flowEngine?.context?.app?.i18n;
  if (i18n?.t && !runtimeT) runtimeT = (s: string, o?: any) => i18n.t(s, { ns: NS, ...(o || {}) });
  const t = (s: string) => (tExpr ? tExpr(s, { ns: NS }) : s);

  // Wire this plugin's OWN bundled shared icon registry (Lucide via IconByKey in the dialog).
  try { setIconRegistry(Icon, icons); } catch (_) { /* fallback: IconByKey renders nothing */ }

  if (flowSettings?.registerComponents) {
    try {
      flowSettings.registerComponents({ PtdlInlineFieldForm: InlineFieldForm });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[inline-field] registerComponents failed', e);
    }
  }

  try {
    TableBlockModel.registerFlow({
      key: 'ptdlInlineAddField',
      sort: 520,
      title: t('Thêm cột mới'),
      steps: {
        create: {
          title: t('Thêm cột mới'),
          uiMode: { type: 'dialog', props: { width: 640 } },
          uiSchema: (ctx: any) => {
            // Inject the APIClient module-level (x-component-props strips its methods) so the field
            // cascader can lazy-load fields/relations — same pattern as conditional-format.
            injectedApi =
              ctx?.model?.context?.api ||
              ctx?.model?.flowEngine?.context?.api ||
              (flowEngine as any)?.context?.api ||
              injectedApi;
            const coll = ctx?.model?.collection;
            let existingNames: string[] = [];
            try {
              existingNames = (coll?.getFields?.() || []).map((f: any) => f?.name).filter(Boolean);
            } catch (_) { existingNames = []; }
            return {
              spec: {
                type: 'object',
                'x-decorator': 'FormItem',
                'x-component': 'PtdlInlineFieldForm',
                'x-component-props': {
                  existingNames,
                  collectionName: coll?.name,
                  dataSourceKey: coll?.dataSourceKey || 'main',
                },
              },
            };
          },
          defaultParams: { spec: { interface: 'input', title: '' } },
          async handler(ctx: any, params: any) {
            await createFieldAndColumn(ctx.model, params?.spec || {}, app);
          },
        },
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[inline-field] registerFlow failed', e);
  }
}
