# @ptdl/plugin-number-input

A NocoBase (v2.1.x) field type whose **form input shows a live thousands
separator while you type**, storing a plain number underneath.

Built by extending the built-in `NumberFieldInterface`, so it inherits all the
standard field plumbing (name, data type, unique, operators, validation) and
just swaps the edit component.

## Features

- Live formatting while typing (uses antd `InputNumber` `formatter`/`parser`).
- Per-field settings:
  - **Separator style** — `1,234,567.89` (comma) or `1.234.567,89` (dot / VN standard).
  - **Decimal places** — 0..10.
  - **Prefix / Suffix** — e.g. `₫`, `VNĐ`, `$`, `%`.
- Read-only (table / detail) view is formatted the same way.

## Usage

1. Enable the plugin in **Plugin Manager**.
2. Add a field to any collection → choose field type **“Formatted number”** (Basic group).
3. In the field settings, pick the separator style, decimals, prefix/suffix.

## Build

This package ships **source only**; it must be built with `@nocobase/build`
(the build session handles this). Notes:

- Bundled deps: none of the framework libs are bundled — `@nocobase/client`,
  `antd`, `react`, `@formily/react` are **external** (the build only reads their
  versions).
- Typical flow: `npm install` → run `@nocobase/build` (with `--no-dts`) →
  produces `dist/` and `<name>-<version>.tgz`.
- Output `.tgz` goes to `D:\Users\tuanla2\Documents\nocobase-plugin-build\`.

## Files

```
src/
├─ index.ts                     re-exports the server plugin (package main)
├─ server/index.ts              empty server Plugin (required to be installable)
└─ client/
   ├─ index.tsx                 registers the component + field interface
   ├─ interface.ts              FormatNumberFieldInterface extends NumberFieldInterface
   └─ FormatNumberInput.tsx     the antd InputNumber wrapper (formatter/parser)
```

## Known polish items (verify on a live instance)

- The per-field settings form is the part most likely to need a small tweak
  after the first test (Formily schema binding to `x-component-props.*`).
- Negative numbers and paste are handled by the parser; confirm against your data.
