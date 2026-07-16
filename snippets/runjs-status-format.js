// ============ CẤU HÌNH — đặt RunJS này LÊN CỘT "status" ============
// key viết THƯỜNG. Nếu status là field Select có value khác thì sửa key cho khớp.
const MAP = {
  success: { color: '#16a34a', bg: 'rgba(22,163,74,0.12)', icon: 'check', label: 'Success' },
  fail:    { color: '#dc2626', bg: 'rgba(220,38,38,0.12)', icon: 'x',     label: 'Fail' },
};
// =================================================================

function StatusCell() {
  const React = ctx.React;

  // Lấy giá trị status: ưu tiên value của chính field; fallback đọc từ record
  let raw = ctx.getValue?.();
  if ((raw == null || raw === '') && ctx.record) raw = ctx.record.status;
  // GỠ LỖI: bỏ // ở dòng dưới để xem ctx cung cấp gì (mở Console F12) nếu ô hiện "—"
  // console.log('[status] value=', ctx.getValue?.(), ' record=', ctx.record, ' keys=', Object.keys(ctx));

  const cfg = MAP[String(raw ?? '').trim().toLowerCase()];
  if (!cfg) return <span style={{ color: '#999' }}>{raw == null || raw === '' ? '—' : String(raw)}</span>;

  // Icon Lucide vẽ thẳng bằng SVG (không cần plugin icon)
  const svgProps = {
    width: '1em', height: '1em', viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
    style: { flexShrink: 0 },
  };
  const icon = cfg.icon === 'check'
    ? <svg {...svgProps}><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></svg>
    : <svg {...svgProps}><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></svg>;

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      color: cfg.color, fontWeight: 600, background: cfg.bg,
      borderRadius: 999, padding: '2px 10px', lineHeight: 1.7,
    }}>
      {icon}{cfg.label}
    </span>
  );
}

ctx.render(<StatusCell />);
