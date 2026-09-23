import { describe, expect, it, vi } from 'vitest';
import { resolveReduceMotion, subscribeReduceMotion } from '../motion';

/**
 * react-native cannot be loaded by this runner, so the two things the hook
 * leans on are stood in for: the platform name and AccessibilityInfo.
 */
const rn = vi.hoisted(() => ({
  platform: { OS: 'ios' },
  query: vi.fn<() => Promise<boolean>>(),
  listeners: [] as ((v: boolean) => void)[],
  removed: 0,
}));

vi.mock('react-native', () => ({
  Platform: rn.platform,
  AccessibilityInfo: {
    isReduceMotionEnabled: () => rn.query(),
    addEventListener: (_name: string, fn: (v: boolean) => void) => {
      rn.listeners.push(fn);
      return {
        remove: () => {
          rn.removed++;
        },
      };
    },
  },
}));


const flush = () => new Promise((r) => setTimeout(r, 0));

function fresh(os: string) {
  rn.platform.OS = os;
  rn.query.mockReset();
  rn.listeners.length = 0;
  rn.removed = 0;
  return vi.fn<(v: boolean) => void>();
}

describe('resolveReduceMotion', () => {
  it('lets on and off override the platform, and system follow it', () => {
    expect(resolveReduceMotion('on', false)).toBe(true);
    expect(resolveReduceMotion('off', true)).toBe(false);
    expect(resolveReduceMotion('system', true)).toBe(true);
    expect(resolveReduceMotion('system', false)).toBe(false);
  });
});

describe('subscribeReduceMotion', () => {
  it('reports the native answer and every change, until unsubscribed', async () => {
    const onChange = fresh('ios');
    rn.query.mockResolvedValue(true);
    const off = subscribeReduceMotion(onChange);
    await flush();
    expect(onChange).toHaveBeenCalledWith(true);
    expect(rn.listeners).toHaveLength(1);
    rn.listeners[0]!(false);
    expect(onChange).toHaveBeenLastCalledWith(false);
    off();
    expect(rn.removed).toBe(1);
    rn.listeners[0]!(true);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('treats a native module that is absent — the query rejects — as unknown, not as a preference', async () => {
    // AccessibilityInfo.isReduceMotionEnabled rejects when the native module is
    // missing (a test renderer, jest-expo). An unhandled rejection there would
    // be a red console on every launch of such a build.
    const onChange = fresh('android');
    rn.query.mockRejectedValue(new Error('NativeAccessibilityInfoAndroid is not available'));
    const off = subscribeReduceMotion(onChange);
    await flush();
    expect(onChange).not.toHaveBeenCalled();
    off();
  });

  it('does not ask a web page without matchMedia, where react-native-web would answer true', async () => {
    const onChange = fresh('web');
    const had = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { value: {}, configurable: true, writable: true });
    try {
      rn.query.mockResolvedValue(true);
      const off = subscribeReduceMotion(onChange);
      await flush();
      expect(rn.query).not.toHaveBeenCalled();
      expect(rn.listeners).toHaveLength(0);
      expect(onChange).not.toHaveBeenCalled();
      off();
    } finally {
      if (had) Object.defineProperty(globalThis, 'window', had);
      else delete (globalThis as { window?: unknown }).window;
    }
  });

  it('asks a web page that has matchMedia', async () => {
    const onChange = fresh('web');
    const had = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { value: { matchMedia: () => ({ matches: true }) }, configurable: true, writable: true });
    try {
      rn.query.mockResolvedValue(true);
      const off = subscribeReduceMotion(onChange);
      await flush();
      expect(onChange).toHaveBeenCalledWith(true);
      off();
    } finally {
      if (had) Object.defineProperty(globalThis, 'window', had);
      else delete (globalThis as { window?: unknown }).window;
    }
  });

  it('drops a late answer once unsubscribed', async () => {
    const onChange = fresh('ios');
    let resolve: (v: boolean) => void = () => {};
    rn.query.mockReturnValue(new Promise<boolean>((r) => (resolve = r)));
    const off = subscribeReduceMotion(onChange);
    off();
    resolve(true);
    await flush();
    expect(onChange).not.toHaveBeenCalled();
  });
});
