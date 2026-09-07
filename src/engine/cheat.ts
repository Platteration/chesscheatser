import { chooseMove, chooseMoveAsync, evaluate, type Difficulty, type SearchResult } from './ai';
import { fileOf, offset, rankOf } from './board';
import { Position } from './position';
import { createRng, randomSeed, type Rng } from './random';
import { DIRS, KING_TARGETS, KNIGHT_TARGETS, RAYS } from './tables';
import type { CheatKind, Move, PieceType, Square } from './types';

/** How often the computer tries to get away with an illegal move. */
export type CheatLevel = 'off' | 'low' | 'high';

export const CHEAT_PROBABILITY: Record<CheatLevel, number> = { off: 0, low: 0.18, high: 0.4 };

/**
 * Plausible-looking illegal moves for the side to move. Every candidate keeps
 * the shape of a real move so an inattentive opponent might miss it:
 *  - jump:     a slider passes through exactly one blocking piece
 *  - geometry: a piece moves a little like a different piece (bishop steps
 *              sideways, rook steps diagonally, knight steps one square, king
 *              steps two, queen hops like a knight)
 *  - pawn:     pawn moves sideways/backwards, captures straight ahead, moves
 *              diagonally without capturing, or double-pushes from anywhere
 *  - upgrade:  a knight, bishop or rook makes an ordinary move but lands as a queen
 *  - resurrect: one of the cheater's captured pieces (`resurrectable`) quietly
 *              reappears on an empty square of its own home ranks
 * Kings are never captured, "upgraded" or resurrected.
 */
export function cheatCandidates(pos: Position, resurrectable: PieceType[] = []): Move[] {
  const color = pos.turn;
  const board = pos.board;
  const out: Move[] = [];

  const add = (from: Square, to: Square, piece: PieceType, cheat: CheatKind, extra: Partial<Move> = {}) => {
    const t = board[to];
    if (t && (t.color === color || t.type === 'k')) return;
    const m: Move = { from, to, piece, cheat, ...extra };
    if (t) m.captured = t.type;
    if (piece === 'p' && rankOf(to) === (color === 'w' ? 7 : 0)) m.promotion = 'q';
    out.push(m);
  };

  for (let from = 0; from < 64; from++) {
    const p = board[from];
    if (!p || p.color !== color) continue;
    switch (p.type) {
      case 'b':
      case 'r':
      case 'q': {
        const [d0, d1] = p.type === 'b' ? [0, 4] : p.type === 'r' ? [4, 8] : [0, 8];
        for (let d = d0; d < d1; d++) {
          const ray = RAYS[from][d];
          let blocker = -1;
          for (let i = 0; i < ray.length; i++) {
            if (board[ray[i]]) {
              blocker = i;
              break;
            }
          }
          if (blocker < 0) continue;
          for (let i = blocker + 1; i < ray.length; i++) {
            const to = ray[i];
            add(from, to, p.type, 'jump');
            if (board[to]) break;
          }
        }
        if (p.type === 'b') {
          for (const to of KING_TARGETS[from]) if (fileOf(to) === fileOf(from) || rankOf(to) === rankOf(from)) add(from, to, 'b', 'geometry');
        } else if (p.type === 'r') {
          for (const to of KING_TARGETS[from]) if (fileOf(to) !== fileOf(from) && rankOf(to) !== rankOf(from)) add(from, to, 'r', 'geometry');
        } else {
          for (const to of KNIGHT_TARGETS[from]) add(from, to, 'q', 'geometry');
        }
        break;
      }
      case 'n':
        for (const to of KING_TARGETS[from]) add(from, to, 'n', 'geometry');
        break;
      case 'k':
        for (const [df, dr] of DIRS) {
          const mid = offset(from, df, dr);
          const to = mid >= 0 ? offset(mid, df, dr) : -1;
          // Two squares in a line: sliding over an empty square, or hopping over a neighbour.
          if (mid >= 0 && to >= 0) add(from, to, 'k', board[mid] ? 'jump' : 'geometry');
        }
        break;
      case 'p': {
        const dir = color === 'w' ? 1 : -1;
        const startRank = color === 'w' ? 1 : 6;
        for (const df of [-1, 1]) {
          const side = offset(from, df, 0);
          if (side >= 0 && !board[side]) add(from, side, 'p', 'pawn');
          const diag = offset(from, df, dir);
          if (diag >= 0 && !board[diag]) add(from, diag, 'p', 'pawn');
        }
        const one = offset(from, 0, dir);
        if (one >= 0 && board[one]) add(from, one, 'p', 'pawn');
        const two = offset(from, 0, 2 * dir);
        if (one >= 0 && two >= 0 && !board[one] && !board[two] && rankOf(from) !== startRank) {
          add(from, two, 'p', 'pawn', { doublePush: true });
        }
        const back = offset(from, 0, -dir);
        if (back >= 0 && !board[back]) add(from, back, 'p', 'pawn');
        break;
      }
    }
  }

  for (const m of pos.pseudoLegalMoves()) {
    if (m.piece === 'n' || m.piece === 'b' || m.piece === 'r') {
      out.push({ ...m, promotion: 'q', cheat: 'upgrade' });
    }
  }

  const types = [...new Set(resurrectable.filter((t) => t !== 'k'))];
  if (types.length) {
    const ranks = color === 'w' ? [0, 1] : [7, 6];
    for (const r of ranks) {
      for (let f = 0; f < 8; f++) {
        const to = r * 8 + f;
        if (board[to]) continue;
        for (const t of types) {
          if (t === 'p' && r === ranks[0]) continue; // pawns never on the back rank
          out.push({ from: -1, to, piece: t, cheat: 'resurrect' });
        }
      }
    }
  }
  return out;
}

