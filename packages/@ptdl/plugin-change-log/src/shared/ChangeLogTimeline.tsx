import React from 'react';
import { Empty, Tag, Tooltip, theme } from 'antd';
import { IconByKey, TAG_HEX } from '@ptdl/shared';
import { ChangeLogEntry, SOURCE_META, formatDuration } from './types';
import { exactTime, initialsOf, makeFieldResolvers, relativeTime, t, timeInValue } from './changeLogClient';

// One consistent type scale (px) so the timeline doesn't mix sizes.
const FS = { big: 15, title: 14, body: 13, meta: 12 };

// The change-history timeline (data-driven version of the mockup): a header summary with the
// current value, lead time, transition count and a time-in-value bar, then one row per change
// with actor, role, source, time-in-previous-value and an optional note.

const hexOf = (color?: string) => (color && (TAG_HEX as any)[color]) || (TAG_HEX as any).default || '#8c8c8c';

const SourceChip: React.FC<{ source?: string }> = ({ source }) => {
  const meta = (source && (SOURCE_META as any)[source]) || null;
  if (!meta) return null;
  const label = t(meta.label);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        border: '1px solid rgba(128,128,128,0.35)',
        borderRadius: 999,
        padding: '0 8px',
        fontSize: FS.meta,
        lineHeight: '18px',
      }}
    >
      <IconByKey type={meta.icon} />
      {label}
    </span>
  );
};

const Avatar: React.FC<{ name?: string | null }> = ({ name }) => (
  <span
    style={{
      width: 22,
      height: 22,
      borderRadius: '50%',
      background: 'rgba(22,119,255,0.12)',
      color: '#1677ff',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 11,
      flexShrink: 0,
    }}
  >
    {initialsOf(name)}
  </span>
);

const metaLabel = (m: any, fallback?: string | null) =>
  (m && m.label) || (fallback == null || fallback === '' ? '—' : String(fallback));

