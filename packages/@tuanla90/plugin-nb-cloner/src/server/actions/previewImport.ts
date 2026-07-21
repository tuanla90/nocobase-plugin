import { Context, Next } from '@nocobase/actions';
import { Importer } from '../services/importer';
import { Packager } from '../services/packager';

/**
 * Dry-run of an import: unpacks the uploaded bundle and reports what WOULD happen against this target
 * (which collections already exist, which fields are new, and same-name/different-key fields that will
 * be skipped) — WITHOUT writing anything. The client shows this before letting the user run the import.
 */
export async function previewImportAction(ctx: Context, next: Next) {
  const body = (ctx.request as any).body;

  if (!body?.fileData || typeof body.fileData !== 'string') {
    ctx.status = 400;
    ctx.body = { error: 'Missing fileData. Send { fileData: "<base64 of .nbc.gz>" } as JSON.' };
    await next();
    return;
  }

  let gzBuffer: Buffer;
  try {
    gzBuffer = Buffer.from(body.fileData, 'base64');
  } catch (e: any) {
    ctx.status = 400;
    ctx.body = { error: 'Invalid base64 data: ' + e.message };
    await next();
    return;
  }

  try {
    const packager = new Packager();
    const bundle = await packager.unpackFromBuffer(gzBuffer);

    if (!bundle.manifest) {
      ctx.status = 400;
      ctx.body = { error: 'Invalid bundle: missing manifest' };
      await next();
      return;
    }

    const importer = new Importer(ctx.db, ctx.app);
    const report = await importer.preview(bundle);
    ctx.body = { manifest: bundle.manifest, ...report };
  } catch (err: any) {
    ctx.status = 500;
    ctx.body = { error: err.message };
  }

  await next();
}
