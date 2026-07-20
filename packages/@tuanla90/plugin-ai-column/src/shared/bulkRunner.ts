/**
 * @tuanla90/plugin-ai-column — shared reliability helpers for TABLE-level bulk actions
 * (Bulk AI Generate, Bulk AI Extract). Both loop over many selected rows calling the same
 * server AI action once per row — this is exactly the shape that trips a provider's rate
 * limit (HTTP 429 / quota errors), so the retry/backoff and reporting logic lives here once
 * instead of being duplicated per action.
 *
 * Deliberately NOT doing cross-request prompt caching (Anthropic cache_control breakpoints /
 * Gemini context caching): the part that repeats across rows (system + prompt template) is
 * typically short, the part that costs tokens (each row's own data + the model's answer) is
 * different every call and can't be cached — and both mechanisms need a fairly large shared
 * prefix before a provider actually grants a discount. Not worth the provider-specific plumbing
 * for this access pattern.
 */
import { t } from './i18n';

/** Heuristic rate-limit detection — covers both a preserved HTTP status (429) and provider
 *  error MESSAGES that slip through as a generic 500/502 from the server action (e.g. Gemini's
 *  "RESOURCE_EXHAUSTED"). Message-based matching is a best-effort fallback, not a guarantee. */
const RATE_LIMIT_PATTERN = /rate.?limit|\b429\b|quota|resource_exhausted|too many requests/i;

export function isRateLimitError(e: any): boolean {
  const status = e?.response?.status ?? e?.status;
  if (status === 429) return true;
  const msg = String(e?.response?.data?.errors?.[0]?.message || e?.response?.data?.message || e?.message || e || '');
  return RATE_LIMIT_PATTERN.test(msg);
}

/** Retry ONLY on rate-limit errors, with exponential backoff. Any other error rethrows
 *  immediately (a bad prompt/schema won't fix itself by waiting). */
export async function withRetry<T>(fn: () => Promise<T>, opts?: { retries?: number; baseDelayMs?: number }): Promise<T> {
  const retries = opts?.retries ?? 2;
  const baseDelayMs = opts?.baseDelayMs ?? 1500;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!isRateLimitError(e) || attempt >= retries) throw e;
      await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
    }
  }
}

/** Bounded-concurrency worker pool over `items` — `worker` is responsible for its own
 *  success/failure bookkeeping (it should not throw for expected per-item failures). */
export async function runBulkPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  const queue = items.slice();
  const poolSize = Math.max(1, Math.min(concurrency, queue.length));
  const runners = Array.from({ length: poolSize }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (item !== undefined) await worker(item);
    }
  });
  await Promise.all(runners);
}

export type BulkSummary = { ok: number; rateLimited: number; otherFail: number };

export function newBulkSummary(): BulkSummary {
  return { ok: 0, rateLimited: 0, otherFail: 0 };
}

/** Record the outcome of one item's attempt — call from inside a runBulkPool worker's catch. */
export function recordFailure(summary: BulkSummary, e: any): void {
  if (isRateLimitError(e)) summary.rateLimited++;
  else summary.otherFail++;
}

export function summaryMessage(s: BulkSummary, total: number, extraNote?: string): string {
  const parts = [t('{{n}} thành công', { n: s.ok })];
  if (s.rateLimited) parts.push(t('{{n}} bị giới hạn tốc độ (rate limit) — thử lại sau', { n: s.rateLimited }));
  if (s.otherFail) parts.push(t('{{n}} lỗi khác', { n: s.otherFail }));
  let msg = t('Xong: {{parts}} / {{total}} dòng.', { parts: parts.join(', '), total });
  if (extraNote) msg += ` (${extraNote})`;
  return msg;
}

export function isBulkAllOk(s: BulkSummary): boolean {
  return s.rateLimited === 0 && s.otherFail === 0;
}

/** Advisory (non-blocking) toast shown once before a large batch starts — the user already
 *  confirmed via the action's own `use:'confirm'` step; this just sets expectations about time
 *  and rate limits so a slow run / partial-fail summary isn't a surprise. */
export function maybeWarnLargeBatch(ctx: any, count: number, threshold = 10): void {
  if (count >= threshold) {
    ctx.message.warning(
      t('Đang xử lý {{n}} dòng — có thể mất thời gian và bị giới hạn tốc độ (rate limit) tuỳ nhà cung cấp AI. Dòng lỗi sẽ được báo riêng, có thể chạy lại sau.', { n: count }),
    );
  }
}
