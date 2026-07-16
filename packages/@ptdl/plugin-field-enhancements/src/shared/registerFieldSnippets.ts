import { registerRunJSSnippet } from '@nocobase/flow-engine';
import { FIELD_SNIPPETS } from './generatedSnippets';

/**
 * Đăng ký toàn bộ snippet field vào registry của RunJS editor (flow-engine). Sau khi đăng ký, chúng hiện
 * trong bảng chọn snippet của code editor khi mở JS field/column/field — lọc theo `contexts` (chỉ hiện đúng
 * loại field). `registerRunJSSnippet` idempotent (ref đã có → bỏ qua) nên gọi ở cả 2 lane đều an toàn.
 *
 * API + `SnippetModule` shape: memory runjs-snippet-registry-native.
 */
export function registerFieldSnippets(): void {
  for (const s of FIELD_SNIPPETS) {
    registerRunJSSnippet(s.ref, () =>
      Promise.resolve({
        default: {
          contexts: s.contexts,
          prefix: s.prefix,
          label: s.label,
          description: s.description,
          content: s.content,
        },
      }),
    );
  }
}