export const ChangeLogTimeline: React.FC<{ entries: ChangeLogEntry[]; fields?: any[]; compact?: boolean }> = ({
  entries,
  fields,
  compact,
}) => {
  const { token } = theme.useToken();
  const { labelOf, valueOf } = makeFieldResolvers(fields || []);
  if (!entries?.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('No history yet')} />;
  }

  const latest = entries[0];
  const oldest = entries[entries.length - 1];
  const leadMs = Date.now() - new Date(oldest.createdAt).getTime();
  const buckets = timeInValue(entries);
  const totalBar = buckets.reduce((a, b) => a + b.ms, 0) || 1;

  return (
    <div>
      {/* header summary */}
      <div
        style={{
          border: '0.5px solid rgba(128,128,128,0.25)',
          borderRadius: 12,
          padding: '10px 14px',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tag color={latest.toMeta?.color} style={{ marginInlineEnd: 0 }}>
              {latest.toMeta?.icon ? (
                <span style={{ marginRight: 5 }}>
                  <IconByKey type={latest.toMeta.icon} />
                </span>
              ) : null}
              {metaLabel(latest.toMeta, latest.toValue)}
            </Tag>
            <span style={{ fontSize: FS.body, opacity: 0.6 }}>{t('current')} · {formatDuration(Date.now() - new Date(latest.createdAt).getTime())}</span>
          </div>
          <div style={{ display: 'flex', gap: 18 }}>
            <div>
              <div style={{ fontSize: FS.meta, opacity: 0.5 }}>{t('Lead time')}</div>
              <div style={{ fontSize: FS.big, fontWeight: 500 }}>{formatDuration(leadMs) || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: FS.meta, opacity: 0.5 }}>{t('Changes')}</div>
              <div style={{ fontSize: FS.big, fontWeight: 500 }}>{entries.length}</div>
            </div>
          </div>
        </div>
        {buckets.length > 1 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden' }}>
              {buckets.map((b) => (
                <div key={b.value} title={`${metaLabel(b.meta, b.value)} · ${formatDuration(b.ms)}`}
                  style={{ width: `${(b.ms / totalBar) * 100}%`, background: hexOf(b.meta?.color) }} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: FS.meta, opacity: 0.75, flexWrap: 'wrap' }}>
              {buckets.slice(0, 5).map((b) => (
                <span key={b.value} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: hexOf(b.meta?.color) }} />
                  {metaLabel(b.meta, b.value)} · {formatDuration(b.ms)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* timeline */}
      <div style={{ position: 'relative', paddingLeft: 26 }}>
        <div style={{ position: 'absolute', left: 9, top: 6, bottom: 6, width: 2, background: 'rgba(128,128,128,0.25)' }} />
        {entries.map((e, i) => {
          const isCreate = e.source === 'create' || e.fromValue == null;
          const dotHex = hexOf(e.toMeta?.color);
          return (
            <div key={e.id ?? i} style={{ position: 'relative', marginBottom: i === entries.length - 1 ? 0 : 16 }}>
              <span
                style={{
                  position: 'absolute',
                  left: -26,
                  top: 2,
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: dotHex,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  boxShadow: `0 0 0 3px ${token.colorBgElevated}`,
                }}
              >
                {e.toMeta?.icon ? <IconByKey type={e.toMeta.icon} /> : null}
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: FS.title, fontWeight: 500 }}>{metaLabel(e.toMeta, e.toValue)}</span>
                {!isCreate && (
                  <span style={{ fontSize: FS.body, opacity: 0.5 }}>← {metaLabel(e.fromMeta, e.fromValue)}</span>
                )}
                {isCreate && (
                  <span style={{ fontSize: FS.meta, opacity: 0.55, background: 'rgba(128,128,128,0.12)', padding: '1px 8px', borderRadius: 999 }}>
                    {t('created')}
                  </span>
                )}
                <Tooltip title={exactTime(e.createdAt)}>
                  <span style={{ marginLeft: 'auto', fontSize: FS.meta, opacity: 0.5 }}>{relativeTime(e.createdAt)}</span>
                </Tooltip>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap', fontSize: FS.body, opacity: 0.85 }}>
                {(e.userName || e.userId) && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Avatar name={e.userName || String(e.userId)} />
                    {e.userName || `#${e.userId}`}
                  </span>
                )}
                {e.roleName && (
                  <span style={{ background: 'rgba(22,119,255,0.12)', color: '#1677ff', fontSize: FS.meta, padding: '1px 8px', borderRadius: 999 }}>
                    {e.roleName}
                  </span>
                )}
                <SourceChip source={e.source} />
                {!isCreate && e.durationMs ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, opacity: 0.6, fontSize: FS.meta }}>
                    <IconByKey type="lucide-clock" />
                    {t('in')} "{metaLabel(e.fromMeta, e.fromValue)}" {formatDuration(Number(e.durationMs))}
                  </span>
                ) : null}
              </div>
              {e.note && !compact ? (
                <div
                  style={{
                    marginTop: 8,
                    padding: '8px 12px',
                    background: 'rgba(128,128,128,0.06)',
                    borderLeft: '2px solid rgba(128,128,128,0.4)',
                    fontSize: FS.body,
                    opacity: 0.85,
                    fontStyle: 'italic',
                  }}
                >
                  “{e.note}”
                </div>
              ) : null}
              {!compact && e.snapshot && Object.keys(e.snapshot).length ? (
                <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {Object.entries(e.snapshot).map(([k, v]) => (
                    <span
                      key={k}
                      style={{
                        fontSize: FS.meta,
                        background: 'rgba(128,128,128,0.1)',
                        borderRadius: 6,
                        padding: '2px 8px',
                      }}
                    >
                      <span style={{ opacity: 0.6 }}>{labelOf(k)}:</span> {valueOf(k, v)}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};
