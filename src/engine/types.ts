export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface Piece {
  type: PieceType;
  color: Color;
}

/** Board square index: a1 = 0, h1 = 7, a8 = 56, h8 = 63. */
export type Square = number;

/** How a move breaks the rules, when the opponent is cheating. */
export type CheatKind = 'jump' | 'geometry' | 'pawn' | 'upgrade' | 'resurrect';

export interface Move {
  /** Origin square, or -1 when a piece appears from off the board (resurrect cheat). */
  from: Square;
  to: Square;
  piece: PieceType;
  captured?: PieceType;
  /** Piece placed on `to` instead of the mover (pawn promotion, or an "upgrade" cheat). */
  promotion?: PieceType;
  enPassant?: boolean;
  doublePush?: boolean;
  /** Set when the move was an illegal move played by a cheating opponent. */
  cheat?: CheatKind;
  /** A null move: the side to move skips its turn. */
  pass?: true;
}

export const PASS_MOVE: Move = { from: -1, to: -1, piece: 'k', pass: true };

/**
 * A legal move plus the two-king bookkeeping the rules need:
 * `checkedAfter` holds the *pre-move* squares of the mover's kings that are
 * still in check once the move has been played.
 */
export interface LegalMove extends Move {
  checkedAfter: Square[];
}

export type Board = (Piece | null)[];

export type GameResult =
  | { kind: 'ongoing'; checkedKings: Square[] }
  | { kind: 'checkmate'; winner: Color; king: Square }
  | { kind: 'both-in-check'; winner: Color; kings: Square[] }
  | { kind: 'stalemate' }
  | { kind: 'fifty-move' }
  | { kind: 'repetition' };

export const PIECE_VALUE: Record<PieceType, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};
