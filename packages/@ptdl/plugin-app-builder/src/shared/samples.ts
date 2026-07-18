/** Golden sample App-Specs — hand-authored demos that double as few-shot exemplars (P2) and the
 *  round-trip corpus (P1). Collection names are prefixed `ab_` so a demo build never clobbers a
 *  user's real collections. */
import { AppSpec } from './appSpec';

/** "Bán hàng" — customers · products · orders (+ line items). Shows m2o + o2m relations, seed with
 *  relation resolution, an EnhancedTable page, and a Progress-bar widget on the order total. */
export const SAMPLE_BAN_HANG: AppSpec = {
  meta: { name: 'Bán hàng (demo)', locale: 'vi' },
  collections: [
    {
      name: 'ab_customers', title: 'Khách hàng', titleField: 'name',
      fields: [
        { name: 'name', title: 'Tên khách', interface: 'input', required: true },
        { name: 'phone', title: 'Điện thoại', interface: 'phone' },
        { name: 'tier', title: 'Hạng', interface: 'select', options: ['VIP', 'Thường'] },
      ],
      seed: [
        { name: 'Công ty An Phát', phone: '0901000001', tier: 'VIP' },
        { name: 'Cửa hàng Bình Minh', phone: '0901000002', tier: 'Thường' },
        { name: 'Siêu thị Cầu Vồng', phone: '0901000003', tier: 'VIP' },
      ],
    },
    {
      name: 'ab_products', title: 'Sản phẩm', titleField: 'name',
      fields: [
        { name: 'name', title: 'Tên sản phẩm', interface: 'input', required: true },
        { name: 'price', title: 'Đơn giá', interface: 'number' },
      ],
      seed: [
        { name: 'Bàn phím cơ', price: 850000 },
        { name: 'Chuột không dây', price: 320000 },
        { name: 'Màn hình 24"', price: 2600000 },
      ],
    },
    {
      name: 'ab_orders', title: 'Đơn hàng', titleField: 'code',
      fields: [
        { name: 'code', title: 'Mã đơn', interface: 'input', required: true, unique: true },
        { name: 'orderDate', title: 'Ngày đặt', interface: 'datetime' },
        {
          name: 'status', title: 'Trạng thái', interface: 'statusFlow',
          // Rich, AI-designed flow (item 1): explicit kind/color per status + a branching transitions map
          // (confirm/ship forward, cancel from any in-flight status) instead of a naive linear chain.
          states: [
            { label: 'Nháp', kind: 'init', color: 'default' },
            { label: 'Đã xác nhận', kind: 'doing', color: 'processing' },
            { label: 'Đang giao', kind: 'doing', color: 'warning' },
            { label: 'Hoàn tất', kind: 'done', color: 'success' },
            { label: 'Đã huỷ', kind: 'fail', color: 'error' },
          ],
          transitions: {
            'Nháp': ['Đã xác nhận', 'Đã huỷ'],
            'Đã xác nhận': ['Đang giao', 'Đã huỷ'],
            'Đang giao': ['Hoàn tất', 'Đã huỷ'],
          },
        },
        { name: 'total', title: 'Tổng tiền', interface: 'number' },
        { name: 'progress', title: 'Tiến độ (%)', interface: 'integer', widget: 'Progress bar' },
      ],
      relations: [
        { name: 'customer', type: 'm2o', target: 'ab_customers', title: 'Khách hàng' },
        { name: 'items', type: 'o2m', target: 'ab_order_items', reverseName: 'order', title: 'Dòng hàng' },
      ],
      // status omitted from seed: the status-flow server hook locks new records to the initial status ('Nháp').
      seed: [
        { code: 'DH-001', total: 1170000, progress: 100, customer: 'Công ty An Phát' },
        { code: 'DH-002', total: 2600000, progress: 60, customer: 'Siêu thị Cầu Vồng' },
        { code: 'DH-003', total: 320000, progress: 10, customer: 'Cửa hàng Bình Minh' },
      ],
    },
    {
      name: 'ab_order_items', title: 'Dòng hàng', titleField: 'id',
      fields: [
        { name: 'qty', title: 'Số lượng', interface: 'integer' },
        { name: 'price', title: 'Đơn giá', interface: 'number' },
        // computed column via @ptdl/plugin-formula — auto = qty × price (data.<field> syntax)
        { name: 'line_total', title: 'Thành tiền', interface: 'number', computed: { expression: 'data.qty * data.price', kind: 'stored' } },
      ],
      relations: [
        { name: 'order', type: 'm2o', target: 'ab_orders', title: 'Đơn hàng' },
        { name: 'product', type: 'm2o', target: 'ab_products', title: 'Sản phẩm' },
      ],
      seed: [
        { qty: 1, price: 850000, order: 'DH-001', product: 'Bàn phím cơ' },
        { qty: 1, price: 320000, order: 'DH-001', product: 'Chuột không dây' },
        { qty: 1, price: 2600000, order: 'DH-002', product: 'Màn hình 24"' },
        { qty: 1, price: 320000, order: 'DH-003', product: 'Chuột không dây' },
      ],
    },
  ],
  pages: [
    { title: 'Khách hàng', collection: 'ab_customers', menuGroup: 'Danh mục', icon: 'lucide-users', columns: ['name', 'phone', 'tier'] },
    { title: 'Sản phẩm', collection: 'ab_products', menuGroup: 'Danh mục', icon: 'lucide-package', columns: ['name', 'price'] },
    {
      title: 'Đơn hàng', collection: 'ab_orders', menuGroup: 'Vận hành', icon: 'lucide-shopping-cart',
      block: 'EnhancedTableBlockModel',
      columns: ['code', 'customer', 'status', 'total', 'progress'],
      popupColumns: ['code', 'customer', 'orderDate', 'status', 'total', 'progress', 'items'],
    },
  ],
  menu: { groups: [{ label: 'Danh mục', icon: 'lucide-folder', order: 1 }, { label: 'Vận hành', icon: 'lucide-workflow', order: 2 }] },
};

export const SAMPLES: Record<string, AppSpec> = { banHang: SAMPLE_BAN_HANG };
