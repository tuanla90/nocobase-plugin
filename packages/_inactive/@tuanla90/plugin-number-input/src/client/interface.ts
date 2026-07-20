import { NumberFieldInterface } from '@nocobase/client';

const NS = '@tuanla90/plugin-number-input';

/**
 * A field interface that behaves like the built-in "Number" field, but uses a
 * live-formatted input component (thousands separator while typing) and exposes
 * per-field settings: separator style, decimal places, prefix and suffix.
 *
 * We extend NumberFieldInterface so we inherit all of its proven plumbing
 * (field name / display name / data type / unique / operators / validation),
 * and only swap the edit component + add our own component-prop settings.
 */
export class FormatNumberFieldInterface extends NumberFieldInterface {
  constructor(manager: any) {
    super(manager);

    this.name = 'formattedNumber';
    this.order = 26;
    this.title = `{{t("Formatted number", { ns: "${NS}" })}}`;

    this.default = {
      type: 'double',
      uiSchema: {
        type: 'number',
        'x-component': 'FormatNumberInput',
        'x-component-props': {
          separatorStyle: 'comma',
          precision: 0,
          prefix: '',
          suffix: '',
        },
      },
    } as any;

    // Start from the inherited Number settings, drop the ones that don't apply
    // to our component (its own step/precision/scale are replaced by ours),
    // then append our four component-prop settings.
    const inherited: any = { ...(this as any).properties };
    delete inherited.precision;
    delete inherited.scale;
    delete inherited['uiSchema.x-component-props.step'];

    (this as any).properties = {
      ...inherited,
      'uiSchema.x-component-props.separatorStyle': {
        type: 'string',
        title: `{{t("Separator style", { ns: "${NS}" })}}`,
        'x-decorator': 'FormItem',
        'x-component': 'Select',
        default: 'comma',
        enum: [
          { value: 'comma', label: '1,234,567.89' },
          { value: 'dot', label: '1.234.567,89' },
        ],
      },
      'uiSchema.x-component-props.precision': {
        type: 'number',
        title: `{{t("Decimal places", { ns: "${NS}" })}}`,
        'x-decorator': 'FormItem',
        'x-component': 'InputNumber',
        'x-component-props': { min: 0, max: 10, step: 1 },
        default: 0,
      },
      'uiSchema.x-component-props.prefix': {
        type: 'string',
        title: `{{t("Prefix", { ns: "${NS}" })}}`,
        'x-decorator': 'FormItem',
        'x-component': 'Input',
      },
      'uiSchema.x-component-props.suffix': {
        type: 'string',
        title: `{{t("Suffix", { ns: "${NS}" })}}`,
        'x-decorator': 'FormItem',
        'x-component': 'Input',
      },
    };
  }
}

export default FormatNumberFieldInterface;
