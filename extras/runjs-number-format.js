// =================== CẤU HÌNH (sửa tuỳ field) ===================
const STYLE    = 'comma'; // 'comma' => 1,234,567.89 | 'dot' => 1.234.567,89 (chuẩn VN)
const DECIMALS = 0;       // số chữ số thập phân (0 = số nguyên)
const PREFIX   = '';      // tiền tố, vd '₫ '
const SUFFIX   = '';      // hậu tố, vd ' đ' hoặc ' %'
// ===============================================================

function NumberFormatField() {
  const React = ctx.React;
  const { InputNumber } = ctx.antd;
  const [value, setValue] = React.useState(ctx.getValue?.() ?? null);

  // Đồng bộ khi giá trị bị đổi từ bên ngoài (reset form, nạp record...)
  React.useEffect(() => {
    const handler = (ev) => setValue(ev?.detail ?? null);
    ctx.element?.addEventListener('js-field:value-change', handler);
    return () => ctx.element?.removeEventListener('js-field:value-change', handler);
  }, []);

  const S = STYLE === 'dot' ? { t: '.', d: ',' } : { t: ',', d: '.' };

  const format = (val) => {
    if (val === undefined || val === null || val === '') return '';
    const s = String(val);
    const neg = s.trim().startsWith('-');
    const p = s.replace('-', '').split('.');
    const intPart = (p[0] || '0').replace(/\B(?=(\d{3})+(?!\d))/g, S.t);
    let out = intPart;
    if (p[1] !== undefined && p[1] !== '') out += S.d + p[1];
    return (neg ? '-' : '') + PREFIX + out + SUFFIX;
  };

  const parse = (val) => {
    if (!val) return '';
    let v = String(val);
    if (PREFIX) v = v.split(PREFIX).join('');
    if (SUFFIX) v = v.split(SUFFIX).join('');
    v = v.split(S.t).join('');                   // bỏ ngăn cách nghìn
    if (S.d !== '.') v = v.split(S.d).join('.');  // đưa dấu thập phân về '.'
    return v.replace(/[^\d.-]/g, '');
  };

  if (ctx.readOnly) return <span>{format(value)}</span>;

  return (
    <InputNumber
      style={{ width: '100%' }}
      value={value}
      onChange={(v) => { setValue(v); ctx.setValue?.(v); }}
      disabled={ctx.disabled}
      controls={false}
      precision={DECIMALS}
      formatter={format}
      parser={parse}
    />
  );
}

ctx.render(<NumberFormatField />);
