import { describe, expect, test } from 'vitest';
import { pieceHalo, pieceInk } from '../pieceHalo';

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

  test('Neon classic outlines and silhouettes use light ink', () => {
    for (const white of [false, true]) {
      expect(pieceInk(true, white, true)).toBe('#fff5df');
    }
  });

  test('Neon solid armies have distinct light fills and a dark edge', () => {
    expect(pieceInk(false, true, true)).toBe('#fff5df');
    expect(pieceInk(false, false, true)).toBe('#b6a4dc');
    expect(pieceHalo(false, false, true).textShadowColor).toBe('rgba(0,0,0,0.9)');
    expect(pieceHalo(true, true, true).textShadowRadius).toBeGreaterThan(0);
  });

  test('other boards retain their original piece ink', () => {
    expect(pieceInk(true, true)).toBe('#141414');
    expect(pieceInk(true, false)).toBe('#141414');
    expect(pieceInk(false, true)).toBe('#fff5df');
    expect(pieceInk(false, false)).toBe('#24333e');
  });
});
