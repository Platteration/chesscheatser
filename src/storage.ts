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
    if (!isRecord(parsed)) return fallback;
    // Defaults are spread under a record only when there are defaults: the saved
    // game's fallback is null, and returning the fallback there made every stored
    // game read back as "none", so Resume never appeared after a restart.
    return (isRecord(fallback) ? { ...fallback, ...parsed } : parsed) as T;
  } catch {
    return fallback;
  }
}

/**
 * Writes the store refused, by key: the write and what the key should now hold (null for
 * removed). A write that fails is not allowed to fail silently. The web build's storage is the
 * origin's localStorage, and on a GitHub Pages project site that origin, and its few megabytes
 * of room, are shared with every other app the account publishes: once one of them has filled
 * it, every save here throws. Swallowing that let a player play on, and finish a daily
 * challenge, with nothing stored and nothing said, and find it all gone on reload. So a refused
 * write is kept here, `StorageNote` says so on every screen while any is, and each is written
 * again after the next write the store accepts, which is how saving resumes by itself once
 * there is room again.
 */
const refused = new Map<string, { id: number; value: string | null }>();
/** The newest write asked of each key, so that a refused value is only retried while it is still the newest. */
const newest = new Map<string, number>();
let writes = 0;
let catchingUp = false;
const listeners = new Set<() => void>();

/** What `StorageNote` says while a write is refused: a browser stores per site, a phone per app. */
export const STORAGE_REFUSED_NOTE = {
  web: 'This browser is not saving the game: its storage for this site is full or switched off. Anything you play now is lost when the page closes. Saving resumes by itself once there is room.',
  native: 'This device is not saving the game: its storage is full. Anything you play now is lost when the app closes. Saving resumes by itself once there is room.',
} as const;

/** True while the store has refused the latest write of any record. */
export function storageRefused(): boolean {
  return refused.size > 0;
}

/** Calls `listener` whenever `storageRefused()` may have changed; returns the unsubscribe. */
export function onStorageRefusedChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function write(key: string, value: string | null): Promise<boolean> {
  const id = ++writes;
  newest.set(key, id);
  let ok = true;
  try {
    if (value === null) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, value);
  } catch {
    ok = false;
  }
  const before = refused.size;
  if (ok) refused.delete(key);
  else refused.set(key, { id, value });
  if (refused.size !== before) for (const listener of listeners) listener();
  if (ok && refused.size > 0) void catchUp();
  return ok;
}

/**
 * There is room again: write what was refused, each record once. Only while the refused value
 * is still the newest one asked of its key: a write issued since may already have stored a
 * newer one (on the web a write takes effect when it is called), which the old value must not
 * then overwrite.
 */
async function catchUp(): Promise<void> {
  if (catchingUp) return;
  catchingUp = true;
  try {
    for (const [key, entry] of [...refused]) {
      if (newest.get(key) === entry.id) await write(key, entry.value);
    }
  } finally {
    catchingUp = false;
  }
}

/** Stores `value` under `key`; false (and `storageRefused()`) when the store refused it. */
export async function saveJSON(key: string, value: unknown): Promise<boolean> {
  let text: string;
  try {
    text = JSON.stringify(value);
  } catch {
    return false;
  }
  return write(key, text);
}

export async function remove(key: string): Promise<boolean> {
  return write(key, null);
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
