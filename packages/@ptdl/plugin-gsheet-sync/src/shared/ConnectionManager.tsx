import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Drawer,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import { DatabaseOutlined, FileExcelOutlined, PlusOutlined, SettingOutlined } from '@ant-design/icons';
import { ColumnSelect } from '@ptdl/shared';
import { t } from './i18n';

// ---- jump to a synced collection's field-config in the data-source manager ----
// That "Configure fields" drawer is NOT URL-addressable, so we land on the
// collections page and programmatically click the matching row's action.
const DS_COLLECTIONS_URL = '/admin/settings/data-source-manager/main/collections';
const OPEN_FIELDS_FLAG = 'ptdl_gsheet_open_fields';

// Poll until the collections table has rendered the target row, then click its
// "Configure fields" action. Runs on window (survives the settings page unmount).
function pollOpenCollectionFields(collectionName: string) {
  if (!collectionName) return;
  const deadline = Date.now() + 20000;
  const timer = setInterval(() => {
    if (Date.now() > deadline) return clearInterval(timer);
    if (!/data-source-manager\/[^/]+\/collections/.test(window.location.pathname)) return;
    const trs = Array.from(document.querySelectorAll('.ant-table-row'));
    for (const r of trs) {
      const cells = Array.from(r.querySelectorAll('.ant-table-cell'));
      // match the row by its (unique) collection-name cell
      if (cells.some((c) => (c.textContent || '').trim() === collectionName)) {
        const actions = r.querySelector('.ant-table-cell:last-child');
        const links = actions ? Array.from(actions.querySelectorAll('a,button')) : [];
        const link =
          links.find((e) => /configure fields|cấu hình\s*field/i.test((e.textContent || '').trim())) || links[0];
        if (link) {
          (link as HTMLElement).click();
          clearInterval(timer);
        }
        return;
      }
    }
  }, 350);
}

// Same classic SPA (/admin) → client-side nav + poll (no reload). From /v/ (a
// different SPA) → stash a flag and hard-nav; the classic client lane consumes it.
function openCollectionFields(collectionName: string) {
  if (!collectionName) return;
  if (window.location.pathname.startsWith('/admin')) {
    try {
      window.history.pushState({}, '', DS_COLLECTIONS_URL);
      window.dispatchEvent(new PopStateEvent('popstate'));
      pollOpenCollectionFields(collectionName);
      return;
    } catch {
      /* fall through to hard nav */
    }
  }
  try {
    sessionStorage.setItem(OPEN_FIELDS_FLAG, collectionName);
  } catch {
    /* ignore */
  }
  window.location.href = DS_COLLECTIONS_URL;
}

function openDataSourceCollections() {
  if (window.location.pathname.startsWith('/admin')) {
    try {
      window.history.pushState({}, '', DS_COLLECTIONS_URL);
      window.dispatchEvent(new PopStateEvent('popstate'));
      return;
    } catch {
      /* fall through */
    }
  }
  window.location.href = DS_COLLECTIONS_URL;
}

// Called by the classic client lane on boot: consume a stashed flag (set before a
// cross-app navigation from /v/) and open the collection's field-config drawer.
export function bootstrapOpenCollectionFields() {
  let target: string | null = null;
  try {
    target = sessionStorage.getItem(OPEN_FIELDS_FLAG);
    if (target) sessionStorage.removeItem(OPEN_FIELDS_FLAG);
  } catch {
    /* ignore */
  }
  if (target) pollOpenCollectionFields(target);
}

// Settings screen for Google Sheets connections. Shared by both client lanes;
// the only lane-specific bit is how to get the api client, injected as a hook.

interface Mapping {
  header: string;
  field: string;
  type?: string;
  include?: boolean;
}

interface Acct {
  id?: number;
  title?: string;
  serviceEmail?: string;
  hasCredentials?: boolean;
  usedBy?: number;
}

interface Conn {
  id?: number;
  title?: string;
  spreadsheetId?: string;
  sheetName?: string;
  range?: string;
  targetCollection?: string;
  targetMode?: string; // create | existing
  accountId?: number | null;
  accountTitle?: string;
  mappings?: Mapping[] | null;
  keyColumn?: string;
  syncMode?: string;
  deleteMissing?: boolean;
  twoWay?: boolean;
  pushDeletes?: string;
  intervalMinutes?: number;
  enabled?: boolean;
  lastSyncAt?: string;
  lastStatus?: string;
  lastError?: string;
  lastRowCount?: number;
  hasCredentials?: boolean;
  serviceEmail?: string;
}

const EMPTY: Conn = {
  title: '',
  spreadsheetId: '',
  sheetName: '',
  range: '',
  targetCollection: '',
  targetMode: 'create',
  accountId: null,
  mappings: null,
  keyColumn: '',
  syncMode: 'replace',
  deleteMissing: false,
  twoWay: false,
  pushDeletes: 'none',
  intervalMinutes: 0,
  enabled: true,
};

// Card container matching the other @ptdl settings screens (global-search / html-template).
const CONTAINER: React.CSSProperties = {
  padding: 20,
  maxWidth: 1200,
  margin: '8px auto 16px',
  background: 'var(--colorBgContainer, #fff)',
  border: '0.8px solid var(--colorBorderSecondary, #f0f0f0)',
  borderRadius: 8,
};
const LOGO: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  borderRadius: 8,
  background: '#0f9d58', // Google Sheets green
  color: '#fff',
  fontSize: 18,
  lineHeight: 1,
};

