import { describe, expect, it, vi } from 'vitest';
import { CLEARED_KEYS, KEPT_ON_CLEAR, STORAGE_KEYS } from '../storage';

const spy = vi.hoisted(() => ({ removed: [] as string[], stored: {} as Record<string, string> }));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => spy.stored[key] ?? null,
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

describe('loadJSON', () => {
  it('returns a stored record when the fallback is null, as the saved game\'s is', async () => {
    // With defaults to spread under, a non-record fallback used to be returned
    // whatever was stored, so the saved game always read back as null and
    // Resume never appeared after a restart.
    const { loadJSON } = await import('../storage');
    spy.stored['k.game'] = JSON.stringify({ seed: 7, humanColor: 'w', events: [] });
    expect(await loadJSON<unknown>('k.game', null)).toEqual({ seed: 7, humanColor: 'w', events: [] });
  });

  it('spreads record defaults under what was stored, and falls back on anything else', async () => {
    const { loadJSON } = await import('../storage');
    spy.stored['k.rec'] = JSON.stringify({ a: 2 });
    expect(await loadJSON('k.rec', { a: 1, b: 1 })).toEqual({ a: 2, b: 1 });
    for (const raw of ['[1,2]', '"text"', '3', 'null', '{not json']) {
      spy.stored['k.bad'] = raw;
      expect(await loadJSON<unknown>('k.bad', null), raw).toBeNull();
      expect(await loadJSON('k.bad', { a: 1 }), raw).toEqual({ a: 1 });
    }
    spy.stored['k.proto'] = '{"__proto__":{"polluted":true},"a":3}';
    const read = await loadJSON<unknown>('k.proto', null);
    expect(read).toEqual({ a: 3 });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
