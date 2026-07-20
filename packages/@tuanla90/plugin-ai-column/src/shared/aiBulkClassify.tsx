import React, { useEffect, useState } from 'react';
import { observer } from '@formily/react';
import { useFlowSettingsContext } from '@nocobase/flow-engine';
import { getFields, ColumnSelect } from '@tuanla90/shared';
import { withRetry, runBulkPool, newBulkSummary, recordFailure, summaryMessage, isBulkAllOk, maybeWarnLargeBatch } from './bulkRunner';
import { registerFlowComponentsOnce } from './aiColumn';
import { NS, t } from './i18n';

/**
 * @tuanla90/plugin-ai-column — "Bulk AI Classify": a COLLECTION-scene table action that, per selected
 * row, classifies a source field's value against a master collection (reusing the server `classify`
 * action) and writes the match into a target field — a code string, or a belongsTo FK link when the
 * target is a relation field. The table-wide sibling of the field-level "AI phân loại" button; ideal
 * for back-filling product/HS codes across many rows at once.
 */

export type BulkClassifyDeps = { flowEngine: any; ActionModel: any; ActionSceneEnum: any; api?: any; tExpr?: (s: string, opts?: any) => any };

let API: any = null;

const SCALAR_TYPES = new Set(['string', 'text', 'integer', 'bigInt', 'float', 'double', 'decimal', 'boolean', 'date']);
const TARGET_TYPES = new Set([...SCALAR_TYPES, 'belongsTo', 'hasOne']);

function useTableCollection(): { coll?: string; dsk: string } {
  let coll: string | undefined;
  let dsk = 'main';
  try {
    const ctx: any = useFlowSettingsContext();
    const model: any = ctx?.model;
    coll = model?.context?.blockModel?.collection?.name;
    dsk = model?.context?.blockModel?.collection?.dataSourceKey || 'main';
  } catch {
    /* no ctx */
  }
  return { coll, dsk };
}

/** Field select over the TABLE's own collection. `mode='source'` → scalar text fields; `mode='target'`
 *  → scalar + belongsTo (so the match can fill a code column or an FK relation). */
function makeTableFieldSelect(mode: 'source' | 'target'): React.FC<any> {
  return observer((props: any) => {
    const { coll, dsk } = useTableCollection();
    const [options, setOptions] = useState<any[]>([]);
    useEffect(() => {
      let alive = true;
      if (coll)
        getFields(API, coll, dsk).then((fields) => {
          if (!alive) return;
          const allow = mode === 'source' ? SCALAR_TYPES : TARGET_TYPES;
          // Exclude raw foreign-key columns (e.g. baoGiaId/sanPhamId) — never a sensible pick.
          setOptions((fields || []).filter((f: any) => !f.isForeignKey && allow.has(f?.type)).map((f: any) => ({ value: f.name, label: (f.uiSchema?.title || f.name) + (f.type === 'belongsTo' || f.type === 'hasOne' ? ' 🔗' : ''), type: f.type, iface: f.interface })));
        });
      else setOptions([]);
      return () => {
        alive = false;
      };
    }, [coll, dsk]);
    return (
      <ColumnSelect
        options={options}
        value={props.value || undefined}
        placeholder={mode === 'source' ? t('Field đem đối chiếu') : t('Field nhận kết quả (code hoặc 🔗 quan hệ)')}
        onChange={(v) => props.onChange?.(v)}
      />
    );
  });
}

const PtdlBulkClassifySource = makeTableFieldSelect('source');
const PtdlBulkClassifyTarget = makeTableFieldSelect('target');

function bulkClassifyStepUiSchema(te: (s: string) => any) {
  return {
    aiMaster: { type: 'object', title: te('Bảng master'), 'x-decorator': 'FormItem', 'x-component': 'PtdlMasterCollectionSelect' },
    rowFields: {
      type: 'void',
      'x-component': 'PtdlGrid',
      properties: {
        aiSourceField: { type: 'string', title: te('Field đem đối chiếu'), 'x-decorator': 'FormItem', 'x-component': 'PtdlBulkClassifySource' },
        aiTargetField: { type: 'string', title: te('Field nhận kết quả'), 'x-decorator': 'FormItem', 'x-component': 'PtdlBulkClassifyTarget' },
      },
    },
    aiWriteTemplate: { type: 'string', title: te('Giá trị ghi vào khi là code (cột của master)'), 'x-decorator': 'FormItem', 'x-component': 'PtdlMasterTokenArea' },
    aiLabelTemplate: { type: 'string', title: te('Hiển thị ứng viên (cột của master)'), 'x-decorator': 'FormItem', 'x-component': 'PtdlMasterTokenArea' },
    rowConnection: {
      type: 'void',
      'x-component': 'PtdlGrid',
      properties: {
        aiService: { type: 'string', title: te('Dịch vụ LLM'), 'x-decorator': 'FormItem', 'x-component': 'PtdlLlmServiceSelect' },
        aiModel: { type: 'string', title: te('Model'), 'x-decorator': 'FormItem', 'x-component': 'PtdlLlmModelSelect' },
      },
    },
  };
}

