import React from 'react';

// Consumer side of the workspace icon architecture (docs/ICON-ARCHITECTURE.md):
// each lane injects ITS OWN `Icon` + `icons` registry (they are separate Maps per lane) via
// setIconRegistry() in load(). We render lucide-* keys (provided by
// @tuanla90/plugin-custom-icons) and gracefully fall back to the always-present antd keys.
let IconComp: any = null;
let iconsMap: Map<string, any> | null = null;

export function setIconRegistry(deps: { Icon: any; icons?: Map<string, any> }) {
  IconComp = deps.Icon || IconComp;
  iconsMap = deps.icons || iconsMap;
}

export const RegistryIcon: React.FC<{ type: string; fallback?: string; style?: React.CSSProperties }> = ({
  type,
  fallback,
  style,
}) => {
  if (!IconComp) return null;
  const key = iconsMap?.has?.(type) ? type : fallback || type;
  return React.createElement(IconComp, { type: key, style });
};
