import { Context, Next } from '@nocobase/actions';
import { Importer } from '../services/importer';
import { Packager } from '../services/packager';

export async function importAction(ctx: Context, next: Next) {
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
    // Optional per-import selection (parts + collections + data). Absent → import everything.
    const result = await importer.import(bundle, body.selection);
    ctx.body = { manifest: bundle.manifest, ...result };
  } catch (err: any) {
    ctx.status = 500;
    ctx.body = { error: err.message };
  }

  await next();
}
