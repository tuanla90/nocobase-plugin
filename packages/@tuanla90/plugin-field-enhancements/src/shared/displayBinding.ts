import { DisplayItemModel } from '@nocobase/flow-engine';

/**
 * Đăng ký 1 DISPLAY field model (cho detail / table / enhanced-table / list — tất cả dùng DisplayItemModel).
 * Editable & display là 2 class riêng trong v2; class này render CHỈ hiển thị (không input), tái dùng view + settings flow
 * của bản editable. Trả về class đã tạo.
 */
export function bindDisplayField(opts: {
  flowEngine: any;
  name: string;
  Base: any;
  interfaces: string[];
  label?: string;
  render: (props: any, model: any) => any;
  flow?: any;
}) {
  const { flowEngine, name, Base, interfaces, label, render, flow } = opts;
  if (!flowEngine || !Base) return null;

  const Cls = class extends Base {
    render() {
      const model: any = this;
      return render(model.props || {}, model);
    }
    // Bake value TRỰC TIẾP không mutate props CHUNG. Spreadsheet-view render N ô/1 model → gọi
    // renderComponent(value) cho từng ô; nếu thay bằng setProps lúc React render (mutate state chung) thì
    // mọi ô lẫn value của nhau = "nháy màu loạn" (verified trên cột select-buttons). Thiếu value → props.value.
    // NocoBase detail/table đi qua render() (đã override ở trên) nên KHÔNG đụng path này.
    renderComponent(value?: any, _wrap?: any) {
      const model: any = this;
      const props = model.props || {};
      return render({ ...props, value: value !== undefined ? value : props.value }, model);
    }
  };
  try { Object.defineProperty(Cls, 'name', { value: name }); } catch (_) { /* ignore */ }

  flowEngine.registerModels({ [name]: Cls });
  if (label) { try { (Cls as any).define?.({ label }); } catch (_) { /* ignore */ } }
  if (flow) { try { (Cls as any).registerFlow(flow); } catch (e) { /* eslint-disable-next-line no-console */ console.warn('[field-enh] display flow failed', name, e); } }

  try {
    (DisplayItemModel as any)?.bindModelToInterface?.(name, interfaces, { isDefault: false });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[field-enh] display bind failed', name, e);
  }
  return Cls;
}
