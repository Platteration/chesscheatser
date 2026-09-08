import { fileOf, opposite, rankOf } from './board';
import { isAttacked, Position } from './position';
import { createRng, randomSeed } from './random';
import { PIECE_VALUE, type Color, type LegalMove, type Move, type PieceType } from './types';

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface SearchResult {
  move: LegalMove;
  score: number;
  depth: number;
  nodes: number;
  timeMs: number;
}

interface Profile {
  maxDepth: number;
  timeMs: number;
  /** Pick randomly among root moves within this many centipawns of the best. */
  slack: number;
  noise: number;
}

const PROFILES: Record<Difficulty, Profile> = {
  easy: { maxDepth: 1, timeMs: 400, slack: 150, noise: 40 },
  medium: { maxDepth: 3, timeMs: 900, slack: 25, noise: 10 },
  hard: { maxDepth: 6, timeMs: 2200, slack: 0, noise: 0 },
};

const MATE = 100_000;
const INF = 1_000_000;
const CHECK_PENALTY = 70;

// Piece-square tables (white's perspective, row 0 = rank 8).
const PST: Record<PieceType, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20,
  ],
};

function pst(type: PieceType, color: Color, s: number): number {
  const f = fileOf(s);
  const r = rankOf(s);
  const row = color === 'w' ? 7 - r : r;
  return PST[type][row * 8 + f];
}

/** Static evaluation from the point of view of the side to move. */
export function evaluate(pos: Position): number {
  let score = 0;
  const board = pos.board;
  for (let s = 0; s < 64; s++) {
    const p = board[s];
    if (!p) continue;
    const v = PIECE_VALUE[p.type] + pst(p.type, p.color, s);
    score += p.color === 'w' ? v : -v;
  }
  for (const color of ['w', 'b'] as Color[]) {
    const enemy = opposite(color);
    let checked = 0;
    for (const k of pos.kings[color]) if (isAttacked(board, k, enemy)) checked++;
    const penalty = checked * CHECK_PENALTY;
    score += color === 'w' ? -penalty : penalty;
  }
  return pos.turn === 'w' ? score : -score;
}

class TimeUp extends Error {}

// ---------------------------------------------------------------------------
// Transposition table (module-level, shared across searches; entries are
// verified by full 32-bit key so stale slots are simply overwritten).
// ---------------------------------------------------------------------------
const TT_BITS = 18;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const TT_EXACT = 0;
const TT_LOWER = 1;
const TT_UPPER = 2;
const ttKey = new Int32Array(TT_SIZE);
const ttScore = new Int32Array(TT_SIZE);
const ttDepth = new Int8Array(TT_SIZE);
const ttFlag = new Int8Array(TT_SIZE);
const ttMove = new Int32Array(TT_SIZE); // from | to << 6 | promoIndex << 12, or -1
const ttUsed = new Uint8Array(TT_SIZE);
const PROMO_INDEX: Record<string, number> = { q: 1, r: 2, b: 3, n: 4 };
const PROMO_TYPES: (PieceType | undefined)[] = [undefined, 'q', 'r', 'b', 'n'];

/** Forgets every stored position (call when a new game starts). */
export function clearTranspositionTable() {
  ttUsed.fill(0);
}

function packMove(m: Move): number {
  if (m.from < 0 || m.pass) return -1;
  return m.from | (m.to << 6) | ((m.promotion ? PROMO_INDEX[m.promotion] : 0) << 12);
}

function sameAsPacked(m: Move, packed: number): boolean {
  return packed >= 0 && m.from === (packed & 63) && m.to === ((packed >> 6) & 63) && (m.promotion ?? undefined) === PROMO_TYPES[(packed >> 12) & 7];
}

/** Mate scores are stored relative to the node so they stay valid at any ply. */
function toTT(score: number, ply: number): number {
  if (score >= MATE - 1000) return score + ply;
  if (score <= -(MATE - 1000)) return score - ply;
  return score;
}
function fromTT(score: number, ply: number): number {
  if (score >= MATE - 1000) return score - ply;
  if (score <= -(MATE - 1000)) return score + ply;
  return score;
}

const MAX_PLY = 64;

class Searcher {
  nodes = 0;
  private deadline: number;
  private killers: Int32Array = new Int32Array(MAX_PLY * 2).fill(-1);
  private history: Int32Array = new Int32Array(64 * 64);

  constructor(private pos: Position, timeMs: number) {
    this.deadline = Date.now() + timeMs;
  }

  private ttProbe(depth: number, alpha: number, beta: number, ply: number): { score: number | null; move: number } {
    const i = this.pos.hash & TT_MASK;
    if (!ttUsed[i] || ttKey[i] !== this.pos.hash) return { score: null, move: -1 };
    const move = ttMove[i];
    if (ttDepth[i] < depth) return { score: null, move };
    const score = fromTT(ttScore[i], ply);
    const flag = ttFlag[i];
    if (flag === TT_EXACT) return { score, move };
    if (flag === TT_LOWER && score >= beta) return { score, move };
    if (flag === TT_UPPER && score <= alpha) return { score, move };
    return { score: null, move };
  }

