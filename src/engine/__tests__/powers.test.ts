import { describe, expect, it } from 'vitest';
import { chooseMove } from '../ai';
import { boardFromString, parseSquare, squareName } from '../board';
import { cheatCandidates } from '../cheat';
import { hashPosition, Position } from '../position';
import { powerLevelFor, powerMoves, POWER_THRESHOLDS } from '../powers';
import { createRng } from '../random';
import { generateSetup } from '../setup';

const has = (moves: { from: number; to: number; cheat?: string; promotion?: string }[], from: string, to: string, kind?: string) =>
  moves.some((m) => m.from === parseSquare(from) && m.to === parseSquare(to) && (!kind || m.cheat === kind));

describe('power levels', () => {
  it('map deficits to levels at the documented thresholds', () => {
    expect(powerLevelFor(0)).toBe(0);
    expect(powerLevelFor(149)).toBe(0);
    expect(powerLevelFor(POWER_THRESHOLDS[1])).toBe(1);
    expect(powerLevelFor(600)).toBe(2);
    expect(powerLevelFor(900)).toBe(3);
    expect(powerLevelFor(5000)).toBe(4);
  });
});

describe('power moves', () => {
  // White: king e1, pawn d4, knight g1, bishop c1, rook a1 (blocked by pawn a2), queen h3. Black kings a8 h8, black pawn d5.
  const pos = () => new Position(boardFromString('k6k/8/8/3p4/3P4/7Q/P7/R1B1K1N1'), 'w');

  it('level 1: pawn sidesteps, king two-step, knight one-step', () => {
    const m = powerMoves(pos(), 1);
    expect(has(m, 'd4', 'e4', 'pawn')).toBe(true);
    expect(has(m, 'd4', 'd3', 'pawn')).toBe(true);
    expect(has(m, 'e1', 'e3', 'geometry')).toBe(true);
    expect(has(m, 'g1', 'g2', 'geometry')).toBe(true);
    expect(has(m, 'c1', 'c2')).toBe(false); // bishops only gain rook moves at level 2
    expect(has(m, 'a1', 'a3')).toBe(false); // jumping is level 3
  });

  it('level 2: bishops and rooks step one square any way, pawn tricks', () => {
    const m = powerMoves(pos(), 2);
    expect(has(m, 'c1', 'c2', 'geometry')).toBe(true);
    expect(has(m, 'c1', 'c8')).toBe(false); // full queen mobility is Ascend
    expect(has(m, 'a1', 'b2', 'geometry')).toBe(true);
    expect(has(m, 'd4', 'd5', 'pawn')).toBe(true); // straight capture
    expect(has(m, 'd4', 'c5', 'pawn')).toBe(true); // diagonal without capture
    expect(has(m, 'a1', 'a3')).toBe(false);
  });

  it('level 3: sliders jump one piece, king hops, queen knight-jumps', () => {
    const m = powerMoves(pos(), 3);
    expect(has(m, 'a1', 'a3', 'jump')).toBe(true);
    expect(has(m, 'h3', 'g1')).toBe(false); // own knight
    expect(has(m, 'h3', 'f2', 'geometry')).toBe(true);
    expect(has(m, 'h3', 'g5', 'geometry')).toBe(true);
  });

  it('level 4: knights move like queens and captured pieces return', () => {
    const m = powerMoves(pos(), 4, ['q', 'p']);
    expect(m.some((x) => x.cheat === 'upgrade')).toBe(false);
    expect(has(m, 'g1', 'g8', 'geometry')).toBe(true); // knight slides up the file like a queen
    expect(has(m, 'c1', 'c8', 'geometry')).toBe(true); // bishop as queen
    expect(m.some((x) => x.cheat === 'resurrect' && x.piece === 'q' && x.from === -1)).toBe(true);
    expect(m.filter((x) => x.cheat === 'resurrect' && x.piece === 'p').every((x) => x.to >= 8 && x.to < 16)).toBe(true);
  });

  it('never duplicates ordinary moves, never captures kings, and unmakes cleanly', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const p = new Position(generateSetup({ mode: 'chaos', seed }).board);
      const rng = createRng(seed);
      for (let i = 0; i < 5; i++) {
        const legal = p.legalMoves();
        if (!legal.length || p.result(legal).kind !== 'ongoing') break;
        p.makeMove(rng.pick(legal));
      }
      const ordinary = new Set(p.pseudoLegalMoves().map((m) => `${m.from}-${m.to}-${m.promotion ?? ''}`));
      const key = p.key();
      for (const level of [1, 2, 3, 4]) {
        for (const m of powerMoves(p, level, ['q'])) {
          expect(m.power).toBe(true);
          if (m.from >= 0) expect(ordinary.has(`${m.from}-${m.to}-${m.promotion ?? ''}`)).toBe(false);
          const target = p.board[m.to];
          expect(target?.type === 'k').toBe(false);
          expect(target?.color === p.turn).toBe(false);
          p.makeMove(m);
          p.unmakeMove();
          expect(p.key()).toBe(key);
        }
      }
    }
  });

  it('powered legal moves flow through Position.legalMoves and the search', () => {
    // White rook a1 behind its own pawn a2; black queen a5 hanging on the file. At level 3 the rook may jump to take it.
    const p = new Position(boardFromString('k6k/8/8/q7/8/8/P7/R3K2K'), 'w');
    expect(p.legalMoves().some((m) => m.from === parseSquare('a1') && m.to === parseSquare('a5'))).toBe(false);
    p.setPower('w', 3);
    const jump = p.legalMoves().find((m) => m.from === parseSquare('a1') && m.to === parseSquare('a5'));
    expect(jump?.power).toBe(true);
    const res = chooseMove(p, 'medium', 1)!;
    expect(squareName(res.move.to)).toBe('a5');
    expect(res.move.captured).toBe('q');
  });

  it('a power move can rescue a king from what would otherwise be mate', () => {
    // Black king a8 is mated by the rook on c8: b8 is covered, a7/b7 hold black pawns, and the
    // bishop on h3 cannot capture c8 because the white pawn on e6 blocks the diagonal.
    const p = new Position(boardFromString('k1R5/pp6/4P3/7k/8/7b/8/6K1'), 'b');
    expect(p.result().kind).toBe('checkmate');
    // Level 1: the king may step two squares along the rank and take the rook itself.
    p.setPower('b', 1);
    expect(p.result().kind).toBe('ongoing');
    const kingTake = p.legalMoves().find((m) => m.from === parseSquare('a8') && m.to === parseSquare('c8'));
    expect(kingTake?.power).toBe(true);
    expect(kingTake?.captured).toBe('r');
    // Level 3: the bishop may jump the pawn and capture the rook too.
    p.setPower('b', 3);
    const jump = p.legalMoves().find((m) => m.from === parseSquare('h3') && m.to === parseSquare('c8'));
    expect(jump?.cheat).toBe('jump');
  });
});

describe('powers and the rest of the engine', () => {
  it('changes the hash when a power level is granted, so the transposition table keeps them apart', () => {
    const p = new Position(boardFromString('k6k/8/8/8/8/8/8/K6K'), 'w');
    const h0 = p.hash;
    p.setPower('w', 2);
    expect(p.hash).not.toBe(h0);
    expect(p.hash).toBe(hashPosition(p.board, p.turn, p.ep, { w: 2, b: 0 }));
    p.setPower('w', 0);
    expect(p.hash).toBe(h0);
    const clone = p.clone();
    p.setPower('b', 4);
    expect(clone.powers.b).toBe(0);
    expect(p.clone().hash).toBe(p.hash);
  });

  it('never offers a sneaky cheat that is already legal under the powers in force', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const p = new Position(generateSetup({ mode: 'chaos', seed }).board);
      for (const level of [1, 2, 3, 4]) {
        p.setPower(p.turn, level);
        const legal = new Set(p.legalMoves().map((m) => `${m.from}:${m.to}:${m.promotion ?? ''}`));
        for (const c of cheatCandidates(p, ['q', 'r'])) {
          expect(legal.has(`${c.from}:${c.to}:${c.promotion ?? ''}`)).toBe(false);
        }
      }
    }
  });
});
