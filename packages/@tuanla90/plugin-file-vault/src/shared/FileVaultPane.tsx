import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Badge, Button, Checkbox, DatePicker, Empty, Image, Input, InputNumber, Modal, Pagination, Segmented,
  Select, Space, Spin, Table, Tag, Tooltip, Typography, message, theme,
} from 'antd';
import {
  DeleteOutlined, EditOutlined, EyeOutlined, ReloadOutlined, ExclamationCircleOutlined,
  FolderOpenOutlined, WarningOutlined, DownloadOutlined,
} from '@ant-design/icons';
import { ConfigContainer, SettingCard } from '@tuanla90/shared';
import { t } from './fileVaultClient';

const { Text, Paragraph, Title } = Typography;
const { RangePicker } = DatePicker;

// ── helpers ───────────────────────────────────────────────────────────────────────────────────────
const errMsg = (e: any) => e?.response?.data?.errors?.[0]?.message || e?.response?.data?.error || e?.message || String(e);

function humanSize(bytes: any): string {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let n = b, i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < units.length - 1);
  return `${n >= 100 ? n.toFixed(0) : n.toFixed(1)} ${units[i]}`;
}

// A collection's title can be an i18n template like `{{t('System settings')}}` — show a friendly name.
function friendlyName(title?: string, name?: string): string {
  const s = String(title || '').trim();
  if (!s) return name || '';
  const m = s.match(/t\(['"]([^'"]+)['"]/);
  if (m) return m[1];
  if (s.includes('{{')) return name || s;
  return s;
}

// type → Lucide key (custom-icons registry). Rendered via LIcon (guarded by icons.has, inline-SVG fallback).
const TYPE_ICON_KEY: Record<string, string> = {
  image: 'lucide-image', video: 'lucide-video', audio: 'lucide-music', pdf: 'lucide-file-text',
  doc: 'lucide-file-text', spreadsheet: 'lucide-file-spreadsheet', archive: 'lucide-file-archive', other: 'lucide-file',
};
const TYPE_LABEL: Record<string, string> = { image: 'Image', video: 'Video', audio: 'Audio', pdf: 'PDF', doc: 'Document', spreadsheet: 'Spreadsheet', archive: 'Archive', other: 'Other' };
const TYPE_TAG_COLOR: Record<string, string> = { image: 'green', video: 'purple', audio: 'magenta', pdf: 'red', doc: 'blue', spreadsheet: 'cyan', archive: 'gold', other: 'default' };

// Inline-SVG fallback for each Lucide key — used when @tuanla90/plugin-custom-icons isn't installed
// (icons.has(key) === false). Static, self-authored markup → dangerouslySetInnerHTML is safe here.
const SVG_INNER: Record<string, string> = {
  'lucide-image': '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  'lucide-file-text': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
  'lucide-file-spreadsheet': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/>',
  'lucide-file-archive': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><circle cx="10" cy="20" r="2"/><path d="M10 7V6"/><path d="M10 12v-1"/><path d="M10 18v-2"/>',
  'lucide-video': '<path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/>',
  'lucide-music': '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  'lucide-file': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
};
const InlineSvg: React.FC<{ k: string; size?: number }> = ({ k, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
    strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: '-0.15em' }}
    dangerouslySetInnerHTML={{ __html: SVG_INNER[k] || SVG_INNER['lucide-file'] }} />
);

interface FileItem {
  id: number; title?: string; filename?: string; extname?: string; size?: number; mimetype?: string;
  url?: string; preview?: string; path?: string; meta?: any; createdAt?: string; updatedAt?: string;
  storageId?: number; storageTitle?: string; storageName?: string; createdById?: number; uploader?: string; type: string;
}
interface UsageRecord { id: any; label: string; }
interface UsageEntry { collection: string; title: string; field: string; count: number; recordIds?: any[]; records?: UsageRecord[]; }
interface RefInfo { collection: string; title: string; field: string; type: string; }
interface StatsData {
  totalCount: number; totalBytes: number;
  byType: { type: string; count: number; bytes: number }[];
  storages: { id: number; title: string; name: string; default?: boolean; count: number; bytes: number }[];
  orphanCount: number; orphanBytes: number; refCount: number; scanOk: boolean; scanErrors: number; refs?: RefInfo[];
}

