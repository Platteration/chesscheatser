import { offset, rankOf } from './board';
import type { Position } from './position';
import { DIRS, KING_TARGETS, KNIGHT_TARGETS, RAYS } from './tables';
import type { CheatKind, Move, PieceType, Square } from './types';

/**
 * Comeback powers: the side that is losing gets extra, fully legal moves. The
 * further behind, the higher the level, and levels are cumulative.
 *
 *  1 Nudge   pawns step sideways or backwards; kings step two squares through
 *            an empty square; knights may also step one square like a king.
 *  2 Slide   bishops and rooks move like queens; pawns capture straight ahead,
 *            move diagonally without capturing, and double-push from anywhere.
 *  3 Leap    sliders (and bishops/rooks sliding as queens) may pass over exactly
 *            one blocking piece; kings hop over a neighbour; queens jump like knights.
 *  4 Ascend  knights, bishops and rooks may arrive as queens; instead of moving,
 *            one captured piece (`resurrectable`) may return to the home ranks.
 */
export const MAX_POWER = 4;

export const POWER_NAMES = ['None', 'Nudge', 'Slide', 'Leap', 'Ascend'] as const;

export const POWER_DESCRIPTIONS = [
  'No extra powers.',
  'Pawns may step sideways or back. Kings may step two squares. Knights may also step one square.',
  'Bishops and rooks move like queens. Pawns may capture straight ahead, move diagonally, and double-push from anywhere.',
  'Sliders may jump over one piece. Kings may hop over a neighbour. Queens may jump like knights.',
  'Knights, bishops and rooks may arrive as queens, and a captured piece may return to your home ranks.',
] as const;

/** Deficit thresholds (centipawns) for each level; index = level. */
export const POWER_THRESHOLDS = [0, 150, 350, 650, 1000] as const;

export function powerLevelFor(deficit: number): number {
  let level = 0;
  for (let l = 1; l <= MAX_POWER; l++) if (deficit >= POWER_THRESHOLDS[l]) level = l;
  return level;
}

/**
 * Pseudo-legal power moves for the side to move at `level`. Every move carries
 * `power: true` and a `cheat` kind naming the trick, so the UI can label it.
 * Ordinary legal moves are never duplicated here.
 */
export function powerMoves(pos: Position, level: number, resurrectable: PieceType[] = [], ordinary?: Move[]): Move[] {
  if (level <= 0) return [];
  const plain = ordinary ?? pos.pseudoLegalMoves();
  const color = pos.turn;
  const board = pos.board;
  const out: Move[] = [];
  const seen = new Set<number>();

  const add = (from: Square, to: Square, piece: PieceType, kind: CheatKind, extra: Partial<Move> = {}) => {
    const t = board[to];
    if (t && (t.color === color || t.type === 'k')) return;
    const key = from * 64 + to + (extra.promotion ? 4096 * 'qrbn'.indexOf(extra.promotion) + 4096 : 0);
    if (seen.has(key)) return;
    seen.add(key);
    const m: Move = { from, to, piece, cheat: kind, power: true, ...extra };
    if (t) m.captured = t.type;
    if (piece === 'p' && rankOf(to) === (color === 'w' ? 7 : 0) && !m.promotion) m.promotion = 'q';
    out.push(m);
  };

  /** Slide along rays; with `jump` the ray continues past the first blocker once. */
  const slide = (from: Square, piece: PieceType, d0: number, d1: number, kind: CheatKind, jump: boolean) => {
    for (let d = d0; d < d1; d++) {
      const ray = RAYS[from][d];
      let blocked = false;
      for (let i = 0; i < ray.length; i++) {
        const to = ray[i];
        const t = board[to];
        if (!blocked) {
          if (!t) {
            add(from, to, piece, kind);
            continue;
          }
          add(from, to, piece, kind);
          if (!jump) break;
          blocked = true;
          continue;
        }
        // past the single blocker
        add(from, to, piece, kind);
        if (t) break;
      }
    }
  };

  for (let from = 0; from < 64; from++) {
    const p = board[from];
    if (!p || p.color !== color) continue;
    switch (p.type) {
      case 'p': {
        const dir = color === 'w' ? 1 : -1;
        for (const df of [-1, 1]) {
          const side = offset(from, df, 0);
          if (side >= 0 && !board[side]) add(from, side, 'p', 'pawn');
          if (level >= 2) {
            const diag = offset(from, df, dir);
            if (diag >= 0 && !board[diag]) add(from, diag, 'p', 'pawn');
          }
        }
        const back = offset(from, 0, -dir);
        if (back >= 0 && !board[back]) add(from, back, 'p', 'pawn');
        if (level >= 2) {
          const one = offset(from, 0, dir);
          if (one >= 0 && board[one]) add(from, one, 'p', 'pawn');
          const two = offset(from, 0, 2 * dir);
          if (one >= 0 && two >= 0 && !board[one] && !board[two]) add(from, two, 'p', 'pawn', { doublePush: true });
        }
        break;
      }
      case 'k':
        for (const [df, dr] of DIRS) {
          const mid = offset(from, df, dr);
          const to = mid >= 0 ? offset(mid, df, dr) : -1;
          if (mid < 0 || to < 0) continue;
          if (!board[mid]) add(from, to, 'k', 'geometry');
          else if (level >= 3) add(from, to, 'k', 'jump');
        }
        break;
      case 'n':
        for (const to of KING_TARGETS[from]) add(from, to, 'n', 'geometry');
        break;
      case 'b':
        if (level >= 2) slide(from, 'b', 4, 8, 'geometry', level >= 3);
        if (level >= 3) slide(from, 'b', 0, 4, 'jump', true);
        break;
      case 'r':
        if (level >= 2) slide(from, 'r', 0, 4, 'geometry', level >= 3);
        if (level >= 3) slide(from, 'r', 4, 8, 'jump', true);
        break;
      case 'q':
        if (level >= 3) {
          slide(from, 'q', 0, 8, 'jump', true);
          for (const to of KNIGHT_TARGETS[from]) add(from, to, 'q', 'geometry');
        }
        break;
    }
  }

  if (level >= 4) {
    // Arrive as a queen: every ordinary move of a knight, bishop or rook, plus the slides above.
    for (const m of plain) {
      if (m.piece === 'n' || m.piece === 'b' || m.piece === 'r') add(m.from, m.to, m.piece, 'upgrade', { promotion: 'q' });
    }
    for (const m of out.slice()) {
      if ((m.piece === 'n' || m.piece === 'b' || m.piece === 'r') && !m.promotion) add(m.from, m.to, m.piece, 'upgrade', { promotion: 'q' });
    }
    const types = [...new Set(resurrectable.filter((t) => t !== 'k'))];
    const ranks = color === 'w' ? [0, 1] : [7, 6];
    for (const r of ranks) {
      for (let f = 0; f < 8; f++) {
        const to = r * 8 + f;
        if (board[to]) continue;
        for (const t of types) {
          if (t === 'p' && r === ranks[0]) continue;
          out.push({ from: -1, to, piece: t, cheat: 'resurrect', power: true });
        }
      }
    }
  }

  // Drop anything that is already an ordinary legal move (same from/to/promotion).
  const keyOf = (m: Move) => m.from * 64 + m.to + (m.promotion ? 4096 * 'qrbn'.indexOf(m.promotion) + 4096 : 0);
  const ordinaryKeys = new Set(plain.map(keyOf));
  return out.filter((m) => m.from < 0 || !ordinaryKeys.has(keyOf(m)));
}
