# @ptdl/plugin-login-lite

**Custom Login** — theme the NocoBase sign-in page (colors, layout, background, form position, input
icons and post-login redirect) directly from the admin panel. Works on both the classic (`/`) and
modern (`/v/`) clients.

## Usage

1. **Enable**: Plugin Manager → search `@ptdl/plugin-login-lite` → enable.
2. **Configure**: open **Settings → Login configurations**.
3. **Add / Edit** a *Home configuration*, tweak the options (a live preview is shown), then **Submit**.
4. **Apply**: toggle **Enable** on the configuration. Only one home configuration can be active at a time.

## Options

### General
| Option | Description |
| :-- | :-- |
| **Title / Description** | Admin-only labels to identify the configuration. |
| **Use system name** | Show the app name from system settings, or a custom one. |
| **Custom system name** | Shown when *Use system name* = No. |
| **Logo image URL** | Optional logo shown above the form title. Leave empty to hide. |

### Background
| Option | Description |
| :-- | :-- |
| **Left side content display** | `Gradient` (bundled, no external request) · `Image` (URL) · `HTML embed` · `Webpage embed` (iframe). |
| **Gradient preset** | Deep space · Midnight · Ocean · Violet · Sunset · Aurora · Emerald. Shown for *Gradient*. |
| **Left side image URL** | Background image; leave empty to fall back to a built-in gradient. Shown for *Image*. |

### Form position & style
| Option | Description |
| :-- | :-- |
| **Form layout** | `Side panel` (full-height column) or `Floating card` (overlays the background). |
| **Form position** | Left / Center / Right. Center applies to the floating card. |
| **Form theme** | `Custom` (use the colors below) · `System` (follow the visitor's OS light/dark) · `Light` / `Dark` (full presets that override the colors). |
| **Show input icons** | Leading icon inside the username / password fields. |
| **Username / Password icon** | Pick the icon (user/mail/at/id · lock/key/shield). |

### Colors *(Custom theme only)*
Background theme color, Font color, Login form theme color, Login form text color, Button background /
text color, and **Background panel opacity**. Hidden when a Light/Dark/System preset is selected.

### After login
| Option | Description |
| :-- | :-- |
| **Default landing page** | Path opened after a successful login when the URL has no explicit `redirect` (e.g. `/admin`). Leave empty to keep the system default. |

### Footer
Copyright / footer text and ICP information (both Markdown).

## Notes

- The default background is a **bundled gradient** — no external image request on the login page.
- A transparent panel color (or reduced panel opacity) lets the background show through behind the form.
- Sign-in inputs mirror their placeholder into `aria-label` for screen readers.
- Shared, framework-free helpers live in `@ptdl/shared` (`loginKit`) and are bundled into the plugin.

## License

Dual-licensed under AGPL-3.0 and the NocoBase Commercial License. The default footer keeps the
NocoBase attribution required by the open-source license — please respect it.
