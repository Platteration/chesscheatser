import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CLEARED_KEYS, KEPT_ON_CLEAR, STORAGE_KEYS } from '../storage';

const spy = vi.hoisted(() => ({ removed: [] as string[], stored: {} as Record<string, string>, full: false }));

// Like the web build's store, a write takes effect (or throws) when it is called: the
// browser's localStorage behind it is synchronous, only the promise around it is not.
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => spy.stored[key] ?? null,
    setItem: async (key: string, value: string) => {
      if (spy.full) throw new Error("QuotaExceededError: Setting the value of 'k' exceeded the quota.");
      spy.stored[key] = value;
    },
    removeItem: async (key: string) => {
      spy.removed.push(key);
      delete spy.stored[key];
    },
  },
}));

/** Lets the catch-up a successful write starts run to the end. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

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

describe('a write the store refuses', () => {
  // On a GitHub Pages project site the web build's storage is the origin's, shared with every
  // other app the account publishes; once one of them has filled it every save throws, and
  // saveJSON used to swallow that: a player played on with nothing stored and nothing said.
  beforeEach(() => {
    // What the store has refused is module state: each case starts from a fresh module.
    vi.resetModules();
    spy.full = false;
  });

  it('is not silent: saveJSON says so, and so does storageRefused until it is written', async () => {
    const { onStorageRefusedChange, saveJSON, storageRefused } = await import('../storage');
    const heard: boolean[] = [];
    const stop = onStorageRefusedChange(() => heard.push(storageRefused()));
    spy.full = true;
    expect(await saveJSON('k.game', { move: 1 })).toBe(false);
    expect(storageRefused()).toBe(true);
    expect(await saveJSON('k.game', { move: 2 })).toBe(false);
    expect(heard).toEqual([true]);

    // Room again: the next write that gets through writes the refused record too, newest value.
    spy.full = false;
    expect(await saveJSON('k.stats', { wins: 1 })).toBe(true);
    await settle();
    expect(spy.stored['k.game']).toBe(JSON.stringify({ move: 2 }));
    expect(storageRefused()).toBe(false);
    expect(heard).toEqual([true, false]);
    stop();
  });

  it('counts a refused removal too, and a later success of the same key clears it', async () => {
    const { remove, saveJSON, storageRefused } = await import('../storage');
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const removeItem = vi.spyOn(AsyncStorage, 'removeItem').mockRejectedValueOnce(new Error('SecurityError'));
    expect(await remove('k.finished')).toBe(false);
    expect(storageRefused()).toBe(true);
    expect(await saveJSON('k.finished', null)).toBe(true);
    expect(storageRefused()).toBe(false);
    removeItem.mockRestore();
  });

  it('is never written over a newer value of its key', async () => {
    // The refused value is retried only while it is still the newest thing asked of its key.
    const { saveJSON, storageRefused } = await import('../storage');
    spy.full = true;
    expect(await saveJSON('k.config', { v: 1 })).toBe(false);
    expect(await saveJSON('k.other', { v: 1 })).toBe(false);
    spy.full = false;
    // Two writes in flight at once: the first to finish starts the catch-up while the newer
    // k.config write is still unresolved, though it has already stored its value.
    const first = saveJSON('k.unrelated', { v: 1 });
    const newer = saveJSON('k.config', { v: 2 });
    expect(await first).toBe(true);
    expect(await newer).toBe(true);
    await settle();
    expect(spy.stored['k.config']).toBe(JSON.stringify({ v: 2 }));
    expect(spy.stored['k.other']).toBe(JSON.stringify({ v: 1 }));
    expect(storageRefused()).toBe(false);
  });

  it('says what is lost and that saving comes back, in the browser and on a phone', async () => {
    const { STORAGE_REFUSED_NOTE } = await import('../storage');
    expect(STORAGE_REFUSED_NOTE.web).toMatch(/^This browser is not saving the game/);
    expect(STORAGE_REFUSED_NOTE.native).toMatch(/^This device is not saving the game/);
    for (const note of Object.values(STORAGE_REFUSED_NOTE)) expect(note).toMatch(/lost when the .* closes\. Saving resumes by itself once there is room\.$/);
  });
});
