import { describe, expect, it } from 'vitest';
import { boardFromString, parseSquare } from '../../engine/board';
import { Position } from '../../engine/position';
import { generateSetup, type Setup } from '../../engine/setup';
import type { Move } from '../../engine/types';
import { blend, measureDeficit } from '../comeback';
import { fold, lostPieces, undoEvents, type GameEvent } from '../events';

describe('deficit measurement', () => {
  it('blends material and engine deficits and never goes negative', () => {
    expect(blend(200, 400)).toBe(300);
    expect(blend(-300, -100)).toBe(0);
  });

  it('grants power to the side that is behind, not the side ahead', () => {
    // White: kings + queen + rook. Black: kings + pawn.
    const pos = new Position(boardFromString('k6k/p7/8/8/8/8/8/K2QR2K'), 'b');
    const black = measureDeficit(pos, 'b', 200);
    expect(black.material).toBe(1300);
    expect(black.level).toBe(1); // ramps one level per turn
    expect(measureDeficit(pos, 'b', 200, 3).level).toBe(4);
    pos.turn = 'w';
    const white = measureDeficit(pos, 'w', 200);
    expect(white.total).toBe(0);
    expect(white.level).toBe(0);
  });
});

describe('power events in the fold', () => {
  const setup: Setup = { board: boardFromString('k6k/pppppppp/8/8/8/8/PPPPPPPP/K6K'), seed: 1, mode: 'mirror', whiteValue: 800, blackValue: 800 };
  const mv = (from: string, to: string, piece: Move['piece'] = 'p', extra: Partial<Move> = {}): GameEvent => ({
    type: 'move',
    move: { from: parseSquare(from), to: parseSquare(to), piece, ...extra },
  });

  it('sets the position power level and makes power moves legal for that side only', () => {
    const events: GameEvent[] = [{ type: 'power', color: 'w', level: 1, material: 200, engine: 200 }];
    const f = fold(setup, events, 'b');
    expect(f.pos.powers.w).toBe(1);
    expect(f.powers.w.level).toBe(1);
    // A pawn stepping backwards is a Nudge power move (the rank behind is empty in this setup).
    const back = f.pos.legalMoves().find((m) => m.from === parseSquare('e2') && m.to === parseSquare('e1'));
    expect(back?.power).toBe(true);
    // A recorded power move is replayed and not counted as a cheat.
    const more: GameEvent[] = [...events, mv('e2', 'e1', 'p', { cheat: 'pawn', power: true })];
    const g = fold(setup, more, 'b');
    expect(g.pos.board[parseSquare('e1')]?.type).toBe('p');
    expect(g.cheats.made).toBe(0);
    expect(g.cheats.humanMade).toBe(0);
    expect(g.pos.legalMoves().every((m) => !m.power)).toBe(true); // black has no power yet
  });

  it('undo steps back through power events to the start of the human turn', () => {
    const events: GameEvent[] = [
      { type: 'power', color: 'w', level: 0, material: 0, engine: 0 },
      mv('e2', 'e3'),
      { type: 'power', color: 'b', level: 0, material: 0, engine: 0 },
      mv('e7', 'e6'),
      { type: 'power', color: 'w', level: 0, material: 0, engine: 0 },
    ];
    const after = undoEvents(setup, events, 'b');
    expect(after).toHaveLength(1);
    expect(after[0].type).toBe('power');
    expect(fold(setup, after, 'b').pos.turn).toBe('w');
  });

  it('pass-and-play undo takes back one ply and drops the pending grant', () => {
    const events: GameEvent[] = [
      { type: 'power', color: 'w', level: 0, material: 0, engine: 0 },
      mv('e2', 'e3'),
      { type: 'power', color: 'b', level: 0, material: 0, engine: 0 },
      mv('e7', 'e6'),
      { type: 'power', color: 'w', level: 0, material: 0, engine: 0 },
    ];
    const once = undoEvents(setup, events, null);
    expect(once).toHaveLength(2);
    expect(fold(setup, once, null).pos.turn).toBe('b');
    const twice = undoEvents(setup, once, null);
    expect(twice).toHaveLength(0);
  });

  it('tracks lost pieces for resurrection', () => {
    const start = generateSetup({ mode: 'chaos', seed: 3 }).board;
    const now = start.slice();
    const idx = now.findIndex((p) => p?.color === 'b' && p.type !== 'k');
    const type = now[idx]!.type;
    now[idx] = null;
    expect(lostPieces(start, now, 'b')).toEqual([type]);
    expect(lostPieces(start, now, 'w')).toEqual([]);
  });
});

