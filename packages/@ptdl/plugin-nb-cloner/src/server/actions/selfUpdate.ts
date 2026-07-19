import { Context, Next } from '@nocobase/actions';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const PACKAGE_NAME = '@ptdl/plugin-nb-cloner';

/**
 * Tự cập nhật plugin từ file zip upload (né việc "Add new" chặn plugin trùng tên).
 * Dùng chính util của NocoBase: giải nén (chấp nhận local path) → ghi đè storage/plugins
 * → cập nhật version. Sau đó restart app để nạp code mới.
 *
 * ⚠️ Endpoint này ghi CODE plugin và chạy khi restart — hãy đảm bảo chỉ admin truy cập được
 * (mặc định gate qua UI Settings, ACL 'loggedIn' như các plugin @ptdl khác). Xem README.
 */
export async function selfUpdateAction(ctx: Context, next: Next) {
  const body = (ctx.request as any).body;
  if (!body?.fileData || typeof body.fileData !== 'string') {
    ctx.status = 400;
    ctx.body = { error: 'Missing fileData (base64 of the plugin .zip file).' };
    await next();
    return;
  }

  let tempPath: string | null = null;
  try {
    const buf = Buffer.from(body.fileData, 'base64');
    tempPath = path.join(os.tmpdir(), `nb-cloner-update-${Date.now()}.zip`);
    fs.writeFileSync(tempPath, buf);

    // NocoBase util (nội bộ) — updatePluginByCompressedFileUrl chấp nhận local file path:
    // giải nén → validate main → ghi đè getStoragePluginDir(packageName) → trả { version }.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const utils = require('@nocobase/server/lib/plugin-manager/utils');
    const result = await utils.updatePluginByCompressedFileUrl({
      compressedFileUrl: tempPath,
      authToken: undefined,
      repository: (ctx.app as any).pm.repository,
    });

    const version: string | undefined = result?.version;
    const packageName: string = result?.packageName || PACKAGE_NAME;

    // Cập nhật version trong DB để Plugin Manager hiển thị đúng ngay lập tức.
    if (version) {
      await ctx.app.db.getRepository('applicationPlugins').update({
        filter: { packageName },
        values: { version },
      });
    }

    ctx.body = {
      success: true,
      version,
      restartRequired: true,
      message: `Plugin updated to v${version ?? '?'}. Restart the app to load the new code.`,
    };
  } catch (err: any) {
    ctx.status = 500;
    ctx.body = { error: err?.message || String(err) };
  } finally {
    if (tempPath) {
      try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
    }
  }

  await next();
}
