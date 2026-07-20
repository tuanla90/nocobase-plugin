import React, { useEffect, useState } from 'react';
import { Cascader, Space, Tag, theme } from 'antd';
import { getFields } from './fieldPicker';
import { st } from './i18n';

/**
 * "Relation appends" cascader — canonical shared version (was copy-pasted as print-template's
 * `AppendsPicker` and line-generator's `RelationAppendsPicker`).
 *
 * Unlike `FieldPickerCascader` (which picks LEAF columns), this picks RELATION dot-paths for a
 * `:get`/`:list` `appends` param: hover expands nested relations (eager tree to `depth`, default 3),
 * each pick joins to a dot-path (`items.product`) and becomes a removable tag. A picked path loads
 * ALL columns of every object along it — no per-column picking. Options come from the same
 * per-collection `collections:get?appends=fields` cache as the field picker (`getFields`).
 *
 * antd-only — works in both the /v/ and /admin lanes.
 */

const REL_TYPES = ['hasMany', 'belongsToMany', 'hasOne', 'belongsTo'];

function cleanTitle(raw: any, fallback: string): string {
  const s = String(raw ?? '');
  const m = s.match(/\{\{\s*t\(\s*['"]([^'"]+)['"]/);
  if (m) return m[1];
  if (!s || /\{\{/.test(s)) return fallback;
  return s;
}
const relLabel = (f: any) => `${cleanTitle(f?.uiSchema?.title, f?.name)} (${f?.name})`;

/** Eager relation tree to `depth` levels: `{value,label,children}` Cascader options. */
export async function buildRelationOptions(
  api: any,
  collection: string,
  depth: number,
  dataSourceKey?: string,
): Promise<any[]> {
  if (depth <= 0) return [];
  const rels = (await getFields(api, collection, dataSourceKey)).filter(
    (f: any) => REL_TYPES.includes(f.type) && f.target,
  );
  return Promise.all(
    rels.map(async (f: any) => {
      const children = depth > 1 ? await buildRelationOptions(api, f.target, depth - 1, dataSourceKey) : [];
      return { value: f.name, label: relLabel(f), children: children.length ? children : undefined };
    }),
  );
}

export interface RelationAppendsPickerProps {
  api: any;
  collectionName?: string;
  value?: string[];
  onChange: (v: string[]) => void;
  /** Relation nesting depth of the cascader (default 3). */
  depth?: number;
  dataSourceKey?: string;
  /** Optional caption under the tags (plugin-specific usage help). */
  hint?: React.ReactNode;
}

export const RelationAppendsPicker: React.FC<RelationAppendsPickerProps> = ({
  api,
  collectionName,
  value,
  onChange,
  depth = 3,
  dataSourceKey,
  hint,
}) => {
  const { token } = theme.useToken();
  const [opts, setOpts] = useState<any[]>([]);
  useEffect(() => {
    let live = true;
    if (collectionName) buildRelationOptions(api, collectionName, depth, dataSourceKey).then((o) => live && setOpts(o));
    else setOpts([]);
    return () => {
      live = false;
    };
  }, [api, collectionName, depth, dataSourceKey]);
  const list = value || [];
  return (
    <div>
      <Space size={4} wrap>
        {list.map((p) => (
          <Tag
            key={p}
            closable
            onClose={(e) => {
              e.preventDefault();
              onChange(list.filter((x) => x !== p));
            }}
          >
            {p}
          </Tag>
        ))}
        <Cascader
          options={opts}
          changeOnSelect
          expandTrigger="hover"
          value={[]}
          disabled={!opts.length}
          onChange={(val: any) => {
            if (Array.isArray(val) && val.length) {
              const p = val.join('.');
              if (!list.includes(p)) onChange([...list, p]);
            }
          }}
        >
          <a style={{ fontSize: 12.5, cursor: opts.length ? 'pointer' : 'not-allowed', color: opts.length ? undefined : token.colorTextDisabled }}>
            {st('＋ Thêm quan hệ ▾')}
          </a>
        </Cascader>
      </Space>
      {hint ? <div style={{ fontSize: 12, color: token.colorTextTertiary, marginTop: 4 }}>{hint}</div> : null}
    </div>
  );
};
