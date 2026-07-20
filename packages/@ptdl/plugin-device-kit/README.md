# Device Kit (photo · location · scan) — User Guide

> Use your **phone/tablet hardware** (camera, GPS, mic) to enter data right in the field:
> photos with a **GPS/time watermark**, a **location on a map** (no API key), **signature** & **audio**,
> **scan QR/barcode** to fill or look up, and one-tap **check-in**.

**Group:** Fields + Actions · **Runs on:** /admin (classic) + /v/ (modern) · **Version:** 0.8.1

> ⚠️ **Requirement: the page must run over HTTPS** (or `localhost`). The browser's camera, GPS and microphone **only work over HTTPS**. Hosting on Railway already provides HTTPS → just open the production URL on your phone and it works.

## What's new after installing?

The plugin **adds no menu or dedicated settings page**. Instead it adds **field types, field display components and action buttons** you attach to your own pages/data blocks:

| New component | Type | Where it appears |
|---|---|---|
| **Location (GPS)** | New field type | **Add field → “Device” group** |
| **Photo (camera)** | Field component | On an **Attachment** field |
| **Signature** | Field component | On an **Attachment** field |
| **Record audio** | Field component | On an **Attachment** field |
| **Scan (QR/Barcode)** | Field component | On a **text / number** field (input, number, uuid…) |
| **QR code (display)** | Field component (read-only) | On a **text / number** field |
| **Check-in (location)** | Action (on a record) | **Add action** on a table row / detail / form |
| **Scan → lookup** | Action (on a table) | **Add action** in a Table block toolbar |
| **Auto-record on save** | Form block setting | ⚙ of a **Form (Create/Edit)** block |

## Where to configure

There is no central Settings page — **each thing is configured in place** via its **⚙** gear (turn on the **UI Editor** first). Every component has its own settings dialog:

| Component | Open its settings from | Dialog name |
|---|---|---|
| Location (GPS) field | ⚙ on the field | **Location settings** |
| Photo (camera) | ⚙ on the field | **Camera settings** |
| Signature | ⚙ on the field | **Signature settings** |
| Record audio | ⚙ on the field | **Audio settings** |
| Scan (QR/Barcode) | ⚙ on the field | **Scan settings** |
| QR code (display) | ⚙ on the field | **QR code settings** |
| Check-in (location) | ⚙ on the action button | **Check-in settings** |
| Scan → lookup | ⚙ on the action button | **Scan → lookup settings** |
| Auto-record on save | ⚙ on the Form block | **Auto-record on save** |

> 💡 **Classic (`/admin`) differs slightly:** the classic UI has no **Add field → Device** group. To use the location field in classic, create a **JSON** field then go to ⚙ → **Field component → “Location (GPS)”**. Everything else is identical to /v/.

## How to use (step by step)

### Scenario A — Field photos with a GPS + time watermark

