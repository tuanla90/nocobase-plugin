import React from 'react';
import { uid } from '@formily/shared';
import { observer, useField, useFieldSchema } from '@formily/react';
import {
  SchemaSettings,
  SchemaSettingsModalItem,
  SchemaSettingsRemove,
  SchemaInitializerItem,
  useSchemaInitializer,
  useDesignable,
  useCollectionRecordData,
} from '@nocobase/client';
import { evaluateFormula, resultToString } from '../shared/formulaEngine';
import { FormulaCodeInput, AlignSeg, RenderHtmlSwitch } from '../shared/formulaEditorComponents';
import { t } from '../shared/i18n';

/**
 * Classic /admin virtual "Formula column" — built on the old Formily-schema TableV2 stack
 * (completely separate from the flow-engine /v/ column). It is a NON-field column added via
 * the `table:configureColumns` SchemaInitializer, like the built-in Actions column.
 */

const SETTINGS_NAME = 'fieldSettings:FormulaColumn';

// Find the inner FormulaCell schema under a TableV2.Column node.
function findCellSchema(columnSchema: any): any {
  const props = columnSchema?.properties || {};
  for (const key of Object.keys(props)) {
    if (props[key]?.['x-component'] === 'FormulaCell') return props[key];
  }
  return null;
}

// The cell: reads the whole row record + the formula config, renders HTML.
// `observer` + reading the reactive `field.componentProps` make the cell re-render live when the
// formula is edited — even though the table row wrapper is memoized on record data (classic TableV2).
export const FormulaCell = observer((props: any) => {
  const record = (useCollectionRecordData() as any) || {};
  const schema: any = useFieldSchema();
  const field: any = useField();
  const cfg = {
    ...(schema?.['x-component-props'] || {}),
    ...(field?.componentProps || {}),
    ...(props || {}),
  };
  const expression: string = cfg.expression || '';
  const align = cfg.align || 'left';
  const style: React.CSSProperties = { display: 'block', textAlign: align, width: '100%' };

  if (!expression.trim()) return <span style={{ color: '#bbb' }}>—</span>;
  const res = evaluateFormula(expression, record);
  if ('error' in res) {
    return (
      <span
        title={t('Lỗi công thức') + ': ' + res.error.message + '\n\n' + expression}
        style={{ color: '#cf1322', fontFamily: 'monospace', fontSize: 12, cursor: 'help' }}
      >
        #ERR
      </span>
    );
  }
  const text = resultToString(res.value);
  if (text === '' || res.value === null || res.value === undefined) return <span style={{ color: '#bbb' }} />;
  if (cfg.renderHtml !== false) return <span style={style} dangerouslySetInnerHTML={{ __html: text }} />;
  return <span style={style}>{text}</span>;
});

// SchemaSettings (gear menu on the column header): Edit formula + Delete.
export const formulaColumnSettings = new SchemaSettings({
  name: SETTINGS_NAME,
  items: [
    {
      name: 'editFormula',
      Component: SchemaSettingsModalItem,
      useComponentProps() {
        const columnSchema: any = useFieldSchema();
        const { dn } = useDesignable();
        const cell = findCellSchema(columnSchema) || columnSchema;
        const cur = cell?.['x-component-props'] || {};
        return {
          title: t('Sửa công thức'),
          width: 640,
          initialValues: {
            title: columnSchema?.title,
            expression: cur.expression,
            renderHtml: cur.renderHtml !== false,
            align: cur.align || 'left',
          },
          schema: {
            type: 'object',
            properties: {
              title: { type: 'string', title: t('Tiêu đề cột'), 'x-decorator': 'FormItem', 'x-component': 'Input' },
              expression: {
                type: 'string',
                title: t('Công thức'),
                'x-decorator': 'FormItem',
                'x-component': 'FormulaCodeInput',
              },
              renderHtml: {
                type: 'boolean',
                title: t('Kết xuất HTML'),
                'x-decorator': 'FormItem',
                'x-component': 'RenderHtmlSwitch',
              },
              align: { type: 'string', title: t('Căn lề'), 'x-decorator': 'FormItem', 'x-component': 'AlignSeg' },
            },
          },
          onSubmit: ({ title, expression, renderHtml, align }: any) => {
            const props = { ...(cell['x-component-props'] || {}), expression, renderHtml, align };
            cell['x-component-props'] = props; // in-place so the live render picks it up
            if (cell['x-uid']) {
              dn.emit('patch', { schema: { ['x-uid']: cell['x-uid'], ['x-component-props']: props } });
            }
            if (typeof title === 'string') {
              columnSchema.title = title;
              if (columnSchema['x-uid']) dn.emit('patch', { schema: { ['x-uid']: columnSchema['x-uid'], title } });
            }
            // refreshParentSchema rebuilds the table columns so the cell updates without F5.
            dn.refresh({ refreshParentSchema: true });
          },
        };
      },
    },
    { name: 'divider', type: 'divider' },
    {
      name: 'delete',
      Component: SchemaSettingsRemove,
      componentProps: {
        removeParentsIfNoChildren: true,
        breakRemoveOn: { 'x-component': 'TableV2' },
      },
    },
  ],
});

// The inner schema inserted into the table when the user picks "Formula column".
function buildFormulaColumnSchema() {
  return {
    type: 'void',
    name: `formula_${uid()}`,
    title: t('Công thức'),
    'x-action-column': 'formula', // bypass the field-wrap so our own x-settings is kept
    'x-decorator': 'TableV2.Column.Decorator',
    'x-toolbar': 'TableColumnSchemaToolbar',
    'x-settings': SETTINGS_NAME,
    'x-component': 'TableV2.Column',
    properties: {
      [uid()]: {
        type: 'void',
        'x-component': 'FormulaCell',
        'x-read-pretty': true,
        'x-component-props': { expression: '', renderHtml: true, align: 'left' },
      },
    },
  };
}

// The "Add column" menu item.
export function FormulaColumnInitializerItem() {
  const { insert } = useSchemaInitializer();
  return <SchemaInitializerItem title={t('Cột công thức')} onClick={() => insert(buildFormulaColumnSchema())} />;
}

// Register everything into the classic app.
export function registerClassicFormulaColumn(app: any) {
  if (!app) return;
  try {
    app.addComponents({ FormulaCell, FormulaCodeInput, AlignSeg, RenderHtmlSwitch });
    app.schemaSettingsManager?.add?.(formulaColumnSettings);
    app.schemaInitializerManager?.addItem?.('table:configureColumns', 'formulaColumn', {
      type: 'item',
      name: 'formulaColumn',
      title: t('Cột công thức'),
      Component: FormulaColumnInitializerItem,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[formula] classic column register failed', e);
  }
}
