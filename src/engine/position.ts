import { boardToString, cloneBoard, fileOf, kingSquares, opposite, rankOf } from './board';
import { KING_TARGETS, KNIGHT_TARGETS, PAWN_ATTACKERS, PAWN_CAPTURES, RAYS } from './tables';
import type { Board, Color, GameResult, LegalMove, Move, Piece, PieceType, Square } from './types';

const PROMOTIONS: PieceType[] = ['q', 'r', 'b', 'n'];

// ---------------------------------------------------------------------------
// Zobrist hashing (32-bit, updated incrementally) for cheap repetition checks.
// ---------------------------------------------------------------------------
const PIECE_INDEX: Record<PieceType, number> = { p: 0, n: 1, b: 2, r: 3, q: 4, k: 5 };
const ZOBRIST_PIECE: Int32Array = new Int32Array(12 * 64);
const ZOBRIST_EP: Int32Array = new Int32Array(8);
let ZOBRIST_TURN = 0;
(() => {
  let a = 0x9e3779b9;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) | 0;
  };
  for (let i = 0; i < ZOBRIST_PIECE.length; i++) ZOBRIST_PIECE[i] = next();
  for (let i = 0; i < 8; i++) ZOBRIST_EP[i] = next();
  ZOBRIST_TURN = next();
})();

function pieceHash(p: Piece, s: Square): number {
  return ZOBRIST_PIECE[(PIECE_INDEX[p.type] + (p.color === 'w' ? 0 : 6)) * 64 + s];
}

export function hashPosition(board: Board, turn: Color, ep: Square): number {
  let h = 0;
  for (let s = 0; s < 64; s++) {
    const p = board[s];
    if (p) h ^= pieceHash(p, s);
  }
  if (turn === 'b') h ^= ZOBRIST_TURN;
  if (ep >= 0) h ^= ZOBRIST_EP[fileOf(ep)];
  return h | 0;
}

interface Undo {
  move: Move;
  captured: Piece | null;
  capturedSquare: Square;
  prevEp: Square;
  prevHalfmove: number;
  prevHash: number;
}

/**
 * Is `square` attacked by any piece of `by`?
 * Kings count as attackers (a king standing next to an enemy king gives check).
 */
export function isAttacked(board: Board, square: Square, by: Color): boolean {
  for (const s of PAWN_ATTACKERS[by][square]) {
    const p = board[s];
    if (p && p.color === by && p.type === 'p') return true;
  }
  for (const s of KNIGHT_TARGETS[square]) {
    const p = board[s];
    if (p && p.color === by && p.type === 'n') return true;
  }
  for (const s of KING_TARGETS[square]) {
    const p = board[s];
    if (p && p.color === by && p.type === 'k') return true;
  }
  const rays = RAYS[square];
  for (let d = 0; d < 8; d++) {
    const slider: PieceType = d < 4 ? 'b' : 'r';
    const ray = rays[d];
    for (let i = 0; i < ray.length; i++) {
      const p = board[ray[i]];
      if (p) {
        if (p.color === by && (p.type === slider || p.type === 'q')) return true;
        break;
      }
    }
  }
  return false;
}

export function kingsInCheck(board: Board, color: Color): Square[] {
  return kingSquares(board, color).filter((k) => isAttacked(board, k, opposite(color)));
}

export class Position {
  board: Board;
  turn: Color;
  ep: Square = -1;
  halfmove = 0;
  fullmove = 1;
  /** Zobrist hash of the current position. */
  hash = 0;
  /** Hashes of every position seen so far (for repetition), including the current one. */
  history: number[] = [];
  /** King squares per colour, kept in sync by make/unmake. */
  kings: Record<Color, Square[]>;
  private undoStack: Undo[] = [];

  constructor(board: Board, turn: Color = 'w') {
    this.board = cloneBoard(board);
    this.turn = turn;
    this.kings = { w: kingSquares(this.board, 'w'), b: kingSquares(this.board, 'b') };
    this.hash = hashPosition(this.board, this.turn, this.ep);
    this.history.push(this.hash);
  }

  clone(): Position {
    const p = new Position(this.board, this.turn);
    p.ep = this.ep;
    p.halfmove = this.halfmove;
    p.fullmove = this.fullmove;
    p.hash = this.hash;
    p.history = this.history.slice();
    return p;
  }

  /** Human-readable key (board, side to move, en-passant square). */
  key(): string {
    return `${boardToString(this.board)} ${this.turn} ${this.ep}`;
  }

  pieceAt(s: Square): Piece | null {
    return this.board[s];
  }

  // ---------------------------------------------------------------------------
  // Move generation
  // ---------------------------------------------------------------------------

