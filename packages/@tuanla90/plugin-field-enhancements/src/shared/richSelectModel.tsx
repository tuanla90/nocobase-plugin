import React, { useRef } from 'react';
import { EditableItemModel } from '@nocobase/flow-engine';
import { Select, Input, Button, Avatar, Switch, Space, Divider, Slider, theme } from 'antd';
import { observer, useForm } from '@formily/react';
import DOMPurify from 'dompurify';
import { bindDisplayField } from './displayBinding';
import { SegmentedGroup, ColumnSelect, FieldPickerCascader, getCaretElement, insertAtCaret, toDisplayString, SettingsGrid, ResetButton, CollapsibleSection, SEG_PROPS, fieldItem as fi, rx, registerFlowComponentsOnce, IconByKey, ColorField, colorToString } from '@tuanla90/shared';
import { globalToggleField, saveWidgetGlobal } from './globalWidgetToggle';

/**
 * No-code widget: field QUAN HỆ (m2o/o2o/oho/obo/o2m/m2m) → dropdown "rich".
 * Subclass RecordSelectFieldModel (thừa kế resource/fetch/search/pagination/hydrate + toàn bộ settings flow),
 * chỉ override render() để tự vẽ Select với option/tag tùy biến. 2 chế độ:
 *  - preset : Avatar + Title + Subtitle (map field bảng đích).
 *  - html   : template HTML với {{field}} (chuẩn) — hoặc {field} cũ — lấy từ record, sanitize bằng DOMPurify.
 * Áp cho cả option dropdown lẫn giá trị đã chọn (single + multiple).
 */

// ---- helpers copy từ core recordSelectShared (không export) ------------------------------------
type FN = { label: string; value: string };
function normFilterTargetKey(k: any): string | undefined {
  if (typeof k === 'string' && k) return k;
  if (Array.isArray(k) && k.length === 1 && typeof k[0] === 'string') return k[0];
  return undefined;
}
function normalizeFieldNames(fieldNames: any, target?: any): FN {
  const titleName = typeof target?.titleCollectionField?.name === 'string' ? target.titleCollectionField.name : undefined;
  const fallbackValue = normFilterTargetKey(target?.filterTargetKey) || 'id';
  const ev = typeof fieldNames?.value === 'string' && fieldNames.value && fieldNames.value !== 'value' ? fieldNames.value : undefined;
  const el = typeof fieldNames?.label === 'string' && fieldNames.label && fieldNames.label !== 'label' ? fieldNames.label : undefined;
  const value = ev || fallbackValue;
  return { value, label: el || titleName || value };
}
function resolveOptions(options: any[] | undefined, value: any, isMultiple: boolean): any[] {
  if (options?.length) return options.map((v) => { const { disabled, options: _o, style, ...rest } = v || {}; return rest; });
  if (isMultiple) return Array.isArray(value) ? value.filter((i) => i && typeof i === 'object') : [];
  if (value && typeof value === 'object') return [value];
  return [];
}

// ---- rich render config -------------------------------------------------------------------------
type IconStyle = 'plain' | 'filled' | 'soft' | 'outlined' | 'square';
type RSCfg = {
  mode: string; titleField: string; subField: string; avatarField: string;
  rightField: string; avatarDefault: boolean; html: string;
  avatarMode: 'image' | 'icon'; avatarSize: number;
  iconStyle: IconStyle; iconColor: string; iconColorField: string;
};
const ICON_STYLES: IconStyle[] = ['plain', 'filled', 'soft', 'outlined', 'square'];
function rscfgFromProps(p: any): RSCfg {
  return {
    mode: p.ptdlrsMode || 'preset',
    titleField: p.ptdlrsTitle || '', subField: p.ptdlrsSub || '', avatarField: p.ptdlrsAvatar || '',
    rightField: p.ptdlrsRight || '', avatarDefault: p.ptdlrsAvatarDefault !== false,
    html: p.ptdlrsHtml || '',
    avatarMode: p.ptdlrsAvatarMode === 'icon' ? 'icon' : 'image',
    avatarSize: typeof p.ptdlrsAvatarSize === 'number' && p.ptdlrsAvatarSize > 0 ? p.ptdlrsAvatarSize : 0,
    iconStyle: ICON_STYLES.includes(p.ptdlrsIconStyle) ? p.ptdlrsIconStyle : 'plain',
    iconColor: colorToString(p.ptdlrsIconColor) || '', iconColorField: p.ptdlrsIconColorField || '',
  };
}
function rscfgFromForm(v: any): RSCfg {
  return {
    mode: v?.mode || 'preset',
    titleField: v?.titleField || '', subField: v?.subField || '', avatarField: v?.avatarField || '',
    rightField: v?.rightField || '', avatarDefault: v?.avatarDefault !== false,
    html: v?.html || '',
    avatarMode: v?.avatarMode === 'icon' ? 'icon' : 'image',
    avatarSize: typeof v?.avatarSize === 'number' && v.avatarSize > 0 ? v.avatarSize : 0,
    iconStyle: ICON_STYLES.includes(v?.iconStyle) ? v.iconStyle : 'plain',
    iconColor: colorToString(v?.iconColor) || '', iconColorField: v?.iconColorField || '',
  };
}

