import React from 'react';
import { css } from '@emotion/css';
import { Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import {
  Droppable,
  FlowsFloatContextMenu,
  DragHandler,
  MemoFlowModelRenderer,
  createRecordMetaFactory,
  createRecordResolveOnServerWithLocal,
  observer,
} from '@nocobase/flow-engine';
import { evaluateFormula, resultToString } from './formulaEngine';
import { applyFormulaFormat } from './formulaFormat';
import { formulaStepUiSchema } from './formulaEditorComponents';
import { NS, t as rt } from './i18n';

/**
 * Standalone "Formula column" — a VIRTUAL table column (not bound to any collection field),
 * exactly like the built-in JS Column. Subclasses TableCustomColumnModel so it shows up under
 * table → "Add column" → "Other columns" → "Formula column". Each row is rendered via a per-row
 * fork whose `record` is bound in getColumnProps(); render() evaluates the formula against it.
 */

function recordSignatureOf(record: any): string {
  if (!record || typeof record !== 'object') return String(record);
  try {
    const seen = new WeakSet();
    return JSON.stringify(record, (_k, v) => {
      if (v && typeof v === 'object') {
        if (seen.has(v)) return '[Circular]';
        seen.add(v);
      }
      return v;
    });
  } catch {
    return String(record);
  }
}

type Deps = {
  flowEngine: any;
  Base: any; // TableCustomColumnModel (per-lane import)
  tExpr?: (s: string, opts?: any) => any;
};

// Guard so this can be called from both afterAdd() and load() without double-registering.
let columnRegistered = false;

export function registerFormulaColumnModel({ flowEngine, Base, tExpr }: Deps) {
  if (columnRegistered) return;
  if (!flowEngine || !Base) {
    // flowEngine may not be ready in an early lifecycle hook — try again later.
    return;
  }
  columnRegistered = true;
  const t = (s: string) => (tExpr ? tExpr(s, { ns: NS }) : s);

  class FormulaColumnModel extends Base {
    _RenderComponent?: React.ComponentType;

    // Public per-row evaluation hook: other plugins (e.g. enhanced-table's summary row)
    // duck-type on this method to aggregate a virtual formula column over raw row data.
    evaluateForRecord(record: any) {
      const formula: string = (this as any).props?.formula || '';
      if (!formula.trim()) return null;
      const res = evaluateFormula(formula, record ?? {});
      return 'error' in res ? null : (res as any).value;
    }

    // The per-cell body: reads this (fork).context.record and renders the formula result.
    // Structure: render() must return a PLAIN function (an observer/memo OBJECT here crashes
    // RenderFunction mode with React #31), so the plain outer C renders an observer <Inner/>.
    // Inner tracks the reactive model props → editing the formula re-renders every cell live,
    // with NO rerender() calls in the flow handler (those caused an infinite loop → freeze).
    render() {
      if (!this._RenderComponent) {
        const self: any = this;
        const Inner = observer(() => {
          const p = self.props || {};
          const formula: string = p.formula || '';
          const record = self.context?.record ?? {};
          const align = p.align || 'left';
          const boxStyle: React.CSSProperties = {
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textAlign: align as any,
            maxWidth: '100%',
          };
          if (!formula.trim()) return <span style={{ color: '#bbb' }}>—</span>;
          const res = evaluateFormula(formula, record);
          if ('error' in res) {
            return (
              <span
                title={rt('Lỗi công thức') + ': ' + res.error.message + '\n\n' + formula}
                style={{ color: '#cf1322', fontFamily: 'monospace', fontSize: 12, cursor: 'help' }}
              >
                #ERR
              </span>
            );
          }
          // format Number/Date (fmtType != auto) → text thuần, bỏ qua đường HTML
          const fmt = applyFormulaFormat(res.value, {
            fmtType: p.fmtType,
            fmtThousands: p.fmtNumber?.thousands,
            fmtDecimals: p.fmtNumber?.decimals,
            fmtDate: p.fmtDate,
          });
          const text = fmt !== null ? fmt : resultToString(res.value);
          if (text === '' || res.value === null || res.value === undefined) {
            return <span style={{ color: '#bbb' }} />;
          }
          if (fmt === null && p.renderHtml !== false) {
            return <div style={boxStyle} dangerouslySetInnerHTML={{ __html: text }} />;
          }
          return <div style={boxStyle}>{text}</div>;
        });
        const C: React.FC = () => <Inner />;
        (C as any).displayName = 'FormulaColumnRenderer';
        this._RenderComponent = C;
      }
      return this._RenderComponent;
    }

    // Build the antd column definition: header (with config menu) + per-row render via forks.
    getColumnProps() {
      const self = this;
      const TitleText = observer(() => <>{self.props.title}</>);
      const titleContent = (
        <Droppable model={this}>
          <FlowsFloatContextMenu
            model={this}
            containerStyle={{ display: 'block', padding: '11px 8px', margin: '-11px -8px' }}
            showBorder={false}
            extraToolbarItems={[{ key: 'drag-handler', component: DragHandler, sort: 1 }]}
          >
            <div
              className={css`
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                width: calc(${this.props.width}px - 16px);
              `}
            >
              <TitleText />
            </div>
          </FlowsFloatContextMenu>
        </Droppable>
      );

      if ((this as any).hidden && !this.context.flowSettingsEnabled) {
        return null;
      }

      return {
        ...this.props,
        title: this.props.tooltip ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {titleContent}
            <Tooltip title={this.props.tooltip}>
              <QuestionCircleOutlined style={{ cursor: 'pointer' }} />
            </Tooltip>
          </span>
        ) : (
          titleContent
        ),
        render: (value: any, record: any, index: number) => {
          const tk = this.context.collection?.getFilterByTK?.(record);
          const forkKey = tk ?? record?.id ?? index;
          const sig = recordSignatureOf(record);
          const fork: any = this.createFork({}, String(forkKey));
          if (fork.__recordRenderSignature !== sig) {
            fork.__recordRenderSignature = sig;
            fork.invalidateFlowCache?.('beforeRender');
          }
          const recordMeta = createRecordMetaFactory(
            () => fork.context.collection,
            fork.context.t('Current record'),
            (ctx: any) => {
              const name = ctx.collection?.name;
              const dataSourceKey = ctx.collection?.dataSourceKey;
              const filterByTk = ctx.collection?.getFilterByTK?.(ctx.record);
              if (!name || filterByTk == null) return undefined;
              return { collection: name, dataSourceKey, filterByTk };
            },
          );
          fork.context.defineProperty('record', {
            get: () => record,
            cache: false,
            resolveOnServer: createRecordResolveOnServerWithLocal(
              () => fork.context.collection,
              () => record,
            ),
            meta: recordMeta,
          });
          fork.context.defineProperty('recordIndex', { get: () => index });
          return <MemoFlowModelRenderer key={`${fork.uid}:${sig}`} model={fork} />;
        },
      };
    }

    async afterAddAsSubModel(...args: any[]) {
      await super.afterAddAsSubModel?.(...args);
      // Apply basic column settings (title/width) right after adding, like JSColumnModel.
      await (this as any).applyFlow?.('tableColumnSettings');
    }
  }

  flowEngine.registerModels({ FormulaColumnModel });

  (FormulaColumnModel as any).define({
    label: t('Cột công thức'),
    createModelOptions: {
      stepParams: {
        tableColumnSettings: {
          title: { title: t('Công thức') },
        },
      },
    },
  });

  try {
    (FormulaColumnModel as any).registerFlow({
      key: 'formulaColumnSettings',
      title: t('Thiết lập công thức'),
      steps: {
        formula: {
          title: t('Công thức'),
          uiMode: { type: 'dialog', props: { width: 640 } },
          uiSchema: (ctx: any) => formulaStepUiSchema(t, ctx),
          defaultParams: { formula: '', renderHtml: true, align: 'left', fmtType: 'auto', fmtNumber: {}, fmtDate: 'DD/MM/YYYY' },
          handler(ctx: any, params: any) {
            // Plain setProps only — props are reactive and the observer <Inner/> cells track
            // them, so every row updates live. NEVER call rerender() here: this flow re-applies
            // on each render, so that recurses into an infinite loop and freezes the page.
            ctx.model.setProps('formula', params?.formula || '');
            ctx.model.setProps('renderHtml', params?.renderHtml !== false);
            ctx.model.setProps('align', params?.align || 'left');
            ctx.model.setProps('fmtType', params?.fmtType || 'auto');
            ctx.model.setProps('fmtNumber', params?.fmtNumber || {});
            ctx.model.setProps('fmtDate', params?.fmtDate || 'DD/MM/YYYY');
          },
        },
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[formula] column registerFlow failed', e);
  }

  return FormulaColumnModel;
}