  /** Pseudo-legal moves for the side to move. Enemy kings are never capturable. */
  pseudoLegalMoves(): Move[] {
    const moves: Move[] = [];
    const color = this.turn;
    const board = this.board;
    for (let from = 0; from < 64; from++) {
      const p = board[from];
      if (!p || p.color !== color) continue;
      switch (p.type) {
        case 'p':
          this.pawnMoves(from, color, moves);
          break;
        case 'n':
          this.stepMoves(from, color, KNIGHT_TARGETS[from], 'n', moves);
          break;
        case 'k':
          this.stepMoves(from, color, KING_TARGETS[from], 'k', moves);
          break;
        case 'b':
          this.slideMoves(from, color, 0, 4, 'b', moves);
          break;
        case 'r':
          this.slideMoves(from, color, 4, 8, 'r', moves);
          break;
        case 'q':
          this.slideMoves(from, color, 0, 8, 'q', moves);
          break;
      }
    }
    return moves;
  }

  private pawnMoves(from: Square, color: Color, out: Move[]) {
    const dir = color === 'w' ? 8 : -8;
    const startRank = color === 'w' ? 1 : 6;
    const promoRank = color === 'w' ? 7 : 0;
    const board = this.board;

    const one = from + dir;
    if (one >= 0 && one < 64 && !board[one]) {
      this.pushPawn(from, one, promoRank, undefined, out);
      if (rankOf(from) === startRank) {
        const two = one + dir;
        if (!board[two]) out.push({ from, to: two, piece: 'p', doublePush: true });
      }
    }
    for (const to of PAWN_CAPTURES[color][from]) {
      const target = board[to];
      if (target) {
        if (target.color !== color && target.type !== 'k') {
          this.pushPawn(from, to, promoRank, target.type, out);
        }
      } else if (to === this.ep) {
        out.push({ from, to, piece: 'p', captured: 'p', enPassant: true });
      }
    }
  }

  private pushPawn(from: Square, to: Square, promoRank: number, captured: PieceType | undefined, out: Move[]) {
    if (rankOf(to) === promoRank) {
      for (const promotion of PROMOTIONS) out.push({ from, to, piece: 'p', captured, promotion });
    } else {
      out.push({ from, to, piece: 'p', captured });
    }
  }

  private stepMoves(from: Square, color: Color, targets: number[], piece: PieceType, out: Move[]) {
    for (const to of targets) {
      const target = this.board[to];
      if (!target) out.push({ from, to, piece });
      else if (target.color !== color && target.type !== 'k') out.push({ from, to, piece, captured: target.type });
    }
  }

  private slideMoves(from: Square, color: Color, dirStart: number, dirEnd: number, piece: PieceType, out: Move[]) {
    const rays = RAYS[from];
    for (let d = dirStart; d < dirEnd; d++) {
      const ray = rays[d];
      for (let i = 0; i < ray.length; i++) {
        const to = ray[i];
        const target = this.board[to];
        if (!target) {
          out.push({ from, to, piece });
        } else {
          if (target.color !== color && target.type !== 'k') out.push({ from, to, piece, captured: target.type });
          break;
        }
      }
    }
  }

  /**
   * Legal moves under the two-king rules: a move is legal as long as it does not
   * leave *all* of the mover's kings in check. Leaving one king in check is fine.
   */
  legalMoves(): LegalMove[] {
    const color = this.turn;
    const enemy = opposite(color);
    const out: LegalMove[] = [];
    for (const m of this.pseudoLegalMoves()) {
      this.makeMove(m);
      const kings = this.kings[color];
      const checkedAfter: Square[] = [];
      for (let i = 0; i < kings.length; i++) {
        const k = kings[i];
        if (isAttacked(this.board, k, enemy)) {
          // Map the post-move king square back to its pre-move square.
          checkedAfter.push(m.piece === 'k' && k === m.to ? m.from : k);
        }
      }
      this.unmakeMove();
      if (kings.length > 0 && checkedAfter.length >= kings.length) continue;
      out.push({ ...m, checkedAfter });
    }
    return out;
  }

  /** Legal moves originating from a square (for the UI). */
  legalMovesFrom(from: Square): LegalMove[] {
    return this.legalMoves().filter((m) => m.from === from);
  }

  // ---------------------------------------------------------------------------
  // Make / unmake
  // ---------------------------------------------------------------------------

  makeMove(m: Move) {
    const board = this.board;
    const mover = board[m.from];
    if (!mover) throw new Error(`No piece on ${m.from}`);
    let capturedSquare = m.to;
    if (m.enPassant) capturedSquare = m.to + (mover.color === 'w' ? -8 : 8);
    const captured = board[capturedSquare];

    this.undoStack.push({
      move: m,
      captured,
      capturedSquare,
      prevEp: this.ep,
      prevHalfmove: this.halfmove,
      prevHash: this.hash,
    });

    let h = this.hash;
    if (captured) h ^= pieceHash(captured, capturedSquare);
    h ^= pieceHash(mover, m.from);
    const placed = m.promotion ? { type: m.promotion, color: mover.color } : mover;
    h ^= pieceHash(placed, m.to);
    if (this.ep >= 0) h ^= ZOBRIST_EP[fileOf(this.ep)];

    board[capturedSquare] = null;
    board[m.from] = null;
    board[m.to] = placed;
    if (mover.type === 'k') {
      const ks = this.kings[mover.color];
      ks[ks.indexOf(m.from)] = m.to;
    }

    this.ep = m.doublePush ? (m.from + m.to) / 2 : -1;
    if (this.ep >= 0) h ^= ZOBRIST_EP[fileOf(this.ep)];
    h ^= ZOBRIST_TURN;
    this.hash = h | 0;
    this.halfmove = mover.type === 'p' || captured ? 0 : this.halfmove + 1;
    if (this.turn === 'b') this.fullmove++;
    this.turn = opposite(this.turn);
    this.history.push(this.hash);
  }

