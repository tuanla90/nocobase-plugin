import { Plugin } from '@nocobase/server';
import { scanApp, repairApp } from './doctor';

const RESOURCE = 'ptdlAppDoctor';

/**
 * App Doctor server — exposes two admin-only actions on the `ptdlAppDoctor` resource:
 *   - scan   : read-only relation-integrity report (missing reverse, broken target/through).
 *   - repair : create the missing reverse relation fields (re-scans server-side; additive, no data touched).
 *
 * No own collection. The logic lives in ./doctor. `ctx.body` is set RAW (no {data:…} wrapping) so the antd
 * table on the client doesn't crash. [[reference_nocobase_action_datawrapping]]
 */
export class PluginAppDoctorServer extends Plugin {
  async load() {
    this.defineActions();
    const acl: any = (this.app as any).acl;
    // Admin-only: reachable only through the pm.app-doctor snippet (granted to plugin-config roles).
    acl?.registerSnippet?.({ name: 'pm.app-doctor', actions: [`${RESOURCE}:scan`, `${RESOURCE}:repair`] });
  }

  private requireAdmin(ctx: any) {
    const roles = ctx.state?.currentRoles;
    const list = Array.isArray(roles) ? roles : roles ? [roles] : [];
    if (!list.includes('root') && !list.includes('admin')) {
      ctx.throw(403, 'Chỉ quản trị viên mới được chạy App Doctor / Only an administrator may run App Doctor');
    }
  }

  private defineActions() {
    const db: any = this.db;
    (this.app as any).resourceManager?.define?.({
      name: RESOURCE,
      actions: {
        // ── scan: read-only relation-integrity report ──────────────────────────────────────────────
        scan: async (ctx: any, next: any) => {
          this.requireAdmin(ctx);
          ctx.body = await scanApp(db); // { ok, issues, summary } — raw
          await next();
        },
        // ── repair: create missing reverse relations (optionally scoped to one collection/field) ─────
        repair: async (ctx: any, next: any) => {
          this.requireAdmin(ctx);
          const v = ctx.action?.params?.values || ctx.request?.body || {};
          const scope = v && (v.collection || v.field) ? { collection: v.collection, field: v.field } : undefined;
          const result = await repairApp(db, scope);
          ctx.body = result; // { ok, fixed, skipped, errors } — raw
          await next();
        },
      },
    });
  }
}

export default PluginAppDoctorServer;