const TYPE_OPTIONS = [
  { value: 'string', label: 'Chữ (string)' },
  { value: 'text', label: 'Chữ dài (text)' },
  { value: 'integer', label: 'Số nguyên' },
  { value: 'number', label: 'Số thực' },
  { value: 'boolean', label: 'Đúng/sai' },
  { value: 'date', label: 'Ngày' },
];

const TYPE_LABEL: Record<string, string> = Object.fromEntries(TYPE_OPTIONS.map((o) => [o.value, o.label]));

// NocoBase scalar types the server supports for existing-collection sync
const SUPPORTED_NB_TYPES = new Set([
  'string', 'text', 'integer', 'bigInt', 'float', 'double', 'decimal', 'real', 'boolean',
  'date', 'datetime', 'dateOnly', 'datetimeNoTz', 'datetimeTz', 'unixTimestamp',
  'uuid', 'nanoid', 'uid', 'email', 'phone', 'url',
]);
const HIDDEN_FIELD_NAMES = new Set(['id', 'createdAt', 'updatedAt', 'createdById', 'updatedById', 'sort', '_sheet_row', 'password']);

const slugify = (s: string) => {
  let out = String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (/^[0-9]/.test(out)) out = 'c_' + out;
  return out;
};

const suggestCollectionName = (s: string) => {
  const out = slugify(s);
  return out ? 'gs_' + out : '';
};

