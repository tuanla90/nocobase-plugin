import React from 'react';
import { theme } from 'antd';
import { SafeIcon } from './bottomBar';
import { usePwaConfig, pwaNavigate } from './configStore';
import { InstallInline } from './installPrompt';

// ---------------------------------------------------------------------------
// Content injected into the user-center (avatar) dropdown when the nav and/or
// install suggestion are configured to live there. Rendered INSIDE the core
// dropdown wrapper, so it reuses the `nb-user-center-item` classes to match the
// native item look. Lane-agnostic; the v2 lane wires it to a UserCenter model.
// ---------------------------------------------------------------------------

export const PwaAvatarPanel: React.FC<{ closeDropdown?: () => void }> = ({ closeDropdown }) => {
  const { token } = theme.useToken();
  const cfg = usePwaConfig();

  const navAvatar = !!cfg.bottomBar?.enabled && cfg.bottomBar?.placement === 'avatar';
  const items = navAvatar ? (cfg.bottomBar?.items || []).filter((it) => it && it.schemaUid).slice(0, 5) : [];
  const insAvatar = cfg.install?.position === 'avatar' && cfg.install?.enabled !== false;

  if (!items.length && !insAvatar) return null;

  return (
    <div>
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          className="nb-user-center-item nb-user-center-item-action"
          onClick={() => {
            pwaNavigate(it.schemaUid || '');
            closeDropdown?.();
          }}
        >
          <div className="nb-user-center-item-main" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'inline-flex', width: 18, justifyContent: 'center', color: token.colorTextSecondary }}>
              <SafeIcon type={it.icon} size={16} />
            </span>
            <span className="nb-user-center-item-label">{it.label}</span>
          </div>
        </button>
      ))}
      {insAvatar ? (
        <InstallInline
          icon={cfg.icon}
          themeColor={cfg.themeColor}
          title={cfg.install?.title}
          description={cfg.install?.description}
          onDone={closeDropdown}
        />
      ) : null}
    </div>
  );
};
