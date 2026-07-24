import { useEffect, useState } from 'react';
import { BottomBarConfig } from './bottomBar';
import { InstallConfig } from './installPrompt';

// ---------------------------------------------------------------------------
// Tiny runtime store for the loaded PWA config. The mobile shell provider fills
// it after fetching pwaSettings; the avatar-menu item (rendered in a separate
// React tree — the user-center dropdown) reads it via usePwaConfig(). Also lets
// any consumer trigger navigation through the shell's navigate function.
// ---------------------------------------------------------------------------

export interface PwaRuntimeConfig {
  bottomBar?: BottomBarConfig;
  install?: InstallConfig;
  themeColor?: string;
  icon?: string;
}

let current: PwaRuntimeConfig = {};
let navFn: ((schemaUid: string) => void) | null = null;
let counts: Record<string, number> = {};
const subs = new Set<() => void>();
const countSubs = new Set<() => void>();

export function setPwaConfig(c: PwaRuntimeConfig): void {
  current = c || {};
  subs.forEach((f) => {
    try {
      f();
    } catch (e) {
      // ignore
    }
  });
}
export function getPwaConfig(): PwaRuntimeConfig {
  return current;
}

export function setBadgeCounts(m: Record<string, number>): void {
  counts = m || {};
  countSubs.forEach((f) => {
    try {
      f();
    } catch (e) {
      // ignore
    }
  });
}
export function getBadgeCounts(): Record<string, number> {
  return counts;
}
export function useBadgeCounts(): Record<string, number> {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    countSubs.add(fn);
    return () => {
      countSubs.delete(fn);
    };
  }, []);
  return counts;
}
export function setPwaNavigate(fn: (schemaUid: string) => void): void {
  navFn = fn;
}
export function pwaNavigate(schemaUid: string): void {
  if (navFn) navFn(schemaUid);
}

export function usePwaConfig(): PwaRuntimeConfig {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    subs.add(fn);
    return () => {
      subs.delete(fn);
    };
  }, []);
  return current;
}
