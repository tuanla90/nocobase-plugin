# AI Codegen Plan — "AI viết hộ" cho mọi surface nhập code trong @tuanla90

> Mục tiêu: mọi chỗ trong bộ `@tuanla90` mà người dùng **phải tự viết code/template** (HTML/CSS/JS,
> Handlebars, ECharts option, formula, token template) đều có nút **"✨ AI viết hộ"** — mô tả bằng
> tiếng Việt → AI sinh code → **tự kiểm bằng chính đường render/compile của surface đó** → chèn.
>
> Trạng thái: **PLAN** (chưa code). Nguồn: quét toàn `packages/@tuanla90/*/src` 2026-07-15.

---

## 1. Tiền lệ đã có (tái dùng, không dựng lại)

- **`plugin-formula` — `aiWriteFormula`** (`src/server/plugin.ts:234`): NL → công thức → **self-validate
  bằng `testFormula`** → nhét lỗi lại cho AI sửa, **retry ≤ 3**. Qua `provider.invoke({ structuredOutput })`.
  Actions: `aiWrite` / `aiSuggest` / `aiExplain`, ACL `loggedIn` (`plugin.ts:189`).
- **Server LLM path**: `app.pm.get('ai').aiManager` → `resolveModel` → `getLLMService` → `provider.invoke({ messages, structuredOutput })`.
- **`plugin-ai-column`**: AI → field (text/number/select, image/PDF/audio, TTS/STT).

→ Vòng **"sinh code → validate → retry-with-error"** đã chạy thật. Kế hoạch này = **nhân khuôn đó** ra mọi surface nhập code.

---

## 2. Kết quả quét — bản đồ surface nhập code

### Nhóm A — Code thô (HTML/CSS/JS) · rào cản cao nhất · **ưu tiên 1**

| Plugin | User viết gì | Code chạy ở đâu (sink) | Validate bằng | File chính |
|---|---|---|---|---|
| **block-custom-html** | HTML template + **JS expr** + **JS block** + scoped CSS | `new Function(...)` (`client/render.ts:348,382`), `dangerouslySetInnerHTML` (`registerBlock.tsx:84`) | render trong sandbox iframe, thu lỗi console | `render.ts`, `HtmlCodeEditor.tsx`, `registerBlock.tsx` |
| **data-visualization-echarts-pro** | **JS transform** + **raw `option`** override | `new Function('data','echarts',code)` + `new Function('echarts','return('+text+')')` (`common/makeChart.tsx:15,29`) | `echarts.init` off-screen render → bắt throw | `makeChart.tsx` |
| **print-template** | **Handlebars** body + CSS + filename template + partial (reusable block) | `hb.compile(...)` (`shared/printService.ts:100`), `renderTemplateParts` | compile + render **record mẫu** → bắt lỗi | `TemplateManager.tsx`, `printService.ts`, `helpers.ts`, `GrapesBodyEditor.tsx`, `HelperDocs.tsx` |
| **login-lite** | **`leftHtml`** — HTML tùy biến panel trái trang login | `dangerouslySetInnerHTML` (`client-v2/index.tsx:230`, `client/CustomAuthLayout.tsx:169`); schema `client/schemas/home.ts:154` | render preview | `home.ts`, `CustomAuthLayout.tsx` |

### Nhóm B — Formula / biểu thức · **đã có AI, chỉ mở rộng**

| Plugin | User viết gì | Sink | Validate | Ghi chú |
|---|---|---|---|---|
| **formula** | biểu thức Excel-style (field / column / **default value** / computed) | `new Function('data','value','record',…)` (`shared/formulaEngine.ts:355`) | `testFormula` (đã có) | Nút AI hiện chỉ ở **computed**. Việc còn lại: gắn cùng nút cho field / column / default-value (rẻ, helper sẵn) |

### Nhóm C — Token template `{{field | format}}` · rào cản nhẹ · **ưu tiên 3**

