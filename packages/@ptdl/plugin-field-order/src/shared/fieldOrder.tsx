import { ArrowDownOutlined, ArrowUpOutlined, HolderOutlined, SwapOutlined } from '@ant-design/icons';
import { Button, Modal, Spin, Tag, Tooltip, Typography, message } from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import * as ReactDOM from 'react-dom';

// The API client differs per lane but is passed in as a resolved INSTANCE (not a hook): this module
// mounts its OWN React root at document.body (see initFieldOrder) rather than riding NocoBase's
// provider tree — the Collection Manager lives under `/admin/settings/*`, a render subtree that
// `app.addProvider` providers do NOT reach, so a provider-based injection never runs there. A
// body-level root is route-independent. It also means we import NOTHING from @nocobase/client(-v2).
export type FieldOrderDeps = {
  apiClient: any;
  t: (s: string, opts?: Record<string, any>) => string;
};

type FieldItem = { name: string; title: string; iface?: string };

const ROOT_ID = 'ptdl-fo-root';
const HOST_ID = 'ptdl-fo-host';

// Only real UI fields are reorderable — same filter the core screen uses (has an interface, or is a
// relation with a source). Excludes system columns (id/createdAt/…) that never show in the picker.
const UI_FIELD_FILTER = { $or: [{ 'interface.$not': null }, { 'options.source.$notEmpty': true }] };

// The last collections-list row the user clicked to open a drawer — the lane-independent source of
// truth for "which collection is this Configure-fields drawer about". The classic (/admin) lane also
// carries aria-labels we could parse, but the modern (/v/) lane exposes NONE, so the collection name
// and the reopen trigger both come from the click the user just made. We also keep the clicked
// <a> element itself to reopen the exact drawer for the post-save refresh.
// The Configure-fields drawer ONLY lives under the Collection Manager (data-source-manager) route.
// Gating everything on it keeps us off record-edit drawers on ordinary app pages — those have a
// sub-table (`tr[data-row-key]`) + a Submit primary button that would otherwise match the structural
// heuristic, and their row clicks are record ids, not collection names.
function onCollectionManager(): boolean {
  return typeof location !== 'undefined' && location.pathname.indexOf('data-source-manager') >= 0;
}

type LastClick = { collection: string; link: HTMLElement | null; time: number };
let lastClick: LastClick = { collection: '', link: null, time: 0 };
function trackClick(e: Event) {
  if (!onCollectionManager()) return;
  const el = e.target as Element;
  if (!el || !el.closest) return;
  const tr = el.closest('tr[data-row-key]') as HTMLElement | null;
  // Only rows of the collections LIST (not the field rows inside the drawer's own table).
  if (!tr || tr.closest('.ant-drawer')) return;
  const collection = tr.getAttribute('data-row-key') || '';
  if (collection) lastClick = { collection, link: el.closest('a') as HTMLElement | null, time: Date.now() };
}

/**
 * Locate the open Configure-fields drawer + its toolbar `.ant-space`, cross-lane. Signal (no
 * aria-labels on /v/): an open drawer holding a field table (rows keyed by field name) AND a primary
 * "Add field" button sitting in a multi-button toolbar Space. The collection name comes from the
 * recent row click that opened it.
 */
function findDrawer(): { space: HTMLElement; collectionName: string } | null {
  // Only ever inject on the Collection Manager route (never on record-edit drawers elsewhere).
  if (!onCollectionManager()) return null;
  // A drawer only opens via a row click, and its mask blocks background clicks while open, so
  // lastClick stays pinned to the collection this drawer is about (no time gate needed — that would
  // make the button vanish from a drawer left open a while).
  if (!lastClick.collection) return null;
  const drawers = Array.from(document.querySelectorAll('.ant-drawer-open')) as HTMLElement[];
  for (const dw of drawers) {
    if (!dw.querySelector('tr[data-row-key]')) continue; // the field table
    const primaries = Array.from(dw.querySelectorAll('.ant-btn-primary')) as HTMLElement[];
    for (const p of primaries) {
      const space = p.closest('.ant-space') as HTMLElement | null;
      if (space && space.querySelectorAll('.ant-btn').length >= 2) {
        return { space, collectionName: lastClick.collection };
      }
    }
  }
  return null;
}

