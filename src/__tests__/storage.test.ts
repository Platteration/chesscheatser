import { describe, expect, it, vi } from 'vitest';
import { CLEARED_KEYS, KEPT_ON_CLEAR, STORAGE_KEYS } from '../storage';

const spy = vi.hoisted(() => ({ removed: [] as string[] }));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async (key: string) => {
      spy.removed.push(key);
    },
  },
}));

describe('clearAll', () => {
  it('drops the records the app keeps — but not the purchase', async () => {
    // The error boundary's last resort ran over all eight keys, which took the
    // Pro unlock with it: the bundled store restores nothing, so a render crash
    // in a stats or daily record quietly cancelled what someone had bought.
    const { clearAll } = await import('../storage');
    await clearAll();
    expect([...spy.removed].sort()).toEqual([...CLEARED_KEYS].sort());
    expect(spy.removed).not.toContain(STORAGE_KEYS.entitlements);
    expect(spy.removed).toContain(STORAGE_KEYS.game);
    expect(spy.removed).toContain(STORAGE_KEYS.appsettings);
  });

  it('accounts for every key: each one is cleared, or kept on purpose', () => {
    for (const key of Object.values(STORAGE_KEYS)) {
      expect(CLEARED_KEYS.includes(key) || KEPT_ON_CLEAR.includes(key)).toBe(true);
    }
    expect(CLEARED_KEYS.length + KEPT_ON_CLEAR.length).toBe(Object.keys(STORAGE_KEYS).length);
    expect(KEPT_ON_CLEAR).toEqual([STORAGE_KEYS.entitlements]);
  });
});