| Plugin | User viết gì | Validate | File |
|---|---|---|---|
| **global-search** | `titleTemplate` (`{{customer.name}}`, `{{price \| number:2}}`) + template URL đích | `fillTemplate(tpl, row)` với row mẫu; cảnh báo token không tồn tại | `shared/config.ts:13,134,155`, `shared/Settings.tsx` |

> ⚠️ **Đính chính**: global-search **không phải "custom HTML"** như tưởng — nó là **token template** (nội suy field + filter format). Nhẹ hơn HTML/JS thô, nhưng vẫn là target codegen hợp lệ (AI ghép token từ danh sách field).
> Chuẩn token `{{field}}` này dùng chung ở global-search + field-enhancements (xem `PLUGIN-REGISTRY.md` mục template token).

### Nhóm D — **KHÔNG phải** code-input (structured config → tự sinh code) · track riêng

Các plugin này **không cho gõ code thô** — user thao tác qua picker/rule-builder, plugin tự sinh CSS/JSON.
Đây là track **"AI sinh config"** (helper thứ 2, mục 4-P4), tách khỏi codegen:

- **branding** — picker màu/gradient → `injectSkin(css)` / `injectTypographyCss(css)` (`shared/skin.tsx:265`, `typography.tsx:108`). **Không có ô CSS thô.**
- **conditional-format** — rule builder (điều kiện → style).
- **custom-icons** — icon picker + remap.
- **status-flow** — state-machine builder.
- **field-enhancements** — widget no-code (RunJS snippet là bản dựng sẵn của plugin, **không phải user tự viết**); góc AI = **Value tag** (map value → {màu, icon}).

---

## 3. Thiết kế: **một** helper chung `@tuanla90/shared/ai/aiCodegen`

Theo rule R1/R2 (reuse `@tuanla90/shared`, không copy-paste): **1 plumbing, N system-prompt + N validator.**

```ts
type CodegenLang = 'html' | 'js' | 'handlebars' | 'echarts-option' | 'formula' | 'token-template';

interface AiCodegenInput {
  language: CodegenLang;
  instruction: string;                 // mô tả NL của user (tiếng Việt)
  current?: string;                    // code hiện tại → chế độ "sửa hộ" thay vì viết mới
  context?: {
    columns?: { name: string; type: string }[];   // schema field / kết quả query
    sampleRows?: any[];                            // vài dòng thật để AI bám sát dữ liệu
    helpers?: string[];                            // vd Handlebars helpers (docso/qr/formatDate…)
    tokens?: string[];                             // vd token hợp lệ cho global-search
  };
  validate: (code: string) => { ok: boolean; error?: string };  // đường render/compile của surface
}
interface AiCodegenResult { code: string; explain: string; triesUsed: number; lastError?: string; }
```

**Vòng lặp** (đúng khuôn `aiWriteFormula`): build prompt theo `language` → `provider.invoke({ structuredOutput: { code, explain } })` → `validate(code)` → nếu `!ok`, thêm `error` vào human message, **retry ≤ 3** → trả kết quả.

**Server**: action mỏng kiểu `ptdlComputed.aiWrite` (ACL `loggedIn`), mỗi plugin gọi helper với `validate` của mình. **Client**: một component chung `<AiCodegenButton>` — nút "✨ AI viết hộ" + ô mô tả + **preview** + nút "Chèn" / "Thử lại". **Không auto-run**, luôn preview trước khi chèn.

### Validate & context theo từng language

| language | validate(code) | context bơm vào |
|---|---|---|
| `echarts-option` | `echarts.init` off-screen `.setOption(code)` → bắt throw | columns + sampleRows của query |
| `handlebars` | `hb.compile(code)` + render record mẫu | fields + `helpers` (HelperDocs) + partial slugs |
| `html` / `js` | render trong iframe sandbox, thu lỗi console/runtime | data-query shape (custom-html) / — (login-lite) |
| `formula` | `testFormula` (đã có) | fields của collection |
| `token-template` | `fillTemplate(code, sampleRow)` không lỗi + cảnh báo token lạ | danh sách field hợp lệ |

---

## 4. Lộ trình (phased)

