import { Context, Next } from '@nocobase/actions';
import { CollectionAnalyzer } from '../services/collectionAnalyzer';

export async function listCollectionsAction(ctx: Context, next: Next) {
  const analyzer = new CollectionAnalyzer(ctx.db);
  const result = await analyzer.analyze();
  ctx.body = result;
  await next();
}
