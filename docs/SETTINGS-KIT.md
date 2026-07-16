# @ptdl Settings Kit — house style for plugin config dialogs

Canonical primitives live in **`@ptdl/shared` (`src/settingsKit.tsx`)**, bundled into every plugin (no
runtime dep). Use them so config dialogs look and behave the same across plugins.

## Two lanes — pick the one your settings live in

| | (A) Formily uiSchema lane | (B) Plain-React lane |
|---|---|---|
| **What** | flow-engine **model settings** — a `uiSchema` of `fi()` cells inside void containers, driven by `registerFlow` | a `pluginSettingsManager` **page**, or a plain-React editor registered as one `value`/`onChange` component |
| **Values** | flat in `form.values` (void containers make no data path) | your own `useState` |
| **Use** | `SettingsGrid` · `fi` · `rx`/`visibleWhen` · `ResetButton` · `PreviewBox` · `CollapsibleSection` · `colorStrip` · `livePreview`/`previewField` · `registerSettingsKit` · `SEG_PROPS` | `SettingRow` · `ControlGrid` · `SettingCard` · `Hint` · `SaveBar` · `PreviewPane` |
| **Shared by both** | `ColorField`, `RegistryIconPicker`/`IconByKey`, condition kit (`@ptdl/shared/condition`), the field picker | |
| **Reference plugin** | `custom-header`, `layout-containers` | `global-search` (`Settings.tsx`) |

The (A) primitives that call `useForm()` — **`fi` / `rx` / `ResetButton`** — do **not** work in lane (B).

## GOTCHA — never `{{$deps}}`

The string reaction form `'x-reactions': { dependencies:[…], fulfill:{ state:{ visible:'{{$deps[0]}}' }}}`
**throws "$deps is not defined" under v2 `compileUiSchema`** → fields silently never toggle (all show).
Always use the function form: `'x-reactions': rx(v => !!v.enabled)` or `visibleWhen('mode', 'html')`.

## (A) Formily lane — layout recipe

Register the kit once, then build the schema as **void `CollapsibleSection` (defaultOpen) → void grid → labeled `fi()` cells**, with a live preview pinned first:

```ts
import { registerSettingsKit, fi, rx, visibleWhen, colorStrip, livePreview, previewField, SEG_PROPS } from '@ptdl/shared';

registerSettingsKit(flowEngine.flowSettings, { MyLeafComponent });   // + SettingsGrid, CollapsibleSection

const Preview = livePreview((v) => <PreviewBox>{renderSample(v)}</PreviewBox>);   // observer + useForm, auto-updates

uiSchema = {
  preview: previewField(Preview, t('Preview')),                     // pin first
  shape: { type:'void', 'x-component':'SettingsGrid', 'x-component-props':{ minColWidth: 220 }, properties: {
    style:   fi(t('Style'),   'Segmented', { componentProps: { ...SEG_PROPS, options: STYLES } }),
    centered:fi(t('Centered'),'Switch',    { type:'boolean' }),
  }},
  colors: { type:'void', 'x-component':'CollapsibleSection', 'x-component-props':{ title:t('Colours') }, properties: {
    strip: colorStrip([                                             // compact swatch row (ColorField showText:false)
      { key:'activeColor', title:t('Active'),   tooltip:t('…') },
      { key:'textColor',   title:t('Text'),     tooltip:t('…') },
      { key:'borderColor', title:t('Border'),   tooltip:t('…'), reactions: visibleWhen('style', ['button','step']) },
    ], { minColWidth: 90 }),
  }},
};
```

Conventions: **compact colours** = `ColorField { showText:false, size:'small' }` in a grid, meaning in the
cell's `x-decorator-props.tooltip` (that's what `colorStrip` emits). **Responsive columns** = pass
`minColWidth` to `SettingsGrid` (don't reach for core `FormGrid`). **Reactions** = `rx`/`visibleWhen`,
never a local re-implementation.

## (B) Plain-React lane — layout recipe

```tsx
import { SettingRow, ControlGrid, SettingCard, Hint, SaveBar, PreviewPane, ColorField } from '@ptdl/shared';

function AppearancePanel({ apiClient }) {
  const [cfg, setCfg] = useState(load);
  const set = (patch) => setCfg((c) => ({ ...c, ...patch }));
  return (
    <div>
      <PreviewPane boxStyle={{ background:'#1f1f1f' }}>{renderPill(cfg)}</PreviewPane>
      <ControlGrid minColWidth={300}>
        <SettingRow label="Position" hint="Center floats over the header; Right docks in the actions.">
          <Segmented value={cfg.align} onChange={(v)=>set({align:v})} options={POS} />
        </SettingRow>
        <SettingRow label="Background" hint="Empty = theme default.">
          <ColorField value={cfg.bg} onChange={(v)=>set({bg:v||''})} emptyValue="" allowAlpha />
        </SettingRow>
      </ControlGrid>
      <SaveBar onReset={() => setCfg(DEFAULTS)} onSave={() => save(apiClient, cfg)} />
    </div>
  );
}
```

Conventions: put **detail text in a `Hint` tooltip** (ⓘ), not wrapping inline. `SettingRow` does
label-left by default (`labelWidth`), or `layout="vertical"` for label-above, `align="start"` for tall
controls. `SettingCard` wraps one row of a repeating-list editor. **`SaveBar`** = state-based Reset + Save
(the Formily `ResetButton` can't be used here). `ColorField` on **string** state needs `emptyValue=""`;
set `allowAlpha` only where rgba is meaningful (backgrounds, not text).

## Not yet in the kit (future consolidation — see SHARED-LIBS-PROPOSAL / HANDOFF)

- **Condition row** — ✅ **done**: `ConditionRow` in `@ptdl/shared/condition` (field Cascader + operator
  + `ConditionValueInput` + remove) is the shared row shell, adopted by `menu-enhancements` and
  `conditional-format`. Canonical `path: string[]`; a dot-string caller adapts in `onChange`. Props for
  the divergent bits: `connector`, `renderRemove`, `cascaderWidth`, `emptyLabel`, `placeholder`,
  `fieldLabel`, `style`. The **group shell** (AND/OR toggle + add + advanced-JSON / rule-card) stays
  per-plugin — too divergent (menu = filter-JSON encode + advanced mode; cond-fmt = rule + match + targets).
- **ColorField adoption** in `menu-enhancements` (`PtdlColor`/`PtdlBadgeStyle`/`PtdlSectionColor` are
  hand-rolled antd `ColorPicker` clones — replace with the shared `ColorField`).
- ~~`.d.ts` for the `.tsx` exports~~ — ✅ **fixed**: `run-shared-build.sh`'s tsc dts step now passes
  `--jsx react-jsx --moduleResolution bundler` so every `.tsx` module (`colorField`/`fieldPicker`/
  `settingsKit`/`condition`/`icons`) emits a fully-typed `.d.ts`. Consumers get complete autocomplete
  for the kit primitives.
