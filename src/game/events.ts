import { opposite } from '../engine/board';
import { Position } from '../engine/position';
import type { Setup } from '../engine/setup';
import { PASS_MOVE, type Board, type Color, type Move, type PieceType } from '../engine/types';

/**
 * A game is an append-only list of events replayed onto the starting setup.
 * Undo, persistence and the cheating mechanics all fall out of this.
 */
export type GameEvent =
  | { type: 'move'; move: Move }
  | { type: 'pass' }
  /** The human calls out the computer's last move (default), or the computer catches the human's (`by: 'ai'`). */
  | { type: 'accuse'; caught: boolean; by?: 'ai' }
  /** Comeback power granted to `color` for the turn that starts now (recorded so replays are deterministic). */
  | { type: 'power'; color: Color; level: number; material: number; engine: number };

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
  /** Last event that was not a power grant (moves, passes, accusations). */
  lastAction: GameEvent | null;
  cheats: CheatStats;
  /** The illegal move most recently undone by a successful accusation. */
  caughtMove: Move | null;
  /** Latest power grant per colour. */
  powers: Record<Color, { level: number; material: number; engine: number }>;
  /** Largest blended deficit each colour has recorded during this game. */
  maxDeficit: Record<Color, number>;
}

export interface FoldOptions {
  doubleCheckLoses?: boolean;
}

export function fold(setup: Setup, events: GameEvent[], aiColor: Color | null, options: FoldOptions = {}): Folded {
  const pos = new Position(setup.board);
  if (options.doubleCheckLoses === false) pos.doubleCheckLoses = false;
  const moveList: Move[] = [];
  const boards: Board[] = [pos.board.slice()];
  const snap = () => boards.push(pos.board.slice());
  const cheats: CheatStats = { made: 0, caught: 0, falseAccusations: 0, humanMade: 0, humanCaught: 0 };
  let bonus: Color | null = null;
  let lastBy: Color | null = null;
  let caughtMove: Move | null = null;
  const powers: Folded['powers'] = { w: { level: 0, material: 0, engine: 0 }, b: { level: 0, material: 0, engine: 0 } };
  const maxDeficit: Record<Color, number> = { w: 0, b: 0 };

  const syncResurrectable = () => {
    for (const c of ['w', 'b'] as Color[]) pos.resurrectable[c] = lostPieces(setup.board, pos.board, c);
  };
  for (const e of events) {
    switch (e.type) {
      case 'move':
        lastBy = pos.turn;
        pos.makeMove(e.move);
        moveList.push(e.move);
        snap();
        if (e.move.cheat && !e.move.power) {
          if (aiColor !== null && lastBy !== aiColor) cheats.humanMade++;
          else cheats.made++;
        }
        break;
      case 'power':
        pos.setPower(e.color, e.level);
        powers[e.color] = { level: e.level, material: e.material, engine: e.engine };
        maxDeficit[e.color] = Math.max(maxDeficit[e.color], Math.round(0.5 * e.material + 0.5 * e.engine));
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
  syncResurrectable();

  const lastEvent = events.length ? events[events.length - 1] : null;
  let lastAction: GameEvent | null = null;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type !== 'power') {
      lastAction = events[i];
      break;
    }
  }
  const canAccuse = aiColor !== null && lastAction?.type === 'move' && lastBy === aiColor;
  return { pos, bonus, canAccuse, moveList, boards, lastBy, lastEvent, lastAction, cheats, caughtMove, powers, maxDeficit };
}

/** Piece types `color` has fewer of than at the start (candidates for resurrection). */
export function lostPieces(start: Board, now: Board, color: Color): PieceType[] {
  const count = (b: Board) => {
    const out: Record<string, number> = {};
    for (const p of b) if (p && p.color === color && p.type !== 'k') out[p.type] = (out[p.type] ?? 0) + 1;
    return out;
  };
  const before = count(start);
  const after = count(now);
  const lost: PieceType[] = [];
  for (const t of ['q', 'r', 'b', 'n', 'p'] as PieceType[]) {
    for (let i = 0; i < (before[t] ?? 0) - (after[t] ?? 0); i++) lost.push(t);
  }
  return lost;
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
  if (m.power) out.power = true;
  return out;
}

/**
 * The longest prefix of `events` that replays onto `setup` without throwing —
 * what a saved game is resumed from, since a record may have been written by an
 * older build, hand-edited, or clipped by the validator's length cap.
 *
 * A binary search is exact here, not an approximation: `fold` is a left fold,
 * so a prefix applies exactly when no event before its end throws, and the
 * prefixes that apply are therefore a prefix of all prefixes. The scan this
 * replaced tried every shorter prefix in turn and so cost the square of the
 * list: 9.3 s for a 8000-event record failing halfway, against 31 ms here.
 */
export function replayablePrefix(setup: Setup, events: GameEvent[] | undefined, aiColor: Color | null): GameEvent[] {
  if (!events || !events.length) return [];
  const applies = (n: number) => {
    try {
      fold(setup, events.slice(0, n), aiColor);
      return true;
    } catch {
      return false;
    }
  };
  if (applies(events.length)) return events;
  let good = 0;
  let bad = events.length;
  while (bad - good > 1) {
    const mid = (good + bad) >> 1;
    if (applies(mid)) good = mid;
    else bad = mid;
  }
  return events.slice(0, good);
}

/**
 * Removes events from the end until the human is to move again with at least
 * one of their own moves taken back. Accusations are never "un-accused": once
 * you know whether a move was a cheat, that whole exchange is rolled back.
 */
export function undoEvents(setup: Setup, events: GameEvent[], aiColor: Color | null, options: FoldOptions = {}): GameEvent[] {
  if (events.length === 0) return events;
  const withoutTrailingPowers = (evs: GameEvent[]) => {
    let n = evs.length;
    while (n > 0 && evs[n - 1].type === 'power') n--;
    return evs.slice(0, n);
  };
  if (aiColor === null) {
    // Drop the pending grant, one real ply, and the grant that preceded it (it is re-measured).
    return withoutTrailingPowers(withoutTrailingPowers(events).slice(0, -1));
  }
  const human = opposite(aiColor);
  let evs = events;
  let poppedHumanMove = false;
  while (evs.length) {
    const before = fold(setup, evs, aiColor, options);
    const last = evs[evs.length - 1];
    evs = evs.slice(0, -1);
    if (last.type === 'move' && before.lastBy === human) poppedHumanMove = true;
    // Popping an accusation exposes the move it judged; keep going until a
    // further human move is gone so that exchange cannot be replayed.
    if (last.type === 'accuse') poppedHumanMove = false;
    const after = fold(setup, evs, aiColor, options);
    if (poppedHumanMove && after.pos.turn === human && after.lastAction?.type !== 'accuse') break;
  }
  return evs;
}
