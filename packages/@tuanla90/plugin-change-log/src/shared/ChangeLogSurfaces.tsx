import React, { useEffect, useRef, useState } from 'react';
import { Badge, Button, Drawer, Popover, Spin } from 'antd';
import { IconByKey } from '@tuanla90/shared';
import { ChangeLogTimeline } from './ChangeLogTimeline';
import { ChangeLogEntry } from './types';
import {
  CHANGELOG_REFRESH_EVENT,
  fetchFields,
  fetchHistory,
  fetchHistoryCount,
  installChangeLogRefreshHook,
  t,
} from './changeLogClient';

// Fetches a record's history and renders the timeline. Used by both the popover and the drawer.
export const ChangeLogHistory: React.FC<{
  api: any;
  collectionName: string;
  recordId: string | number;
  fieldName?: string;
  compact?: boolean;
  active?: boolean;
}> = ({ api, collectionName, recordId, fieldName, compact, active = true }) => {
  const [entries, setEntries] = useState<ChangeLogEntry[]>([]);
  const [fields, setFields] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const hasData = useRef(false);

  // Auto-refresh: install the mutation hook once and re-fetch this record's timeline whenever any
  // record is saved — so a new change-log entry shows up without a manual F5.
  useEffect(() => {
    installChangeLogRefreshHook(api);
    const onRefresh = () => setReloadKey((k) => k + 1);
    window.addEventListener(CHANGELOG_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(CHANGELOG_REFRESH_EVENT, onRefresh);
  }, [api]);

  // A different record scrolled into scope → show the spinner again on its first load.
  useEffect(() => {
    hasData.current = false;
  }, [collectionName, recordId, fieldName]);

  useEffect(() => {
    if (!active || recordId === undefined || recordId === null || recordId === '') return;
    let cancelled = false;
    // Spinner only on the first load; a background refresh keeps the current timeline on screen.
    if (!hasData.current) setLoading(true);
    Promise.all([fetchHistory(api, collectionName, recordId, fieldName), fetchFields(api, collectionName)])
      .then(([rows, flds]) => {
        if (cancelled) return;
        setEntries(rows);
        setFields(flds);
        hasData.current = true;
      })
      .catch(() => !cancelled && setEntries([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [api, collectionName, recordId, fieldName, active, reloadKey]);

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Spin />
      </div>
    );
  }
  return <ChangeLogTimeline entries={entries} fields={fields} compact={compact} />;
};

// Expose the history components on a global so other @tuanla90 plugins (e.g. status-flow's status
// cell) can render a history popover WITHOUT a hard dependency — same bridge pattern as
// globalThis.__ptdlCondFmt. No-op consumers if change-log isn't installed.
export function exposeChangeLogBridge() {
  (globalThis as any).__ptdlChangeLog = { ChangeLogTrigger, ChangeLogHistory };
}

// A trigger button that shows the history either inline in a Popover (compact) or in a Drawer
// (full). Reused by the record action model and can be dropped anywhere with a record context.
export const ChangeLogTrigger: React.FC<{
  api: any;
  collectionName: string;
  recordId: string | number;
  fieldName?: string;
  mode?: 'popover' | 'drawer';
  showBadge?: boolean;
  label?: React.ReactNode;
  buttonProps?: any;
}> = ({ api, collectionName, recordId, fieldName, mode = 'drawer', showBadge, label, buttonProps }) => {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<number>(0);
  const [reloadKey, setReloadKey] = useState(0);
  const icon = <IconByKey type="lucide-history" />;
  const btnLabel = label ?? t('History');

  // Keep the badge live: install the mutation hook and bump on the refresh event so the count
  // updates right after a record is saved (not just when the panel is opened/closed).
  useEffect(() => {
    if (!showBadge) return;
    installChangeLogRefreshHook(api);
    const onRefresh = () => setReloadKey((k) => k + 1);
    window.addEventListener(CHANGELOG_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(CHANGELOG_REFRESH_EVENT, onRefresh);
  }, [api, showBadge]);

  // Count badge: refetch on record change, when the panel closes, and on any live refresh.
  useEffect(() => {
    if (!showBadge || recordId === undefined || recordId === null || recordId === '') return;
    let cancelled = false;
    fetchHistoryCount(api, collectionName, recordId).then((n) => !cancelled && setCount(n));
    return () => {
      cancelled = true;
    };
  }, [api, collectionName, recordId, showBadge, open, reloadKey]);

  const withBadge = (node: React.ReactElement) =>
    showBadge ? (
      <Badge count={count} size="small" offset={[-2, 2]}>
        {node}
      </Badge>
    ) : (
      node
    );

  if (mode === 'popover') {
    return (
      <Popover
        trigger={['click']}
        placement="bottomRight"
        open={open}
        onOpenChange={setOpen}
        content={
          <div style={{ width: 380, maxHeight: 460, overflow: 'auto' }}>
            <ChangeLogHistory api={api} collectionName={collectionName} recordId={recordId} fieldName={fieldName} compact active={open} />
          </div>
        }
      >
        {withBadge(
          <Button {...buttonProps} icon={icon}>
            {btnLabel}
          </Button>,
        )}
      </Popover>
    );
  }

  return (
    <>
      {withBadge(
        <Button {...buttonProps} icon={icon} onClick={() => setOpen(true)}>
          {btnLabel}
        </Button>,
      )}
      <Drawer title={t('Change history')} width={560} open={open} onClose={() => setOpen(false)} destroyOnClose>
        <ChangeLogHistory api={api} collectionName={collectionName} recordId={recordId} fieldName={fieldName} active={open} />
      </Drawer>
    </>
  );
};
