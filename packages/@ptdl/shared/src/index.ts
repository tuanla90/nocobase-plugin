export { COLOR_PRESETS, colorToString, TAG_COLORS, TAG_HEX, tagColorToHex } from './color';
export { ColorField } from './colorField';
export { setIconRegistry, IconByKey, RegistryIconPicker } from './icons';
export {
  getFields,
  fieldJsonMeta,
  buildFieldCascaderOptions,
  buildLevelOptions,
  getCaretElement,
  insertAtCaret,
  FieldPickerCascader,
  FieldTokenTextArea,
  // Column picker dropdown (title + raw name, dual-search) + spreadable props + option builder +
  // the shared two-line option renderer (used by both the flat select and the multi-level cascader).
  ColumnSelect,
  columnDropdownProps,
  buildColumnOptions,
  TwoLineOption,
  fieldTypeIcon,
} from './fieldPicker';
export type { FieldJsonMeta, TokenFormat, FieldPickerCascaderProps, FieldTokenTextAreaProps, ColumnOption, ColumnSelectProps } from './fieldPicker';
// Standard "button group" (Segmented at medium) — house default for every @ptdl segmented control.
export { SegmentedGroup } from './controls';
export type { SegmentedGroupProps } from './controls';
// Relation-appends cascader (picks relation dot-paths for `appends`, not leaf columns).
export { buildRelationOptions, RelationAppendsPicker } from './relationPicker';
export type { RelationAppendsPickerProps } from './relationPicker';
export {
  resolveFieldMeta, operatorsForMeta, opNeedsNoValue, ConditionValueInput, evalConditionOp,
  OP_LABELS, DATE_PRESETS, ConditionRow,
} from './condition';
export type { CondMeta, ConditionCond, ConditionRowProps } from './condition';
export {
  get, toDisplayString, escapeHtml, makeNumberFormatter, formatNumber, formatDate, applyFilter, interpolate,
} from './format';
export type { NumberFormat, InterpolateOpts } from './format';
export {
  // (A) Formily uiSchema lane
  SettingsGrid, fieldItem, fi, rx, visibleWhen, ResetButton, PreviewBox, CollapsibleSection,
  SEG_PROPS, registerSettingsKit, livePreview, previewField, colorStrip,
  // (B) plain-React lane
  Hint, SettingRow, ControlGrid, SettingCard, SaveBar, PreviewPane, ConfigContainer,
} from './settingsKit';
export {
  DEFAULT_BG_GRADIENT, DEFAULT_POWERED_BY_HTML, hexToRgba, svgFieldIcon,
  ACCOUNT_ICONS, PASSWORD_ICONS, accountIconPath, passwordIconPath, getFormThemeColors,
  GRADIENTS, gradientCss, resolveThemePalette,
} from './loginKit';
export type { FormThemeColors, ThemePalette } from './loginKit';
export { LIVE_REFRESH_TYPE, DATA_CHANGED_TYPE, onWsMessage, onLiveRefresh, refreshFlowBlocks } from './liveRefresh';
// Shared render-string i18n: consumers register `sharedEnUS` under `SHARED_NS` and inject `setSharedT`
// in load() so @ptdl/shared's own labels (field-picker button, empty state) are bilingual per lane.
export { SHARED_NS, setSharedT, sharedEnUS, st } from './i18n';
// AI "viết hộ" button (client). The SERVER codegen helper lives at the `@ptdl/shared/ai-server`
// subpath (no React) so a plugin's server can import it without pulling antd/react.
export { AiCodegenButton } from './aiCodegen';
export type { AiCodegenButtonProps, AiCodegenRequest, AiValidateResult } from './aiCodegen';
