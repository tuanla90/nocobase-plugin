// In-editor reference: every Handlebars helper the renderer registers, with a
// copy-paste-able example. Kept in sync with helpers.ts by hand — update both.
import React from 'react';
import { Button, Space, Table, Tag, Tooltip, message } from 'antd';
import { t } from './i18n';

interface HelperDoc {
  group: string;
  name: string;
  desc: string;
  example: string;
}

const DOCS: HelperDoc[] = [
  // Built-in Handlebars
  { group: 'Cơ bản', name: '{{field}}', desc: 'Giá trị 1 trường; quan hệ dùng chấm', example: '{{client.name}}' },
  { group: 'Cơ bản', name: '#each', desc: 'Lặp danh sách dòng con (appends)', example: '<table>{{#each items}}<tr><td>{{this.product.name}}</td><td>{{this.qty}}</td></tr>{{/each}}</table>' },
  { group: 'Cơ bản', name: '#if / #unless', desc: 'Điều kiện (kết hợp eq/gt/and...)', example: '{{#if (eq status "paid")}}ĐÃ THANH TOÁN{{else}}CHƯA THU{{/if}}' },
  { group: 'Cơ bản', name: '@index', desc: 'Số thứ tự trong #each (từ 0)', example: '{{#each items}}<tr><td>{{add @index 1}}</td></tr>{{/each}}' },
  // Numbers
  { group: 'Số', name: 'formatNumber', desc: 'Định dạng số/tiền tệ/%: format="#,##0₫|$|€|£|%", locale', example: '{{formatNumber total format="#,##0₫"}}' },
  { group: 'Số', name: 'add / subtract / multiply / divide / mod', desc: 'Toán tử 2 ngôi', example: '{{multiply qty price}}' },
  { group: 'Số', name: 'docso / docsoHoa', desc: 'Đọc số thành chữ tiếng Việt (docsoHoa = viết hoa chữ đầu)', example: 'Bằng chữ: {{docsoHoa total}} đồng' },
  // Special
  { group: 'Khác', name: 'qr', desc: 'Sinh mã QR (SVG). size=px, level=L/M/Q/H', example: '{{qr code size=110}}' },
  { group: 'Khác', name: 'Ngắt trang', desc: 'Ép sang trang mới ở vị trí này khi in', example: '<div style="break-before:page"></div>' },
  { group: 'Khác', name: 'Khối chung (partial)', desc: 'Nhúng template "khối chung" theo slug (tạo ở tab Chung)', example: '{{> header_chung}}' },
  // Dates
  { group: 'Ngày giờ', name: 'formatDate', desc: 'Token: DD MM YYYY HH mm ss DDDD MMMM A...', example: '{{formatDate createdAt "DD/MM/YYYY HH:mm"}}' },
  { group: 'Ngày giờ', name: 'now', desc: 'Thời điểm in', example: 'In lúc {{now "HH:mm DD/MM/YYYY"}}' },
  // Comparison / logic
  { group: 'So sánh', name: 'eq / ne / gt / lt / gte / lte', desc: 'So sánh — dùng trong #if', example: '{{#if (gte total 1000000)}}<b>Khách VIP</b>{{/if}}' },
  { group: 'So sánh', name: 'and / or', desc: 'Logic nhiều điều kiện', example: '{{#if (and paid (gt total 0))}}✔{{/if}}' },
  // Strings
  { group: 'Chuỗi', name: 'uppercase / lowercase / capitalize / proper', desc: 'Đổi hoa-thường', example: '{{uppercase client.name}}' },
  { group: 'Chuỗi', name: 'concat', desc: 'Nối chuỗi', example: '{{concat code " - " client.name}}' },
  { group: 'Chuỗi', name: 'regexReplace', desc: 'Thay theo regex (g)', example: '{{regexReplace phone "^84" "0"}}' },
  { group: 'Chuỗi', name: 'regexExtract', desc: 'Trích theo regex (group index)', example: '{{regexExtract email "^[^@]+"}}' },
  // SQL (alasql — tương đương {[ path | SQL | format ]} và [[ path | SQL ]] bên Google Doc merge)
  { group: 'SQL', name: 'sql (giá trị đơn)', desc: 'Query trả 1 dòng 1 cột → ra thẳng giá trị. FROM ? = mảng truyền vào', example: '{{formatNumber (sql "SELECT SUM(total_cost) FROM ?" items) format="#,##0₫"}}' },
  { group: 'SQL', name: '#sql (lặp dòng)', desc: 'Query trả nhiều dòng → lặp như #each (có @index/@first/@last). Aggregate + GROUP BY', example: '{{#sql "SELECT document_name, SUM(quantity) AS qty, SUM(total_cost) AS total FROM ? GROUP BY document_name" items}}<tr><td>{{add @index 1}}</td><td>{{document_name}}</td><td>{{qty}}</td><td>{{formatNumber total format="#,##0₫"}}</td></tr>{{/sql}}' },
  { group: 'SQL', name: '#sql (lọc + sắp xếp)', desc: 'WHERE / ORDER BY / LIMIT như SQL thường', example: '{{#sql "SELECT * FROM ? WHERE fee_type = \'Solicitor Fees\' ORDER BY total_cost DESC" items}}<tr><td>{{document_name}}</td></tr>{{/sql}}' },
  { group: 'SQL', name: 'sql (CASE WHEN...)', desc: 'Biến đổi giá trị, nối chuỗi, NOW()...', example: '{{sql "SELECT CASE WHEN SUM(amount)>=1000000 THEN \'VIP\' ELSE \'Thường\' END FROM ?" items}}' },
  // Arrays (kết hợp pluck để tính trên dòng con)
  { group: 'Mảng', name: 'pluck', desc: 'Rút 1 cột từ danh sách object → mảng', example: '{{arraySum (pluck items "amount")}}' },
  { group: 'Mảng', name: 'arraySum / arrayAvg / arrayMax / arrayMin', desc: 'Tổng hợp trên mảng số', example: 'Tổng: {{formatNumber (arraySum (pluck items "amount")) format="#,##0₫"}}' },
  { group: 'Mảng', name: 'arrayLength', desc: 'Số phần tử', example: '{{arrayLength items}} dòng' },
  { group: 'Mảng', name: 'arrayJoin', desc: 'Nối mảng thành chuỗi', example: '{{arrayJoin (pluck items "product.name") ", "}}' },
  { group: 'Mảng', name: 'arrayUnique / arrayReverse / arrayGet / arrayIncludes', desc: 'Khử trùng / đảo / lấy phần tử i / chứa?', example: '{{arrayGet (pluck items "sku") 0}}' },
];

