import { Context, Next } from '@nocobase/actions';
import * as path from 'path';

const PACKAGE_NAME = '@tuanla90/plugin-nb-cloner';

/**
 * Trả về thông tin phiên bản plugin để UI hiển thị:
 * - version: version NocoBase ghi trong DB (applicationPlugins) = cái Plugin Manager hiển thị.
 * - fileVersion: version thực trong package.json của code đang chạy (để đối chiếu lệch/không).
 */
export async function infoAction(ctx: Context, next: Next) {
  const row: any = await ctx.app.db.getRepository('applicationPlugins').findOne({
    filter: { packageName: PACKAGE_NAME },
  });

  let fileVersion: string | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    fileVersion = require(path.resolve(__dirname, '../../../package.json')).version;
  } catch {
    /* ignore */
  }

  // KHÔNG bọc trong { data } — NocoBase tự bọc response thành { data: ... } một lần.
  ctx.body = {
    name: PACKAGE_NAME,
    version: row?.version,
    fileVersion,
    enabled: row?.enabled,
    installed: row?.installed,
  };
  await next();
}
