import { describe, expect, test, vi } from 'vitest';
import { AURAS } from '../../cosmetics';
import { makeTheme, type Theme } from '../theme';
import { pieceInk } from '../pieceHalo';

vi.mock('react-native', () => ({ StyleSheet: { create: (value: unknown) => value }, useColorScheme: () => 'light' }));
vi.mock('../../settings', () => ({ useSettings: () => ({ settings: {} }) }));

function contrast(foreground: string, background: string): number {
  const luminance = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe.each(['light', 'dark'] as const)('%s interface text', (scheme) => {
  test('enabled choices and warning actions meet AA', () => {
    const theme = makeTheme(scheme, 'wood');
    for (const background of [theme.bg, theme.surface, theme.surfaceAlt]) {
      expect(contrast(theme.textMuted, background)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(theme.accentText, theme.accent)).toBeGreaterThanOrEqual(4.5);
    const roleColors = theme as Theme & { onDanger?: string; accentInk?: string };
    expect(contrast(roleColors.onDanger ?? theme.accentText, theme.danger)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(roleColors.accentInk ?? theme.accent, theme.surface)).toBeGreaterThanOrEqual(4.5);
    const neon = makeTheme(scheme, 'neon');
    for (const square of [neon.board.light, neon.board.dark]) {
      for (const classic of [false, true]) {
        for (const white of [false, true]) {
          expect(contrast(pieceInk(classic, white, true), square)).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  test.each(Object.entries(AURAS))('%s aura labels meet AA on the player panel', (id) => {
    const theme = makeTheme(scheme, 'wood', id);
    expect(contrast(theme.power, theme.surface)).toBeGreaterThanOrEqual(4.5);
  });
});
