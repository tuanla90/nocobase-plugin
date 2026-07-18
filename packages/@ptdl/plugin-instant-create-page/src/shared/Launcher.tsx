/**
 * Instant Create Page — one-click launcher. A small floating "➕ Quick page" button (bottom-right) that opens
 * the QuickCreateForm in a drawer, so the tool is reachable from anywhere in the app. Mounted via
 * `app.addProvider`. Lane-agnostic: `app` + `t` injected by the lane.
 */
import React, { useState } from 'react';
import { Button, Drawer, Tooltip } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { QuickCreateForm } from './QuickCreateForm';

export interface LauncherDeps {
  app: any;
  t: (s: string, opts?: Record<string, any>) => string;
}

/** Reactively read NocoBase v2's "UI editor" (flow-settings) toggle — the floating launcher only shows when
 *  it is ON, so it never clutters normal (non-edit) use. Mirrors the framework's own reader
 *  (@nocobase/client-v2): the "1"/"0" localStorage flag + its custom preference-change event (plus the
 *  native `storage` event so a toggle in another tab is picked up too). */
function useFlowSettingsEnabled(): boolean {
  const read = () => {
    try {
      return typeof window !== 'undefined' && window.localStorage.getItem('NOCOBASE_V2_FLOW_SETTINGS_ENABLED') === '1';
    } catch {
      return false;
    }
  };
  const [on, setOn] = React.useState(read);
  React.useEffect(() => {
    const h = () => setOn(read());
    window.addEventListener('nocobase:v2:flow-settings-preference-change', h);
    window.addEventListener('storage', h);
    return () => {
      window.removeEventListener('nocobase:v2:flow-settings-preference-change', h);
      window.removeEventListener('storage', h);
    };
  }, []);
  return on;
}

export function createLauncher({ app, t }: LauncherDeps): React.FC<{ children?: React.ReactNode }> {
  const InstantCreatePageLauncher: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
    const [open, setOpen] = useState(false);
    const editMode = useFlowSettingsEnabled();
    return (
      <>
        {children}
        {editMode && (
          <>
        <Tooltip title={t('Quick create a table page')} placement="left">
          <Button
            type="primary"
            shape="round"
            icon={<PlusOutlined />}
            onClick={() => setOpen(true)}
            style={{
              position: 'fixed',
              right: 20,
              bottom: 20,
              zIndex: 1000,
              boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
            }}
          >
            {t('Quick page')}
          </Button>
        </Tooltip>
        <Drawer
          title={t('Quick create a table page')}
          width={520}
          open={open}
          onClose={() => setOpen(false)}
          destroyOnClose
        >
          <QuickCreateForm app={app} t={t} compact onCreated={() => setOpen(false)} />
        </Drawer>
          </>
        )}
      </>
    );
  };
  return InstantCreatePageLauncher;
}