  private ttStore(depth: number, score: number, flag: number, best: Move | null, ply: number) {
    const i = this.pos.hash & TT_MASK;
    // Prefer keeping deeper entries for the same position; otherwise replace.
    if (ttUsed[i] && ttKey[i] === this.pos.hash && ttDepth[i] > depth && ttFlag[i] === TT_EXACT) return;
    ttUsed[i] = 1;
    ttKey[i] = this.pos.hash;
    ttScore[i] = toTT(score, ply);
    ttDepth[i] = depth;
    ttFlag[i] = flag;
    ttMove[i] = best ? packMove(best) : -1;
  }

  private noteCutoff(m: Move, depth: number, ply: number) {
    if (m.captured || m.promotion || m.from < 0) return;
    const packed = packMove(m);
    const k = ply * 2;
    if (this.killers[k] !== packed) {
      this.killers[k + 1] = this.killers[k];
      this.killers[k] = packed;
    }
    this.history[m.from * 64 + m.to] += depth * depth;
  }

  private tick() {
    this.nodes++;
    if ((this.nodes & 1023) === 0 && Date.now() > this.deadline) throw new TimeUp();
  }

  order(moves: LegalMove[], first?: LegalMove, ttMovePacked = -1, ply = 0): LegalMove[] {
    const k1 = this.killers[ply * 2];
    const k2 = this.killers[ply * 2 + 1];
    const scoreOf = (m: LegalMove) => {
      let s = 0;
      if (first && m.from === first.from && m.to === first.to && m.promotion === first.promotion) s += 2_000_000;
      if (sameAsPacked(m, ttMovePacked)) s += 1_000_000;
      if (m.captured) s += 100_000 + 10 * PIECE_VALUE[m.captured] - PIECE_VALUE[m.piece];
      if (m.promotion) s += 50_000 + PIECE_VALUE[m.promotion];
      if (!m.captured && !m.promotion && m.from >= 0) {
        const packed = packMove(m);
        if (packed === k1) s += 40_000;
        else if (packed === k2) s += 30_000;
        else s += Math.min(29_999, this.history[m.from * 64 + m.to]);
      }
      return s;
    };
    return moves
      .map((m) => ({ m, s: scoreOf(m) }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.m);
  }

  search(depth: number, alpha: number, beta: number, ply: number): number {
    this.tick();
    const pos = this.pos;
    if (pos.halfmove >= 100 || pos.repetitionCount() >= 3) return 0;
    const alphaOrig = alpha;
    const probe = ply > 0 && ply < MAX_PLY ? this.ttProbe(depth, alpha, beta, ply) : { score: null, move: -1 };
    if (probe.score !== null) return probe.score;

    const legal = pos.legalMoves();
    const res = pos.result(legal);
    if (res.kind === 'both-in-check' || res.kind === 'checkmate') return -(MATE - ply);
    if (res.kind !== 'ongoing') return 0;
    if (depth <= 0) return this.quiesce(alpha, beta, ply, 4);

    let best = -INF;
    let bestMove: Move | null = null;
    for (const m of this.order(legal, undefined, probe.move, ply)) {
      pos.makeMove(m);
      let score: number;
      try {
        score = -this.search(depth - 1, -beta, -alpha, ply + 1);
      } finally {
        pos.unmakeMove();
      }
      if (score > best) {
        best = score;
        bestMove = m;
      }
      if (score > alpha) alpha = score;
      if (alpha >= beta) {
        if (ply < MAX_PLY) this.noteCutoff(m, depth, ply);
        break;
      }
    }
    if (ply < MAX_PLY) {
      const flag = best <= alphaOrig ? TT_UPPER : best >= beta ? TT_LOWER : TT_EXACT;
      this.ttStore(depth, best, flag, bestMove, ply);
    }
    return best;
  }

  quiesce(alpha: number, beta: number, ply: number, qdepth: number): number {
    this.tick();
    const pos = this.pos;
    if (pos.allKingsInCheck()) return -(MATE - ply);
    const stand = evaluate(pos);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (qdepth <= 0) return stand;

    const tactical = pos.legalMoves().filter((m) => m.captured || m.promotion);
    let best = stand;
    for (const m of this.order(tactical)) {
      pos.makeMove(m);
      let score: number;
      try {
        score = -this.quiesce(-beta, -alpha, ply + 1, qdepth - 1);
      } finally {
        pos.unmakeMove();
      }
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    return best;
  }

  /** Scores one root move at `depth` given the best score found so far. */
  rootMove(depth: number, m: LegalMove, alpha: number): number {
    this.pos.makeMove(m);
    try {
      return -this.search(depth - 1, -INF, -alpha, 1);
    } finally {
      this.pos.unmakeMove();
    }
  }

  /** Searches every root move; the best move's score is exact, the rest are upper bounds. */
  rootScores(depth: number, legal: LegalMove[], previousBest?: LegalMove): { move: LegalMove; score: number }[] {
    const out: { move: LegalMove; score: number }[] = [];
    let alpha = -INF;
    for (const m of this.order(legal, previousBest)) {
      const score = this.rootMove(depth, m, alpha);
      out.push({ move: m, score });
      if (score > alpha) alpha = score;
    }
    return out;
  }
}

type Scored = { move: LegalMove; score: number }[];

function pickFromScores(best: Scored, profile: Profile, rng: ReturnType<typeof createRng>): { move: LegalMove; score: number } {
  // With alpha-beta at the root only the best move's score is exact; the rest
  // are upper bounds. That is good enough for "pick among near-equal moves".
  const top = best[0].score;
  const candidates = best.filter((x) => top - x.score <= profile.slack);
  const withNoise = candidates.map((c) => ({ ...c, score: c.score + (rng.next() - 0.5) * 2 * profile.noise }));
  withNoise.sort((a, b) => b.score - a.score);
  return withNoise[0];
}

export function chooseMove(position: Position, difficulty: Difficulty, seed = randomSeed()): SearchResult | null {
  const started = Date.now();
  const profile = PROFILES[difficulty];
  const rng = createRng(seed);
  const pos = position.clone();
  const legal = pos.legalMoves();
  if (legal.length === 0) return null;

  const searcher = new Searcher(pos, profile.timeMs);
  let best: { move: LegalMove; score: number }[] = legal.map((move) => ({ move, score: 0 }));
  let completedDepth = 0;

  for (let depth = 1; depth <= profile.maxDepth; depth++) {
    try {
      const scores = searcher.rootScores(depth, legal, best[0]?.move);
      scores.sort((a, b) => b.score - a.score);
      best = scores;
      completedDepth = depth;
      if (Math.abs(scores[0].score) >= MATE - 100) break;
    } catch (e) {
      if (e instanceof TimeUp) break;
      throw e;
    }
  }

  const pick = pickFromScores(best, profile, rng);
  return {
    move: pick.move,
    score: pick.score,
    depth: completedDepth,
    nodes: searcher.nodes,
    timeMs: Date.now() - started,
  };
}

/**
 * Score of the side to move at a fixed depth (plies) inside an alpha-beta
 * window, for tooling such as puzzle mining. A window hugging the mate score
 * makes "is there a forced mate?" questions very cheap. Returns null if
 * `timeMs` runs out first.
 */
export function scoreAtDepth(position: Position, depth: number, timeMs = 2000, alpha = -INF, beta = INF): number | null {
  const pos = position.clone();
  const searcher = new Searcher(pos, timeMs);
  try {
    return searcher.search(depth, alpha, beta, 0);
  } catch (e) {
    if (e instanceof TimeUp) return null;
    throw e;
  }
}

const yieldToUI = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Same search as `chooseMove`, but hands control back to the UI thread between
 * root moves (at most every ~40ms) so spinners keep animating and taps register.
 * Resolves to null when `shouldAbort()` becomes true (e.g. the game was reset).
 */
export async function chooseMoveAsync(
  position: Position,
  difficulty: Difficulty,
  seed = randomSeed(),
  shouldAbort: () => boolean = () => false,
): Promise<SearchResult | null> {
  const started = Date.now();
  const profile = PROFILES[difficulty];
  const rng = createRng(seed);
  const pos = position.clone();
  const legal = pos.legalMoves();
  if (legal.length === 0) return null;

  const searcher = new Searcher(pos, profile.timeMs);
  let best: Scored = legal.map((move) => ({ move, score: 0 }));
  let completedDepth = 0;
  let lastYield = Date.now();

  outer: for (let depth = 1; depth <= profile.maxDepth; depth++) {
    const scores: Scored = [];
    let alpha = -INF;
    for (const m of searcher.order(legal, best[0]?.move)) {
      if (Date.now() - lastYield > 40) {
        await yieldToUI();
        lastYield = Date.now();
        if (shouldAbort()) return null;
      }
      let score: number;
      try {
        score = searcher.rootMove(depth, m, alpha);
      } catch (e) {
        if (e instanceof TimeUp) break outer;
        throw e;
      }
      scores.push({ move: m, score });
      if (score > alpha) alpha = score;
    }
    scores.sort((a, b) => b.score - a.score);
    best = scores;
    completedDepth = depth;
    if (Math.abs(scores[0].score) >= MATE - 100) break;
  }

  const pick = pickFromScores(best, profile, rng);
  return { move: pick.move, score: pick.score, depth: completedDepth, nodes: searcher.nodes, timeMs: Date.now() - started };
}

export { MATE, INF };