export interface CheatChoice {
  move: Move;
  /** Static evaluation after the cheat, from the cheater's point of view. */
  score: number;
}

/**
 * Picks the most profitable cheat that neither leaves the cheater's own kings
 * all in check nor ends the game on the spot (a cheat must leave the victim a
 * turn in which to call it out).
 */
export function chooseCheat(pos: Position, rng: Rng, resurrectable: PieceType[] = []): CheatChoice | null {
  const me = pos.turn;
  let best: CheatChoice | null = null;
  for (const m of cheatCandidates(pos, resurrectable)) {
    pos.makeMove(m);
    let score = -Infinity;
    if (!pos.allKingsInCheck(me) && pos.result().kind === 'ongoing') {
      score = -evaluate(pos) + (rng.next() - 0.5) * 30;
    }
    pos.unmakeMove();
    if (score > -Infinity && (!best || score > best.score)) best = { move: m, score };
  }
  return best;
}

export interface Action {
  move: Move;
  cheated: boolean;
}

/**
 * Chooses the computer's move. With cheating enabled it sometimes plays an
 * illegal move instead, but only when that looks better than its best legal option.
 */
export interface CheatContext {
  /** Piece types the cheater has lost so far (candidates for resurrection). */
  resurrectable?: PieceType[];
}

export function chooseAction(
  position: Position,
  difficulty: Difficulty,
  level: CheatLevel,
  seed = randomSeed(),
  ctx: CheatContext = {},
): Action | null {
  return decide(position, chooseMove(position, difficulty, seed), level, seed, ctx);
}

/** Async variant that keeps the UI responsive while the computer thinks. */
export async function chooseActionAsync(
  position: Position,
  difficulty: Difficulty,
  level: CheatLevel,
  seed = randomSeed(),
  shouldAbort: () => boolean = () => false,
  ctx: CheatContext = {},
): Promise<Action | null> {
  const legal = await chooseMoveAsync(position, difficulty, seed, shouldAbort);
  if (shouldAbort()) return null;
  return decide(position, legal, level, seed, ctx);
}

function decide(position: Position, legal: SearchResult | null, level: CheatLevel, seed: number, ctx: CheatContext): Action | null {
  const rng = createRng(seed);
  if (!legal) return null;
  const p = CHEAT_PROBABILITY[level];
  if (p > 0 && rng.next() < p) {
    const pos = position.clone();
    const cheat = chooseCheat(pos, rng, ctx.resurrectable);
    if (cheat) {
      pos.makeMove(legal.move);
      const legalStatic = -evaluate(pos);
      pos.unmakeMove();
      if (cheat.score > legalStatic + 10) return { move: cheat.move, cheated: true };
    }
  }
  return { move: legal.move, cheated: false };
}