// hex/#rgb → rgba(...,alpha); non-hex colours fall back to the colour itself (no tint).
function withAlpha(color: string, alpha: number): string {
  const s = String(color || '').trim();
  let m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) { const n = parseInt(m[1], 16); return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`; }
  m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) { const h = m[1]; return `rgba(${parseInt(h[0] + h[0], 16)}, ${parseInt(h[1] + h[1], 16)}, ${parseInt(h[2] + h[2], 16)}, ${alpha})`; }
  return s || 'transparent';
}
// Resolved icon colour for a record: dynamic column value wins, else the fixed colour, else fallback.
function iconColorFor(record: any, cfg: RSCfg): string {
  if (cfg.iconColorField) {
    const c = getFieldStr(record, cfg.iconColorField);
    if (c) return c;
  }
  return cfg.iconColor || '';
}
// Render the icon glyph in the chosen style (plain / filled circle / soft / outlined / square).
function renderIconAvatar(iconKey: string, color: string, style: IconStyle, sz: number): React.ReactNode {
  const c = color || 'var(--colorPrimary, #1677ff)';
  if (style === 'plain') {
    return <span style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 0, fontSize: sz, color: color || 'currentColor', flex: '0 0 auto' }}><IconByKey type={iconKey} /></span>;
  }
  const round = style !== 'square';
  let bg = 'transparent', iconCol = c, border: string | undefined;
  if (style === 'filled') { bg = c; iconCol = '#fff'; }
  else if (style === 'square') { bg = c; iconCol = '#fff'; }
  else if (style === 'soft') { bg = withAlpha(c, 0.16); iconCol = c; }
  else if (style === 'outlined') { bg = 'transparent'; iconCol = c; border = `1.5px solid ${c}`; }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto',
      width: sz, height: sz, borderRadius: round ? '50%' : Math.max(4, Math.round(sz * 0.28)),
      background: bg, color: iconCol, border, fontSize: Math.round(sz * 0.6), lineHeight: 0,
    }}><IconByKey type={iconKey} /></span>
  );
}

function getFieldStr(record: any, name?: string): string {
  if (!name || !record) return '';
  // object/scalar → string (unwraps label/name/title/id) via shared toDisplayString — byte-equivalent.
  return toDisplayString(record[name]);
}
// avatar: string url | {url} | [{url}] | attachment-like.
function getAvatarUrl(record: any, name?: string): string {
  if (!name || !record) return '';
  let v = record[name];
  if (Array.isArray(v)) v = v[0];
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return String(v.url || v.src || v.preview || '');
  return '';
}
function interpolateHtml(tpl: string, record: any): string {
  // Standard token is {{field}}; the optional inner/outer brace keeps legacy {field} working too.
  return String(tpl).replace(/\{\{?([\w.]+)\}\}?/g, (_m, key) => {
    const v = String(key).split('.').reduce((o: any, k: string) => (o == null ? o : o[k]), record);
    return v == null ? '' : String(typeof v === 'object' ? (v.label ?? v.name ?? v.id ?? '') : v);
  });
}

// Self-contained "+" glyph — @tuanla90/shared deliberately avoids @ant-design/icons so consumer plugin
// builds don't have to externalize it; keep the same rule here.
const PlusGlyph = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false" style={{ verticalAlign: '-0.125em', display: 'inline-block' }}>
    <rect x="11" y="5" width="2" height="14" fill="currentColor" />
    <rect x="5" y="11" width="14" height="2" fill="currentColor" />
  </svg>
);

// Row hiển thị 1 record — dùng chung option dropdown + tag đã chọn.
function RichRow({ record, cfg, fieldNames }: { record: any; cfg: RSCfg; fieldNames: FN }) {
  const { token } = theme.useToken();
  if (!record || typeof record !== 'object') return <span>{record == null ? '' : String(record)}</span>;
  if (cfg.mode === 'html' && cfg.html) {
    const clean = DOMPurify.sanitize(interpolateHtml(cfg.html, record));
    return <span style={{ display: 'inline-flex', alignItems: 'center' }} dangerouslySetInnerHTML={{ __html: clean }} />;
  }
  // preset
  const title = getFieldStr(record, cfg.titleField) || getFieldStr(record, fieldNames.label) || getFieldStr(record, fieldNames.value) || 'N/A';
  const sub = getFieldStr(record, cfg.subField);
  const right = getFieldStr(record, cfg.rightField);
  const isIcon = cfg.avatarMode === 'icon';
  const iconKey = isIcon ? getFieldStr(record, cfg.avatarField) : '';
  const avatarUrl = isIcon ? '' : getAvatarUrl(record, cfg.avatarField);
  const hasImg = !!avatarUrl;
  const hasIcon = !!iconKey;
  // Kích thước avatar: cấu hình (avatarSize) hoặc mặc định nhỏ gọn (24 khi có subtitle, 20 khi không).
  const sz = cfg.avatarSize || (sub ? 24 : 20);
  // Hiện avatar khi: có ảnh/icon, HOẶC bật "avatar mặc định" (fallback chữ cái đầu). Tắt default + rỗng → ẩn hẳn.
  const showAvatar = hasImg || hasIcon || cfg.avatarDefault;
  // Có field phải → row chiếm full bề rộng để đẩy nó ra sát mép.
  const fullRow = !!cfg.rightField;
  return (
    <span style={{ display: fullRow ? 'flex' : 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, width: fullRow ? '100%' : undefined }}>
      {showAvatar ? (
        hasIcon ? (
          renderIconAvatar(iconKey, iconColorFor(record, cfg), cfg.iconStyle, sz)
        ) : (
          <Avatar size={sz} src={hasImg ? avatarUrl : undefined} style={{ flex: '0 0 auto', fontSize: Math.round(sz * 0.5), lineHeight: `${sz}px` }}>
            {!hasImg ? (title.charAt(0) || '?').toUpperCase() : null}
          </Avatar>
        )
      ) : null}
      <span style={{ display: 'inline-flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.2, flex: fullRow ? 1 : undefined }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        {sub ? <span style={{ fontSize: 12, color: token.colorTextTertiary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span> : null}
      </span>
      {right ? (
        <span style={{
          marginLeft: 'auto', flex: '0 0 auto', whiteSpace: 'nowrap',
          fontSize: 11, lineHeight: '16px', padding: '0 7px', borderRadius: 10,
          color: token.colorTextSecondary,
          background: token.colorFillSecondary,
          border: `1px solid ${token.colorBorderSecondary}`,
        }}>{right}</span>
      ) : null}
    </span>
  );
}

// value record(s) → format cho antd Select (labelInValue): label = RichRow, value = record[valueKey].
function toRichValue(record: any, fieldNames: FN, isMultiple: boolean, cfg: RSCfg): any {
  const conv = (item: any) => ({ label: <RichRow record={item} cfg={cfg} fieldNames={fieldNames} />, value: item?.[fieldNames.value] });
  if (!record) return isMultiple ? [] : undefined;
  if (isMultiple) return (Array.isArray(record) ? record : []).filter((i) => i && typeof i === 'object').map(conv);
  if (Array.isArray(record)) return record[0] ? conv(record[0]) : undefined;
  return typeof record === 'object' ? conv(record) : undefined;
}

// ---- settings components ------------------------------------------------------------------------
const RS_Seg = (props: any) => (
  <SegmentedGroup {...SEG_PROPS} value={props.value ?? props.defaultValue} onChange={(v: any) => props.onChange?.(v)} options={props.options || []} />
);
const RS_FieldSelect = (props: any) => (
  <ColumnSelect value={props.value || undefined} onChange={(v: any) => props.onChange?.(v)}
    options={props.options || []} placeholder={props.placeholder || 'Field…'} />
);
const RS_Html = (props: any) => {
  const taRef = useRef<any>(null);
  const insert = (path: string[]) => {
    insertAtCaret(getCaretElement(taRef.current), `{{${path.join('.')}}}`, props.value || '', (v: string) => props.onChange?.(v));
  };
  return (
    <div>
      <div style={{ marginBottom: 4 }}>
        {/* Lazy nested picker: drills the target collection's to-one relations on demand. */}
        <FieldPickerCascader
          api={props.api}
          collectionName={props.collectionName}
          dataSourceKey={props.dataSourceKey}
          onPick={insert}
        />
      </div>
      <Input.TextArea ref={taRef} rows={3} value={props.value} onChange={(e: any) => props.onChange?.(e.target.value)}
        placeholder={props.placeholder} style={{ fontFamily: 'monospace', fontSize: 12 }} />
    </div>
  );
};
const RS_Switch = (props: any) => <Switch checked={props.value !== false} onChange={(c: any) => props.onChange?.(c)} />;
const RS_Slider = (props: any) => {
  const { token } = theme.useToken();
  const v = typeof props.value === 'number' && props.value > 0 ? props.value : 24;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 140 }}>
      <Slider min={14} max={40} value={v} onChange={(n: any) => props.onChange?.(n)} style={{ flex: 1 }} />
      <span style={{ width: 32, textAlign: 'right', color: token.colorTextSecondary, fontSize: 12 }}>{v}px</span>
    </div>
  );
};
const RS_Color = (props: any) => <ColorField value={props.value} onChange={(v: any) => props.onChange?.(v)} size="small" />;

const RS_DEFAULTS = { mode: 'preset', titleField: '', subField: '', avatarField: '', rightField: '', avatarDefault: true, html: '', avatarMode: 'image', avatarSize: 0, iconStyle: 'plain', iconColor: '', iconColorField: '' };

export function registerRichSelectModel(deps: {
  flowEngine: any; flowSettings?: any; Base: any; tExpr?: (s: string, o?: any) => any;
}) {
  const { flowEngine, flowSettings, Base } = deps;
  if (!flowEngine || !Base) {
    // eslint-disable-next-line no-console
    console.warn('[field-enh] rich-select: missing flowEngine/Base — skip');
    return;
  }
  const t = (s: string) => (deps.tExpr ? deps.tExpr(s, { ns: 'field-enhancements' }) : s);

  if (flowSettings?.registerComponents) {
    try {
      registerFlowComponentsOnce(flowSettings, { RS_Grid: SettingsGrid, CollapsibleSection, RS_Seg, RS_FieldSelect, RS_Html, RS_Switch, RS_Slider, RS_Color, RS_Reset: ResetButton, RS_Preview: RichSelectPreview });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[field-enh] rich-select registerComponents failed', e);
    }
  }

  // Base = RecordSelectFieldModel (core). Thừa kế toàn bộ flow (resource/fetch/search/hydrate/settings).
  class PtdlRichSelectFieldModel extends Base {
    render() {
      const model: any = this;
      const p: any = model.props || {};
      const cfg = rscfgFromProps(p);
      const target = model.context?.collectionField?.targetCollection;
      const fieldNames = normalizeFieldNames(p.fieldNames, target);
      const isMultiple = Boolean(p.multiple && p.allowMultiple);

      if (p.pattern === 'readPretty') {
        const list = isMultiple ? (Array.isArray(p.value) ? p.value : []) : (p.value ? [p.value] : []);
        if (!list.length) return <span style={{ color: '#bfbfbf' }}>-</span>;
        return (
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {list.map((r: any, i: number) => <RichRow key={r?.[fieldNames.value] ?? i} record={r} cfg={cfg} fieldNames={fieldNames} />)}
          </span>
        );
      }

      const realOptions = resolveOptions(p.options, p.value, isMultiple);
      // "Quick create" (add-new) — inherited from core RecordSelectFieldModel: onMount wires
      // p.onModalAddClick / p.onDropdownAddClick (→ the openView / dropdownAdd flows) and the setting
      // sets p.quickCreate = 'modalAdd' (Pop-up) | 'quickAdd' (Dropdown). Because we override render()
      // with a bespoke Select, we must draw these affordances ourselves — otherwise the toggle has no
      // button and clicking does nothing (the bug this fixes).
      const t = model.context?.t || ((s: string) => s);
      const quickCreate = p.quickCreate;
      const canAdd = p.allowCreate !== false && p.allowEdit !== false;
      const isConfigMode = !!model.context?.flowSettingsEnabled;
      const searchText = p.searchText;

      const select = (
        <Select
          style={{ width: '100%' }}
          allowClear
          showSearch
          filterOption={false}
          labelInValue
          maxTagCount="responsive"
          mode={isMultiple ? 'multiple' : undefined}
          loading={model.resource?.loading}
          placeholder={p.placeholder}
          disabled={p.disabled}
          fieldNames={fieldNames}
          options={realOptions}
          value={toRichValue(p.value, fieldNames, isMultiple, cfg)}
          onChange={(_v: any, option: any) => p.onChange?.(option)}
          onDropdownVisibleChange={(open: boolean) => p.onDropdownVisibleChange?.(open)}
          onPopupScroll={p.onPopupScroll}
          onSearch={p.onSearch}
          onCompositionEnd={(e: any) => p.onCompositionEnd?.(e, false)}
          popupMatchSelectWidth
          optionRender={({ data }: any) => <RichRow record={data} cfg={cfg} fieldNames={fieldNames} />}
          labelRender={(data: any) => data.label}
          listHeight={320}
          dropdownRender={(menu: any) => {
            // Dropdown quick-add: inline "Add «typed text»" row → creates the record via onDropdownAddClick.
            if (quickCreate === 'quickAdd' && canAdd && searchText) {
              const isFullMatch = realOptions.some((v: any) => v?.[fieldNames.label] === searchText);
              return (
                <>
                  {!(realOptions.length === 0 && searchText) && menu}
                  {realOptions.length > 0 && !isFullMatch && <Divider style={{ margin: 0 }} />}
                  {!isFullMatch && (
                    <div onClick={() => p.onDropdownAddClick?.(searchText)} style={{ cursor: 'pointer', padding: '5px 12px' }}>
                      <PlusGlyph /><span style={{ paddingLeft: 6 }}>{`${t('Add')} “${searchText}”`}</span>
                    </div>
                  )}
                </>
              );
            }
            return menu;
          }}
        />
      );

      // Pop-up add-new: an "Add new" button beside the Select — opens the create popup (inherited
      // openView flow) and appends the created record. Also shown in config mode so the designer sees it.
      if (quickCreate === 'modalAdd' && (canAdd || isConfigMode)) {
        return (
          <Space.Compact style={{ width: '100%' }}>
            {select}
            <Button onClick={(e: any) => p.onModalAddClick?.(e)} disabled={!canAdd}>{t('Add new')}</Button>
          </Space.Compact>
        );
      }
      return select;
    }
  }

  flowEngine.registerModels({ PtdlRichSelectFieldModel });
  try { (PtdlRichSelectFieldModel as any).define?.({ label: t('Rich select') }); } catch (_) { /* optional */ }

  const richFlow: any = {
      key: 'ptdlRichSelect',
      sort: 850,
      title: t('Rich display'),
      steps: {
        settings: {
          title: t('Rich display settings'),
          uiMode: { type: 'dialog', props: { width: 780 } },
          uiSchema: (ctx: any) => {
            const cf = ctx?.model?.collectionField;
            const target = cf?.targetCollection;
            const api = ctx?.app?.apiClient || ctx?.model?.context?.api || ctx?.model?.flowEngine?.context?.api;
            let fieldOptions: any[] = [];
            try {
              const fields = target?.getFields?.() || [];
              fieldOptions = fields.filter((f: any) => f?.name).map((f: any) => ({ label: f.title || f.name, value: f.name, type: f.type, iface: f.interface }));
            } catch (_) { /* ignore */ }
            // Load 1 record thật của bảng đích để preview (không bịa data).
            const loadSample = async () => {
              const targetName = cf?.target;
              const dsKey = cf?.dataSourceKey;
              if (!api || !targetName) return null;
              const res = await api.request({
                url: `${targetName}:list`, method: 'get',
                params: { pageSize: 1 },
                headers: dsKey ? { 'X-Data-Source': dsKey } : undefined,
              });
              return res?.data?.data?.[0] || null;
            };
            return {
              ...globalToggleField(t),
              preview: {
                type: 'void', title: t('Preview'),
                'x-decorator': 'FormItem', 'x-decorator-props': { style: { marginBottom: 8 } },
                'x-component': 'RS_Preview',
                'x-component-props': { fieldTitles: Object.fromEntries(fieldOptions.map((o: any) => [o.value, o.label])), loadSample },
              },
              modeRow: {
                type: 'void', 'x-component': 'RS_Grid',
                'x-component-props': { style: { gridTemplateColumns: '1fr auto', alignItems: 'end', gap: '2px 12px' } },
                properties: {
                  mode: fi(t('Display mode'), 'RS_Seg', {
                    componentProps: { options: [{ label: t('Preset'), value: 'preset' }, { label: t('Custom HTML'), value: 'html' }] },
                  }),
                  reset: {
                    type: 'void', 'x-component': 'RS_Reset', 'x-component-props': { defaults: RS_DEFAULTS, label: t('Reset') },
                    'x-decorator': 'FormItem', 'x-decorator-props': { style: { marginBottom: 6, alignSelf: 'end' } },
                  },
                },
              },
              // Preset — hàng 1: 3 field text; hàng 2: avatar (field + mặc định). Bố cục [avatar][title/sub] … [right-tag].
              // Gom cụm field preset vào 1 CollapsibleSection; reaction trên section ẩn cả cụm (kể cả header) khi mode=html.
              presetFields: {
                type: 'void', 'x-component': 'CollapsibleSection',
                'x-component-props': { title: t('Preset fields') },
                'x-reactions': rx((v: any) => (v.mode || 'preset') === 'preset'),
                properties: {
                  presetRow: {
                    type: 'void', 'x-component': 'RS_Grid',
                    'x-component-props': { minColWidth: 150 },
                    'x-reactions': rx((v: any) => (v.mode || 'preset') === 'preset'),
                    properties: {
                      titleField: fi(t('Title field'), 'RS_FieldSelect', { componentProps: { options: fieldOptions, placeholder: t('(title field)') } }),
                      subField: fi(t('Subtitle field'), 'RS_FieldSelect', { componentProps: { options: fieldOptions, placeholder: '—' } }),
                      rightField: fi(t('Right field (tag)'), 'RS_FieldSelect', { componentProps: { options: fieldOptions, placeholder: '—' } }),
                    },
                  },
                  presetRow2: {
                    type: 'void', 'x-component': 'RS_Grid',
                    'x-component-props': { minColWidth: 160 },
                    'x-reactions': rx((v: any) => (v.mode || 'preset') === 'preset'),
                    properties: {
                      avatarField: fi(t('Avatar / icon field'), 'RS_FieldSelect', { componentProps: { options: fieldOptions, placeholder: '—' } }),
                      avatarMode: fi(t('Avatar type'), 'RS_Seg', {
                        componentProps: { options: [{ label: t('Image'), value: 'image' }, { label: t('Icon'), value: 'icon' }] },
                      }),
                      avatarDefault: fi(t('Default avatar (initials)'), 'RS_Switch', { type: 'boolean' }),
                    },
                  },
                  presetRow3: {
                    type: 'void', 'x-component': 'RS_Grid',
                    'x-component-props': { minColWidth: 200 },
                    'x-reactions': rx((v: any) => (v.mode || 'preset') === 'preset'),
                    properties: {
                      avatarSize: fi(t('Avatar size'), 'RS_Slider', { type: 'number' }),
                    },
                  },
                  // Icon-only options (visible when Avatar type = Icon). Icon style gets its OWN full-width
                  // row so the 5-option segmented never truncates; colour (fixed / from a column) sits below.
                  presetRow4: {
                    type: 'void', 'x-component': 'RS_Grid',
                    'x-component-props': { style: { gridTemplateColumns: '1fr' } },
                    'x-reactions': rx((v: any) => (v.mode || 'preset') === 'preset' && v.avatarMode === 'icon'),
                    properties: {
                      iconStyle: fi(t('Icon style'), 'RS_Seg', {
                        componentProps: {
                          options: [
                            { label: t('Icon only'), value: 'plain' },
                            { label: t('Filled'), value: 'filled' },
                            { label: t('Soft'), value: 'soft' },
                            { label: t('Outline'), value: 'outlined' },
                            { label: t('Square'), value: 'square' },
                          ],
                        },
                      }),
                    },
                  },
                  presetRow5: {
                    type: 'void', 'x-component': 'RS_Grid',
                    'x-component-props': { minColWidth: 200 },
                    'x-reactions': rx((v: any) => (v.mode || 'preset') === 'preset' && v.avatarMode === 'icon'),
                    properties: {
                      iconColor: fi(t('Icon colour'), 'RS_Color'),
                      iconColorField: fi(t('Colour from column'), 'RS_FieldSelect', { componentProps: { options: fieldOptions, placeholder: '—' } }),
                    },
                  },
                },
              },
              // Custom HTML.
              html: fi(t('HTML template ({{field}} = column of target record)'), 'RS_Html', {
                componentProps: {
                  placeholder: '<b>{{name}}</b> — <span style="color:#888">{{position}}</span>',
                  api,
                  collectionName: cf?.target,
                  dataSourceKey: cf?.dataSourceKey,
                },
                reactions: rx((v: any) => v.mode === 'html'),
              }),
            };
          },
          defaultParams: { ...RS_DEFAULTS },
          handler(ctx: any, params: any) {
            const p = params || {};
            const props = {
              ptdlrsMode: p.mode || 'preset',
              ptdlrsTitle: p.titleField || '',
              ptdlrsSub: p.subField || '',
              ptdlrsAvatar: p.avatarField || '',
              ptdlrsRight: p.rightField || '',
              ptdlrsAvatarDefault: p.avatarDefault !== false,
              ptdlrsHtml: p.html || '',
              ptdlrsAvatarMode: p.avatarMode === 'icon' ? 'icon' : 'image',
              ptdlrsAvatarSize: typeof p.avatarSize === 'number' && p.avatarSize > 0 ? p.avatarSize : 0,
              ptdlrsIconStyle: ICON_STYLES.includes(p.iconStyle) ? p.iconStyle : 'plain',
              ptdlrsIconColor: colorToString(p.iconColor) || '',
              ptdlrsIconColorField: p.iconColorField || '',
            };
            ctx.model.setProps(props);
            // Global: display variant renders the same RichRow (readPretty) → save under the display model.
            saveWidgetGlobal(ctx, params, 'PtdlRichSelectDisplayFieldModel', props);
          },
        },
      },
  };
  try {
    (PtdlRichSelectFieldModel as any).registerFlow(richFlow);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[field-enh] rich-select registerFlow failed', e);
  }

  const RS_INTERFACES = ['m2o', 'o2o', 'oho', 'obo', 'o2m', 'm2m'];
  try {
    (EditableItemModel as any)?.bindModelToInterface('PtdlRichSelectFieldModel', RS_INTERFACES, { isDefault: false });
    // eslint-disable-next-line no-console
    console.log('[field-enh] rich-select registered:', !!flowEngine.getModelClass?.('PtdlRichSelectFieldModel'), 'bind→', RS_INTERFACES.join(','));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[field-enh] rich-select bind failed', e);
  }

  // Display variant (detail/table/list) — render record(s) thành RichRow, không cần Select.
  bindDisplayField({
    flowEngine, Base, name: 'PtdlRichSelectDisplayFieldModel', interfaces: RS_INTERFACES,
    label: t('Rich select'), flow: { ...richFlow, key: 'ptdlRichSelectDisplay' },
    render: (p: any, model: any) => {
      const cfg = rscfgFromProps(p);
      const target = model?.context?.collectionField?.targetCollection;
      const fieldNames = normalizeFieldNames(p.fieldNames, target);
      const isMultiple = Array.isArray(p.value);
      const list = isMultiple ? p.value : (p.value ? [p.value] : []);
      if (!list.length) return <span style={{ color: '#bfbfbf' }}>-</span>;
      return (
        <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {list.map((r: any, i: number) => <RichRow key={r?.[fieldNames.value] ?? i} record={r} cfg={cfg} fieldNames={fieldNames} />)}
        </span>
      );
    },
  });

  return PtdlRichSelectFieldModel;
}

// Preview — mặc định dùng TÊN TỔNG QUÁT theo field đã map (không bịa). Nút "Load sample" lấy 1 record thật bảng đích.
const RichSelectPreview: any = observer((props: any) => {
  const form: any = useForm();
  const { token } = theme.useToken();
  const cfg = rscfgFromForm(form?.values || {});
  const titles: Record<string, string> = props?.fieldTitles || {};
  const [real, setReal] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string>('');
  const titleKey = cfg.titleField || '__title__';
  const fieldNames: FN = { label: titleKey, value: 'id' };

  // Record hiển thị: record thật (nếu đã Load) hoặc mẫu tên-tổng-quát.
  let record: any;
  if (real) {
    record = real;
  } else {
    const sample: any = { id: 1 };
    sample[titleKey] = cfg.titleField ? (titles[cfg.titleField] || cfg.titleField) : 'Title';
    if (cfg.subField) sample[cfg.subField] = titles[cfg.subField] || cfg.subField;
    if (cfg.rightField) sample[cfg.rightField] = titles[cfg.rightField] || cfg.rightField;
    // Icon mode → seed a sample icon key so the preview shows the chosen style; image mode → empty (initials).
    if (cfg.avatarField) sample[cfg.avatarField] = cfg.avatarMode === 'icon' ? 'lucide-star' : '';
    if (cfg.avatarMode === 'icon' && cfg.iconColorField) sample[cfg.iconColorField] = colorToString(cfg.iconColor) || '#1677ff';
    record = cfg.mode === 'html'
      ? { ...sample, title: 'Title', subtitle: 'Subtitle', name: 'Title', position: 'Subtitle', status: 'Status' }
      : sample;
  }

  const onLoad = async () => {
    if (!props?.loadSample) return;
    setLoading(true); setErr('');
    try {
      const r = await props.loadSample();
      if (r) setReal(r); else setErr('No record');
    } catch (e: any) {
      setErr(e?.message || 'Load failed');
    } finally {
      setLoading(false);
    }
  };

  const row = <RichRow record={record} cfg={cfg} fieldNames={fieldNames} />;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{real ? 'Sample record' : 'Generic preview'}</span>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          {err ? <span style={{ fontSize: 12, color: token.colorError }}>{err}</span> : null}
          {real ? <Button size="small" type="link" onClick={() => setReal(null)}>Clear</Button> : null}
          <Button size="small" loading={loading} onClick={onLoad}>Load sample</Button>
        </span>
      </div>
      <div style={{ fontSize: 12, color: token.colorTextTertiary, marginBottom: 4 }}>Selected</div>
      <div style={{ display: 'flex', alignItems: 'center', minHeight: 32, padding: '2px 10px', border: `1px solid ${token.colorBorder}`, borderRadius: 6, marginBottom: 10, background: token.colorBgContainer }}>
        {row}
      </div>
      <div style={{ fontSize: 12, color: token.colorTextTertiary, marginBottom: 4 }}>Dropdown option</div>
      <div style={{ border: `1px solid ${token.colorBorder}`, borderRadius: 6, overflow: 'hidden', boxShadow: token.boxShadowTertiary }}>
        <div style={{ padding: '8px 12px', background: token.colorFillTertiary }}>{row}</div>
      </div>
    </div>
  );
});
