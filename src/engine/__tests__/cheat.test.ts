import { describe, expect, it } from 'vitest';
import { boardFromString, parseSquare, squareName } from '../board';
import { cheatCandidates, chooseAction, chooseCheat } from '../cheat';
import { hashPosition, Position } from '../position';
import { createRng } from '../random';
import { generateSetup } from '../setup';
import { PASS_MOVE } from '../types';

describe('pass (null move)', () => {
  it('flips the turn and round-trips through unmake', () => {
    const pos = new Position(boardFromString('k6k/8/8/8/8/8/4P3/K6K'), 'w');
    const before = pos.key();
    pos.makeMove(PASS_MOVE);
    expect(pos.turn).toBe('b');
    expect(pos.hash).toBe(hashPosition(pos.board, 'b', -1));
    pos.unmakeMove();
    expect(pos.turn).toBe('w');
    expect(pos.key()).toBe(before);
  });

  it('clears a pending en-passant square', () => {
    const pos = new Position(boardFromString('k6k/8/8/8/8/8/4P3/K6K'), 'w');
    pos.makeMove(pos.legalMoves().find((m) => m.doublePush)!);
    expect(pos.ep).toBeGreaterThanOrEqual(0);
    pos.makeMove(PASS_MOVE);
    expect(pos.ep).toBe(-1);
    pos.unmakeMove();
    expect(pos.ep).toBeGreaterThanOrEqual(0);
  });
});

describe('cheat candidates', () => {
  it('are all illegal, never capture a king, and unmake cleanly', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const pos = new Position(generateSetup({ mode: 'chaos', seed }).board);
      // Play a few random legal plies so the position is more open.
      const rng = createRng(seed);
      for (let i = 0; i < 6; i++) {
        const legal = pos.legalMoves();
        if (!legal.length || pos.result().kind !== 'ongoing') break;
        pos.makeMove(rng.pick(legal));
      }
      const key = pos.key();
      const legal = pos.legalMoves();
      for (const c of cheatCandidates(pos)) {
        expect(c.cheat).toBeDefined();
        const target = pos.board[c.to];
        expect(target?.type === 'k').toBe(false);
        expect(target?.color === pos.turn).toBe(false);
        const isLegal = legal.some((m) => m.from === c.from && m.to === c.to && m.promotion === c.promotion);
        expect(isLegal).toBe(false);
        pos.makeMove(c);
        pos.unmakeMove();
        expect(pos.key()).toBe(key);
      }
    }
  });

  it('includes the classic tricks', () => {
    // White rook a1 blocked by own pawn a2; bishop c1; knight g1; king e1; pawn d4.
    const pos = new Position(boardFromString('k6k/8/8/8/3P4/8/P7/R1B1K1N1'), 'w');
    const cands = cheatCandidates(pos);
    const has = (from: string, to: string, kind: string) =>
      cands.some((c) => c.from === parseSquare(from) && c.to === parseSquare(to) && c.cheat === kind);
    expect(has('a1', 'a3', 'jump')).toBe(true); // rook hops over its own pawn
    expect(has('c1', 'c2', 'geometry')).toBe(true); // bishop steps sideways
    expect(has('g1', 'g2', 'geometry')).toBe(true); // knight steps one square
    expect(has('e1', 'e3', 'geometry')).toBe(true); // king steps two
    expect(has('d4', 'e4', 'pawn')).toBe(true); // pawn slides sideways
    expect(has('d4', 'd3', 'pawn')).toBe(true); // pawn retreats
    expect(has('d4', 'd6', 'pawn')).toBe(true); // double push from the middle
    expect(cands.some((c) => c.cheat === 'upgrade' && c.piece === 'n' && c.promotion === 'q')).toBe(true);
  });

  it('restores a non-pawn piece after an upgrade cheat is unmade', () => {
    const pos = new Position(boardFromString('k6k/8/8/8/8/8/8/K5NK'), 'w');
    const up = cheatCandidates(pos).find((c) => c.cheat === 'upgrade' && c.piece === 'n')!;
    pos.makeMove(up);
    expect(pos.board[up.to]?.type).toBe('q');
    pos.unmakeMove();
    expect(pos.board[up.from]?.type).toBe('n');
    expect(pos.board[up.to]).toBeNull();
  });
});

