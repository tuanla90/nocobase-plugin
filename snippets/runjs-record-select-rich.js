/**
 * Rich association select — Run JS (JS field, thay cho "Dropdown select" mặc định của field quan hệ m2o/o2o/o2m/m2m)
 * Mỗi option hiển thị nhiều thông tin hơn 1 dòng chữ:
 *
 *   [Avatar][Tên]                                     [Active icon]
 *   [      ][Chức vụ]
 *
 * - Cột trái: avatar (căn trên, dùng chữ cái đầu của tên nếu không có ảnh)
 * - Cột phải, dòng 1: tên + icon trạng thái active (nếu bật)
 * - Cột phải, dòng 2: chức vụ (dòng phụ, màu xám nhạt)
 * Ô đóng / tag (khi chưa mở dropdown) hiện gọn avatar + tên (không icon/chức vụ) cho đỡ rối.
 *
 * QUAN TRỌNG — đây là field quan hệ (association), khác field chọn giá trị đơn thuần:
 * - Bảng phụ + field khoá TỰ LẤY từ field hiện tại (`ctx.collectionField.target` / `.targetCollection.filterTargetKey`),
 *   không cần khai TARGET_COLLECTION/VALUE_FIELD tay — đúng bảng quan hệ đã cấu hình ở Collection, không hard-code.
 * - Value ghi vào form là NGUYÊN RECORD (object) đã chọn — vd `{id, nickname, avatar, position, status}` — chứ KHÔNG
 *   phải chỉ mỗi id, giống đúng cách field "Dropdown select" gốc của NocoBase lưu (xem RecordSelectFieldModel.tsx,
 *   Select dùng labelInValue/lưu cả option). Field kiểu m2m/o2m tự chuyển sang mode nhiều (mảng record).
 * - Nếu record NocoBase trả về ban đầu (appends) thiếu field hiển thị (vd chỉ có id) → tự fetch bổ sung 1 lần khi mount.
 *
 * Cách dùng: field quan hệ trong Form → menu field → "JS field" → dán code này → chỉnh LABEL_FIELD/SUBTITLE_FIELD/
 * AVATAR_FIELD/ACTIVE_FIELD cho khớp cột thật của bảng đích.
 */

// ================== CẤU HÌNH ==================
const LABEL_FIELD = 'nickname'; // tên hiển thị chính (dòng 1)
const SUBTITLE_FIELD = 'position'; // chức vụ (dòng 2) — để '' nếu không có field này
const AVATAR_FIELD = 'avatar'; // field ảnh — hỗ trợ url string, hoặc object/array attachment {url}
const ACTIVE_FIELD = 'status'; // field boolean — hiện icon khi true, để '' nếu không cần icon trạng thái
const SEARCH_FIELD = LABEL_FIELD; // field dùng để lọc khi gõ tìm kiếm (server-side, kiểu $includes)
const APPENDS = []; // quan hệ cần appends thêm (vd AVATAR_FIELD là field quan hệ riêng của bảng đích thì thêm vào đây)
const PAGE_SIZE = 30;
const PLACEHOLDER = 'Chọn...';
const ACTIVE_ICON = 'circle-check'; // tên icon lucide (bare kebab)
const ACTIVE_ICON_COLOR = '#52c41a';
const AVATAR_SIZE = 32;
// Override thủ công — để trống ('') thì tự lấy theo field quan hệ hiện tại (khuyến nghị, không cần đụng vào)
const TARGET_COLLECTION_OVERRIDE = '';
const VALUE_FIELD_OVERRIDE = '';
const MULTIPLE_OVERRIDE = null; // null = tự nhận theo collectionField.type (m2m/o2m → nhiều; m2o/o2o → 1)
// ==============================================

const DEBUG = false; // bật true để log ra console: target collection, valueField, kết quả fetch — dùng khi field không hiện gì

const targetCollectionName = TARGET_COLLECTION_OVERRIDE || ctx.collectionField?.target;
const valueField = VALUE_FIELD_OVERRIDE || ctx.collectionField?.targetCollection?.filterTargetKey || 'id';
const isMultiple =
  MULTIPLE_OVERRIDE ?? ['belongsToMany', 'hasMany', 'belongsToArray'].includes(ctx.collectionField?.type);

if (DEBUG) {
  console.log('[runjs-record-select-rich] collectionField:', ctx.collectionField);
  console.log('[runjs-record-select-rich] targetCollectionName:', targetCollectionName, 'valueField:', valueField, 'isMultiple:', isMultiple);
}