describe('maxDeficit feeds the biggest-comeback stat', () => {
  const setup: Setup = {
    board: boardFromString('k6k/pppppppp/8/8/8/8/PPPPPPPP/K6K'),
    seed: 1,
    mode: 'mirror',
    whiteValue: 800,
    blackValue: 800,
  };

  it('records the largest blended deficit each side ever sat at', () => {
    const events: GameEvent[] = [
      { type: 'power', color: 'w', level: 1, material: 400, engine: 200 },
      { type: 'power', color: 'w', level: 2, material: 900, engine: 700 },
      // A later, smaller deficit must not lower the recorded maximum.
      { type: 'power', color: 'w', level: 2, material: 100, engine: 0 },
      { type: 'power', color: 'b', level: 1, material: 300, engine: 300 },
    ];
    const f = fold(setup, events, 'b');
    expect(f.maxDeficit.w).toBe(blend(900, 700));
    expect(f.maxDeficit.b).toBe(300);
  });

  it('uses the shared blend so the meter and the stat cannot drift apart', () => {
    const events: GameEvent[] = [{ type: 'power', color: 'w', level: 1, material: 333, engine: 777 }];
    expect(fold(setup, events, 'b').maxDeficit.w).toBe(blend(333, 777));
  });
});

describe('drafting through the event log', () => {
  const setup: Setup = {
    board: boardFromString('k6k/pppppppp/8/8/8/8/PPPPPPPP/K6K'),
    seed: 1,
    mode: 'mirror',
    whiteValue: 800,
    blackValue: 800,
  };

  it('grants only the drafted power, not a whole level', () => {
    const events: GameEvent[] = [
      { type: 'draft', color: 'w', offered: ['pawn.nudge', 'king.step2', 'knight.step'], taken: 'king.step2', level: 1, material: 400, engine: 400 },
    ];
    const f = fold(setup, events, 'b');
    expect(f.powers.w.tags).toEqual(['king.step2']);
    expect(f.pos.powerTags.w.has('pawn.nudge')).toBe(false);
    // A king two-step is legal; a pawn sidestep is not, because it was not taken.
    const legal = f.pos.legalMoves();
    expect(legal.some((m) => m.piece === 'k' && m.power)).toBe(true);
    expect(legal.some((m) => m.piece === 'p' && m.power)).toBe(false);
  });

  it('accumulates picks across level-ups and leaves the opponent alone', () => {
    const events: GameEvent[] = [
      { type: 'draft', color: 'w', offered: ['pawn.nudge'], taken: 'pawn.nudge', level: 1, material: 300, engine: 300 },
      { type: 'move', move: { from: parseSquare('e2'), to: parseSquare('e3'), piece: 'p' } },
      { type: 'draft', color: 'b', offered: [], taken: null, level: 0, material: 0, engine: 0 },
      { type: 'move', move: { from: parseSquare('e7'), to: parseSquare('e6'), piece: 'p' } },
      { type: 'draft', color: 'w', offered: ['king.step2'], taken: 'king.step2', level: 2, material: 600, engine: 600 },
    ];
    const f = fold(setup, events, 'b');
    expect(f.powers.w.tags.sort()).toEqual(['king.step2', 'pawn.nudge']);
    expect(f.powers.w.level).toBe(2);
    expect(f.powers.b.tags).toEqual([]);
    expect(f.pos.powerTags.b.size).toBe(0);
  });

  it('records a measurement without a pick when nothing was earned', () => {
    const events: GameEvent[] = [{ type: 'draft', color: 'w', offered: [], taken: null, level: 0, material: 120, engine: 80 }];
    const f = fold(setup, events, 'b');
    expect(f.powers.w.tags).toEqual([]);
    expect(f.maxDeficit.w).toBe(blend(120, 80));
    expect(f.lastEvent?.type).toBe('draft');
    expect(f.lastAction).toBeNull(); // a grant is not an action
  });

  it('replays a legacy power event as that level cumulative set', () => {
    const legacy: GameEvent[] = [{ type: 'power', color: 'w', level: 2, material: 600, engine: 600 }];
    const f = fold(setup, legacy, 'b');
    expect(f.powers.w.tags).toContain('pawn.nudge');
    expect(f.powers.w.tags).toContain('bishop.step');
    expect(f.powers.w.tags).not.toContain('slider.jump');
    expect(f.powers.w.level).toBe(2);
  });

  it('undo strips a trailing draft along with the ply it preceded', () => {
    const events: GameEvent[] = [
      { type: 'draft', color: 'w', offered: [], taken: null, level: 0, material: 0, engine: 0 },
      { type: 'move', move: { from: parseSquare('e2'), to: parseSquare('e3'), piece: 'p' } },
      { type: 'draft', color: 'b', offered: [], taken: null, level: 0, material: 0, engine: 0 },
      { type: 'move', move: { from: parseSquare('e7'), to: parseSquare('e6'), piece: 'p' } },
      { type: 'draft', color: 'w', offered: [], taken: null, level: 0, material: 0, engine: 0 },
    ];
    // Versus the computer, a take-back rolls the pair back to the human's turn.
    const vsAi = undoEvents(setup, events, 'b');
    expect(fold(setup, vsAi, 'b').pos.turn).toBe('w');
    expect(vsAi.some((e) => e.type === 'move')).toBe(false);
    // Pass-and-play takes back a single ply, dropping the pending grant.
    const local = undoEvents(setup, events, null);
    expect(local).toHaveLength(2);
    expect(fold(setup, local, null).pos.turn).toBe('b');
  });
});
