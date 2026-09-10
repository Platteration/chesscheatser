import { describe, expect, it } from 'vitest';
import { boardFromString, parseSquare } from '../../engine/board';
import { Position } from '../../engine/position';
import type { LegalMove } from '../../engine/types';
import { pickerChoices } from '../picker';

const legal = (m: Partial<LegalMove>): LegalMove => ({ from: 0, to: 0, piece: 'p', checkedAfter: [], ...m });

describe('pickerChoices', () => {
  it('offers nothing when nothing is pending', () => {
    expect(pickerChoices([], null)).toEqual([]);
  });

  it('offers every promotion that exists for the square, queen first', () => {
    const from = parseSquare('b7');
    const to = parseSquare('b8');
    const moves = (['n', 'b', 'r', 'q'] as const).map((promotion) => legal({ from, to, promotion }));
    expect(pickerChoices(moves, { from, to, kind: 'promote' })).toEqual(['q', 'r', 'b', 'n']);
  });

  it('offers only the pieces a resurrect power can bring back', () => {
    const to = parseSquare('d1');
    const moves = [legal({ from: -1, to, piece: 'r' }), legal({ from: -1, to, piece: 'q' }), legal({ from: -1, to: to + 1, piece: 'n' })];
    expect(pickerChoices(moves, { from: -1, to, kind: 'resurrect' })).toEqual(['q', 'r']);
  });

  it('offers only the queen for a promotion that exists solely as a power move', () => {
    // Slide (level 2) lets a pawn step diagonally onto an empty square. On b7
    // that reaches a8/c8, where no ordinary move goes, and powerMoves stamps
    // 'q' and nothing else: a hardcoded q/r/b/n picker made three of the four
    // buttons match no move at all, so the tap was silently swallowed.
    const pos = new Position(boardFromString('k6k/1P6/8/8/8/8/8/K6K'), 'w');
    pos.setPower('w', 2);
    const moves = pos.legalMoves();
    const from = parseSquare('b7');
    const diagonal = parseSquare('c8');
    const straight = parseSquare('b8');

    expect(moves.some((m) => m.from === from && m.to === diagonal && m.power)).toBe(true);
    const offered = pickerChoices(moves, { from, to: diagonal, kind: 'promote' });
    expect(offered).toEqual(['q']);
    // Every offered piece must name a move that can actually be played.
    for (const t of offered) {
      expect(moves.some((m) => m.from === from && m.to === diagonal && m.promotion === t)).toBe(true);
    }
    // The ordinary promotion square still offers the full set.
    expect(pickerChoices(moves, { from, to: straight, kind: 'promote' })).toEqual(['q', 'r', 'b', 'n']);
  });
});
