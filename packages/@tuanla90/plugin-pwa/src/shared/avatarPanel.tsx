import React from 'react';
import { theme } from 'antd';
import { SafeIcon } from './bottomBar';
import { usePwaConfig, pwaNavigate, useBadgeCounts } from './configStore';
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
  const counts = useBadgeCounts();

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
          {it.badge?.enabled && (counts[it.key] || 0) > 0 ? (
            <span
              style={{
                minWidth: 18,
                height: 18,
                padding: '0 5px',
                borderRadius: 999,
                background: (it.badge.color && it.badge.color.trim()) || '#ff4d4f',
                color: '#fff',
                fontSize: 11,
                fontWeight: 600,
                lineHeight: '18px',
                textAlign: 'center',
                flex: 'none',
              }}
            >
              {(counts[it.key] || 0) > (it.badge.max || 99) ? `${it.badge.max || 99}+` : counts[it.key]}
            </span>
          ) : null}
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