export function FileVaultPane({ api, Icon, icons }: { api: any; Icon?: any; icons?: any }) {
  const { token } = theme.useToken();

  // Lucide-by-key with icons.has() guard + inline-SVG fallback (established @tuanla90 custom-icons pattern).
  const LIcon: React.FC<{ type: string; size?: number; style?: React.CSSProperties }> = ({ type, size = 16, style }) =>
    Icon && icons?.has?.(type)
      ? <Icon type={type} style={{ fontSize: size, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', verticalAlign: '-0.125em', ...(style || {}) }} />
      : <InlineSvg k={type} size={size} />;

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<FileItem[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [sort, setSort] = useState('-createdAt');
  const [search, setSearch] = useState('');
  const [typeF, setTypeF] = useState<string>('');
  const [storageF, setStorageF] = useState<string>('all');
  const [range, setRange] = useState<any>(null);
  const [view, setView] = useState<string>('gallery');
  const [usedInCollection, setUsedInCollection] = useState<string>('');
  const [recordIdInput, setRecordIdInput] = useState<string>('');
  const [usedInRecordId, setUsedInRecordId] = useState<number | null>(null);

  const [stats, setStats] = useState<StatsData | null>(null);
  const [usageMap, setUsageMap] = useState<Record<string, UsageEntry[]>>({});
  const [orphanSet, setOrphanSet] = useState<Set<number>>(new Set());
  const [usageLoaded, setUsageLoaded] = useState(false);

  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  const [renaming, setRenaming] = useState<FileItem | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [usageModal, setUsageModal] = useState<FileItem | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);

  const req = (url: string, data?: any) => {
    if (!api?.request) return Promise.reject(new Error('API client not ready'));
    return api.request({ url, method: 'post', data }).then((r: any) => r?.data?.data ?? r?.data);
  };

  const rangeKey = range && range[0] && range[1] ? `${+range[0]}-${+range[1]}` : '';

  // ── data loading ──────────────────────────────────────────────────────────────────────────────
  const loadUsage = async (ids: number[]) => {
    setUsageLoaded(false);
    if (!ids?.length) { setUsageMap({}); setOrphanSet(new Set()); setUsageLoaded(true); return; }
    try {
      const res = await req('fileVault:usage', { ids });
      setUsageMap(res?.usage || {});
      setOrphanSet(new Set((res?.orphanIds || []).map((x: any) => Number(x))));
      setUsageLoaded(true);
    } catch {
      // Non-fatal — the page still works, just without usage badges.
      setUsageMap({}); setOrphanSet(new Set()); setUsageLoaded(false);
    }
  };

  const loadStats = async () => {
    try { setStats(await req('fileVault:stats')); }
    catch { setStats(null); }
  };

  const load = async (over: { page?: number; search?: string } = {}) => {
    setLoading(true);
    const p = over.page ?? 1;
    const s = over.search ?? search;
    try {
      const res = await req('fileVault:browse', {
        page: p, pageSize, sort, search: (s || '').trim(), type: typeF,
        storageId: storageF,
        dateFrom: range?.[0] ? range[0].startOf('day').toISOString() : null,
        dateTo: range?.[1] ? range[1].endOf('day').toISOString() : null,
        usedInCollection: usedInCollection || undefined,
        usedInRecordId: usedInCollection && usedInRecordId != null ? usedInRecordId : undefined,
      });
      const list: FileItem[] = res?.items || [];
      setItems(list); setCount(res?.count || 0); setPage(p);
      loadUsage(list.map((i) => i.id));
    } catch (e) {
      message.error(errMsg(e)); setItems([]); setCount(0);
    } finally { setLoading(false); }
  };

  // mount: stats once
  useEffect(() => { loadStats(); /* eslint-disable-next-line */ }, []);
  // filters → reload page 1 (also fires on mount = first data load)
  useEffect(() => { load({ page: 1 }); /* eslint-disable-next-line */ }, [sort, typeF, storageF, rangeKey, pageSize, usedInCollection, usedInRecordId]);

  const refreshAll = async () => { await Promise.all([load({ page }), loadStats()]); };

  const commitRecordId = () => {
    const n = recordIdInput === '' ? null : Number(recordIdInput);
    setUsedInRecordId(Number.isFinite(n as any) ? (n as number) : null);
  };

  // ── mutations ─────────────────────────────────────────────────────────────────────────────────
  const doRename = async () => {
    if (!renaming) return;
    setBusy(true);
    try {
      const r = await req('fileVault:rename', { id: renaming.id, title: renameVal });
      if (r?.ok === false) { message.error(r.error || t('Operation failed')); return; }
      setItems((prev) => prev.map((it) => (it.id === renaming.id ? { ...it, title: renameVal } : it)));
      message.success(t('Renamed'));
      setRenaming(null);
    } catch (e) { message.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  const doPurge = async (ids: number[]) => {
    setBusy(true);
    try {
      const r = await req('fileVault:purge', { ids });
      if (!r?.ok) { message.error(r?.error || t('Operation failed')); return; }
      message.success(t('Deleted {{n}} file(s), freed {{size}}', { n: String(r.deleted), size: humanSize(r.freedBytes) }));
      setSelected([]);
      await refreshAll();
    } catch (e) { message.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  // Bulk download as ZIP. Request the binary as a Blob (auth headers still sent by the apiClient), then
  // trigger a browser download via a temporary object-URL <a>. `ids` = selected, or null for a full backup.
  const downloadZip = async (ids: number[] | null, labelCount: number) => {
    setZipping(true);
    try {
      const resp = await api.request({ url: 'fileVault:downloadZip', method: 'post', data: { ids: ids && ids.length ? ids : undefined }, responseType: 'blob' });
      const blob: Blob = resp?.data instanceof Blob ? resp.data : new Blob([resp?.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `file-backup-${labelCount || 'all'}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      message.success(t('Downloaded {{n}} file(s) as ZIP', { n: String(labelCount) }));
    } catch (e: any) {
      // The server may return a JSON error as a Blob — read it back so the toast is meaningful.
      let msg = errMsg(e);
      try { const b = e?.response?.data; if (b instanceof Blob) { const j = JSON.parse(await b.text()); msg = j.error || msg; } } catch { /* keep errMsg */ }
      message.error(msg);
    } finally { setZipping(false); }
  };

  const usageCountOf = (id: number) => (usageMap[id] || []).reduce((s, u) => s + (u.count || 0), 0);
  const isOrphan = (id: number) => usageLoaded && orphanSet.has(id);
  const isUsed = (id: number) => (usageMap[id] || []).length > 0;

  const confirmDelete = (it: FileItem) => {
    const used = isUsed(it.id);
    const n = usageCountOf(it.id);
    Modal.confirm({
      title: t('Delete this file?'),
      icon: <ExclamationCircleOutlined />,
      width: 480,
      content: used
        ? <Alert type="warning" showIcon message={t('This file is used in {{n}} place(s). Deleting it will break those records.', { n: String(n) })} />
        : <span>{t('This file will be permanently deleted from storage. This cannot be undone.')}</span>,
      okText: t('Delete'), okButtonProps: { danger: true }, cancelText: t('Cancel'),
      onOk: () => doPurge([it.id]),
    });
  };

  const confirmBulkDelete = () => {
    if (!selected.length) return;
    const inUse = selected.filter((id) => isUsed(id));
    Modal.confirm({
      title: t('Delete {{n}} selected file(s)?', { n: String(selected.length) }),
      icon: <ExclamationCircleOutlined />,
      width: 480,
      content: inUse.length
        ? <Alert type="warning" showIcon message={t('{{n}} of them are used by records — deleting will break those records.', { n: String(inUse.length) })} />
        : <span>{t('These files will be permanently deleted from storage. This cannot be undone.')}</span>,
      okText: t('Delete'), okButtonProps: { danger: true }, cancelText: t('Cancel'),
      onOk: () => doPurge(selected),
    });
  };

  const confirmCleanOrphans = () => {
    const n = stats?.orphanCount || 0;
    const bytes = stats?.orphanBytes || 0;
    if (!n) { message.info(t('No orphan files to clean.')); return; }
    Modal.confirm({
      title: t('Clean {{n}} orphan file(s)?', { n: String(n) }),
      icon: <WarningOutlined />,
      width: 540,
      content: (
        <div>
          <Alert type="warning" showIcon style={{ marginBottom: 10 }}
            message={t('This permanently deletes {{n}} file(s) ({{size}}) that no record references.', { n: String(n), size: humanSize(bytes) })} />
          <Paragraph type="secondary" style={{ fontSize: 12, margin: 0 }}>
            {t('Note: only relational attachment-field references are detected. A file referenced only by a URL inside a text or JSON field is treated as an orphan. This cannot be undone.')}
          </Paragraph>
        </div>
      ),
      okText: t('Clean orphans'), okButtonProps: { danger: true }, cancelText: t('Cancel'),
      onOk: async () => {
        setBusy(true);
        try {
          const r = await req('fileVault:cleanOrphans', {});
          if (!r?.ok) { message.error(r?.error || t('Operation failed')); return; }
          message.success(t('Cleaned {{n}} file(s), freed {{size}}', { n: String(r.deleted), size: humanSize(r.freedBytes) }));
          setSelected([]);
          await refreshAll();
        } catch (e) { message.error(errMsg(e)); }
        finally { setBusy(false); }
      },
    });
  };

  const onPreview = (it: FileItem) => {
    if (it.type === 'image' && it.url) setPreviewSrc(it.url);
    else if (it.url) window.open(it.url, '_blank', 'noopener');
    else message.info(t('No file URL available.'));
  };

  const toggleSel = (id: number, on: boolean) =>
    setSelected((prev) => (on ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id)));

  // ── usage badge ────────────────────────────────────────────────────────────────────────────────
  const UsageBadge: React.FC<{ it: FileItem }> = ({ it }) => {
    if (!usageLoaded) return <Text type="secondary" style={{ fontSize: 11 }}>…</Text>;
    if (isOrphan(it.id)) return <Tag color="orange" style={{ cursor: 'default' }}>{t('Orphan')}</Tag>;
    const n = usageCountOf(it.id);
    if (!n) return <Text type="secondary" style={{ fontSize: 11 }}>—</Text>;
    return (
      <a onClick={(e) => { e.stopPropagation(); setUsageModal(it); }} style={{ fontSize: 12 }}>
        <Badge color={token.colorPrimary} /> {t('used in {{n}} place(s)', { n: String(n) })}
      </a>
    );
  };

  // ── thumbnail ─────────────────────────────────────────────────────────────────────────────────
  const Thumb: React.FC<{ it: FileItem; size: number }> = ({ it, size }) => {
    const [err, setErr] = useState(false);
    const box: React.CSSProperties = {
      width: size, height: size, borderRadius: token.borderRadius, background: token.colorFillTertiary,
      display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flex: '0 0 auto',
      color: token.colorTextTertiary,
    };
    if (it.type === 'image' && it.url && !err) {
      return (
        <div style={box}>
          <img src={it.preview || it.url} alt={it.title || ''} onError={() => setErr(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      );
    }
    return <div style={box}><LIcon type={TYPE_ICON_KEY[it.type] || TYPE_ICON_KEY.other} size={Math.round(size * 0.55)} /></div>;
  };

  // ── gallery card ──────────────────────────────────────────────────────────────────────────────
  const GalleryCard: React.FC<{ it: FileItem }> = ({ it }) => {
    const checked = selected.includes(it.id);
    return (
      <div style={{
        border: `1px solid ${checked ? token.colorPrimary : token.colorBorderSecondary}`,
        borderRadius: token.borderRadiusLG, background: token.colorBgContainer, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ position: 'relative', height: 132, background: token.colorFillQuaternary, cursor: 'pointer' }} onClick={() => onPreview(it)}>
          {it.type === 'image' && it.url
            ? <img src={it.preview || it.url} alt={it.title || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: token.colorTextTertiary }}><LIcon type={TYPE_ICON_KEY[it.type] || TYPE_ICON_KEY.other} size={46} /></div>}
          <div style={{ position: 'absolute', top: 6, left: 6 }} onClick={(e) => e.stopPropagation()}>
            <Checkbox checked={checked} onChange={(e) => toggleSel(it.id, e.target.checked)} />
          </div>
          <div style={{ position: 'absolute', top: 6, right: 6 }}>
            {isOrphan(it.id) ? <Tag color="orange" style={{ marginInlineEnd: 0 }}>{t('Orphan')}</Tag> : null}
          </div>
        </div>
        <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Tooltip title={it.filename}>
            <Text strong ellipsis style={{ fontSize: 13 }}>{it.title || it.filename || `#${it.id}`}</Text>
          </Tooltip>
          <Space size={4} wrap>
            <Tag color={TYPE_TAG_COLOR[it.type]} style={{ marginInlineEnd: 0 }}>
              <Space size={3}><LIcon type={TYPE_ICON_KEY[it.type]} size={12} />{t(TYPE_LABEL[it.type] || 'Other')}</Space>
            </Tag>
            <Text type="secondary" style={{ fontSize: 11 }}>{humanSize(it.size)}</Text>
          </Space>
          <Text type="secondary" style={{ fontSize: 11 }} ellipsis>
            {it.storageTitle || it.storageName || '—'} · {it.createdAt ? new Date(it.createdAt).toLocaleDateString() : ''}
          </Text>
          <div style={{ minHeight: 20 }}><UsageBadge it={it} /></div>
          <Space size={2} style={{ marginTop: 2 }}>
            <Tooltip title={t('Preview')}><Button size="small" type="text" icon={<EyeOutlined />} onClick={() => onPreview(it)} /></Tooltip>
            <Tooltip title={t('Rename')}><Button size="small" type="text" icon={<EditOutlined />} onClick={() => { setRenaming(it); setRenameVal(it.title || ''); }} /></Tooltip>
            <Tooltip title={t('Download')}><Button size="small" type="text" icon={<DownloadOutlined />} disabled={!it.url} onClick={() => it.url && window.open(it.url, '_blank', 'noopener')} /></Tooltip>
            <Tooltip title={t('Delete')}><Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => confirmDelete(it)} /></Tooltip>
          </Space>
        </div>
      </div>
    );
  };

  // ── table columns ─────────────────────────────────────────────────────────────────────────────
  const columns = [
    { title: '', key: 'thumb', width: 52, render: (_: any, it: FileItem) => <Thumb it={it} size={36} /> },
    {
      title: t('File'), key: 'title', render: (_: any, it: FileItem) => (
        <div>
          <Tooltip title={it.filename}><Text strong style={{ fontSize: 13 }}>{it.title || it.filename || `#${it.id}`}</Text></Tooltip>
          <div><Text type="secondary" style={{ fontSize: 11 }}>{it.filename}</Text></div>
        </div>
      ),
    },
    { title: t('Type'), key: 'type', width: 120, render: (_: any, it: FileItem) => <Tag color={TYPE_TAG_COLOR[it.type]}><Space size={3}><LIcon type={TYPE_ICON_KEY[it.type]} size={12} />{t(TYPE_LABEL[it.type] || 'Other')}</Space></Tag> },
    { title: t('Size'), key: 'size', width: 96, render: (_: any, it: FileItem) => humanSize(it.size) },
    { title: t('Storage'), key: 'storage', width: 130, render: (_: any, it: FileItem) => <Text type="secondary" style={{ fontSize: 12 }}>{it.storageTitle || it.storageName || '—'}</Text> },
    { title: t('Uploader'), key: 'uploader', width: 130, render: (_: any, it: FileItem) => <Text type="secondary" style={{ fontSize: 12 }}>{it.uploader || '—'}</Text> },
    { title: t('Created'), key: 'createdAt', width: 150, render: (_: any, it: FileItem) => <Text type="secondary" style={{ fontSize: 12 }}>{it.createdAt ? new Date(it.createdAt).toLocaleString() : '—'}</Text> },
    { title: t('Usage'), key: 'usage', width: 150, render: (_: any, it: FileItem) => <UsageBadge it={it} /> },
    {
      title: t('Actions'), key: 'actions', width: 150, render: (_: any, it: FileItem) => (
        <Space size={2}>
          <Tooltip title={t('Preview')}><Button size="small" type="text" icon={<EyeOutlined />} onClick={() => onPreview(it)} /></Tooltip>
          <Tooltip title={t('Rename')}><Button size="small" type="text" icon={<EditOutlined />} onClick={() => { setRenaming(it); setRenameVal(it.title || ''); }} /></Tooltip>
          <Tooltip title={t('Download')}><Button size="small" type="text" icon={<DownloadOutlined />} disabled={!it.url} onClick={() => it.url && window.open(it.url, '_blank', 'noopener')} /></Tooltip>
          <Tooltip title={t('Delete')}><Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => confirmDelete(it)} /></Tooltip>
        </Space>
      ),
    },
  ];

  const typeOptions = [
    { value: '', label: t('All types') },
    ...['image', 'video', 'audio', 'pdf', 'doc', 'spreadsheet', 'archive', 'other'].map((ty) => ({
      value: ty,
      label: <Space size={5}><LIcon type={TYPE_ICON_KEY[ty]} size={13} />{t(TYPE_LABEL[ty])}</Space>,
    })),
  ];
  const storageOptions = [
    { value: 'all', label: t('All storages') },
    ...((stats?.storages || []).map((s) => ({ value: String(s.id), label: `${s.title || s.name} (${s.count})` }))),
  ];
  const sortOptions = [
    { value: '-createdAt', label: t('Newest first') },
    { value: 'createdAt', label: t('Oldest first') },
    { value: '-size', label: t('Largest first') },
    { value: 'size', label: t('Smallest first') },
    { value: 'title', label: t('Name A→Z') },
  ];
  const collectionOptions = useMemo(() => {
    const m = new Map<string, string>();
    (stats?.refs || []).forEach((r) => { if (!m.has(r.collection)) m.set(r.collection, friendlyName(r.title, r.collection)); });
    return [{ value: '', label: t('Any collection') }, ...[...m.entries()].map(([value, label]) => ({ value, label }))];
  }, [stats]);

  const allPageIds = items.map((i) => i.id);
  const allChecked = allPageIds.length > 0 && allPageIds.every((id) => selected.includes(id));
  const someChecked = allPageIds.some((id) => selected.includes(id));

  const modalUsageList = usageModal ? (usageMap[usageModal.id] || []) : [];

  // ── stat tile ──────────────────────────────────────────────────────────────────────────────────
  const StatTile: React.FC<{ label: string; value: string; sub?: string; accent?: string }> = ({ label, value, sub, accent }) => (
    <div style={{
      flex: '1 1 130px', minWidth: 130, padding: '10px 14px',
      border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadiusLG, background: token.colorFillQuaternary,
    }}>
      <div style={{ fontSize: 12, color: token.colorTextSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.25, color: accent || token.colorText, whiteSpace: 'nowrap' }}>{value}</div>
      {sub ? <div style={{ fontSize: 11, color: token.colorTextTertiary, whiteSpace: 'nowrap' }}>{sub}</div> : null}
    </div>
  );

  return (
    <ConfigContainer maxWidth={1240}>
      <div style={{ marginBottom: 14 }}>
        <Title level={4} style={{ margin: 0 }}><FolderOpenOutlined /> {t('File Vault')}</Title>
        <Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
          {t('Browse, preview, rename and delete every uploaded file. See which records use each file, and clean up orphaned files to reclaim space.')}
        </Paragraph>
      </div>

      {/* ── stats ── */}
      <SettingCard style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <StatTile label={t('Total files')} value={stats ? String(stats.totalCount) : '—'} />
          <StatTile label={t('Total size')} value={stats ? humanSize(stats.totalBytes) : '—'} />
          <StatTile label={t('Orphan files')} value={stats ? String(stats.orphanCount) : '—'}
            accent={stats && stats.orphanCount > 0 ? token.colorWarning : undefined} />
          <StatTile label={t('Reclaimable')} value={stats ? humanSize(stats.orphanBytes) : '—'}
            accent={stats && stats.orphanCount > 0 ? token.colorWarning : undefined} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 12 }}>
          <div style={{ flex: 1, minWidth: 180, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(stats?.byType || []).map((bt) => (
              <Tag key={bt.type} color={TYPE_TAG_COLOR[bt.type]} style={{ marginInlineEnd: 0 }}>
                <Space size={4}><LIcon type={TYPE_ICON_KEY[bt.type]} size={12} />{t(TYPE_LABEL[bt.type] || 'Other')} {bt.count} · {humanSize(bt.bytes)}</Space>
              </Tag>
            ))}
          </div>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={refreshAll} disabled={busy}>{t('Refresh')}</Button>
            <Button icon={<DownloadOutlined />} loading={zipping} onClick={() => downloadZip(null, stats?.totalCount || 0)} disabled={busy || !stats || stats.totalCount === 0}>{t('Backup all (ZIP)')}</Button>
            <Tooltip title={stats && stats.scanErrors ? t('Some collections could not be scanned; orphan detection may be incomplete.') : ''}>
              <Button danger icon={<WarningOutlined />} disabled={busy || !stats || stats.orphanCount === 0} onClick={confirmCleanOrphans}>
                {t('Clean orphan files')}{stats?.orphanCount ? ` (${stats.orphanCount})` : ''}
              </Button>
            </Tooltip>
          </Space>
        </div>
        {stats && stats.scanOk === false && (
          <Alert type="info" showIcon style={{ marginTop: 10 }} message={t('Usage scan could not run — orphan counts are hidden.')} />
        )}
      </SettingCard>

      {/* ── filters ── */}
      <SettingCard style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <Input.Search allowClear placeholder={t('Search by name…')} style={{ width: 220 }}
            defaultValue={search}
            onSearch={(val) => { setSearch(val); load({ page: 1, search: val }); }} />
          <Select value={typeF} options={typeOptions} style={{ width: 160 }} onChange={setTypeF} />
          <Select value={storageF} options={storageOptions} style={{ width: 170 }} onChange={setStorageF} />
          <RangePicker value={range} onChange={setRange} allowEmpty={[true, true]} />
          <Select value={sort} options={sortOptions} style={{ width: 150 }} onChange={setSort} />
          <div style={{ flex: 1 }} />
          <Segmented value={view} onChange={(v) => setView(String(v))}
            options={[{ label: t('Gallery'), value: 'gallery' }, { label: t('Table'), value: 'table' }]} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>{t('Used in collection')}:</Text>
          <Select value={usedInCollection} options={collectionOptions} style={{ width: 210 }}
            onChange={(v) => { setUsedInCollection(v); setRecordIdInput(''); setUsedInRecordId(null); }} />
          <InputNumber
            value={recordIdInput === '' ? null : Number(recordIdInput)}
            onChange={(val) => setRecordIdInput(val == null ? '' : String(val))}
            onPressEnter={commitRecordId} onBlur={commitRecordId}
            disabled={!usedInCollection} placeholder={t('Record ID')} style={{ width: 130 }} controls={false} min={1} />
          {usedInCollection ? (
            <Button size="small" type="text" onClick={() => { setUsedInCollection(''); setRecordIdInput(''); setUsedInRecordId(null); }}>{t('Clear')}</Button>
          ) : null}
        </div>
        {selected.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Checkbox indeterminate={someChecked && !allChecked} checked={allChecked}
              onChange={(e) => { if (e.target.checked) setSelected(Array.from(new Set([...selected, ...allPageIds]))); else setSelected(selected.filter((id) => !allPageIds.includes(id))); }}>
              {t('Select all on page')}
            </Checkbox>
            <Text>{t('{{n}} selected', { n: String(selected.length) })}</Text>
            <Button size="small" icon={<DownloadOutlined />} loading={zipping} onClick={() => downloadZip(selected, selected.length)} disabled={busy}>{t('Download ZIP')}</Button>
            <Button size="small" danger icon={<DeleteOutlined />} onClick={confirmBulkDelete} disabled={busy || zipping}>{t('Delete selected')}</Button>
            <Button size="small" type="text" onClick={() => setSelected([])}>{t('Clear')}</Button>
          </div>
        )}
      </SettingCard>

      {/* ── content ── */}
      <SettingCard>
        <Spin spinning={loading || busy}>
          {items.length === 0 && !loading ? (
            <Empty description={t('No files found.')} />
          ) : view === 'gallery' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
              {items.map((it) => <GalleryCard key={it.id} it={it} />)}
            </div>
          ) : (
            <Table
              rowKey="id" size="small" columns={columns as any} dataSource={items} pagination={false}
              rowSelection={{ selectedRowKeys: selected, onChange: (keys) => setSelected(keys as number[]) }}
            />
          )}
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
            <Pagination
              current={page} pageSize={pageSize} total={count} showSizeChanger
              pageSizeOptions={['12', '24', '48', '96']}
              showTotal={(tot) => t('{{n}} files total', { n: String(tot) })}
              onChange={(p, ps) => { if (ps !== pageSize) setPageSize(ps); else load({ page: p }); }}
            />
          </div>
        </Spin>
      </SettingCard>

      {/* ── rename modal ── */}
      <Modal open={!!renaming} title={t('Rename file')} onCancel={() => setRenaming(null)} onOk={doRename}
        confirmLoading={busy} okText={t('Save')} cancelText={t('Cancel')} destroyOnClose>
        <div style={{ marginTop: 8 }}>
          <Input value={renameVal} onChange={(e) => setRenameVal(e.target.value)} addonAfter={renaming?.extname || undefined}
            placeholder={t('Display name')} onPressEnter={doRename} />
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
            {t('System filename')}: {renaming?.filename}
          </Text>
        </div>
      </Modal>

      {/* ── usage modal ── */}
      <Modal open={!!usageModal} title={t('Where is this file used?')} footer={null} onCancel={() => setUsageModal(null)} destroyOnClose>
        {modalUsageList.length ? (
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            {modalUsageList.map((u, i) => (
              <div key={i} style={{ padding: '8px 10px', border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadius }}>
                <div>
                  <Text strong>{friendlyName(u.title, u.collection)}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>{`  (${u.collection}.${u.field})`}</Text>
                </div>
                <div style={{ marginTop: 2 }}><Text type="secondary" style={{ fontSize: 12 }}>{t('{{n}} record(s)', { n: String(u.count) })}</Text></div>
                {(u.records && u.records.length) ? (
                  <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {u.records.map((r) => (
                      <Tooltip key={String(r.id)} title={t('Record')}>
                        <Tag style={{ marginInlineEnd: 0 }}>{r.label ? `${r.label} (#${r.id})` : `#${r.id}`}</Tag>
                      </Tooltip>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </Space>
        ) : <Empty description={t('Not referenced by any record (orphan).')} />}
      </Modal>

      {/* hidden controlled image preview */}
      {previewSrc && (
        <Image style={{ display: 'none' }} src={previewSrc}
          preview={{ visible: true, src: previewSrc, onVisibleChange: (v) => { if (!v) setPreviewSrc(null); } }} />
      )}
    </ConfigContainer>
  );
}

export default FileVaultPane;
