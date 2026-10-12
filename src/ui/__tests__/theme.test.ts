import { describe, expect, test, vi } from 'vitest';
import { AURAS } from '../../cosmetics';
import { makeTheme } from '../theme';
import { pieceInk } from '../pieceHalo';

vi.mock('react-native', () => ({ StyleSheet: { create: (value: unknown) => value }, useColorScheme: () => 'light' }));
vi.mock('../../settings', () => ({ useSettings: () => ({ settings: {} }) }));

function contrast(foreground: string, background: string): number {
  // One sRGB channel of a #rrggbb colour, linearised; `at` is the index of its two hex digits.
  const channel = (hex: string, at: number) => {
    const v = parseInt(hex.slice(at, at + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (hex: string) => 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
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
    expect(contrast(theme.onDanger, theme.danger)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.accentInk, theme.surface)).toBeGreaterThanOrEqual(4.5);
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