- **P0 — Nền + POC**: chốt chữ ký `aiCodegen` + `<AiCodegenButton>` chung. POC trên **echarts-pro** (validate rõ nhất, nhu cầu cao nhất): "AI vẽ hộ" → mô tả → sinh `option` → render preview → chèn.
- **P1 — print-template**: ăn theo ngay (đã có `renderTemplateParts` + `HelperDocs` → context xịn). Sinh Handlebars body từ mô tả + field tokens.
- **P2 — block-custom-html**: rộng nhất, validate mờ hơn → **preview-first, cho sửa trong hội thoại**, không one-shot.
- **P3 — mở rộng rẻ**: gắn nút AI cho **formula** field / column / default-value (helper sẵn); **login-lite `leftHtml`** (nhẹ); **global-search** token template.
- **P4 — track "AI sinh config"** (helper thứ 2: NL + schema → JSON config → schema-validate): **gsheet-sync** (map cột ↔ field + infer type), **custom-icons** (gợi ý icon theo nghĩa), **conditional-format** (NL → rule), **field-enhancements Value-tag**, **status-flow**.
  > 🟠 **HOÃN (2026-07-15)** — Tier 2 / P4 chỉ ghi nhận, **chưa ưu tiên**. Đợt hiện tại chỉ làm **Nhóm A + B (5 surface)**. Khi nào xong A+B và chốt được `aiCodegen` thì mới mở helper thứ 2 cho track này.

---

## 5. Rủi ro & nguyên tắc

- **Bảo mật/sandbox giữ nguyên** — block author vốn đã tự viết JS tùy ý; AI **không** mở rộng trust boundary. Không auto-run khi chưa preview.
- **SES strict trên server**: `new Function` trùng tên tham số **throw** (xem `plugin-formula` note VALUE→value); **verify trên server thật**, smoke-test Node/browser không bắt được.
- **Cost/latency**: mỗi retry = 1 call LLM → **cap 3**.
- **HTML validate mờ** (chạy được nhưng "nhìn sai") → **preview + lặp**, không tin one-shot.
- **i18n + shared bắt buộc** (R1/R2): UI song ngữ, dùng chung `@tuanla90/shared`.

---

## 6. Checklist surface (để không sót)

- [x] **Nền tảng** — `@tuanla90/shared` `AiCodegenButton` (client) + `generateCode`/`ai-server` (server, subpath) + `run-shared-build.sh` + nb-local runtime install. **DONE 2026-07-15.**
- [x] **block-custom-html** — HTML/JS (`HtmlCodeEditor`, validate=`new Function` compile, context=cột+dòng thật). **Wired+deploy+verify (action 401, load sạch).**
- [x] **print-template** — Handlebars (`HtmlEditorArea`→ phủ body/header/footer; validate=`hb.compile+render` với helper set; server enrich field+helper từ collection). **Wired+deploy+verify (action 401).**
- [x] **formula** — field/column (`FormulaCodeInput`, reuse `ptdlComputed:aiWrite`, gated collection+api; default-value không có context → ẩn nút). **Client deploy+verify.**
- [~] **echarts-pro** — **SKIP** (user đồng ý 2026-07-15): Formily nằm trong form plugin data-viz bên thứ 3, khó + rủi ro.
- [~] **login-lite** — **HOÃN**: `leftHtml` là Formily render ở nhiều nơi (đổi x-component dễ vỡ, phải đăng ký mọi chỗ) + giá trị thấp nhất (HTML tĩnh, không data-context) — cùng loại khó như echarts. Làm sau nếu cần.
- [ ] global-search — titleTemplate · URL template  → (Nhóm C, sau A+B)
- [ ] gsheet-sync — column↔field mapping · type infer  → **P4 (config track)**
- [ ] custom-icons — gợi ý icon theo nghĩa  → **P4**
- [ ] conditional-format — NL → rule  → **P4**
- [ ] field-enhancements — Value tag (value→{màu,icon})  → **P4**
- [ ] status-flow — NL → states/transitions  → **P4**
- [x] ~~ai-column~~ — đã là plugin AI
- [x] ~~branding~~ — structured picker, **không có code-input**
