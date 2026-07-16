/**
 * Quick View — one-click launcher. A small floating "➕ Quick page" button (bottom-right) that opens
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

export function createLauncher({ app, t }: LauncherDeps): React.FC<{ children?: React.ReactNode }> {
  const QuickViewLauncher: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
    const [open, setOpen] = useState(false);
    return (
      <>
        {children}
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
    );
  };
  return QuickViewLauncher;
}