export function registerBulkClassify({ flowEngine, ActionModel, ActionSceneEnum, api, tExpr }: BulkClassifyDeps) {
  if (!flowEngine || !ActionModel || !ActionSceneEnum) {
    // eslint-disable-next-line no-console
    console.warn('[ai-column] bulk classify: missing deps — skip');
    return;
  }
  if (api) API = api;
  const te = (s: string) => (tExpr ? tExpr(s, { ns: NS }) : s);

  try {
    registerFlowComponentsOnce(flowEngine, { PtdlBulkClassifySource, PtdlBulkClassifyTarget });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[ai-column] bulk classify: registerComponents failed', e);
  }

  class PtdlBulkClassifyActionModel extends ActionModel {
    static scene = ActionSceneEnum.collection;
    defaultProps = { title: te('Phân loại AI hàng loạt') };
  }
  flowEngine.registerModels({ PtdlBulkClassifyActionModel });
  try {
    (PtdlBulkClassifyActionModel as any).define({ label: te('Phân loại AI hàng loạt') });
  } catch {
    /* optional */
  }

  try {
    (PtdlBulkClassifyActionModel as any).registerFlow({
      key: 'ptdlBulkClassifySettings',
      title: te('Cấu hình phân loại AI hàng loạt'),
      on: 'click',
      steps: {
        confirm: {
          use: 'confirm',
          defaultParams: { enable: true, title: te('Phân loại AI hàng loạt'), content: te('Đối chiếu AI cho các dòng đã chọn? Giá trị hiện tại của field đích sẽ bị GHI ĐÈ.') },
        },
        run: {
          title: te('Cấu hình phân loại AI'),
          uiMode: { type: 'dialog', props: { width: 720 } },
          uiSchema: bulkClassifyStepUiSchema(te),
          defaultParams: { aiMaster: {}, aiSourceField: '', aiTargetField: '', aiWriteTemplate: '', aiLabelTemplate: '', aiService: '', aiModel: '' },
          async handler(ctx: any, params: any) {
            const master = params?.aiMaster?.collection;
            const sourceField = params?.aiSourceField;
            const targetField = params?.aiTargetField;
            if (!master || !sourceField || !targetField) {
              ctx.message.error(t('Chưa cấu hình bảng master / field nguồn / field đích — mở gear (⚙) để cấu hình trước.'));
              return;
            }
            const resource = ctx.blockModel?.resource;
            const rows: any[] = resource?.getSelectedRows ? resource.getSelectedRows() : [];
            if (!rows.length) {
              ctx.message.warning(t('Chọn ít nhất 1 dòng (tick checkbox) trước khi chạy.'));
              return;
            }
            const collection = ctx.blockModel.collection;
            const collectionName = collection?.name;
            if (!collectionName) {
              ctx.message.error(t('Không xác định được collection của bảng.'));
              return;
            }
            // Detect once whether the target field is a relation → write an FK link, else a code.
            let targetIsRel = false;
            try {
              const fields = await getFields(API, collectionName, collection?.dataSourceKey || 'main');
              const tf = (fields || []).find((f: any) => f.name === targetField);
              targetIsRel = !!tf && (tf.type === 'belongsTo' || tf.type === 'hasOne');
            } catch {
              /* assume scalar */
            }

            maybeWarnLargeBatch(ctx, rows.length);
            const hideLoading = ctx.message.loading(t('Đang đối chiếu AI cho {{n}} dòng...', { n: rows.length }), 0);
            const summary = newBulkSummary();
            let skippedEmpty = 0;

            await runBulkPool(rows, 3, async (row) => {
              const q = row[sourceField];
              if (q == null || String(q).trim() === '') {
                skippedEmpty++;
                return;
              }
              try {
                await withRetry(async () => {
                  const filterByTk = collection.getFilterByTK(row);
                  const res = await ctx.api.request({
                    url: 'ptdlAiColumn:classify',
                    method: 'post',
                    data: {
                      query: String(q),
                      masterCollection: master,
                      dataSourceKey: params.aiMaster?.dataSourceKey || 'main',
                      labelTemplate: params.aiLabelTemplate || undefined,
                      writeTemplate: params.aiWriteTemplate || undefined,
                      llmService: params.aiService || undefined,
                      model: params.aiModel || undefined,
                    },
                  });
                  const best = res?.data?.data?.best;
                  if (!best) throw new Error('no match');
                  const value = targetIsRel ? { id: best.tk } : best.write;
                  await ctx.api.request({ url: `${collectionName}:update`, method: 'post', params: { filterByTk }, data: { [targetField]: value } });
                });
                summary.ok++;
              } catch (e) {
                recordFailure(summary, e);
              }
            });

            hideLoading();
            const note = skippedEmpty ? t('{{n}} dòng bỏ qua vì field nguồn trống', { n: skippedEmpty }) : undefined;
            const msg = summaryMessage(summary, rows.length, note);
            if (isBulkAllOk(summary) && !skippedEmpty) ctx.message.success(msg);
            else ctx.message.warning(msg);
            await resource.refresh?.();
          },
        },
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[ai-column] bulk classify: registerFlow failed', e);
  }

  return PtdlBulkClassifyActionModel;
}
