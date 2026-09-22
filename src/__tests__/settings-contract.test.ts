/**
 * The settings contract, pinned: the storage keys, the row list, the enum
 * tables, the theme's null rule, what Reset touches, what About says, and the
 * accessibility floor. Each is a literal here on purpose — a renamed key
 * silently orphans every player's record, and a dropped row or table member
 * would otherwise fail only in someone's hand.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, resetSettings, resolveScheme, type AppSettings } from '../appSettings';
import { STORAGE_KEYS } from '../storage';
import { SETTING_TABLES } from '../validate';

vi.mock('expo-constants', () => ({ default: { expoConfig: { version: '9.9.9' } } }));

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

describe('storage keys', () => {
  it('are exactly these, spelled exactly so', () => {
    expect(STORAGE_KEYS).toEqual({
      settings: 'twokings.settings.v1',
      game: 'twokings.game.v1',
      stats: 'twokings.stats.v1',
      daily: 'twokings.daily.v1',
      ladder: 'twokings.ladder.v1',
      puzzles: 'twokings.puzzles.v1',
      appsettings: 'twokings.appsettings.v1',
      entitlements: 'twokings.entitlements.v1',
    });
  });
});

describe('the settings record', () => {
  it('has exactly these rows, with these defaults', () => {
    expect(Object.keys(DEFAULT_SETTINGS)).toEqual(['colorScheme', 'boardTheme', 'pieceStyle', 'sounds', 'haptics', 'reduceMotion', 'seenIntro']);
    expect(DEFAULT_SETTINGS).toEqual({
      colorScheme: 'system',
      boardTheme: 'wood',
      pieceStyle: 'solid',
      sounds: true,
      haptics: true,
      reduceMotion: 'system',
      seenIntro: false,
    });
  });

  it('has exactly these values for each enum', () => {
    expect(Object.keys(SETTING_TABLES)).toEqual(['colorScheme', 'boardTheme', 'pieceStyle', 'reduceMotion']);
    expect(Object.keys(SETTING_TABLES.colorScheme)).toEqual(['system', 'dark', 'light']);
    expect(Object.keys(SETTING_TABLES.boardTheme)).toEqual(['wood', 'marble', 'slate', 'neon', 'tournament']);
    expect(Object.keys(SETTING_TABLES.pieceStyle)).toEqual(['solid', 'classic']);
    expect(Object.keys(SETTING_TABLES.reduceMotion)).toEqual(['system', 'on', 'off']);
  });
});

describe('theme', () => {
  it('resolves a device with no stated scheme to dark, and follows a stated one', () => {
    // React Native answers null when the OS states no preference; the app's own
    // pre-provider default is dark, so that is what `system` means then.
    expect(resolveScheme('system', null)).toBe('dark');
    expect(resolveScheme('system', undefined)).toBe('dark');
    expect(resolveScheme('system', 'light')).toBe('light');
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
  });

  it('is what useTheme builds from', () => {
    expect(read('../ui/theme.ts')).toMatch(/resolveScheme\(settings\.colorScheme, system\)/);
  });
});

describe('reset to defaults', () => {
  const changed: AppSettings = { colorScheme: 'light', boardTheme: 'neon', pieceStyle: 'classic', sounds: false, haptics: false, reduceMotion: 'on', seenIntro: true };

  it('restores every preference but keeps whether the intro was seen', () => {
    expect(resetSettings(changed)).toEqual({ ...DEFAULT_SETTINGS, seenIntro: true });
    expect(resetSettings({ ...changed, seenIntro: false })).toEqual(DEFAULT_SETTINGS);
  });

  it('is confirmed, and the provider writes the settings record and nothing else', () => {
    // The provider cannot be imported here (React Native), so its wiring is
    // checked against the source, as validate.test.ts does for App.tsx.
    const provider = read('../settings.tsx');
    expect(provider).toMatch(/const KEY = STORAGE_KEYS\.appsettings;/);
    expect(provider.match(/STORAGE_KEYS\.\w+/g)).toEqual(['STORAGE_KEYS.appsettings']);
    expect(provider.match(/saveJSON\(\w+/g)?.every((call) => call === 'saveJSON(KEY')).toBe(true);
    expect(provider).toMatch(/resetSettings\(prev\)/);
    const home = read('../ui/HomeScreen.tsx');
    expect(home).toMatch(/confirmAction\(\{[\s\S]*?onConfirm: reset,/);
    expect(home).toMatch(/title="Reset to defaults"[^>]*onPress=\{onReset\}/);
  });
});

describe('reduce motion', () => {
  it('reaches the one glide the app draws', () => {
    // The row exists because Board.tsx animates a moved piece; the setting has
    // to be what stops it, on the same early exit a pass or a spawn takes.
    const board = read('../ui/Board.tsx');
    expect(board).toMatch(/Animated\.timing\(/);
    expect(board).toMatch(/useReduceMotion\(settings\.reduceMotion\)/);
    expect(board).toMatch(/if \(reduceMotion \|\| !animate/);
  });
});

describe('about', () => {
  it('names the app, its version from the config, the source and the two documents it links', async () => {
    const about = await import('../about');
    expect(about.APP_NAME).toBe(JSON.parse(read('../../app.json')).expo.name);
    expect(about.APP_VERSION).toBe('9.9.9');
    expect(about.SOURCE_URL).toBe('https://github.com/Platteration/chesscheatser');
    expect(about.PRIVACY_URL).toBe(`${about.SOURCE_URL}/blob/HEAD/PRIVACY.md`);
    expect(about.CHANGELOG_URL).toBe(`${about.SOURCE_URL}/blob/HEAD/CHANGELOG.md`);
    // The privacy sentence is quoted from the statement itself, so it cannot drift from it.
    expect(read('../../PRIVACY.md')).toContain(about.PRIVACY_SENTENCE);
    expect(read('../../CHANGELOG.md').length).toBeGreaterThan(0);
  });

  it('reads 0.0.0 rather than "undefined" when the config carries no version', async () => {
    vi.resetModules();
    vi.doMock('expo-constants', () => ({ default: { expoConfig: null } }));
    const about = await import('../about');
    expect(about.APP_VERSION).toBe('0.0.0');
  });
});

describe('accessibility floor', () => {
  /** The opening tag of the JSX element starting at `at`, braces balanced so an arrow function in a prop does not end it early. */
  function openingTag(src: string, at: number): string {
    let depth = 0;
    for (let i = at; i < src.length; i++) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) return src.slice(at, i + 1);
    }
    return src.slice(at);
  }

  const uiFiles = [...readdirSync(new URL('../ui/', import.meta.url)).filter((f) => f.endsWith('.tsx')).map((f) => `../ui/${f}`), '../../App.tsx'];

  it('gives every pressable a role', () => {
    let pressables = 0;
    for (const file of uiFiles) {
      const src = read(file);
      for (const m of src.matchAll(/<Pressable\b/g)) {
        pressables++;
        expect(openingTag(src, m.index!), `${file} at ${m.index}`).toMatch(/accessibilityRole=/);
      }
    }
    expect(pressables).toBeGreaterThan(5);
  });

  it('marks the selected segment, names the switch after its row, and calls a link a link', () => {
    const components = read('../ui/components.tsx');
    const segment = openingTag(components, components.indexOf('<Pressable', components.indexOf('export function Segmented')));
    expect(segment).toMatch(/accessibilityState=\{\{ selected: active \}\}/);
    const button = openingTag(components, components.indexOf('<Pressable', components.indexOf('export function Button')));
    expect(button).toMatch(/accessibilityRole="button"/);
    expect(openingTag(components, components.indexOf('<Switch'))).toMatch(/accessibilityLabel=\{label\}/);
    const link = openingTag(components, components.indexOf('<Pressable', components.indexOf('export function Link')));
    expect(link).toMatch(/accessibilityRole="link"/);
  });
});