1. Go to the table/collection you want to fill and add an **Attachment** field (if you don't have one).
2. Turn on the **UI Editor** → click that attachment field → open **⚙ → Field component → “Photo (camera)”**.
3. Open **⚙** again → **“Camera settings”** and adjust:
   - **Capture mode**: **“In-app”** (opens the camera inside the page and **forces a live capture** — real proof, no picking from the gallery) or **“System camera”** (opens the device's camera app).
   - **Watermark (stamped on the image)**: toggle **Capture time**, **GPS coordinates**, **Taken by**, add an **Extra line**, and pick the **Position** (Bottom-left / Bottom-right / Top-left / Top-right).
   - **Image & data**: **Max size** (1280/1600/1920/Keep original) and **JPEG quality** to save mobile data; **Save coordinates into field** (pick a Location (GPS) field to store the coordinates alongside); **Require a photo before saving**.
4. **Save**. ✅ The form now has a **📷 Take photo** button — tap it to shoot; the photo is watermarked then uploaded automatically.

### Scenario B — The “Location (GPS)” field: get coordinates, pick on the map, resolve an address

1. **Add field → “Device” group → “Location (GPS)”** (classic: a JSON field + Field component “Location (GPS)”).
2. Go to **⚙ → “Location settings”** to choose:
   - **High accuracy**, **Show accuracy (±m)**.
   - **Map**: the **map on input** (drag the pin to pick) and the **map on view** (detail), plus **Map height**.
   - **Address (reverse geocode — OSM, free)**: **Off** / **Button** / **Auto** — turns coordinates into a text address (free via OpenStreetMap, ~1/sec), pick a **Language** (default `vi`).
   - **Accuracy colour thresholds**: **Good when ≤ (m)** / **OK when ≤ (m)** — a green/amber/red dot based on the margin of error.
3. When entering data: tap **📍 Get location** to grab the current coordinates; or **click/drag the pin on the map**; or **“Enter manually / paste link”** (paste a Google Maps link directly and the system extracts the coordinates).
4. **Save**. ✅ In tables/detail it shows as a **📍 `latitude, longitude (±m)`** pill; click it to open Google Maps.

> 💡 **No map API key needed** — the map uses OpenStreetMap and positioning uses the browser's GPS.

### Scenario C — Scan a QR/Barcode to fill a field

1. On a **text/number** field (product code, batch number…) → **⚙ → Field component → “Scan (QR/Barcode)”**.
2. **⚙ → “Scan settings”**: **Beep on scan**, **Vibrate on scan**, **Auto-save after scan**; the **Transform result (advanced)** section lets you use **Regex (extract/clean code)** + **Replacement** to keep just the part you need.
3. When entering: the field has a **📷** button at the end → tap it to open the scan frame → the decoded code fills the field automatically.

### Scenario D — One-tap GPS check-in (attendance / visit confirmation)

1. You need a **Location (GPS)** field (or JSON) in the table to hold the coordinates.
2. In a Table/Detail block → **Add action → “Check-in (location)”**.
3. **⚙ → “Check-in settings”**: choose **Write to Location field**, enable **High accuracy**, turn on **Ask for confirmation** if you want a prompt first, and set the **Button label** (empty = “Check-in”).
4. Tap the **📍 Check-in** button on a record → it grabs the current GPS, writes it to the chosen field, then refreshes. ✅

### Scenario E — Scan to look up / point-of-sale (POS)

1. In a **Table** block toolbar → **Add action → “Scan → lookup”**.
2. **⚙ → “Scan → lookup settings”**:
   - **Code field (look up in this table)**: the column used to find a record by the scanned code.
   - **On match**: **Add to cart** (push into a Sub-table Pro cart — POS), **Filter table** (filter to the matching record), or **Notify**.
   - **Cart channel (match Sub-table Pro)**, **Continuous scan (POS)**, **Beep**, **Vibrate**, **Button label**.
3. Tap the scan button → each scanned code is looked up in the table and handled per your settings; enable **Continuous scan** to scan one after another without closing the frame.

### Scenario F — Signature & audio

- **Signature:** an **Attachment** field → ⚙ → **Field component → “Signature”** → **“Signature settings”** (Pen color, Pen width, Height, White background, **Stamp name + time under the signature**). The **✍️ Sign** button opens a pad to sign with your finger/mouse and saves a PNG.
- **Audio:** an **Attachment** field → ⚙ → **Field component → “Record audio”** → **“Audio settings”** (**Max duration**). The **🎙️ Record audio** button records a clip and attaches it to the record.

### Scenario G — Auto-record on save (no manual tapping)

1. In a **Form (Create/Edit)** block → **⚙ → “Auto-record on save”**.
2. Turn on **“Enable auto-record on save”**; optionally **“Save device info into field”** (pick a JSON/text field to store OS, browser, model, screen size…).
3. **Save**. ✅ From now on, whenever a user clicks **Save** on the form:
   - each **Location (GPS)** field auto-captures its coordinates (per each field's **When to capture** setting: **Only when empty** / **Always update**);
   - any **Camera** field marked **required** blocks the save until a photo is added;
   - time & author are taken automatically from the system fields (`createdAt`/`updatedAt`/`createdBy`).

## Tips & notes

- ⚠️ **HTTPS is required.** If you open the page over `http://` (not localhost), the browser blocks the camera/GPS/mic and the buttons throw permission errors.
- ⚠️ **The “File manager” plugin must be enabled.** The **Photo / Signature / Audio** fields all upload through the built-in attachment machinery; with File manager off, these three won't show (the Location field, scanning and check-in still work fine).
- **First use asks for permission.** The browser requests **Camera / Location / Microphone** access — choose **Allow**. If you accidentally deny it, the plugin shows per-device instructions to re-enable it (iOS Safari / Chrome Android). Remember to turn on your phone's **GPS/Location**.
- **The watermark is burned into the image** (image processing strips EXIF), so the GPS/time stamp can't be removed from the photo. To keep the coordinates as queryable data too, also use **“Save coordinates into field”**.
- **The Location field stores JSON** `{lat, lng, accuracy, ts, src, address}` → it's filterable/reportable and costs no API key.
- **Device info only captures**: OS, browser, model (Android; iOS only shows “iPhone”), screen size, a pseudo-id. **IMEI / hardware ID can't be read** in a browser; the IP address must be read server-side.
- **Reverse geocode** uses OpenStreetMap's free service, limited to ~1 request/sec — fine for data entry, not for bulk calls.
- Runs on **both** clients: classic `/admin` and modern `/v/`. Only the **Add field → Device** group is /v/-only; classic uses a **JSON** field + Field component (see “Where to configure”).

## Remove / disable

- **Drop a single component:** open the ⚙ of that field/button, switch **Field component** back to default, or delete the action button. Each component's settings has a **“Reset”** button to restore defaults.
- **Remove entirely:** disable the plugin in **Plugin Manager**. The camera/location/scan/signature/audio buttons stop appearing. **Your data stays**: photos/signatures/recordings are ordinary attachments; coordinates and device info are JSON in the record; values filled by scanning are plain text/number data too.
- A **Location (GPS)** field shows as raw JSON when the plugin is off (no data is lost); re-enable the plugin and it renders nicely again.

---

### For developers

Client-only (the server is a no-op). A single shared registration path serves **both lanes** (`src/shared/registerAll.tsx`); only the base class injected per lane differs. **Photo / Signature / Audio** subclass plugin-file-manager's `UploadFieldModel` (native value/preview/submit untouched — they only add a button). **Location (GPS)** is a custom `CollectionFieldInterface` `ptdlLocation` (dbType `json`, “Device” group) with a fallback binding onto the `json` interface; the map uses Leaflet + OpenStreetMap (no key). **Check-in** and **Scan → lookup** are custom `ActionModel`s (house pattern `getModelClass('ActionModel')` → subclass → `define({ label })`). **Auto-record on save** patches the `submitHandler` of `CreateFormModel`/`EditFormModel` to capture GPS and enforce required fields before the native pipeline runs. Every registration step is **guarded with try/catch** so one part failing doesn't take down the rest. i18n follows the VN-source convention (VN strings as keys + `src/locale/en-US.json`) and uses the `@ptdl/shared` settings-kit.

The building blocks live in `src/shared/`: `geo.ts` · `watermark.ts` · `cameraModal.tsx` · `cameraFieldModel.tsx` · `locationField.tsx` · `mapView.tsx` · `geocode.ts` · `scanModal.tsx` · `scanInputModel.tsx` · `qrDisplayModel.tsx` · `checkinAction.tsx` · `scanLookupAction.tsx` · `signaturePad.tsx` · `signatureFieldModel.tsx` · `audioRecorder.tsx` · `audioFieldModel.tsx` · `autoSubmit.tsx` · `deviceInfo.ts` · `permissionHelp.tsx`, all wired by `registerAll.tsx`.

**Requirements:** the **File manager** plugin must be enabled (the camera/signature/audio widgets subclass its `UploadFieldModel`).

**Build:** `cd build-env && bash recipes/run-device-kit-build.sh && bash recipes/add-markers.sh storage/tar/@ptdl/plugin-device-kit-<version>.tgz`. Bump `version` in `package.json` on each new build so NocoBase treats it as an update, then upload the `.tgz` via **Plugin Manager → Add & Update → Upload plugin** and hard-refresh (**Ctrl+Shift+R**).
