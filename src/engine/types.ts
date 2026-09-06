export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface Piece {
  type: PieceType;
  color: Color;
}

/** Board square index: a1 = 0, h1 = 7, a8 = 56, h8 = 63. */
export type Square = number;

export interface Move {
  from: Square;
  to: Square;
  piece: PieceType;
  captured?: PieceType;
  promotion?: PieceType;
  enPassant?: boolean;
  doublePush?: boolean;
}

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
