import React from 'react';
import { InputNumber } from 'antd';
import { connect, mapProps, mapReadPretty } from '@formily/react';

/**
 * Live-formatted number input.
 *
 * Wraps antd <InputNumber/> and uses its built-in `formatter` / `parser`
 * so the thousands separator appears WHILE the user types, while the value
 * stored in the record stays a plain number.
 */

export type SeparatorStyle = 'comma' | 'dot';

export interface FormatNumberProps {
  value?: number | string;
  onChange?: (v: number | string | null) => void;
  /**
   * 'comma' -> 1,234,567.89  (thousands ",", decimal ".")
   * 'dot'   -> 1.234.567,89  (thousands ".", decimal ",")  (Vietnamese standard)
   */
  separatorStyle?: SeparatorStyle;
  /** number of decimal places; 0 or undefined = integer */
  precision?: number;
  prefix?: string;
  suffix?: string;
  disabled?: boolean;
  placeholder?: string;
}

const sepOf = (style: SeparatorStyle = 'comma') =>
  style === 'dot' ? { thousand: '.', decimal: ',' } : { thousand: ',', decimal: '.' };

const buildFormatter =
  ({ separatorStyle, prefix = '', suffix = '' }: FormatNumberProps) =>
  (val?: string | number) => {
    if (val === undefined || val === null || val === '') return '';
    const { thousand, decimal } = sepOf(separatorStyle);
    const str = String(val);
    const neg = str.trim().startsWith('-');
    const [intRaw, frac] = str.replace('-', '').split('.');
    const intPart = (intRaw || '0').replace(/\B(?=(\d{3})+(?!\d))/g, thousand);
    let out = intPart;
    if (frac !== undefined && frac !== '') out += decimal + frac;
    return `${neg ? '-' : ''}${prefix}${out}${suffix}`;
  };

const buildParser =
  ({ separatorStyle, prefix = '', suffix = '' }: FormatNumberProps) =>
  (val?: string) => {
    if (!val) return '';
    const { thousand, decimal } = sepOf(separatorStyle);
    let v = val;
    if (prefix) v = v.split(prefix).join('');
    if (suffix) v = v.split(suffix).join('');
    v = v.split(thousand).join(''); // strip thousands separators
    if (decimal !== '.') v = v.split(decimal).join('.'); // normalize decimal to "."
    return v.replace(/[^\d.-]/g, '');
  };

const Editable: React.FC<FormatNumberProps> = (props) => {
  const { value, onChange, precision, disabled, placeholder } = props;
  return (
    <InputNumber
      style={{ width: '100%' }}
      value={value as any}
      onChange={onChange as any}
      disabled={disabled}
      placeholder={placeholder}
      controls={false}
      precision={typeof precision === 'number' && precision >= 0 ? precision : undefined}
      formatter={buildFormatter(props) as any}
      parser={buildParser(props) as any}
    />
  );
};

const ReadPretty: React.FC<FormatNumberProps> = (props) => {
  const { value } = props;
  if (value === undefined || value === null || (value as any) === '') return <span />;
  return <span>{buildFormatter(props)(value as any)}</span>;
};

export const FormatNumberInput = connect(Editable, mapProps({}), mapReadPretty(ReadPretty));

export default FormatNumberInput;