describe('chooseCheat / chooseAction', () => {
  it('never picks a cheat that ends the game or leaves its own kings all in check', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const pos = new Position(generateSetup({ mode: 'chaos', seed }).board);
      const choice = chooseCheat(pos, createRng(seed));
      if (!choice) continue;
      const me = pos.turn;
      pos.makeMove(choice.move);
      expect(pos.allKingsInCheck(me)).toBe(false);
      expect(pos.result().kind).toBe('ongoing');
      pos.unmakeMove();
    }
  });

  it('cheats to grab a hanging queen it could not legally reach', () => {
    // White rook a1, own pawn a2 in the way, black queen a5 sitting on the file.
    const pos = new Position(boardFromString('k6k/8/8/q7/8/8/P7/R3K2K'), 'w');
    const choice = chooseCheat(pos, createRng(1))!;
    expect(choice).not.toBeNull();
    expect(squareName(choice.move.from)).toBe('a1');
    expect(squareName(choice.move.to)).toBe('a5');
    expect(choice.move.cheat).toBe('jump');
  });

  it('never cheats when cheating is off and sometimes cheats when it is on', () => {
    const pos = new Position(boardFromString('k6k/8/8/q7/8/8/P7/R3K2K'), 'w');
    for (let seed = 1; seed <= 20; seed++) {
      expect(chooseAction(pos, 'easy', 'off', seed)!.cheated).toBe(false);
    }
    let cheats = 0;
    for (let seed = 1; seed <= 40; seed++) if (chooseAction(pos, 'easy', 'high', seed)!.cheated) cheats++;
    expect(cheats).toBeGreaterThan(5);
    expect(cheats).toBeLessThan(40);
    // The real position is left untouched.
    expect(pos.turn).toBe('w');
    expect(pos.moveCount).toBe(0);
  });
});

describe('resurrect and hop cheats', () => {
  it('spawns a captured piece on an empty home square and unmakes cleanly', () => {
    const pos = new Position(boardFromString('k6k/8/8/8/8/8/8/K6K'), 'w');
    const key = pos.key();
    const cands = cheatCandidates(pos, ['q', 'p', 'k']);
    const spawns = cands.filter((c) => c.cheat === 'resurrect');
    expect(spawns.length).toBeGreaterThan(0);
    expect(spawns.every((c) => c.from === -1 && c.piece !== 'k')).toBe(true);
    // Pawns only on rank 2, queens on ranks 1-2, never on occupied squares.
    expect(spawns.filter((c) => c.piece === 'p').every((c) => c.to >= 8 && c.to < 16)).toBe(true);
    expect(spawns.some((c) => c.to === parseSquare('a1'))).toBe(false);
    const q = spawns.find((c) => c.piece === 'q' && c.to === parseSquare('d1'))!;
    pos.makeMove(q);
    expect(pos.board[q.to]).toEqual({ type: 'q', color: 'w' });
    expect(pos.turn).toBe('b');
    pos.unmakeMove();
    expect(pos.key()).toBe(key);
    expect(cheatCandidates(pos).some((c) => c.cheat === 'resurrect')).toBe(false);
  });

  it('lets a king hop over a neighbouring piece', () => {
    const pos = new Position(boardFromString('k6k/8/8/8/8/8/4P3/4K2K'), 'w');
    const hop = cheatCandidates(pos).find((c) => c.piece === 'k' && c.from === parseSquare('e1') && c.to === parseSquare('e3'));
    expect(hop?.cheat).toBe('jump');
  });
});
