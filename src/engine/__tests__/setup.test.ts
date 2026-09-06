import { describe, expect, it } from 'vitest';
import { kingSquares, rankOf } from '../board';
import { Position } from '../position';
import { armyValue, generateSetup, setupIsPlayable, setupIsQuiet, type MaterialMode } from '../setup';
import type { PieceType } from '../types';

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
    for (let seed = 1; seed <= 150; seed++) {
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
