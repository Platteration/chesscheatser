import { useMemo } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { AURAS, DEFAULT_AURA } from '../cosmetics';
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
  /** Comeback power accent. */
  power: string;
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
  bg: '#19232d',
  surface: '#24323e',
  surfaceAlt: '#30424f',
  border: '#526674',
  text: '#f7f1e5',
  textMuted: '#b7c2c7',
  accent: '#e8bd70',
  accentText: '#1a1300',
  danger: '#ef9290',
  success: '#93c6a1',
  power: '#c07be8',
  kingA: '#e8bd70',
  kingB: '#b9c4d6',
  radius: 12,
};

const LIGHT: Omit<Theme, 'board' | 'scheme'> = {
  bg: '#f5f0e6',
  surface: '#fffaf0',
  surfaceAlt: '#e9e2d3',
  border: '#b7b2a4',
  text: '#24333e',
  textMuted: '#5b6b72',
  accent: '#a57127',
  accentText: '#1a1300',
  danger: '#b4424a',
  success: '#37734d',
  power: '#8a3fc4',
  kingA: '#a57127',
  kingB: '#5f6f88',
  radius: 12,
};

export function makeTheme(scheme: 'dark' | 'light', boardTheme: BoardTheme, aura: string = DEFAULT_AURA): Theme {
  const b = BOARD_THEMES[boardTheme];
  const base = scheme === 'dark' ? DARK : LIGHT;
  const a = AURAS[aura] ?? AURAS[DEFAULT_AURA];
  return {
    ...base,
    scheme,
    power: scheme === 'dark' ? a.dark : a.light,
    board: { light: b.light, dark: b.dark, border: b.border, ...OVERLAYS },
  };
}

/** The static dark theme, for code that runs before providers are mounted. */
export const theme: Theme = makeTheme('dark', 'wood');

export function useTheme(): Theme {
  const { settings } = useSettings();
  const system = useColorScheme();
  const scheme = settings.colorScheme === 'system' ? (system === 'light' ? 'light' : 'dark') : settings.colorScheme;
  return useMemo(() => makeTheme(scheme, settings.boardTheme, settings.aura), [scheme, settings.boardTheme, settings.aura]);
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
