import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import type { ReduceMotionSetting } from './appSettings';

/** `on` and `off` are the player's word; `system` is whatever the platform reports. */
export function resolveReduceMotion(setting: ReduceMotionSetting, system: boolean): boolean {
  return setting === 'system' ? system : setting === 'on';
}

/**
 * Reports the platform's reduce-motion switch to `onChange`, now and on every
 * change, and returns the unsubscribe. Two guards the sources force. The native
 * query *rejects* when its module is absent (a test renderer, a build without
 * the native side), and a rejection is "unknown", not a preference, so nothing
 * is reported. react-native-web resolves *true* when `window.matchMedia` is
 * missing (jsdom, a thumbnail renderer) — the same "unknown" — so on the web a
 * page without matchMedia is not asked at all. In both cases the default of
 * false stands: the player's own `on` is the way to reduce motion there.
 */
export function subscribeReduceMotion(onChange: (reduced: boolean) => void): () => void {
  if (Platform.OS === 'web' && (typeof window === 'undefined' || typeof window.matchMedia !== 'function')) return () => {};
  let live = true;
  AccessibilityInfo.isReduceMotionEnabled()
    .then((reduced) => {
      if (live) onChange(reduced);
    })
    .catch(() => {});
  const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (reduced) => {
    if (live) onChange(reduced);
  });
  return () => {
    live = false;
    sub.remove();
  };
}

/** Whether motion should be reduced right now, given the player's setting. */
export function useReduceMotion(setting: ReduceMotionSetting): boolean {
  const [system, setSystem] = useState(false);
  useEffect(() => subscribeReduceMotion(setSystem), []);
  return resolveReduceMotion(setting, system);
}
