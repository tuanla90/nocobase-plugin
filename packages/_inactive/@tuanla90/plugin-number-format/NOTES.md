# @tuanla90/plugin-number-format — research notes

**Goal:** live thousands-separator formatting for **number fields on FORMS** (type `1234567` → see `1,234,567` while typing), configurable per field via the UI — as a proper plugin (replacing the paste-per-field RunJS approach).

**Status: WIP.** Extracted out of `@tuanla90/plugin-icon-kit` on 2026-07-08 so it can be researched separately. NOT built/installed yet.

## What already works (proven)
- **Value binding is trivial:** core `NumberFieldModel.render()` is literally
  `<InputNumberField {...this.props} style={{width:'100%'}}/>`, so `this.props` already
  carries the form `value` + `onChange`. Setting `formatter` / `parser` / `precision` /
  `controls:false` props reaches the antd `InputNumber` and formats live.
- **The formatter/parser logic** (`makeNumberFormatter` / `makeNumberParser` in
  `src/shared/numberFormat.tsx`) is the user's confirmed-working RunJS logic.

## The open problem
Registering a **new** flow (`numberFormat`) on the core `NumberFieldModel` succeeds, but
the step **does not appear in the FORM field's ⋮ settings menu**. Bundle analysis of
`@nocobase/client-v2` showed that menu renders only **specific named settings flows**
(`formItemSettings` on a minified model `uK`, `numberSettings` on `ve`,
`displayFieldSettings` on `hI`, …) — not arbitrary new flows. Table COLUMNS accept new
field models via `tableColumnSettings` (that's why conditional-formatting worked), but
forms have no equivalent "add any flow / pick a component" hook.

## Directions to try
1. **Inject a STEP into the existing `numberSettings` flow** (already on the number model)
   via `FlowDefinition.addStep(stepKey, step)` — instead of a new flow. Must not clobber
   the core steps. First fetch the real source:
   `curl -s https://raw.githubusercontent.com/nocobase/nocobase/main/packages/core/client-v2/src/flow/models/fields/...`
   (WebFetch summarizes code — use `curl` for verbatim.)
2. **Register on the form field-ITEM settings model** (`formItemSettings`) and reach the
   number sub-model to `setProps`.
3. **Fallback that works today:** the RunJS number-format field (`JSEditableFieldModel`),
   saved at `D:\Users\tuanla2\Documents\nocobase-plugin-build\runjs-number-format.js`.

## To build later (same pipeline as the other plugins)
Add root stubs `client.js`/`client-v2.js`/`server.js` (+ `.d.ts`) in this dir, add a
`run-numfmt-build.sh` (stub externals from the 2.1.19 host, `nocobase-build --tar --no-dts`),
then extract `.tgz`, re-add root stubs, install into `nb-local` node_modules + storage/plugins.
