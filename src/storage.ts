import AsyncStorage from '@react-native-async-storage/async-storage';

export const STORAGE_KEYS = {
  settings: 'twokings.settings.v1',
  game: 'twokings.game.v1',
  stats: 'twokings.stats.v1',
  daily: 'twokings.daily.v1',
  ladder: 'twokings.ladder.v1',
  puzzles: 'twokings.puzzles.v1',
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function safeParse<T>(text: string): T {
  return JSON.parse(text, (key, value) => {
    return key === '__proto__' || key === 'constructor' || key === 'prototype' ? undefined : value;
  }) as T;
}

export async function loadJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = safeParse<unknown>(raw);
    return isRecord(parsed) && isRecord(fallback) ? { ...fallback, ...parsed } : fallback;
  } catch {
    return fallback;
  }
}

export async function saveJSON(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Persistence is best-effort.
  }
}

export async function remove(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // ignore
  }
}
