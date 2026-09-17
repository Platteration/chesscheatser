import { describe, expect, test } from 'vitest';
import { pieceHalo } from '../pieceHalo';

describe('pieceHalo', () => {
  test.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])('classic=%s white=%s keeps a positive radius, or Android draws no shadow at all', (classic, white) => {
    expect(pieceHalo(classic, white).textShadowRadius).toBeGreaterThan(0);
  });

  test('solid pieces keep the tabletop style: a short downward offset', () => {
    for (const white of [false, true]) {
      expect(pieceHalo(false, white).textShadowOffset).toEqual({ width: 0, height: 2 });
    }
  });

  test('a dark piece gets a light halo and a light piece a dark one', () => {
    expect(pieceHalo(false, false).textShadowColor).toBe('rgba(255,255,255,0.45)');
    expect(pieceHalo(false, true).textShadowColor).toBe('rgba(0,0,0,0.9)');
  });
});
