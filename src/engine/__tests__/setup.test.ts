import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { kingSquares, rankOf } from '../board';
import { Position } from '../position';
import { armyValue, generateSetup, setupIsPlayable, setupIsQuiet, type MaterialMode } from '../setup';
import type { PieceType } from '../types';

/** What vitest falls back to when nothing sets `testTimeout`, and what this suite outgrew. */
const VITEST_DEFAULT_TIMEOUT = 5000;

const FIRST_MOVE_SEEDS = 150;

/** One seed's worth of the first-move check, so the timeout guard can time the same work. */
function noFirstMoveWin(seed: number) {
  const setup = generateSetup({ mode: 'chaos', seed, minPieces: 12, maxPieces: 16 });
  expect(setupIsPlayable(setup.board)).toBe(true);
  for (const color of ['w', 'b'] as const) {
    const pos = new Position(setup.board, color);
    for (const m of pos.legalMoves()) {
      pos.makeMove(m);
      expect(pos.result().kind).not.toBe('both-in-check');
      pos.unmakeMove();
    }
  }
}

function armyOf(board: ReturnType<typeof generateSetup>['board'], color: 'w' | 'b'): PieceType[] {
  return board.filter((p): p is NonNullable<typeof p> => !!p && p.color === color && p.type !== 'k').map((p) => p.type);
}

describe('random setup', () => {
  it('gives every side exactly two kings on the back rank and a quiet start', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const setup = generateSetup({ mode: 'chaos', seed });
      for (const color of ['w', 'b'] as const) {
        const kings = kingSquares(setup.board, color);
        expect(kings).toHaveLength(2);
        for (const k of kings) expect(rankOf(k)).toBe(color === 'w' ? 0 : 7);
      }
      expect(setupIsQuiet(setup.board)).toBe(true);
      // No pawns on a back rank.
      for (let s = 0; s < 64; s++) {
        const p = setup.board[s];
        if (p?.type === 'p') expect([1, 6]).toContain(rankOf(s));
      }
      // All pieces on the two home ranks.
      for (let s = 16; s < 48; s++) expect(setup.board[s]).toBeNull();
    }
  });

  it('never lets either side win with its very first move', () => {
    for (let seed = 1; seed <= FIRST_MOVE_SEEDS; seed++) noFirstMoveWin(seed);
  });

  it('is given a timeout with room for the slowest check in the suite', () => {
    // The check above is the one test here that costs seconds, and on vitest's
    // 5 s default it timed out about one run in five — at the parent commit
    // too, so nobody's change was ever the cause. The bound is taken from
    // timing the same work rather than from the number in the config.
    const config = readFileSync(new URL('../../../vitest.config.ts', import.meta.url), 'utf8');
    const timeout = Number(/testTimeout:\s*([\d_]+)/.exec(config)?.[1].replace(/_/g, ''));
    expect(timeout).toBeGreaterThanOrEqual(4 * VITEST_DEFAULT_TIMEOUT);
    const sample = 15;
    const started = Date.now();
    for (let seed = 1; seed <= sample; seed++) noFirstMoveWin(seed);
    const whole = ((Date.now() - started) / sample) * FIRST_MOVE_SEEDS;
    expect(whole * 1.5).toBeLessThan(timeout);
  });

  it('respects the piece-count range', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const setup = generateSetup({ mode: 'chaos', seed, minPieces: 5, maxPieces: 9 });
      for (const color of ['w', 'b'] as const) {
        const n = setup.board.filter((p) => p?.color === color).length;
        expect(n).toBeGreaterThanOrEqual(5);
        expect(n).toBeLessThanOrEqual(9);
      }
    }
  });

  it('is deterministic for a given seed', () => {
    const a = generateSetup({ mode: 'fair', seed: 12345 });
    const b = generateSetup({ mode: 'fair', seed: 12345 });
    expect(a.board).toEqual(b.board);
  });

  it('keeps fair armies within a pawn of each other', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const setup = generateSetup({ mode: 'fair', seed });
      expect(Math.abs(setup.whiteValue - setup.blackValue)).toBeLessThanOrEqual(100);
      expect(setup.whiteValue).toBe(armyValue(armyOf(setup.board, 'w')));
    }
  });

  it('handicap mode scales the computer army by the requested ratio', () => {
    for (const ratio of [0.6, 1, 1.5, 2.2, 3]) {
      let sum = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const setup = generateSetup({ mode: 'handicap', seed, handicap: ratio });
        sum += setup.blackValue / setup.whiteValue;
      }
      const avg = sum / 30;
      expect(Math.abs(avg - ratio)).toBeLessThan(0.12);
    }
  });

  it('mirror mode gives both sides the same multiset of pieces', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const setup = generateSetup({ mode: 'mirror' as MaterialMode, seed });
      expect(armyOf(setup.board, 'w').sort()).toEqual(armyOf(setup.board, 'b').sort());
    }
  });

  it('chaos mode actually varies material between sides', () => {
    let different = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const setup = generateSetup({ mode: 'chaos', seed });
      if (setup.whiteValue !== setup.blackValue) different++;
    }
    expect(different).toBeGreaterThan(20);
  });
});
