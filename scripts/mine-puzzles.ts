/**
 * Mines puzzles from random two-king games and writes assets/puzzles.json.
 *   npx tsx scripts/mine-puzzles.ts [count-per-kind] [seed] [win-2 count]
 * Kinds:
 *   double-1: one move puts both enemy kings in check (instant win). Unique solution.
 *   mate-1:   one move checkmates a king. Unique solution.
 *   win-2:    a forced win in two moves (three plies); unique winning first move.
 */
import { writeFileSync } from 'node:fs';
import { chooseMove, INF, MATE, scoreAtDepth } from '../src/engine/ai';
import { boardToString } from '../src/engine/board';
import { moveToString, Position } from '../src/engine/position';
import { createRng } from '../src/engine/random';
import { generateSetup } from '../src/engine/setup';
import type { LegalMove } from '../src/engine/types';

export interface Puzzle {
  id: string;
  kind: 'double-1' | 'mate-1' | 'win-2';
  board: string;
  turn: 'w' | 'b';
  solution: string;
  /** Number of pieces on the board, as a rough difficulty proxy. */
  pieces: number;
}

const perKind = Number(process.argv[2] ?? 25);
const baseSeed = Number(process.argv[3] ?? 1000);
const win2Count = Math.min(perKind, Number(process.argv[4] ?? 12));
const found: Record<Puzzle['kind'], Puzzle[]> = { 'double-1': [], 'mate-1': [], 'win-2': [] };
const seen = new Set<string>();
const MATE_WINDOW = MATE - 10;

function winningMoves(pos: Position, legal: LegalMove[], kind: 'both-in-check' | 'checkmate'): LegalMove[] {
  const out: LegalMove[] = [];
  for (const m of legal) {
    pos.makeMove(m);
    const r = pos.result();
    pos.unmakeMove();
    if (r.kind === kind) out.push(m);
  }
  return out;
}

function record(kind: Puzzle['kind'], pos: Position, solution: string) {
  const cap = kind === 'win-2' ? win2Count : perKind;
  const key = `${boardToString(pos.board)} ${pos.turn}`;
  if (seen.has(key) || found[kind].length >= cap) return;
  seen.add(key);
  const pieces = pos.board.filter(Boolean).length;
  found[kind].push({ id: `${kind}-${found[kind].length + 1}`, kind, board: boardToString(pos.board), turn: pos.turn, solution, pieces });
}

/** Unique first move that forces a win within three plies, or null. Mate-only search windows keep this fast. */
function uniqueWinInTwo(pos: Position, legal: LegalMove[]): string | null {
  const score = scoreAtDepth(pos, 3, 400, MATE_WINDOW, INF);
  if (score === null || score < MATE_WINDOW) return null;
  let winners = 0;
  let winner = '';
  for (const m of legal) {
    pos.makeMove(m);
    const reply = scoreAtDepth(pos, 2, 200, -INF, -MATE_WINDOW);
    pos.unmakeMove();
    if (reply !== null && reply <= -MATE_WINDOW) {
      winners++;
      winner = moveToString(m);
      if (winners > 1) return null;
    }
  }
  return winners === 1 ? winner : null;
}

const done = () => found['double-1'].length >= perKind && found['mate-1'].length >= perKind && found['win-2'].length >= win2Count;
const counts = () => JSON.stringify(Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v.length])));

for (let seed = baseSeed; !done() && seed < baseSeed + 20000; seed++) {
  const rng = createRng(seed);
  const pos = new Position(generateSetup({ mode: rng.next() < 0.5 ? 'fair' : 'chaos', seed }).board);
  for (let ply = 0; ply < 40 && !done(); ply++) {
    const legal = pos.legalMoves();
    const res = pos.result(legal);
    if (res.kind !== 'ongoing') break;

    // Immediate wins: require exactly one winning move so the puzzle has a unique answer.
    const doubles = winningMoves(pos, legal, 'both-in-check');
    const mates = winningMoves(pos, legal, 'checkmate');
    if (doubles.length === 1 && mates.length === 0 && ply >= 4) record('double-1', pos, moveToString(doubles[0]));
    else if (mates.length === 1 && doubles.length === 0 && ply >= 4) record('mate-1', pos, moveToString(mates[0]));
    else if (doubles.length === 0 && mates.length === 0 && ply >= 6 && found['win-2'].length < win2Count && rng.next() < 0.3) {
      const winner = uniqueWinInTwo(pos, legal);
      if (winner) record('win-2', pos, winner);
    }

    // Advance with a mostly sensible move so positions look like real games.
    if (doubles.length || mates.length) break;
    const pick = rng.next() < 0.7 ? chooseMove(pos, 'easy', seed + ply)?.move : rng.pick(legal);
    if (!pick) break;
    pos.makeMove(pick);
  }
  if (seed % 20 === 0) console.error(`seed ${seed}: ${counts()}`);
}

const puzzles = [...found['double-1'], ...found['mate-1'], ...found['win-2']];
writeFileSync('assets/puzzles.json', JSON.stringify(puzzles, null, 1));
console.error(`wrote ${puzzles.length} puzzles: ${counts()}`);
