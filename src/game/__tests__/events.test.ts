import { describe, expect, it } from 'vitest';
import { boardFromString, parseSquare } from '../../engine/board';
import type { Setup } from '../../engine/setup';
import type { Move } from '../../engine/types';
import { fold, undoEvents, type GameEvent } from '../events';

const setup: Setup = {
  board: boardFromString('k6k/pppppppp/8/8/8/8/PPPPPPPP/K6K'),
  seed: 1,
  mode: 'mirror',
  whiteValue: 800,
  blackValue: 800,
};
const mv = (from: string, to: string, piece: Move['piece'] = 'p', extra: Partial<Move> = {}): GameEvent => ({
  type: 'move',
  move: { from: parseSquare(from), to: parseSquare(to), piece, ...extra },
});

describe('fold', () => {
  it('opens the accusation window only right after a computer move', () => {
    const ai = 'b';
    const e1 = [mv('e2', 'e4')];
    expect(fold(setup, e1, ai).canAccuse).toBe(false);
    const e2 = [...e1, mv('e7', 'e5')];
    const f = fold(setup, e2, ai);
    expect(f.canAccuse).toBe(true);
    expect(f.pos.turn).toBe('w');
    expect(fold(setup, e2, null).canAccuse).toBe(false);
  });

  it('a caught cheat is undone, the computer skips, and the human gets a bonus move', () => {
    const ai = 'b';
    const cheat = mv('e7', 'e4', 'p', { cheat: 'pawn' }); // pawn teleports three squares
    const events: GameEvent[] = [mv('e2', 'e3'), cheat, { type: 'accuse', caught: true }];
    const f = fold(setup, events, ai);
    expect(f.pos.board[parseSquare('e7')]?.type).toBe('p');
    expect(f.pos.board[parseSquare('e4')]).toBeNull();
    expect(f.pos.turn).toBe('w');
    expect(f.bonus).toBe('w');
    expect(f.cheats).toEqual({ made: 1, caught: 1, falseAccusations: 0 });
    expect(f.caughtMove).toEqual(cheat.type === 'move' ? cheat.move : null);
    expect(f.moveList.map((m) => !!m.pass)).toEqual([false, true]);
    expect(f.boards).toHaveLength(3);
    expect(f.boards[2]).toEqual(f.pos.board);
    expect(f.boards[1][parseSquare('e3')]?.type).toBe('p');
    expect(f.canAccuse).toBe(false);
    // Human moves, then a pass gives them the board again.
    const more: GameEvent[] = [...events, mv('d2', 'd4'), { type: 'pass' }];
    const g = fold(setup, more, ai);
    expect(g.pos.turn).toBe('w');
    expect(g.bonus).toBeNull();
  });

  it('a false accusation hands the computer the bonus', () => {
    const ai = 'b';
    const events: GameEvent[] = [mv('e2', 'e3'), mv('e7', 'e6'), { type: 'accuse', caught: false }];
    const f = fold(setup, events, ai);
    expect(f.pos.turn).toBe('w');
    expect(f.bonus).toBe('b');
    expect(f.cheats.falseAccusations).toBe(1);
    expect(f.pos.board[parseSquare('e6')]?.type).toBe('p');
  });
});

describe('undoEvents', () => {
  const ai = 'b';
  it('takes back a human/computer pair', () => {
    const events: GameEvent[] = [mv('e2', 'e3'), mv('e7', 'e6'), mv('d2', 'd3'), mv('d7', 'd6')];
    const after = undoEvents(setup, events, ai);
    expect(after).toHaveLength(2);
    expect(fold(setup, after, ai).pos.turn).toBe('w');
  });

  it('rolls back through an accusation rather than reopening it', () => {
    const events: GameEvent[] = [mv('e2', 'e3'), mv('e7', 'e4', 'p', { cheat: 'pawn' }), { type: 'accuse', caught: true }];
    const after = undoEvents(setup, events, ai);
    expect(after).toHaveLength(0);
  });

  it('rolls back a bonus-move exchange as a unit', () => {
    const events: GameEvent[] = [
      mv('e2', 'e3'),
      mv('e7', 'e4', 'p', { cheat: 'pawn' }),
      { type: 'accuse', caught: true },
      mv('d2', 'd3'),
      { type: 'pass' },
      mv('c2', 'c3'),
      mv('a7', 'a6'),
    ];
    const after = undoEvents(setup, events, ai);
    // Back to the second bonus move (human to move, after the pass).
    expect(after).toHaveLength(5);
    expect(fold(setup, after, ai).pos.turn).toBe('w');
  });

  it('pass-and-play undoes a single ply', () => {
    const events: GameEvent[] = [mv('e2', 'e3'), mv('e7', 'e6')];
    expect(undoEvents(setup, events, null)).toHaveLength(1);
  });
});
