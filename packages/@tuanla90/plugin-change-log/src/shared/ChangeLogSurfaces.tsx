import React, { useEffect, useState } from 'react';
import { Badge, Button, Drawer, Popover, Spin } from 'antd';
import { IconByKey } from '@tuanla90/shared';
import { ChangeLogTimeline } from './ChangeLogTimeline';
import { ChangeLogEntry } from './types';
import { fetchFields, fetchHistory, fetchHistoryCount, t } from './changeLogClient';

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
  useEffect(() => {
    if (!active || recordId === undefined || recordId === null || recordId === '') return;
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchHistory(api, collectionName, recordId, fieldName), fetchFields(api, collectionName)])
      .then(([rows, flds]) => {
        if (cancelled) return;
        setEntries(rows);
        setFields(flds);
      })
      .catch(() => !cancelled && setEntries([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [api, collectionName, recordId, fieldName, active]);

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
  const icon = <IconByKey type="lucide-history" />;
  const btnLabel = label ?? t('History');

  // Count badge: fetch once (and refresh when the panel closes, in case a transition happened).
  useEffect(() => {
    if (!showBadge || recordId === undefined || recordId === null || recordId === '') return;
    let cancelled = false;
    fetchHistoryCount(api, collectionName, recordId).then((n) => !cancelled && setCount(n));
    return () => {
      cancelled = true;
    };
  }, [api, collectionName, recordId, showBadge, open]);

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
