import AsyncStorage from '@react-native-async-storage/async-storage';

/** Every key the app writes. The error boundary's last resort clears all but `KEPT_ON_CLEAR`, so none may be missing. */
export const STORAGE_KEYS = {
  settings: 'twokings.settings.v1',
  game: 'twokings.game.v1',
  stats: 'twokings.stats.v1',
  daily: 'twokings.daily.v1',
  ladder: 'twokings.ladder.v1',
  puzzles: 'twokings.puzzles.v1',
  appsettings: 'twokings.appsettings.v1',
  entitlements: 'twokings.entitlements.v1',
} as const;

export async function loadJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as T) };
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

/**
 * The one record the error boundary's last resort does not touch. It is not the
 * app's own state: it records a purchase, and a render crash in a stats or
 * daily record is no reason to revoke one. It cannot be the thing that fails
 * either — `cleanEntitlements` reduces whatever is stored to a list of known
 * product ids — so keeping it costs the recovery nothing. The bundled store's
 * `restore()` returns nothing, so on today's build erasing it would simply lose
 * the unlock.
 */
export const KEPT_ON_CLEAR: readonly string[] = [STORAGE_KEYS.entitlements];

/** Everything `clearAll` drops. Every key is either here or in `KEPT_ON_CLEAR`; a test checks that. */
export const CLEARED_KEYS: readonly string[] = Object.values(STORAGE_KEYS).filter((key) => !KEPT_ON_CLEAR.includes(key));

/** Drops the records the app keeps: the error boundary's last way out when one of them cannot be shown. */
export async function clearAll(): Promise<void> {
  await Promise.all(CLEARED_KEYS.map(remove));
}