export function createConnectionManager({ useApiClient }: { useApiClient: () => any }) {
  const Field: React.FC<{ label: string; hint?: React.ReactNode; children: React.ReactNode }> = ({
    label,
    hint,
    children,
  }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 500, marginBottom: 4 }}>{label}</div>
      {children}
      {hint ? (
        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
          {hint}
        </Typography.Text>
      ) : null}
    </div>
  );

  return function ConnectionManager() {
    const api = useApiClient();
    const [rows, setRows] = useState<Conn[]>([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [edit, setEdit] = useState<Conn>({ ...EMPTY });
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<any>(null);
    const [previewing, setPreviewing] = useState(false);
    const [preview, setPreview] = useState<any>(null);
    const [syncingId, setSyncingId] = useState<number | null>(null);
    const [allCollections, setAllCollections] = useState<any[]>([]);
    const [targetFields, setTargetFields] = useState<any[]>([]);

    // reusable service accounts
    const [accounts, setAccounts] = useState<Acct[]>([]);
    const [acctOpen, setAcctOpen] = useState(false);
    const [acctEdit, setAcctEdit] = useState<Acct>({});
    const [acctCreds, setAcctCreds] = useState('');
    const [acctSaving, setAcctSaving] = useState(false);

    const set = (k: keyof Conn, v: any) => setEdit((e) => ({ ...e, [k]: v }));
    const errMsg = (e: any, fallback: string) =>
      e?.response?.data?.errors?.[0]?.message || e?.message || fallback;

    const load = useCallback(async () => {
      setLoading(true);
      try {
        const res = await api.request({ url: 'ptdlGsheet:listConnections', method: 'post', data: {} });
        setRows(res?.data?.data || []);
      } catch (e: any) {
        message.error(errMsg(e, t('Không tải được danh sách')));
      } finally {
        setLoading(false);
      }
    }, [api]);

    const loadAccounts = useCallback(async () => {
      try {
        const res = await api.request({ url: 'ptdlGsheet:listAccounts', method: 'post', data: {} });
        setAccounts(res?.data?.data || []);
      } catch (e: any) {
        message.error(errMsg(e, t('Không tải được Service Account')));
      }
    }, [api]);

    useEffect(() => {
      load();
      loadAccounts();
    }, [load, loadAccounts]);

    // ---- service-account editor ----
    const openAcctEditor = (a?: Acct) => {
      setAcctEdit(a ? { ...a } : {});
      setAcctCreds('');
      setAcctOpen(true);
    };
    const doSaveAccount = async () => {
      if (!acctEdit.id && !acctCreds.trim()) return message.warning(t('Dán JSON của Service Account'));
      setAcctSaving(true);
      try {
        const res = await api.request({
          url: 'ptdlGsheet:saveAccount',
          method: 'post',
          data: { id: acctEdit.id, title: acctEdit.title, credentials: acctCreds || undefined },
        });
        const saved: Acct = res?.data?.data || {};
        message.success(t('Đã lưu Service Account'));
        setAcctOpen(false);
        await loadAccounts();
        // if the editor was opened from the connection drawer, auto-select the new account
        if (!acctEdit.id && saved.id && open) set('accountId', saved.id);
      } catch (e: any) {
        message.error(errMsg(e, t('Lưu Service Account thất bại')));
      } finally {
        setAcctSaving(false);
      }
    };
    const doDeleteAccount = async (id: number) => {
      try {
        await api.request({ url: 'ptdlGsheet:deleteAccount', method: 'post', data: { id } });
        message.success(t('Đã xoá Service Account'));
        await loadAccounts();
      } catch (e: any) {
        message.error(errMsg(e, t('Xoá thất bại')));
      }
    };

    // collections list for "existing" target mode
    const loadCollections = useCallback(async () => {
      try {
        const res = await api.request({ url: 'collections:list?paginate=false&sort=name' });
        const list = (res?.data?.data || []).filter((c: any) => !c.hidden);
        setAllCollections(list);
      } catch (e: any) {
        message.error(errMsg(e, t('Không tải được danh sách collection')));
      }
    }, [api]);

    useEffect(() => {
      if (open && edit.targetMode === 'existing' && !allCollections.length) loadCollections();
    }, [open, edit.targetMode, allCollections.length, loadCollections]);

    // fields of the chosen existing collection
    useEffect(() => {
      let stale = false;
      (async () => {
        if (edit.targetMode !== 'existing' || !edit.targetCollection) {
          setTargetFields([]);
          return;
        }
        try {
          const res = await api.request({
            url: `collections:get?filterByTk=${encodeURIComponent(edit.targetCollection)}&appends=fields`,
          });
          if (!stale) setTargetFields(res?.data?.data?.fields || []);
        } catch {
          if (!stale) setTargetFields([]);
        }
      })();
      return () => {
        stale = true;
      };
    }, [api, edit.targetMode, edit.targetCollection]);

    const usableTargetFields = useMemo(
      () =>
        targetFields.filter(
          (f: any) => !f.target && SUPPORTED_NB_TYPES.has(f.type) && !HIDDEN_FIELD_NAMES.has(f.name),
        ),
      [targetFields],
    );

    // default mapping rows once preview (and, for existing mode, target fields) are loaded
    useEffect(() => {
      if (!preview?.fields?.length) return;
      if (edit.mappings && edit.mappings.length) return;
      if (edit.targetMode === 'existing') {
        if (!usableTargetFields.length) return;
        setEdit((e) => ({
          ...e,
          mappings: preview.fields.map((f: any) => {
            const match = usableTargetFields.find(
              (tf: any) => tf.name === f.name || (tf.uiSchema?.title || '') === f.title,
            );
            return { header: f.title, field: match?.name || '', type: f.type, include: !!match };
          }),
        }));
      } else {
        setEdit((e) => ({
          ...e,
          mappings: preview.fields.map((f: any) => ({
            header: f.title,
            field: f.name,
            type: f.type,
            include: true,
          })),
        }));
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [preview, usableTargetFields, edit.targetMode]);

    const updateMapping = (idx: number, patch: Partial<Mapping>) =>
      setEdit((e) => ({
        ...e,
        mappings: (e.mappings || []).map((m, i) => (i === idx ? { ...m, ...patch } : m)),
      }));

    const openEditor = (row?: Conn) => {
      setEdit(row ? { ...row } : { ...EMPTY });
      setTestResult(null);
      setPreview(null);
      setTargetFields([]);
      setOpen(true);
      loadAccounts();
    };

    const hasCred = () => !!edit.accountId || !!edit.hasCredentials;

    const doTest = async () => {
      if (!hasCred()) return message.warning(t('Chọn Service Account trước'));
      setTesting(true);
      setTestResult(null);
      try {
        const res = await api.request({
          url: 'ptdlGsheet:testConnection',
          method: 'post',
          data: { id: edit.id, accountId: edit.accountId || undefined, spreadsheetId: edit.spreadsheetId },
        });
        const data = res?.data?.data;
        setTestResult(data);
        message.success(t('Kết nối OK: "{{title}}" ({{count}} sheet)', { title: data?.title, count: data?.sheets?.length || 0 }));
        if (!edit.sheetName && data?.sheets?.length) set('sheetName', data.sheets[0].title);
      } catch (e: any) {
        message.error(errMsg(e, t('Kết nối thất bại')));
      } finally {
        setTesting(false);
      }
    };

    const doPreview = async () => {
      if (!hasCred()) return message.warning(t('Chọn Service Account trước'));
      setPreviewing(true);
      setPreview(null);
      try {
        const res = await api.request({
          url: 'ptdlGsheet:preview',
          method: 'post',
          data: {
            id: edit.id,
            accountId: edit.accountId || undefined,
            spreadsheetId: edit.spreadsheetId,
            sheetName: edit.sheetName,
            range: edit.range,
          },
        });
        setPreview(res?.data?.data);
      } catch (e: any) {
        message.error(errMsg(e, t('Preview thất bại')));
      } finally {
        setPreviewing(false);
      }
    };

    const doSave = async () => {
      if (!edit.title) return message.warning(t('Nhập tên connection'));
      if (!hasCred()) return message.warning(t('Chọn Service Account'));
      if (!edit.spreadsheetId) return message.warning(t('Nhập Spreadsheet ID / URL'));
      if (!edit.sheetName) return message.warning(t('Chọn sheet (tab)'));
      if (!edit.targetCollection)
        return message.warning(edit.targetMode === 'existing' ? t('Chọn collection đích') : t('Nhập tên collection đích'));
      if (edit.targetMode === 'existing') {
        const active = (edit.mappings || []).filter((m) => m.include !== false && m.field);
        if (!active.length) return message.warning(t('Chọn ít nhất 1 cột và field đích trong bảng mapping (bấm Xem trước)'));
      }
      if (edit.syncMode === 'upsert' && !edit.keyColumn) return message.warning(t('Chế độ upsert cần chọn cột khóa'));
      setSaving(true);
      try {
        const res = await api.request({
          url: 'ptdlGsheet:saveConnection',
          method: 'post',
          data: { ...edit },
        });
        message.success(t('Đã lưu'));
        setEdit(res?.data?.data || edit);
        await load();
      } catch (e: any) {
        message.error(errMsg(e, t('Lưu thất bại')));
      } finally {
        setSaving(false);
      }
    };

    const doSync = async (id: number) => {
      setSyncingId(id);
      try {
        const res = await api.request({ url: 'ptdlGsheet:syncNow', method: 'post', data: { id } });
        const d = res?.data?.data || {};
        const removedPart = d.removed ? t(', xoá {{removed}}', { removed: d.removed }) : '';
        message.success(
          t('Đồng bộ xong: {{rows}} dòng', { rows: d.rows ?? 0 }) +
            (d.updated !== undefined
              ? t(' (mới {{created}}, cập nhật {{updated}}{{removedPart}})', {
                  created: d.created || 0,
                  updated: d.updated || 0,
                  removedPart,
                })
              : ''),
        );
        await load();
      } catch (e: any) {
        message.error(errMsg(e, t('Sync thất bại')));
        await load();
      } finally {
        setSyncingId(null);
      }
    };

    const doDelete = async (id: number) => {
      try {
        await api.request({ url: 'ptdlGsheet:deleteConnection', method: 'post', data: { id } });
        message.success(t('Đã xoá connection (collection dữ liệu vẫn giữ nguyên)'));
        await load();
      } catch (e: any) {
        message.error(errMsg(e, t('Xoá thất bại')));
      }
    };

    const accountOptions = useMemo(
      () =>
        accounts.map((a) => ({
          label: `${a.title || a.serviceEmail || `#${a.id}`}${a.serviceEmail ? ` — ${a.serviceEmail}` : ''}`,
          value: a.id,
        })),
      [accounts],
    );
    const sheetOptions = useMemo(
      () => (testResult?.sheets || []).map((s: any) => ({ label: s.title, value: s.title })),
      [testResult],
    );
    const headerOptions = useMemo(
      () => (preview?.headers || []).map((h: string) => ({ label: h, value: h })),
      [preview],
    );
    const collectionOptions = useMemo(
      () =>
        allCollections.map((c: any) => {
          // system collections carry i18n templates like {{t("Users")}} — unwrap them
          const title = String(c.title || c.name).replace(/\{\{\s*t\(["']([^"']+)["']\)\s*\}\}/, '$1');
          return { label: `${title} (${c.name})`, value: c.name };
        }),
      [allCollections],
    );
    const targetFieldType = (name: string) => usableTargetFields.find((f: any) => f.name === name)?.type;

    // TYPE_OPTIONS/TYPE_LABEL hold Vietnamese labels that double as i18n keys; translate at render
    // time (the runtime translator isn't set at module-eval, only after each lane's load()).
    const typeLabelText = (v?: string) => (v ? (TYPE_LABEL[v] ? t(TYPE_LABEL[v]) : v) : '?');
    const typeOptions = TYPE_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }));

    const mappingColumns: any[] = [
      {
        title: '',
        key: 'include',
        width: 40,
        render: (_: any, m: Mapping, i: number) => (
          <Checkbox checked={m.include !== false} onChange={(e) => updateMapping(i, { include: e.target.checked })} />
        ),
      },
      { title: t('Cột trên sheet'), dataIndex: 'header', key: 'header' },
      {
        title: t('Kiểu suy ra'),
        key: 'inferred',
        width: 110,
        render: (_: any, m: Mapping, i: number) => {
          const inf = preview?.fields?.find((f: any) => f.title === m.header)?.type;
          return <Tag>{typeLabelText(inf)}</Tag>;
        },
      },
      {
        title: t('Field đích'),
        key: 'field',
        render: (_: any, m: Mapping, i: number) =>
          edit.targetMode === 'existing' ? (
            <ColumnSelect
              style={{ width: '100%' }}
              size="small"
              disabled={m.include === false}
              value={m.field || undefined}
              onChange={(v) => updateMapping(i, { field: v })}
              options={usableTargetFields.map((f: any) => ({
                value: f.name,
                label: f.uiSchema?.title || f.name,
                type: f.type,
                iface: f.interface,
              }))}
              placeholder={t('Chọn field')}
            />
          ) : (
            <Input
              size="small"
              disabled={m.include === false}
              value={m.field}
              onChange={(e) => updateMapping(i, { field: e.target.value })}
            />
          ),
      },
      {
        title: t('Kiểu lưu'),
        key: 'type',
        width: 150,
        render: (_: any, m: Mapping, i: number) =>
          edit.targetMode === 'existing' ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {m.field ? t('theo field ({{type}})', { type: targetFieldType(m.field) || '?' }) : '—'}
            </Typography.Text>
          ) : (
            <Select
              size="small"
              style={{ width: '100%' }}
              disabled={m.include === false}
              value={m.type}
              onChange={(v) => updateMapping(i, { type: v })}
              options={typeOptions}
            />
          ),
      },
    ];

    const columns: any[] = [
      { title: t('Tên'), dataIndex: 'title', key: 'title' },
      {
        title: t('Nguồn'),
        key: 'src',
        render: (_: any, r: Conn) => (
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {r.sheetName} · {(r.spreadsheetId || '').slice(0, 12)}…
            </Typography.Text>
            <div>
              <Tag
                color={r.accountId ? 'geekblue' : 'orange'}
                style={{ fontSize: 11, marginInlineEnd: 0, marginTop: 2 }}
              >
                {r.accountId ? r.accountTitle || r.serviceEmail || 'Service Account' : t('credentials riêng (cũ)')}
              </Tag>
            </div>
          </div>
        ),
      },
      {
        title: t('Collection đích'),
        dataIndex: 'targetCollection',
        key: 'target',
        render: (v: string, r: Conn) => (
          <span>
            <Tooltip title={t('Mở cấu hình field của collection (đổi kiểu, định dạng…)')}>
              <Tag
                color="blue"
                style={{ cursor: v ? 'pointer' : 'default' }}
                onClick={() => v && openCollectionFields(v)}
              >
                {v} <SettingOutlined style={{ fontSize: 11 }} />
              </Tag>
            </Tooltip>
            {r.targetMode === 'existing' ? <Tag color="cyan">{t('có sẵn')}</Tag> : null}
          </span>
        ),
      },
      {
        title: t('Chế độ'),
        key: 'mode',
        render: (_: any, r: Conn) => (
          <span>
            {r.syncMode === 'upsert' ? <Tag color="purple">upsert: {r.keyColumn}</Tag> : <Tag>replace</Tag>}
            {r.twoWay ? <Tag color="geekblue">{t('⇅ 2 chiều')}</Tag> : null}
          </span>
        ),
      },
      {
        title: t('Lịch'),
        key: 'sched',
        render: (_: any, r: Conn) =>
          r.intervalMinutes ? t('{{n}} phút', { n: r.intervalMinutes }) : <Typography.Text type="secondary">{t('thủ công')}</Typography.Text>,
      },
      {
        title: t('Lần sync cuối'),
        key: 'last',
        render: (_: any, r: Conn) => {
          if (!r.lastStatus) return <Typography.Text type="secondary">{t('chưa chạy')}</Typography.Text>;
          const when = r.lastSyncAt ? new Date(r.lastSyncAt).toLocaleString('vi-VN') : '';
          if (r.lastStatus === 'ok')
            return (
              <span>
                <Tag color="green">OK</Tag> {r.lastRowCount ?? ''} {t('dòng')} · {when}
              </span>
            );
          if (r.lastStatus === 'running') return <Tag color="gold">{t('đang chạy')}</Tag>;
          return (
            <Typography.Text type="danger" style={{ fontSize: 12 }} title={r.lastError || ''}>
              <Tag color="red">{t('Lỗi')}</Tag> {(r.lastError || '').slice(0, 60)}
            </Typography.Text>
          );
        },
      },
      {
        title: '',
        key: 'ops',
        render: (_: any, r: Conn) => (
          <Space>
            <Button size="small" type="primary" ghost loading={syncingId === r.id} onClick={() => doSync(r.id!)}>
              {t('Đồng bộ ngay')}
            </Button>
            <Button size="small" onClick={() => openEditor(r)}>
              {t('Sửa')}
            </Button>
            <Popconfirm title={t('Xoá connection này?')} onConfirm={() => doDelete(r.id!)}>
              <Button size="small" danger>
                {t('Xoá')}
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ];

    const acctColumns: any[] = [
      {
        title: t('Tên gợi nhớ'),
        dataIndex: 'title',
        key: 'title',
        render: (v: string) => <b>{v || <Typography.Text type="secondary">{t('(chưa đặt tên)')}</Typography.Text>}</b>,
      },
      {
        title: 'Service account email',
        dataIndex: 'serviceEmail',
        key: 'email',
        render: (v: string) => <Typography.Text copyable={!!v} code style={{ fontSize: 12 }}>{v || '—'}</Typography.Text>,
      },
      {
        title: t('Đang dùng'),
        dataIndex: 'usedBy',
        key: 'usedBy',
        width: 120,
        render: (v: number) =>
          v ? <Tag color="blue">{v} connection</Tag> : <Typography.Text type="secondary">{t('chưa dùng')}</Typography.Text>,
      },
      {
        title: '',
        key: 'ops',
        width: 140,
        render: (_: any, a: Acct) => (
          <Space>
            <Button size="small" onClick={() => openAcctEditor(a)}>
              {t('Sửa')}
            </Button>
            <Popconfirm
              title={a.usedBy ? t('Đang được {{n}} connection dùng — gỡ trước khi xoá', { n: a.usedBy }) : t('Xoá Service Account này?')}
              onConfirm={() => doDeleteAccount(a.id!)}
              disabled={!!a.usedBy}
            >
              <Button size="small" danger disabled={!!a.usedBy}>
                {t('Xoá')}
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ];

    const okCount = rows.filter((r) => r.lastStatus === 'ok').length;
    const errCount = rows.filter((r) => r.lastStatus === 'error').length;

    return (
      <div style={CONTAINER}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <Typography.Title level={4} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={LOGO}>
                <FileExcelOutlined />
              </span>
              Google Sheets Sync
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ margin: '6px 0 0' }}>
              {t('Kéo dữ liệu từ Google Sheet về collection NocoBase — tự động theo lịch, một chiều hoặc hai chiều.')}
            </Typography.Paragraph>
          </div>
          <Space wrap>
            <Button onClick={() => { load(); loadAccounts(); }}>{t('↻ Tải lại')}</Button>
            <Button icon={<DatabaseOutlined />} onClick={openDataSourceCollections}>
              {t('Quản lý collection')}
            </Button>
          </Space>
        </div>

        <Tabs
          defaultActiveKey="connections"
          items={[
            {
              key: 'connections',
              label: `${t('Kết nối')}${rows.length ? ` (${rows.length})` : ''}`,
              children: (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                    {rows.length ? (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {rows.length} connection ·{' '}
                        <Tag color="green" style={{ marginInlineEnd: 0 }}>{okCount} OK</Tag>
                        {errCount ? <> <Tag color="red" style={{ marginInlineEnd: 0 }}>{errCount} {t('lỗi')}</Tag></> : null}
                      </Typography.Text>
                    ) : (
                      <span />
                    )}
                    <Button type="primary" style={{ marginLeft: 'auto' }} onClick={() => openEditor()}>
                      {t('＋ Thêm connection')}
                    </Button>
                  </div>
                  <Alert
                    style={{ marginBottom: 16 }}
                    type="info"
                    showIcon
                    message={t('Mỗi connection kéo dữ liệu 1 sheet (tab) về 1 collection trong NocoBase — tạo mới tự động hoặc map cột vào collection có sẵn. Chọn 1 Service Account (tab bên) đã lưu để dùng.')}
                  />
                  <Table
                    rowKey="id"
                    size="small"
                    loading={loading}
                    dataSource={rows}
                    columns={columns}
                    pagination={false}
                    locale={{ emptyText: t('Chưa có connection nào — bấm “＋ Thêm connection” để bắt đầu.') }}
                  />
                </div>
              ),
            },
            {
              key: 'accounts',
              label: `Service Account${accounts.length ? ` (${accounts.length})` : ''}`,
              children: (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {t('Đăng ký credentials 1 lần, dùng lại cho mọi connection.')}
                    </Typography.Text>
                    <Button type="primary" icon={<PlusOutlined />} style={{ marginLeft: 'auto' }} onClick={() => openAcctEditor()}>
                      {t('Thêm Service Account')}
                    </Button>
                  </div>
                  <Alert
                    style={{ marginBottom: 16 }}
                    type="info"
                    showIcon
                    message={t('Service Account = tài khoản máy của Google Cloud. Tạo key JSON (IAM → Service Accounts → Keys), lưu vào đây 1 lần, rồi Share từng Google Sheet cho email của account (quyền Viewer, hoặc Editor nếu cần đồng bộ 2 chiều).')}
                  />
                  <Table
                    rowKey="id"
                    size="small"
                    dataSource={accounts}
                    columns={acctColumns}
                    pagination={false}
                    locale={{ emptyText: t('Chưa có Service Account — bấm “＋ Thêm Service Account”.') }}
                  />
                </div>
              ),
            },
          ]}
        />

        <Drawer
          title={edit.id ? t('Sửa connection #{{id}}', { id: edit.id }) : t('Thêm connection')}
          width={780}
          open={open}
          onClose={() => setOpen(false)}
          destroyOnClose
          extra={
            <Space>
              {edit.id ? (
                <Button loading={syncingId === edit.id} onClick={() => doSync(edit.id!)}>
                  {t('Đồng bộ ngay')}
                </Button>
              ) : null}
              <Button type="primary" loading={saving} onClick={doSave}>
                {t('Lưu')}
              </Button>
            </Space>
          }
        >
          <Field label={t('Tên connection')}>
            <Input value={edit.title} onChange={(e) => set('title', e.target.value)} placeholder={t('VD: Danh sách đơn hàng')} />
          </Field>

          <Field
            label="Service Account"
            hint={
              <span>
                {t('Chọn Service Account đã lưu để')} <b>{t('tái sử dụng')}</b> {t('cho nhiều connection. Nhớ')}{' '}
                <b>{t('Share')}</b> {t('sheet cho email của account đó (quyền Viewer, hoặc Editor nếu đồng bộ 2 chiều).')}
              </span>
            }
          >
            <Space.Compact style={{ width: '100%' }}>
              <Select
                style={{ width: '100%' }}
                showSearch
                optionFilterProp="label"
                value={edit.accountId || undefined}
                onChange={(v) => set('accountId', v)}
                options={accountOptions}
                placeholder={t('Chọn Service Account đã lưu')}
                notFoundContent={t('Chưa có account nào — bấm ＋ để thêm')}
              />
              <Button icon={<PlusOutlined />} onClick={() => openAcctEditor()}>
                {t('Thêm')}
              </Button>
            </Space.Compact>
            {!edit.accountId && edit.hasCredentials ? (
              <Alert
                style={{ marginTop: 8 }}
                type="warning"
                showIcon
                message={t('Connection này đang dùng credentials riêng (cũ{{emailSuffix}}). Chọn 1 Service Account ở trên để chuyển sang dùng chung.', { emailSuffix: edit.serviceEmail ? `: ${edit.serviceEmail}` : '' })}
              />
            ) : null}
          </Field>

          <Field label={t('Spreadsheet ID hoặc URL')} hint={t('Dán nguyên URL của Google Sheet cũng được — hệ thống tự tách ID.')}>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                value={edit.spreadsheetId}
                onChange={(e) => set('spreadsheetId', e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/…"
              />
              <Button loading={testing} onClick={doTest}>
                {t('Kiểm tra kết nối')}
              </Button>
            </Space.Compact>
          </Field>

          {testResult ? (
            <Alert
              style={{ marginBottom: 14 }}
              type="success"
              showIcon
              message={t('"{{title}}" — {{count}} sheet. Service account: {{email}}', {
                title: testResult.title,
                count: testResult.sheets?.length || 0,
                email: testResult.serviceEmail,
              })}
            />
          ) : null}

          <Field label="Sheet (tab)" hint={t('Bấm Kiểm tra kết nối để nạp danh sách tab, hoặc gõ tay tên tab.')}>
            <Select
              style={{ width: '100%' }}
              showSearch
              value={edit.sheetName || undefined}
              onChange={(v) => {
                set('sheetName', v);
                if (!edit.targetCollection && edit.targetMode !== 'existing')
                  set('targetCollection', suggestCollectionName(v));
              }}
              options={sheetOptions}
              placeholder={t('Tên tab, VD: Sheet1')}
              notFoundContent={t('Chưa có danh sách — Kiểm tra kết nối trước')}
            />
          </Field>

          <Field label={t('Vùng dữ liệu (tuỳ chọn)')} hint={t('Để trống = cả sheet. VD: A1:F — dòng đầu của vùng là dòng tiêu đề.')}>
            <Input value={edit.range} onChange={(e) => set('range', e.target.value)} placeholder="A1:F" />
          </Field>

          <Field label={t('Collection đích')}>
            <Radio.Group
              value={edit.targetMode || 'create'}
              onChange={(e) => setEdit((prev) => ({ ...prev, targetMode: e.target.value, targetCollection: '', mappings: null }))}
              style={{ marginBottom: 8 }}
            >
              <Radio.Button value="create">{t('Tạo collection mới')}</Radio.Button>
              <Radio.Button value="existing">{t('Collection có sẵn')}</Radio.Button>
            </Radio.Group>
            {edit.targetMode === 'existing' ? (
              <Select
                style={{ width: '100%' }}
                showSearch
                value={edit.targetCollection || undefined}
                onChange={(v) => setEdit((prev) => ({ ...prev, targetCollection: v, mappings: null }))}
                options={collectionOptions}
                placeholder={t('Chọn collection')}
                optionFilterProp="label"
              />
            ) : (
              <Input
                value={edit.targetCollection}
                onChange={(e) => set('targetCollection', e.target.value)}
                placeholder="gs_don_hang"
              />
            )}
            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
              {edit.targetMode === 'existing'
                ? t('Map cột sheet vào field CÓ SẴN — kiểu dữ liệu lấy theo field đích. Chế độ replace chỉ xoá record do sync tạo ra (record khác giữ nguyên).')
                : t('Collection sẽ được TẠO TỰ ĐỘNG lần sync đầu kèm field theo bảng mapping bên dưới (mặc định: mọi cột, kiểu suy ra tự động).')}
            </Typography.Text>
            {edit.id && edit.targetCollection ? (
              <Button
                type="link"
                size="small"
                icon={<SettingOutlined />}
                style={{ paddingLeft: 0, marginTop: 2 }}
                onClick={() => openCollectionFields(edit.targetCollection!)}
              >
                {t('Mở cấu hình field của "{{name}}" (đổi kiểu, định dạng…)', { name: edit.targetCollection })}
              </Button>
            ) : null}
          </Field>

          <div style={{ marginBottom: 14 }}>
            <Button loading={previewing} onClick={doPreview}>
              {t('👁 Xem trước & thiết lập mapping cột')}
            </Button>
          </div>

          {preview && edit.mappings?.length ? (
            <Field
              label={t('Mapping cột → field')}
              hint={
                edit.targetMode === 'existing'
                  ? t('Chỉ cột được tick mới sync. Cột trùng tên field đã được tự match — kiểm tra lại rồi chỉnh nếu cần.')
                  : t('Bỏ tick cột không cần. Sửa được tên field và kiểu lưu (ghi đè kiểu suy ra).')
              }
            >
              <Table
                size="small"
                rowKey={(m: any) => m.header}
                pagination={false}
                columns={mappingColumns}
                dataSource={edit.mappings || []}
              />
            </Field>
          ) : null}

          {preview ? (
            <Field
              label={t('Dữ liệu mẫu ({{n}} dòng)', { n: preview.totalRows })}
              hint={t('Giá trị hiển thị đã đổi theo kiểu suy ra — cột ngày hiện ra dạng ngày, không phải số serial của Google.')}
            >
              <Table
                size="small"
                rowKey={(_, i) => String(i)}
                pagination={false}
                scroll={{ x: true }}
                columns={(preview.headers || []).map((h: string, i: number) => {
                  const inf = preview?.fields?.find((f: any) => f.title === h)?.type;
                  return {
                    title: (
                      <span>
                        {h}{' '}
                        <Tag style={{ marginInlineEnd: 0, fontSize: 11 }}>{typeLabelText(inf)}</Tag>
                      </span>
                    ),
                    key: String(i),
                    render: (_: any, row: any[]) => String(row?.[i] ?? ''),
                  };
                })}
                dataSource={preview.sample || []}
              />
            </Field>
          ) : null}

          <Field label={t('Chế độ đồng bộ')}>
            <Radio.Group value={edit.syncMode} onChange={(e) => set('syncMode', e.target.value)}>
              <Radio.Button value="replace">{t('Thay toàn bộ (replace)')}</Radio.Button>
              <Radio.Button value="upsert">{t('Upsert theo cột khóa')}</Radio.Button>
            </Radio.Group>
            {edit.syncMode === 'upsert' ? (
              <div style={{ marginTop: 8 }}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Select
                    style={{ width: '100%' }}
                    showSearch
                    value={edit.keyColumn || undefined}
                    onChange={(v) => set('keyColumn', v)}
                    options={headerOptions}
                    placeholder={t('Cột khóa (giá trị duy nhất, VD: Mã đơn) — bấm Xem trước để nạp danh sách cột')}
                  />
                  <Checkbox checked={!!edit.deleteMissing} onChange={(e) => set('deleteMissing', e.target.checked)}>
                    {t('Xoá record không còn trên sheet')}
                  </Checkbox>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {t('Upsert giữ nguyên id record khi dòng đã có → an toàn cho quan hệ/comment gắn vào record, và là nền cho đồng bộ 2 chiều sau này. Replace nhanh hơn nhưng thay id mỗi lần sync.')}
                  </Typography.Text>
                </Space>
              </div>
            ) : null}
          </Field>

          <Field
            label={t('Đồng bộ 2 chiều')}
            hint={
              edit.syncMode !== 'upsert' || !edit.keyColumn
                ? t('Cần chế độ Upsert + cột khóa mới bật được (định danh dòng trên sheet theo cột khóa).')
                : t('Sửa/thêm/xoá record trong NocoBase sẽ được đẩy lên sheet sau ~3 giây (gộp batch). Sheet phải được Share quyền EDITOR cho service account.')
            }
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              <Space>
                <Switch
                  checked={!!edit.twoWay}
                  disabled={edit.syncMode !== 'upsert' || !edit.keyColumn}
                  onChange={(v) => set('twoWay', v)}
                />
                <Typography.Text>{t('Đẩy thay đổi từ NocoBase lên sheet')}</Typography.Text>
              </Space>
              {edit.twoWay ? (
                <Space wrap>
                  <span>{t('Khi xoá record:')}</span>
                  <Select
                    style={{ width: 260 }}
                    value={edit.pushDeletes || 'none'}
                    onChange={(v) => set('pushDeletes', v)}
                    options={[
                      { value: 'none', label: t('Không đụng sheet') },
                      { value: 'clear', label: t('Xoá trắng dòng (giữ dòng)') },
                      { value: 'delete', label: t('Xoá hẳn dòng trên sheet') },
                    ]}
                  />
                  {edit.id ? (
                    <Button
                      onClick={async () => {
                        try {
                          const res = await api.request({ url: 'ptdlGsheet:pushNow', method: 'post', data: { id: edit.id } });
                          const d = res?.data?.data || {};
                          message.success(t('Đã đẩy lên sheet: {{updated}} sửa, {{appended}} thêm, {{skipped}} bỏ qua', { updated: d.updated || 0, appended: d.appended || 0, skipped: d.skipped || 0 }));
                        } catch (e: any) {
                          message.error(errMsg(e, t('Push thất bại')));
                        }
                      }}
                    >
                      {t('⇪ Đẩy toàn bộ lên sheet')}
                    </Button>
                  ) : null}
                </Space>
              ) : null}
            </Space>
          </Field>

          <Field label={t('Tự động sync (phút)')} hint={t('0 = chỉ sync thủ công. VD: 15 = mỗi 15 phút.')}>
            <InputNumber min={0} value={edit.intervalMinutes} onChange={(v) => set('intervalMinutes', v ?? 0)} />
          </Field>

          <Field label={t('Bật connection')}>
            <Switch checked={!!edit.enabled} onChange={(v) => set('enabled', v)} />
          </Field>
        </Drawer>

        <Modal
          title={acctEdit.id ? t('Sửa Service Account #{{id}}', { id: acctEdit.id }) : t('Thêm Service Account')}
          open={acctOpen}
          onCancel={() => setAcctOpen(false)}
          onOk={doSaveAccount}
          confirmLoading={acctSaving}
          okText={t('Lưu')}
          cancelText={t('Huỷ')}
          destroyOnClose
          width={620}
        >
          <Field label={t('Tên gợi nhớ')} hint={t('Để dễ nhận ra khi chọn (VD: “SA phòng kế toán”). Bỏ trống = lấy theo email.')}>
            <Input
              value={acctEdit.title}
              onChange={(e) => setAcctEdit((a) => ({ ...a, title: e.target.value }))}
              placeholder={t('VD: Service Account chính')}
            />
          </Field>
          <Field
            label="Service Account JSON"
            hint={
              acctEdit.id ? (
                <span>
                  {t('Đã lưu')} ({acctEdit.serviceEmail || t('ẩn')}) {t('— chỉ dán lại khi muốn thay key. Nhớ')}{' '}
                  <b>{t('Share')}</b> {t('sheet cho email này.')}
                </span>
              ) : (
                t('Google Cloud Console → IAM → Service Accounts → Keys → tạo key JSON, dán TOÀN BỘ nội dung file vào đây.')
              )
            }
          >
            <Input.TextArea
              rows={7}
              value={acctCreds}
              onChange={(e) => setAcctCreds(e.target.value)}
              placeholder={acctEdit.id ? t('•••••• (đã lưu — dán JSON mới nếu muốn thay)') : '{ "type": "service_account", ... }'}
            />
          </Field>
        </Modal>
      </div>
    );
  };
}
