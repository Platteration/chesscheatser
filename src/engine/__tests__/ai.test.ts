import { describe, expect, it } from 'vitest';
import { chooseMove, evaluate } from '../ai';
import { boardFromString, parseSquare, squareName } from '../board';
import { Position } from '../position';
import { generateSetup } from '../setup';

describe('ai', () => {
  it('finds a move that checks both enemy kings (instant win)', () => {
    // Black kings a8 and c8; white rook on b1 can play Rb8 to check both at once. White king e1.
    const pos = new Position(boardFromString('k1k5/8/8/8/8/8/8/1R2K3'), 'w');
    const res = chooseMove(pos, 'hard', 1)!;
    expect(squareName(res.move.from)).toBe('b1');
    expect(squareName(res.move.to)).toBe('b8');
    pos.makeMove(res.move);
    expect(pos.result().kind).toBe('both-in-check');
  });

  it('finds a back-rank checkmate against one king', () => {
    // Black king a8 (other king far away on h4 with room), white queen d7 -> Qa7?? no, Qb7 needs support.
    // White rook e1, black pawns a7 b7 shield king a8... use classic: black king g8, pawns f7 g7 h7,
    // white rook e1: Re8#. Black's second king sits on a1 corner with white king c2 covering b1/b2.
    const pos = new Position(boardFromString('6k1/5ppp/8/8/8/8/2K5/k3R3'), 'w');
    const res = chooseMove(pos, 'medium', 1)!;
    pos.makeMove(res.move);
    expect(pos.result().kind).toBe('checkmate');
  });

  it('always returns a legal move on random setups at every difficulty', () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      const setup = generateSetup({ mode: 'chaos', seed: 42 });
      const pos = new Position(setup.board);
      const res = chooseMove(pos, difficulty, 7)!;
      expect(res).not.toBeNull();
      const legal = pos.legalMoves();
      expect(legal.some((m) => m.from === res.move.from && m.to === res.move.to)).toBe(true);
    }
  });

  it('evaluation is symmetric', () => {
    const pos = new Position(boardFromString('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'));
    const w = evaluate(pos);
    pos.turn = 'b';
    expect(evaluate(pos)).toBe(-w);
  });

  it('prefers capturing a free queen', () => {
    const pos = new Position(boardFromString('k6k/8/8/3q4/8/8/8/K2R3K'), 'w');
    const res = chooseMove(pos, 'medium', 3)!;
    expect(squareName(res.move.to)).toBe('d5');
    expect(res.move.captured).toBe('q');
    expect(parseSquare('d5')).toBe(res.move.to);
  });
});