  unmakeMove() {
    const u = this.undoStack.pop();
    if (!u) throw new Error('Nothing to unmake');
    const { move: m } = u;
    const board = this.board;
    this.turn = opposite(this.turn);
    if (this.turn === 'b') this.fullmove--;
    const moved = board[m.to]!;
    board[m.from] = m.promotion ? { type: 'p', color: moved.color } : moved;
    board[m.to] = null;
    board[u.capturedSquare] = u.captured;
    if (moved.type === 'k') {
      const ks = this.kings[moved.color];
      ks[ks.indexOf(m.to)] = m.from;
    }
    this.ep = u.prevEp;
    this.halfmove = u.prevHalfmove;
    this.hash = u.prevHash;
    this.history.pop();
  }

  get moveCount(): number {
    return this.undoStack.length;
  }

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------

  /** Kings of the side to move that are currently in check. */
  checkedKings(): Square[] {
    const enemy = opposite(this.turn);
    return this.kings[this.turn].filter((k) => isAttacked(this.board, k, enemy));
  }

  /** True when the side to move has two or more kings and every one of them is in check. */
  allKingsInCheck(): boolean {
    const kings = this.kings[this.turn];
    if (kings.length < 2) return false;
    const enemy = opposite(this.turn);
    for (let i = 0; i < kings.length; i++) if (!isAttacked(this.board, kings[i], enemy)) return false;
    return true;
  }

  /**
   * Evaluates the position for the side to move.
   *
   *  - All of a player's kings in check at the start of their turn: they lose.
   *  - A king in check with no legal move that rescues it: checkmate, they lose.
   *  - No legal moves (and no check): stalemate.
   *  - 50-move rule / threefold repetition: draw.
   */
  result(legal?: LegalMove[]): GameResult {
    const kings = this.kings[this.turn];
    const checked = this.checkedKings();
    const winner = opposite(this.turn);
    // The two-king twist: every king in check at once is an immediate loss.
    // (A degenerate single-king army just plays normal chess.)
    if (kings.length >= 2 && checked.length >= kings.length) {
      return { kind: 'both-in-check', winner, kings: checked };
    }
    const moves = legal ?? this.legalMoves();
    for (const k of checked) {
      const canEscape = moves.some((m) => !m.checkedAfter.includes(k));
      if (!canEscape) return { kind: 'checkmate', winner, king: k };
    }
    if (moves.length === 0) return { kind: 'stalemate' };
    if (this.halfmove >= 100) return { kind: 'fifty-move' };
    if (this.repetitionCount() >= 3) return { kind: 'repetition' };
    return { kind: 'ongoing', checkedKings: checked };
  }

  repetitionCount(): number {
    const h = this.history;
    const current = this.hash;
    let n = 0;
    const stop = Math.max(0, h.length - 1 - this.halfmove);
    for (let i = h.length - 1; i >= stop; i -= 2) if (h[i] === current) n++;
    return n;
  }

  isGameOver(): boolean {
    return this.result().kind !== 'ongoing';
  }

  /** Material balance in centipawns from the perspective of `color`. */
  material(color: Color): number {
    return this.board.reduce((acc, p) => {
      if (!p) return acc;
      const v = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 }[p.type];
      return acc + (p.color === color ? v : -v);
    }, 0);
  }
}

export function moveToString(m: Move): string {
  const f = (s: Square) => 'abcdefgh'[fileOf(s)] + (rankOf(s) + 1);
  return f(m.from) + f(m.to) + (m.promotion ?? '');
}

/** Short algebraic-ish notation for the move list. */
export function moveToSAN(m: Move): string {
  const to = 'abcdefgh'[fileOf(m.to)] + (rankOf(m.to) + 1);
  const cap = m.captured ? 'x' : '';
  if (m.piece === 'p') {
    const fromFile = 'abcdefgh'[fileOf(m.from)];
    const promo = m.promotion ? '=' + m.promotion.toUpperCase() : '';
    return (m.captured ? fromFile + cap : '') + to + promo;
  }
  const fromName = 'abcdefgh'[fileOf(m.from)] + (rankOf(m.from) + 1);
  return m.piece.toUpperCase() + fromName + cap + to;
}
