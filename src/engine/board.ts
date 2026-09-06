import type { Board, Color, Piece, PieceType, Square } from './types';

export const FILES = 'abcdefgh';

export function fileOf(sq: Square): number {
  return sq & 7;
}

export function rankOf(sq: Square): number {
  return sq >> 3;
}

export function sq(file: number, rank: number): Square {
  return rank * 8 + file;
}

/** Returns the square offset by (df, dr) or -1 if it leaves the board. */
export function offset(from: Square, df: number, dr: number): Square {
  const f = fileOf(from) + df;
  const r = rankOf(from) + dr;
  if (f < 0 || f > 7 || r < 0 || r > 7) return -1;
  return sq(f, r);
}

export function squareName(s: Square): string {
  return FILES[fileOf(s)] + (rankOf(s) + 1);
}

export function parseSquare(name: string): Square {
  const f = FILES.indexOf(name[0]);
  const r = parseInt(name[1], 10) - 1;
  if (f < 0 || r < 0 || r > 7 || Number.isNaN(r)) throw new Error(`Bad square: ${name}`);
  return sq(f, r);
}

export function opposite(c: Color): Color {
  return c === 'w' ? 'b' : 'w';
}

export function emptyBoard(): Board {
  return new Array<Piece | null>(64).fill(null);
}

export function cloneBoard(board: Board): Board {
  return board.slice();
}

export function findPieces(board: Board, color: Color, type: PieceType): Square[] {
  const out: Square[] = [];
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p && p.color === color && p.type === type) out.push(i);
  }
  return out;
}

export function kingSquares(board: Board, color: Color): Square[] {
  return findPieces(board, color, 'k');
}

/** Compact, human-readable FEN-like board string (piece placement only). */
export function boardToString(board: Board): string {
  const rows: string[] = [];
  for (let r = 7; r >= 0; r--) {
    let row = '';
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = board[sq(f, r)];
      if (!p) {
        empty++;
        continue;
      }
      if (empty) {
        row += empty;
        empty = 0;
      }
      row += p.color === 'w' ? p.type.toUpperCase() : p.type;
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return rows.join('/');
}

/** Parses the piece-placement field of a FEN string. */
export function boardFromString(placement: string): Board {
  const board = emptyBoard();
  const rows = placement.split('/');
  if (rows.length !== 8) throw new Error('Bad placement string');
  for (let i = 0; i < 8; i++) {
    const r = 7 - i;
    let f = 0;
    for (const ch of rows[i]) {
      if (ch >= '1' && ch <= '8') {
        f += parseInt(ch, 10);
        continue;
      }
      const lower = ch.toLowerCase() as PieceType;
      if (!'pnbrqk'.includes(lower)) throw new Error(`Bad piece: ${ch}`);
      board[sq(f, r)] = { type: lower, color: ch === lower ? 'b' : 'w' };
      f++;
    }
  }
  return board;
}