const GROUP_COLOR: Record<string, string> = {
  'Cơ bản': 'blue',
  'Số': 'green',
  'Ngày giờ': 'purple',
  'So sánh': 'orange',
  'Chuỗi': 'cyan',
  'SQL': 'red',
  'Khác': 'gold',
  'Mảng': 'magenta',
};

/** onInsert: khi có, mỗi dòng thêm nút "Chèn" đưa ví dụ thẳng vào vị trí con trỏ của editor. */
export const HelperDocs: React.FC<{ onInsert?: (text: string) => void }> = ({ onInsert }) => (
  <Table
    rowKey={(r) => r.name}
    size="small"
    pagination={false}
    dataSource={DOCS}
    columns={[
      {
        title: t('Nhóm'),
        dataIndex: 'group',
        width: 84,
        // Keep the raw VN group as the stable filter value + GROUP_COLOR key; translate only for display.
        filters: [...new Set(DOCS.map((d) => d.group))].map((g) => ({ text: t(g), value: g })),
        onFilter: (v, r) => r.group === v,
        render: (g: string) => <Tag color={GROUP_COLOR[g]}>{t(g)}</Tag>,
      },
      {
        title: 'Helper',
        dataIndex: 'name',
        width: 170,
        render: (v: string, r) => (
          <Tooltip title={t(r.desc)}>
            {/* names that are pure Handlebars syntax (contain {{…}}) must NOT go through i18next
                interpolation — show them verbatim; descriptive names (Ngắt trang, …) are translated. */}
            <code style={{ fontSize: 12 }}>{String(v).includes('{{') ? v : t(v)}</code>
          </Tooltip>
        ),
      },
      {
        title: t('Ví dụ (Copy để dán / Chèn vào con trỏ)'),
        dataIndex: 'example',
        render: (v: string) => (
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <code style={{ fontSize: 12, whiteSpace: 'pre-wrap', flex: 1, wordBreak: 'break-all' }}>{v}</code>
            <Space size={4} style={{ flexShrink: 0 }}>
              <Button
                size="small"
                onClick={() => {
                  navigator.clipboard?.writeText(v).then(
                    () => message.success(t('Đã copy')),
                    () => message.warning(t('Không copy được — chọn tay giúp')),
                  );
                }}
              >
                Copy
              </Button>
              {onInsert && (
                <Button size="small" type="primary" ghost onClick={() => onInsert(v)}>
                  {t('Chèn')}
                </Button>
              )}
            </Space>
          </div>
        ),
      },
    ]}
  />
);
