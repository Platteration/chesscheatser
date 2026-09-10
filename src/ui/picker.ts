import type { LegalMove, PieceType, Square } from '../engine/types';

/** A tap that needs a piece chosen before it becomes a move. */
export interface PendingPick {
  from: Square;
  to: Square;
  /** promote: a pawn reaching the last rank. upgrade: an optional "arrive as a queen".
   *  resurrect: a comeback power bringing a captured piece back onto an empty home square. */
  kind: 'promote' | 'upgrade' | 'resurrect';
}

/** Queen first, as players expect; anything unusual keeps a stable place after it. */
const ORDER: PieceType[] = ['q', 'r', 'b', 'n', 'p', 'k'];

/**
 * What the picker may offer, derived from the moves that actually exist.
 *
 * A hardcoded ['q','r','b','n'] is wrong for a promotion that only exists as a
 * comeback power move: `powerMoves` stamps 'q' and nothing else, so three of the
 * four buttons match no legal move and the tap is silently swallowed — the
 * player loses the turn until they retry and happen to pick the queen.
 */
export function pickerChoices(legal: readonly LegalMove[], pending: PendingPick | null): PieceType[] {
  if (!pending) return [];
  const { from, to, kind } = pending;
  const pieces =
    kind === 'resurrect'
      ? legal.filter((m) => m.from < 0 && m.to === to).map((m) => m.piece)
      : legal.filter((m) => m.from === from && m.to === to && m.promotion).map((m) => m.promotion as PieceType);
  return [...new Set(pieces)].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
}
