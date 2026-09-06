import { emptyBoard, sq } from './board';
import { isAttacked, kingsInCheck, Position } from './position';
import { createRng, randomSeed, type Rng } from './random';
import { PIECE_VALUE, type Board, type Color, type PieceType } from './types';

/**
 * How the two armies relate to each other.
 *  - chaos:  each side gets an independent random army (can be wildly unfair).
 *  - fair:   different random armies, but roughly equal total material.
 *  - mirror: both sides get the same set of pieces, placed independently.
 */
export type MaterialMode = 'chaos' | 'fair' | 'mirror';

export interface SetupOptions {
  mode: MaterialMode;
  /** Total pieces per side, kings included. Range 3..16. */
  minPieces?: number;
  maxPieces?: number;
  seed?: number;
}

export interface Setup {
  board: Board;
  seed: number;
  mode: MaterialMode;
  whiteValue: number;
  blackValue: number;
}

export const KINGS_PER_SIDE = 2;
export const DEFAULT_MIN_PIECES = 8;
export const DEFAULT_MAX_PIECES = 16;

const WEIGHTED_TYPES: PieceType[] = [
  ...Array<PieceType>(30).fill('p'),
  ...Array<PieceType>(17).fill('n'),
  ...Array<PieceType>(17).fill('b'),
  ...Array<PieceType>(18).fill('r'),
  ...Array<PieceType>(18).fill('q'),
];

export function armyValue(army: PieceType[]): number {
  return army.reduce((acc, t) => acc + PIECE_VALUE[t], 0);
}

/** Picks the non-king pieces for one side. */
function randomArmy(rng: Rng, min: number, max: number): PieceType[] {
  const count = rng.int(min, max) - KINGS_PER_SIDE;
  const army: PieceType[] = [];
  let pawns = 0;
  while (army.length < count) {
    let t = rng.pick(WEIGHTED_TYPES);
    if (t === 'p') {
      if (pawns >= 8) t = rng.pick(['n', 'b', 'r', 'q'] as PieceType[]);
      else pawns++;
    }
    army.push(t);
  }
  return army;
}

/** Places kings + army on a side's two home ranks. Pawns never start on the back rank. */
function placeArmy(board: Board, rng: Rng, color: Color, army: PieceType[]) {
  const backRank = color === 'w' ? 0 : 7;
  const frontRank = color === 'w' ? 1 : 6;
  const files = rng.shuffle([0, 1, 2, 3, 4, 5, 6, 7]);
  const back = files.slice(0, 8);
  const kingFiles = back.slice(0, KINGS_PER_SIDE);
  for (const f of kingFiles) board[sq(f, backRank)] = { type: 'k', color };

  const free = new Set<number>();
  for (const f of back.slice(KINGS_PER_SIDE)) free.add(sq(f, backRank));
  const frontSquares = rng.shuffle([0, 1, 2, 3, 4, 5, 6, 7].map((f) => sq(f, frontRank)));
  for (const s of frontSquares) free.add(s);

  // Pawns first so they can claim front-rank squares.
  const pawns = army.filter((t) => t === 'p');
  const others = army.filter((t) => t !== 'p');
  for (const _ of pawns) {
    const s = frontSquares.find((x) => free.has(x));
    if (s === undefined) break;
    free.delete(s);
    board[s] = { type: 'p', color };
  }
  const remaining = rng.shuffle([...free]);
  for (const t of others) {
    const s = remaining.pop();
    if (s === undefined) break;
    board[s] = { type: t, color };
  }
}

/**
 * True if `color`, moving first from this board, could put every enemy king in
 * check with a single move (an instant win before the other side has played).
 */
function hasInstantWin(board: Board, color: Color): boolean {
  const pos = new Position(board, color);
  for (const m of pos.legalMoves()) {
    pos.makeMove(m);
    const instant = pos.allKingsInCheck();
    pos.unmakeMove();
    if (instant) return true;
  }
  return false;
}

/** A playable start: no king in check, and neither side can win on the spot. */
export function setupIsPlayable(board: Board): boolean {
  if (kingsInCheck(board, 'w').length > 0 || kingsInCheck(board, 'b').length > 0) return false;
  return !hasInstantWin(board, 'w') && !hasInstantWin(board, 'b');
}

function tryBuild(rng: Rng, white: PieceType[], black: PieceType[]): Board | null {
  for (let attempt = 0; attempt < 20; attempt++) {
    const board = emptyBoard();
    placeArmy(board, rng, 'w', white);
    placeArmy(board, rng, 'b', black);
    if (setupIsPlayable(board)) return board;
  }
  return null;
}

export function generateSetup(options: SetupOptions): Setup {
  const seed = options.seed ?? randomSeed();
  const rng = createRng(seed);
  const min = Math.max(3, Math.min(16, options.minPieces ?? DEFAULT_MIN_PIECES));
  const max = Math.max(min, Math.min(16, options.maxPieces ?? DEFAULT_MAX_PIECES));

  for (;;) {
    const white = randomArmy(rng, min, max);
    let black: PieceType[];
    switch (options.mode) {
      case 'mirror':
        black = white.slice();
        break;
      case 'fair': {
        const target = armyValue(white);
        black = white.slice();
        for (let i = 0; i < 400; i++) {
          const candidate = randomArmy(rng, min, max);
          if (Math.abs(armyValue(candidate) - target) <= 100) {
            black = candidate;
            break;
          }
        }
        break;
      }
      default:
        black = randomArmy(rng, min, max);
    }
    const board = tryBuild(rng, white, black);
    if (board) {
      return { board, seed, mode: options.mode, whiteValue: armyValue(white), blackValue: armyValue(black) };
    }
  }
}

/** Sanity helper used by tests: no square attacked for either king set. */
export function setupIsQuiet(board: Board): boolean {
  for (let s = 0; s < 64; s++) {
    const p = board[s];
    if (p && p.type === 'k' && isAttacked(board, s, p.color === 'w' ? 'b' : 'w')) return false;
  }
  return true;
}
