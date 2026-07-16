# @ptdl/plugin-action-enhancements

Custom action-button display for NocoBase v2 (works on `/admin` and `/v/`).

## Features

- **Deep per-button colour** — background / text / border + hover colours per button, applied through
  antd Button component tokens (antd ignores injected CSS on buttons; tokens are the supported path).
  Configured in the button ⚙ popup → **Custom colour**.
- **Action-bar layout** *(WIP)* — per-block: vertical stacking, even distribution, left/centre/right
  alignment, per-button pin. Configured in the block ⚙.

Fully bilingual (English + Vietnamese). Reuses `@ptdl/shared` colour kit.

## Build

```bash
cd build-env && bash recipes/run-action-enh-build.sh
bash recipes/add-markers.sh storage/tar/@ptdl/plugin-action-enhancements-*.tgz
```

See `docs/ACTION-ENHANCEMENTS-DESIGN.md` for the full design.
