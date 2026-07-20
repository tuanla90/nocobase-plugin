// Shared shapes + helpers for the change-log plugin (server writes, client renders).

export type ChangeSource = 'create' | 'form' | 'action' | 'quick' | 'bulk' | 'api' | 'workflow' | 'system';

// Snapshot of a status value's presentation, captured at log time so the timeline stays correct
// even if the field's enum/colors/icons are edited later.
export interface ValueMeta {
  label?: string;
  color?: string;
  icon?: string;
  kind?: string;
}

export interface ChangeLogEntry {
  id: number;
  collectionName: string;
  recordId: string;
  fieldName: string;
  fromValue: string | null;
  toValue: string | null;
  fromMeta?: ValueMeta;
  toMeta?: ValueMeta;
  userId?: string | null;
  userName?: string | null;
  roleName?: string | null;
  source?: ChangeSource;
  durationMs?: number | null;
  note?: string | null;
  snapshot?: Record<string, any>;
  createdAt: string;
}

export interface ChangeLogConfig {
  collectionName: string;
  enabled: boolean;
  triggerFields: string[];
  snapshotFields: string[];
  captureNote: boolean;
  options?: Record<string, any>;
}

// Header the client sets on quick-transition / action requests so the server can record a precise
// source (the server otherwise can only see the generic action name).
export const SOURCE_HEADER = 'x-ptdl-change-source';

export const SOURCE_META: Record<ChangeSource, { label: string; icon: string }> = {
  create: { label: 'Created', icon: 'lucide-file-plus' },
  form: { label: 'Form', icon: 'lucide-file-text' },
  action: { label: 'Action', icon: 'lucide-zap' },
  quick: { label: 'Quick', icon: 'lucide-mouse-pointer-click' },
  bulk: { label: 'Bulk', icon: 'lucide-layers' },
  api: { label: 'API', icon: 'lucide-code' },
  workflow: { label: 'Workflow', icon: 'lucide-workflow' },
  system: { label: 'System', icon: 'lucide-server-cog' },
};

// Compact duration: "3d 4h", "5h 12m", "45s". Falsy/negative -> ''.
export function formatDuration(ms?: number | null): string {
  if (!ms || ms < 0) return '';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d${h ? ` ${h}h` : ''}`;
  if (h > 0) return `${h}h${m ? ` ${m}m` : ''}`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}
