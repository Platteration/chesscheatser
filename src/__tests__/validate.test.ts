import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARMY_SIZES, DEFAULT_CONFIG } from '../game/config';
import { generateSetup } from '../engine/setup';
import type { AppSettings } from '../settings';
import { cleanConfig, cleanSavedGame, cleanSettings } from '../validate';

/** Board theme ids as the theme table actually declares them (it cannot be imported: it pulls in React Native). */
const themeSource = readFileSync(new URL('../ui/theme.ts', import.meta.url), 'utf8');
const boardThemeIds = [...themeSource.slice(themeSource.indexOf('BOARD_THEMES')).matchAll(/^ {2}(\w+): \{ label:/gm)].map((m) => m[1]);

const SETTINGS: AppSettings = {
  colorScheme: 'light',
  boardTheme: 'slate',
  pieceStyle: 'classic',
  sounds: false,
  haptics: false,
  seenIntro: true,
};

describe('cleanConfig', () => {
  it('fills in a config a previous build never wrote', () => {
    expect(cleanConfig({ mode: 'ai', difficulty: 'hard' })).toEqual({ ...DEFAULT_CONFIG, difficulty: 'hard' });
  });

  it('clamps every unknown value to the default instead of passing it on', () => {
    const c = cleanConfig({
      mode: 'network',
      difficulty: 'impossible',
      material: 'lopsided',
      playAs: 'green',
      armySize: 'enormous',
      cheating: 'always',
      doubleCheck: 'ignore',
      comeback: 'yes',
    });
    expect(c).toEqual(DEFAULT_CONFIG);
    // The crash this exists to stop: an army size that is not in the table.
    expect(ARMY_SIZES[c.armySize]).toBeDefined();
  });

  it('keeps the optional fields only when they are usable', () => {
    expect(cleanConfig({ clock: 5, playerCheats: true }).clock).toBe(5);
    expect(cleanConfig({ clock: 7 }).clock).toBe(0);
    expect(cleanConfig({ playerCheats: 'sure' }).playerCheats).toBe(false);
    expect(cleanConfig({}).clock).toBeUndefined();
  });

  it('survives a record that is not an object at all', () => {
    expect(cleanConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(cleanConfig('wat')).toEqual(DEFAULT_CONFIG);
    expect(cleanConfig([1, 2])).toEqual(DEFAULT_CONFIG);
  });
});

describe('cleanSavedGame', () => {
  const good = { config: { ...DEFAULT_CONFIG, armySize: 'small' }, seed: 7, humanColor: 'w', events: [{ type: 'pass' }] };

  it('keeps a usable record, including its optional fields', () => {
    const g = cleanSavedGame({ ...good, daily: '2026-01-02', ranked: 4, handicap: 1.2, clocks: { w: 1000, b: 900 } })!;
    expect(g.config.armySize).toBe('small');
    expect(g.seed).toBe(7);
    expect(g.events).toHaveLength(1);
    expect(g).toMatchObject({ daily: '2026-01-02', ranked: 4, handicap: 1.2, clocks: { w: 1000, b: 900 } });
  });

  it('rebuilds a record saved before comeback and double check existed, so the setup still generates', () => {
    // What a pre-comeback build wrote: no comeback/doubleCheck, and here no config at all.
    const stored = JSON.parse('{"seed":11,"humanColor":"b","events":[]}');
    const g = cleanSavedGame(stored)!;
    expect(g).not.toBeNull();
    const size = ARMY_SIZES[g.config.armySize];
    expect(size).toBeDefined();
    expect(() =>
      generateSetup({ mode: g.config.material, seed: g.seed, minPieces: size.min, maxPieces: size.max }),
    ).not.toThrow();
  });

  it('drops a record that cannot be replayed rather than crashing Resume', () => {
    expect(cleanSavedGame(null)).toBeNull();
    expect(cleanSavedGame('{}')).toBeNull();
    expect(cleanSavedGame({ ...good, seed: 'seven' })).toBeNull();
    expect(cleanSavedGame({ ...good, seed: Number.NaN })).toBeNull();
    expect(cleanSavedGame({ ...good, humanColor: 'q' })).toBeNull();
    expect(cleanSavedGame({ ...good, events: 'none' })).toBeNull();
    expect(cleanSavedGame({ ...good, events: [{ type: 'teleport' }] })).toBeNull();
    expect(cleanSavedGame({ ...good, events: [null] })).toBeNull();
  });

  it('ignores a half-written clock rather than resuming with one side on NaN', () => {
    expect(cleanSavedGame({ ...good, clocks: { w: 1000 } })!.clocks).toBeUndefined();
    expect(cleanSavedGame({ ...good, clocks: 'gone' })!.clocks).toBeUndefined();
  });
});

describe('cleanSettings', () => {
  it('keeps values the app knows', () => {
    const s = { colorScheme: 'dark', boardTheme: 'neon', pieceStyle: 'solid', sounds: true, haptics: false, seenIntro: true };
    expect(cleanSettings(s, SETTINGS)).toEqual(s);
  });

  it('replaces an unknown board theme, which would otherwise throw on every render', () => {
    // makeTheme reads BOARD_THEMES[boardTheme].light with no guard, and useTheme
    // runs in the app's own root: an unknown value white-screens the app at launch.
    const s = cleanSettings({ boardTheme: 'chartreuse', colorScheme: 'sepia', pieceStyle: 'outline' }, SETTINGS);
    expect(boardThemeIds).toContain(s.boardTheme);
    expect(s.boardTheme).toBe(SETTINGS.boardTheme);
    expect(s.colorScheme).toBe(SETTINGS.colorScheme);
    expect(s.pieceStyle).toBe(SETTINGS.pieceStyle);
  });

  it('falls back for missing and mistyped fields, and for a record that is not an object', () => {
    expect(cleanSettings({ sounds: 'on' }, SETTINGS)).toEqual(SETTINGS);
    expect(cleanSettings(undefined, SETTINGS)).toEqual(SETTINGS);
    expect(cleanSettings(42, SETTINGS)).toEqual(SETTINGS);
  });

  it('reads every board theme the theme table declares', () => {
    // Guards the list in validate.ts against the table drifting away from it.
    expect(boardThemeIds.length).toBeGreaterThan(1);
    for (const id of boardThemeIds) {
      expect(cleanSettings({ boardTheme: id }, SETTINGS).boardTheme).toBe(id);
    }
  });
});
