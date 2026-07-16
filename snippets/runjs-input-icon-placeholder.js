/**
 * Input icon + placeholder-from-title — Run JS (JS field trong Form Create/Edit)
 * Thêm icon lucide vào prefix của Input/Input.Password và tự set placeholder = tiêu đề field
 * (ctx.collectionField.title) thay vì hiện label phía trên — giống mẫu login (icon user/lock trong ô input).
 *
 * Cách dùng: field trong Form → menu field → "JS field" → dán code này (thay code mặc định) → chỉnh CONFIG.
 * Để giống ảnh mẫu 100%: mở thêm "Form item settings" > "Show label" của field này và TẮT đi (bước có sẵn
 * của NocoBase, không cần code) — placeholder sẽ đóng vai trò label.
 */

// ================== CẤU HÌNH ==================
const ICON = 'user'; // tên icon lucide, bare kebab (vd 'user', 'lock', 'mail', 'phone')
const ICON_SIZE = 16;
const ICON_COLOR = '#8c8c8c';
const USE_TITLE_AS_PLACEHOLDER = true; // true: placeholder = ctx.collectionField.title
const PLACEHOLDER_OVERRIDE = ''; // không rỗng thì dùng chuỗi này thay vì title
const IS_PASSWORD = false; // true: dùng Input.Password (ẩn ký tự, có icon mắt của antd)
// ==============================================

function InputWithIcon() {
  const React = ctx.React;
  const { Input } = ctx.antd;
  const { useState, useEffect } = React;
  const [value, setValue] = useState(ctx.getValue?.() ?? '');
  const [iconHtml, setIconHtml] = useState('');

  useEffect(() => {
    const handler = (ev) => setValue(ev?.detail ?? '');
    ctx.element?.addEventListener('js-field:value-change', handler);
    return () => ctx.element?.removeEventListener('js-field:value-change', handler);
  }, []);

  // Icon lucide qua CDN — RunJS không đọc được registry icon nội bộ của @nocobase/client-v2,
  // đây là cách đúng cho RunJS (xem docs/ICON-ARCHITECTURE.md). Version khớp lucide-react mà
  // @ptdl/plugin-custom-icons pin (0.469.0).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const lucide = await ctx.requireAsync('lucide@0.469.0/dist/umd/lucide.min.js');
        const pascal = ICON.split('-')
          .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
          .join('');
        const iconNode = lucide.icons[pascal];
        if (!iconNode) throw new Error(`Không tìm thấy icon lucide: ${ICON}`);
        const el = lucide.createElement(iconNode);
        el.setAttribute('width', ICON_SIZE);
        el.setAttribute('height', ICON_SIZE);
        el.setAttribute('stroke', ICON_COLOR);
        if (!cancelled) setIconHtml(el.outerHTML);
      } catch (e) {
        if (!cancelled) setIconHtml('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onChange = (e) => {
    const v = e?.target?.value ?? '';
    setValue(v);
    ctx.setValue?.(v);
  };

  const placeholder =
    PLACEHOLDER_OVERRIDE || (USE_TITLE_AS_PLACEHOLDER ? ctx.collectionField?.title || '' : undefined);

  const prefix = iconHtml ? (
    <span style={{ display: 'inline-flex', lineHeight: 0 }} dangerouslySetInnerHTML={{ __html: iconHtml }} />
  ) : null;

  if (ctx.readOnly) {
    return <span>{String(value ?? '')}</span>;
  }

  const InputComp = IS_PASSWORD ? Input.Password : Input;

  return <InputComp value={value} onChange={onChange} placeholder={placeholder} prefix={prefix} disabled={ctx.disabled} />;
}

ctx.render(<InputWithIcon />);
