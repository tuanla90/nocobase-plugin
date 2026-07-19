import { Context, Next } from '@nocobase/actions';
import { Extractor, ExportSelection } from '../services/extractor';
import { Packager } from '../services/packager';

/**
 * Sanitize tên app để dùng an toàn trong filename.
 * Chỉ giữ lại ký tự alphanumeric, gạch ngang, gạch dưới.
 * Giới hạn 40 ký tự để tránh tên file quá dài.
 */
function sanitizeAppName(raw: string): string {
  return raw
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '-')  // thay ký tự đặc biệt bằng '-'
    .replace(/-{2,}/g, '-')             // thu gọn nhiều '-' liên tiếp
    .replace(/^-|-$/g, '')              // bỏ '-' ở đầu/cuối
    .slice(0, 40) || 'nocobase-app';    // fallback nếu sau sanitize thành rỗng
}

export async function exportAction(ctx: Context, next: Next) {
  const body = ctx.request.body as any;

  // Validate + sanitize appName
  const rawAppName = typeof body.appName === 'string' ? body.appName : 'nocobase-app';
  const appName = sanitizeAppName(rawAppName);

  const selection: ExportSelection = {
    includeSystemSchema: body.includeSystemSchema ?? true,
    includeUiSchemas:    body.includeUiSchemas ?? true,
    includeRoles:        body.includeRoles ?? true,
    includeWorkflows:    body.includeWorkflows ?? false,
    businessCollections: Array.isArray(body.businessCollections) ? body.businessCollections : [],
  };

  try {
    const extractor = new Extractor(ctx.db);
    const bundle    = await extractor.extract(selection, appName);

    const packager  = new Packager();
    const gzBuffer  = await packager.packToBuffer(bundle);

    const dateStr  = new Date().toISOString().split('T')[0];
    const filename = `nb-clone-${appName}-${dateStr}.nbc.gz`;

    ctx.set('Content-Type', 'application/gzip');
    ctx.set('Content-Disposition', `attachment; filename="${filename}"`);
    ctx.set('Content-Length', String(gzBuffer.length));
    ctx.body = gzBuffer;
  } catch (err: any) {
    ctx.status = 500;
    ctx.body = { error: err.message };
  }

  await next();
}
