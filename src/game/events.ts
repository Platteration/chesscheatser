import { opposite } from '../engine/board';
import { Position } from '../engine/position';
import type { Setup } from '../engine/setup';
import { PASS_MOVE, type Board, type Color, type Move } from '../engine/types';

/**
 * A game is an append-only list of events replayed onto the starting setup.
 * Undo, persistence and the cheating mechanics all fall out of this.
 */
export type GameEvent =
  | { type: 'move'; move: Move }
  | { type: 'pass' }
  /** The human calls out the computer's last move (default), or the computer catches the human's (`by: 'ai'`). */
  | { type: 'accuse'; caught: boolean; by?: 'ai' };

export interface CheatStats {
  /** Computer cheats played / caught by the human. */
  made: number;
  caught: number;
  falseAccusations: number;
  /** Human cheats played / caught by the computer. */
  humanMade: number;
  humanCaught: number;
}

export interface Folded {
  pos: Position;
  /** Side that gets to move again right after its next move. */
  bonus: Color | null;
  /** The last computer move can still be called out. */
  canAccuse: boolean;
  /** Moves as they should appear in the move list (a caught cheat is removed). */
  moveList: Move[];
  /** Board after each entry of `moveList`; index 0 is the starting position. */
  boards: Board[];
  /** Who played the most recent 'move' event. */
  lastBy: Color | null;
  lastEvent: GameEvent | null;
  cheats: CheatStats;
  /** The illegal move most recently undone by a successful accusation. */
  caughtMove: Move | null;
}

export function fold(setup: Setup, events: GameEvent[], aiColor: Color | null): Folded {
  const pos = new Position(setup.board);
  const moveList: Move[] = [];
  const boards: Board[] = [pos.board.slice()];
  const snap = () => boards.push(pos.board.slice());
  const cheats: CheatStats = { made: 0, caught: 0, falseAccusations: 0, humanMade: 0, humanCaught: 0 };
  let bonus: Color | null = null;
  let lastBy: Color | null = null;
  let caughtMove: Move | null = null;

  for (const e of events) {
    switch (e.type) {
      case 'move':
        lastBy = pos.turn;
        pos.makeMove(e.move);
        moveList.push(e.move);
        snap();
        if (e.move.cheat) {
          if (aiColor !== null && lastBy !== aiColor) cheats.humanMade++;
          else cheats.made++;
        }
        break;
      case 'pass':
        pos.makeMove(PASS_MOVE);
        moveList.push(PASS_MOVE);
        snap();
        bonus = null;
        break;
      case 'accuse':
        if (aiColor === null) break;
        if (e.by === 'ai') {
          // The computer caught the human cheating: the move comes off, the human skips, the computer moves twice.
          if (e.caught) {
            pos.unmakeMove();
            caughtMove = moveList.pop() ?? null;
            boards.pop();
            pos.makeMove(PASS_MOVE);
            moveList.push(PASS_MOVE);
            snap();
            cheats.humanCaught++;
            bonus = aiColor;
          }
          break;
        }
        if (e.caught) {
          // The illegal move comes off the board and the cheater forfeits its turn.
          pos.unmakeMove();
          caughtMove = moveList.pop() ?? null;
          boards.pop();
          pos.makeMove(PASS_MOVE);
          moveList.push(PASS_MOVE);
          snap();
          cheats.caught++;
          bonus = opposite(aiColor);
        } else {
          cheats.falseAccusations++;
          bonus = aiColor;
        }
        break;
    }
  }

  const lastEvent = events.length ? events[events.length - 1] : null;
  const canAccuse = aiColor !== null && lastEvent?.type === 'move' && lastBy === aiColor;
  return { pos, bonus, canAccuse, moveList, boards, lastBy, lastEvent, cheats, caughtMove };
}

/** Strips a move down to the fields worth persisting. */
export function stripMove(m: Move): Move {
  if (m.pass) return PASS_MOVE;
  const out: Move = { from: m.from, to: m.to, piece: m.piece };
  if (m.captured) out.captured = m.captured;
  if (m.promotion) out.promotion = m.promotion;
  if (m.enPassant) out.enPassant = true;
  if (m.doublePush) out.doublePush = true;
  if (m.cheat) out.cheat = m.cheat;
  return out;
}

/**
 * Removes events from the end until the human is to move again with at least
 * one of their own moves taken back. Accusations are never "un-accused": once
 * you know whether a move was a cheat, that whole exchange is rolled back.
 */
export function undoEvents(setup: Setup, events: GameEvent[], aiColor: Color | null): GameEvent[] {
  if (events.length === 0) return events;
  if (aiColor === null) {
    return events.slice(0, -1);
  }
  const human = opposite(aiColor);
  let evs = events;
  let poppedHumanMove = false;
  while (evs.length) {
    const before = fold(setup, evs, aiColor);
    const last = evs[evs.length - 1];
    evs = evs.slice(0, -1);
    if (last.type === 'move' && before.lastBy === human) poppedHumanMove = true;
    // Popping an accusation exposes the move it judged; keep going until a
    // further human move is gone so that exchange cannot be replayed.
    if (last.type === 'accuse') poppedHumanMove = false;
    const after = fold(setup, evs, aiColor);
    if (poppedHumanMove && after.pos.turn === human && after.lastEvent?.type !== 'accuse') break;
  }
  return evs;
}
