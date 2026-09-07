import { useMemo } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { useSettings, type BoardTheme } from '../settings';

export interface BoardColors {
  light: string;
  dark: string;
  border: string;
  selected: string;
  lastMove: string;
  target: string;
  capture: string;
  check: string;
  hint: string;
}

export interface Theme {
  scheme: 'dark' | 'light';
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentText: string;
  danger: string;
  success: string;
  /** Crown colours that tell a side's two kings apart. */
  kingA: string;
  kingB: string;
  board: BoardColors;
  radius: number;
}

const OVERLAYS = {
  selected: 'rgba(255, 221, 66, 0.75)',
  lastMove: 'rgba(255, 221, 66, 0.35)',
  target: 'rgba(20, 20, 20, 0.28)',
  capture: 'rgba(200, 40, 40, 0.55)',
  check: 'rgba(226, 60, 60, 0.85)',
  hint: 'rgba(52, 140, 235, 0.9)',
};

export const BOARD_THEMES: Record<BoardTheme, { label: string; light: string; dark: string; border: string }> = {
  wood: { label: 'Wood', light: '#f0d9b5', dark: '#b58863', border: '#3b2a1a' },
  marble: { label: 'Marble', light: '#e9e6df', dark: '#8f9aa6', border: '#4a525c' },
  slate: { label: 'Slate', light: '#aab5c0', dark: '#4f5d6b', border: '#1f262e' },
  neon: { label: 'Neon', light: '#4a4d78', dark: '#2a2c4c', border: '#ff2e88' },
  tournament: { label: 'Green', light: '#eeeed2', dark: '#769656', border: '#2f3d24' },
};

const DARK: Omit<Theme, 'board' | 'scheme'> = {
  bg: '#15161a',
  surface: '#22242b',
  surfaceAlt: '#2c2f38',
  border: '#3a3e4a',
  text: '#f2f2f4',
  textMuted: '#a1a5b3',
  accent: '#e4b95b',
  accentText: '#1a1300',
  danger: '#e25555',
  success: '#5ccc82',
  kingA: '#e4b95b',
  kingB: '#b9c4d6',
  radius: 12,
};

const LIGHT: Omit<Theme, 'board' | 'scheme'> = {
  bg: '#f4f2ee',
  surface: '#ffffff',
  surfaceAlt: '#ebe8e2',
  border: '#d9d4cb',
  text: '#1d1c1a',
  textMuted: '#6b6760',
  accent: '#c9962d',
  accentText: '#1a1300',
  danger: '#c73b3b',
  success: '#2e9c58',
  kingA: '#c9962d',
  kingB: '#5f6f88',
  radius: 12,
};

export function makeTheme(scheme: 'dark' | 'light', boardTheme: BoardTheme): Theme {
  const b = BOARD_THEMES[boardTheme];
  const base = scheme === 'dark' ? DARK : LIGHT;
  return {
    ...base,
    scheme,
    board: { light: b.light, dark: b.dark, border: b.border, ...OVERLAYS },
  };
}

/** The static dark theme, for code that runs before providers are mounted. */
export const theme: Theme = makeTheme('dark', 'wood');

export function useTheme(): Theme {
  const { settings } = useSettings();
  const system = useColorScheme();
  const scheme = settings.colorScheme === 'system' ? (system === 'light' ? 'light' : 'dark') : settings.colorScheme;
  return useMemo(() => makeTheme(scheme, settings.boardTheme), [scheme, settings.boardTheme]);
}

/**
 * Builds a `useStyles()` hook from a theme-aware style factory:
 *   const useStyles = themedStyles((t) => ({ box: { backgroundColor: t.surface } }));
 */
export function themedStyles<T extends StyleSheet.NamedStyles<T>>(factory: (t: Theme) => T): () => T {
  return () => {
    const t = useTheme();
    return useMemo(() => StyleSheet.create(factory(t)), [t]);
  };
}
