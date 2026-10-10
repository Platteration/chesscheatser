import { beforeEach, describe, expect, it, vi } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadJSON, STORAGE_KEYS } from '../storage';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn() },
}));

describe('loading persisted data', () => {
  beforeEach(() => vi.mocked(AsyncStorage.getItem).mockReset());

  it('restores a saved game even when the empty-game fallback is null', async () => {
    const saved = { config: { mode: 'local' }, seed: 42, humanColor: 'w', events: [] };
    vi.mocked(AsyncStorage.getItem).mockResolvedValue(JSON.stringify(saved));
    expect(await loadJSON<typeof saved | null>(STORAGE_KEYS.game, null)).toEqual(saved);
  });

  it('merges older settings with their defaults', async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValue('{"sounds":false}');
    expect(await loadJSON('settings', { sounds: true, haptics: true })).toEqual({ sounds: false, haptics: true });
  });

  it('uses the fallback when nothing was saved', async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValue(null);
    expect(await loadJSON(STORAGE_KEYS.game, null)).toBeNull();
  });

  it.each(['null', '[]', 'false', '"game"', '{broken'])('rejects invalid object data: %s', async (raw) => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValue(raw);
    expect(await loadJSON(STORAGE_KEYS.game, null)).toBeNull();
  });
});