/**
 * Refresh the drawer's field table after a save: the table fetches `collections/<c>/fields:list`
 * ordered by sort on mount, so closing + reopening re-fetches and shows the new order. (No external
 * handle to the table's own refresh; close/reopen is the reliable, verified path.) Reopen by
 * re-clicking the exact trigger the user used — it still sits in the collections table behind the drawer.
 */
function refreshDrawer() {
  const dw = document.querySelector('.ant-drawer-open');
  (dw?.querySelector('.ant-drawer-close') as HTMLElement | null)?.click();
  const link = lastClick.link;
  setTimeout(() => link?.click(), 300);
}

/** The drag-and-drop reorder dialog. Fetches the collection's UI fields in current sort order. */
const ReorderModal: React.FC<{
  open: boolean;
  collectionName: string;
  apiClient: any;
  t: FieldOrderDeps['t'];
  onClose: () => void;
}> = ({ open, collectionName, apiClient, t, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<FieldItem[]>([]);
  const [overIdx, setOverIdx] = useState(-1);
  const dragIdx = useRef(-1);

  useEffect(() => {
    if (!open || !collectionName) return;
    let alive = true;
    setLoading(true);
    setItems([]);
    apiClient
      .request({
        url: `collections/${collectionName}/fields:list`,
        method: 'get',
        // filter as a JSON STRING: this apiClient serializes params with qs bracket-notation, which
        // DROPS null values (`interface.$not: null` would vanish, matching 0 plain fields). A string
        // param serializes verbatim to `filter=<json>` — exactly how the core drawer sends it.
        params: { paginate: false, sort: ['sort'], filter: JSON.stringify(UI_FIELD_FILTER) },
      })
      .then((res: any) => {
        if (!alive) return;
        const rows: any[] = res?.data?.data || [];
        setItems(
          rows.map((f) => ({ name: f.name, title: (f.uiSchema && f.uiSchema.title) || f.name, iface: f.interface })),
        );
      })
      .catch(() => {
        if (alive) message.error(t('Failed to load fields'));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, collectionName, apiClient]);

  const move = (from: number, to: number) =>
    setItems((prev) => {
      if (to < 0 || to >= prev.length || from === to) return prev;
      const a = [...prev];
      const [x] = a.splice(from, 1);
      a.splice(to, 0, x);
      return a;
    });

  const save = async () => {
    if (!items.length) return onClose();
    setSaving(true);
    try {
      await apiClient.request({
        url: 'fieldOrder:reorder',
        method: 'post',
        data: { collectionName, order: items.map((i) => i.name) },
      });
      message.success(t('Field order updated'));
      onClose();
      refreshDrawer();
    } catch (e) {
      message.error(t('Failed to update field order'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={save}
      confirmLoading={saving}
      okText={t('Save')}
      cancelText={t('Cancel')}
      okButtonProps={{ disabled: loading || items.length === 0 }}
      title={t('Reorder fields')}
      width={460}
      destroyOnClose
      zIndex={2000}
    >
      <Typography.Paragraph type="secondary" style={{ marginTop: 0, fontSize: 12 }}>
        {t('Drag rows to reorder, then Save. Applies to this screen and new blocks; existing blocks keep their layout.')}
      </Typography.Paragraph>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin />
        </div>
      ) : items.length === 0 ? (
        <Typography.Text type="secondary">{t('No reorderable fields')}</Typography.Text>
      ) : (
        <div style={{ maxHeight: '55vh', overflow: 'auto' }}>
          {items.map((it, i) => (
            <div
              key={it.name}
              draggable
              onDragStart={() => {
                dragIdx.current = i;
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (overIdx !== i) setOverIdx(i);
              }}
              onDragLeave={() => setOverIdx((v) => (v === i ? -1 : v))}
              onDrop={(e) => {
                e.preventDefault();
                const from = dragIdx.current;
                if (from >= 0) move(from, i);
                dragIdx.current = -1;
                setOverIdx(-1);
              }}
              onDragEnd={() => {
                dragIdx.current = -1;
                setOverIdx(-1);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                marginBottom: 6,
                borderRadius: 6,
                cursor: 'move',
                border: '1px solid rgba(0,0,0,0.08)',
                outline: overIdx === i ? '2px solid #1677ff' : 'none',
                background: 'rgba(0,0,0,0.02)',
              }}
            >
              <HolderOutlined style={{ opacity: 0.4 }} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <span style={{ fontWeight: 500 }}>{it.title}</span>
                <span style={{ opacity: 0.45, marginLeft: 8, fontSize: 12 }}>{it.name}</span>
              </span>
              {it.iface ? <Tag style={{ marginInlineEnd: 0, fontSize: 11, opacity: 0.7 }}>{it.iface}</Tag> : null}
              <Tooltip title={t('Move up')}>
                <Button
                  size="small"
                  type="text"
                  icon={<ArrowUpOutlined />}
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                />
              </Tooltip>
              <Tooltip title={t('Move down')}>
                <Button
                  size="small"
                  type="text"
                  icon={<ArrowDownOutlined />}
                  disabled={i === items.length - 1}
                  onClick={() => move(i, i + 1)}
                />
              </Tooltip>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
};

/**
 * The self-contained root: watches for the Configure-fields drawer and portals a "Reorder fields"
 * button into its toolbar; the button opens the drag-and-drop dialog. Mounted once at body level by
 * initFieldOrder, so it runs on every route (including the settings pages the router providers miss).
 */
const FieldOrderRoot: React.FC<FieldOrderDeps> = ({ apiClient, t }) => {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [collectionName, setCollectionName] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let raf = 0;
    const ensure = () => {
      const found = findDrawer();
      if (!found) {
        document.getElementById(HOST_ID)?.remove();
        setHost((h) => (h ? null : h));
        setCollectionName((c) => (c ? '' : c));
        return;
      }
      let h = document.getElementById(HOST_ID) as HTMLElement | null;
      if (!h) {
        h = document.createElement('div');
        h.id = HOST_ID;
        h.className = 'ant-space-item'; // slot into the toolbar's flex spacing
      }
      // Sit at the head of the (right-aligned) toolbar cluster; re-insert only when React detached it.
      if (h.parentElement !== found.space) found.space.insertBefore(h, found.space.firstChild);
      setHost((prev) => (prev === h ? prev : h));
      setCollectionName((prev) => (prev === found.collectionName ? prev : found.collectionName));
    };

    const runEnsure = () => {
      try {
        ensure();
      } catch (e) {
        /* keep the interval alive */
      }
    };
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        runEnsure();
      });
    };

    runEnsure();
    // Capture-phase so we record the collection BEFORE the drawer opens (and even if the row's own
    // handler stops propagation).
    document.addEventListener('click', trackClick, true);
    const obs = new MutationObserver(schedule);
    obs.observe(document.body, { childList: true, subtree: true });
    // Direct (NOT rAF/visibility-gated): requestAnimationFrame is paused on hidden/backgrounded tabs,
    // so a plain interval is the reliable driver — it keeps injecting when the tab isn't focused
    // (and makes the feature observable under automated/headless browsers).
    const id = window.setInterval(runEnsure, 1000);
    return () => {
      document.removeEventListener('click', trackClick, true);
      obs.disconnect();
      window.clearInterval(id);
      if (raf) cancelAnimationFrame(raf);
      document.getElementById(HOST_ID)?.remove();
    };
  }, []);

  return (
    <>
      {host && collectionName
        ? ReactDOM.createPortal(
            <Button icon={<SwapOutlined rotate={90} />} onClick={() => setOpen(true)}>
              {t('Reorder fields')}
            </Button>,
            host,
          )
        : null}
      <ReorderModal
        open={open}
        collectionName={collectionName}
        apiClient={apiClient}
        t={t}
        onClose={() => setOpen(false)}
      />
    </>
  );
};

/**
 * Mount the feature. Call once from each client lane's `load()` with the lane's resolved apiClient
 * instance. Idempotent (guards on the body container) and uses the host's legacy `react-dom` render
 * (synchronous; react-dom/client's createRoot subpath isn't externalized by the NocoBase builder).
 */
export function initFieldOrder({ apiClient, t }: FieldOrderDeps) {
  if (typeof document === 'undefined') return;
  if (document.getElementById(ROOT_ID)) return; // already mounted (other lane / re-load)
  const container = document.createElement('div');
  container.id = ROOT_ID;
  document.body.appendChild(container);
  const rd: any = ReactDOM as any;
  try {
    rd.render(<FieldOrderRoot apiClient={apiClient} t={t} />, container);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[field-order] mount failed', e);
  }
}