function avatarSrc(record) {
  const v = record?.[AVATAR_FIELD];
  if (!v) return undefined;
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v[0]?.url;
  return v.url;
}

function RichAssociationSelect() {
  const React = ctx.React;
  const { Select, Avatar, Spin, Empty } = ctx.antd;
  const { useState, useEffect, useRef, useCallback } = React;

  const [value, setValue] = useState(ctx.getValue?.() ?? (isMultiple ? [] : undefined));
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIconHtml, setActiveIconHtml] = useState('');
  const recordsRef = useRef(new Map()); // String(valueField) -> record, dùng cho optionRender/readOnly/hydrate

  const searchTimerRef = useRef(null);

  useEffect(() => {
    const handler = (ev) => setValue(ev?.detail ?? (isMultiple ? [] : undefined));
    ctx.element?.addEventListener('js-field:value-change', handler);
    return () => ctx.element?.removeEventListener('js-field:value-change', handler);
  }, []);

  // Icon lucide cho trạng thái active — load qua CDN (RunJS không đọc được registry icon nội bộ, xem
  // docs/ICON-ARCHITECTURE.md). Version khớp lucide-react mà @ptdl/plugin-custom-icons pin (0.469.0).
  useEffect(() => {
    if (!ACTIVE_FIELD) return;
    let cancelled = false;
    (async () => {
      try {
        const lucide = await ctx.requireAsync('lucide@0.469.0/dist/umd/lucide.min.js');
        const pascal = ACTIVE_ICON.split('-')
          .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
          .join('');
        const iconNode = lucide.icons[pascal];
        if (!iconNode) return;
        const el = lucide.createElement(iconNode);
        el.setAttribute('width', 14);
        el.setAttribute('height', 14);
        el.setAttribute('stroke', ACTIVE_ICON_COLOR);
        if (!cancelled) setActiveIconHtml(el.outerHTML);
      } catch (_) {
        // Tải icon lỗi (CDN down...) → bỏ qua, vẫn hiện tên/avatar bình thường
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rememberRecord = (record) => {
    if (record?.[valueField] != null) recordsRef.current.set(String(record[valueField]), record);
    return record;
  };

  const toOption = (record) => ({ value: record[valueField], label: record[LABEL_FIELD], record: rememberRecord(record) });

  const fetchOptions = useCallback(async (search) => {
    setLoading(true);
    try {
      const res = await ctx.api.request({
        url: `${targetCollectionName}:list`,
        method: 'get',
        params: {
          pageSize: PAGE_SIZE,
          appends: APPENDS.length ? APPENDS : undefined,
          filter: search ? { [SEARCH_FIELD]: { $includes: search } } : undefined,
        },
      });
      const list = res?.data?.data || [];
      if (DEBUG) console.log('[runjs-record-select-rich] fetched', list.length, 'record(s):', list);
      setOptions(list.map(toOption));
    } catch (e) {
      if (DEBUG) console.error('[runjs-record-select-rich] fetch error:', e);
      ctx.message?.error?.(e.message || 'Tải danh sách thất bại');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tải lần đầu + hydrate record đang chọn nếu thiếu field hiển thị (vd form chỉ có {id} do server không append đủ)
  useEffect(() => {
    (async () => {
      await fetchOptions('');
      const current = ctx.getValue?.();
      const items = isMultiple ? (Array.isArray(current) ? current : []) : current ? [current] : [];
      items.forEach(rememberRecord);
      const missing = items.filter((it) => it?.[valueField] != null && it[LABEL_FIELD] == null);
      if (!missing.length) return;
      if (DEBUG) console.log('[runjs-record-select-rich] hydrating missing:', missing);
      try {
        const res = await ctx.api.request({
          url: `${targetCollectionName}:list`,
          method: 'get',
          params: {
            filter: { [valueField]: { $in: missing.map((it) => it[valueField]) } },
            appends: APPENDS.length ? APPENDS : undefined,
          },
        });
        (res?.data?.data || []).forEach(rememberRecord);
        const merge = (it) => (it?.[valueField] != null ? recordsRef.current.get(String(it[valueField])) || it : it);
        setValue((prev) => (isMultiple ? (Array.isArray(prev) ? prev.map(merge) : prev) : merge(prev)));
      } catch (_) {
        // Không hydrate được (record đã xoá...) → vẫn hiện value thô, không chặn form
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSearch = (text) => {
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => fetchOptions(text), 300);
  };

  const onChange = (_v, option) => {
    const next = isMultiple
      ? (Array.isArray(option) ? option : []).map((o) => o.record)
      : option?.record ?? null;
    setValue(next);
    ctx.setValue?.(next);
  };

  const renderRow = (record, compact) => {
    if (!record) return null;
    // Fallback lộ ra ngay khi LABEL_FIELD cấu hình sai tên cột (không tồn tại ở bảng đích) — thay vì hiện trống
    // im lặng, hiện value thô kèm dấu ? để dễ nhận ra cần sửa CẤU HÌNH.
    const name = record[LABEL_FIELD] ?? (record[valueField] != null ? `#${record[valueField]} (?)` : '');
    const subtitle = SUBTITLE_FIELD ? record[SUBTITLE_FIELD] : '';
    const active = ACTIVE_FIELD ? !!record[ACTIVE_FIELD] : false;
    const src = avatarSrc(record);
    return (
      <div style={{ display: 'flex', alignItems: compact ? 'center' : 'flex-start', gap: 8, minWidth: 0 }}>
        <Avatar src={src} size={compact ? 22 : AVATAR_SIZE} style={{ flexShrink: 0 }}>
          {!src && name ? name.charAt(0).toUpperCase() : null}
        </Avatar>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name}
            </span>
            {!compact && active && activeIconHtml ? (
              <span
                style={{ display: 'inline-flex', lineHeight: 0, flexShrink: 0 }}
                dangerouslySetInnerHTML={{ __html: activeIconHtml }}
              />
            ) : null}
          </div>
          {!compact && subtitle ? <div style={{ fontSize: 12, color: '#8c8c8c' }}>{subtitle}</div> : null}
        </div>
      </div>
    );
  };

  if (ctx.readOnly) {
    if (isMultiple) {
      const list = Array.isArray(value) ? value : [];
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {list.map((rec, i) => (
            <React.Fragment key={rec?.[valueField] ?? i}>{renderRow(rec, true)}</React.Fragment>
          ))}
        </div>
      );
    }
    return value ? renderRow(value, true) : <span style={{ color: '#bfbfbf' }}>-</span>;
  }

  return (
    <Select
      mode={isMultiple ? 'multiple' : undefined}
      value={isMultiple ? (Array.isArray(value) ? value.map((r) => r?.[valueField]) : []) : value?.[valueField]}
      onChange={onChange}
      onSearch={onSearch}
      showSearch
      filterOption={false}
      allowClear
      loading={loading}
      disabled={ctx.disabled}
      placeholder={PLACEHOLDER}
      // Tắt virtual scroll: Select mặc định dùng rc-virtual-list, tự đo chiều cao mỗi dòng theo 1 hàng đơn (~32px).
      // Option của mình cao 2 dòng (avatar+tên+chức vụ) hơn mức đó → nội dung bị virtual-list cắt/che mất, dropdown
      // hiện trắng trơn dù data đã fetch đủ. Tắt virtual để list tự đo chiều cao thật theo nội dung render.
      virtual={false}
      style={{ width: '100%' }}
      popupMatchSelectWidth={false}
      notFoundContent={
        loading ? <Spin size="small" /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có kết quả" />
      }
      options={options}
      optionRender={(option) => renderRow(option?.data?.record ?? option?.record, false)}
      // Dùng thẳng `value` (state) — đây LÀ record đang chọn, không tra qua recordsRef (ref không kích hoạt
      // re-render khi được cập nhật → nếu tra theo ref, lần render đầu của field đã có sẵn giá trị (sửa record cũ)
      // sẽ ra null vì ref chưa kịp có data, khiến ô hiện trống dù value không rỗng).
      labelRender={() => renderRow(isMultiple ? null : value, true)}
      tagRender={(props) => {
        const record =
          (Array.isArray(value) && value.find((r) => String(r?.[valueField]) === String(props.value))) ||
          recordsRef.current.get(String(props.value));
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              margin: '2px 4px 2px 0',
              padding: '1px 6px 1px 2px',
              border: '1px solid #d9d9d9',
              borderRadius: 999,
              background: '#fafafa',
            }}
          >
            {renderRow(record, true)}
            <span style={{ cursor: 'pointer', color: '#8c8c8c' }} onMouseDown={(e) => e.preventDefault()} onClick={props.onClose}>
              ×
            </span>
          </span>
        );
      }}
    />
  );
}

ctx.render(<RichAssociationSelect />);
