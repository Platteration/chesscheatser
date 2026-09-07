import { boardFromString } from '../engine/board';
import { moveToString, Position } from '../engine/position';
import type { Color, LegalMove } from '../engine/types';

export type PuzzleKind = 'double-1' | 'mate-1' | 'win-2';

export interface Puzzle {
  id: string;
  kind: PuzzleKind;
  board: string;
  turn: Color;
  solution: string;
  pieces: number;
}

export const PUZZLE_KIND_LABEL: Record<PuzzleKind, { title: string; goal: string }> = {
  'double-1': { title: 'Double check', goal: 'Put both enemy kings in check with one move.' },
  'mate-1': { title: 'Mate in one', goal: 'Checkmate one of the enemy kings in one move.' },
  'win-2': { title: 'Win in two', goal: 'Force a win in two moves against any defence.' },
};

export function loadPuzzles(): Puzzle[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../../assets/puzzles.json') as Puzzle[];
}

export function puzzlePosition(p: Puzzle): Position {
  return new Position(boardFromString(p.board), p.turn);
}

/** Is `move` a correct first move for the puzzle? One-movers accept any move that reaches the goal. */
export function isSolution(p: Puzzle, pos: Position, move: LegalMove): boolean {
  if (p.kind === 'win-2') return moveToString(move) === p.solution;
  pos.makeMove(move);
  const r = pos.result();
  pos.unmakeMove();
  return p.kind === 'double-1' ? r.kind === 'both-in-check' : r.kind === 'checkmate';
}

export interface PuzzleProgress {
  solved: string[];
}

export const EMPTY_PUZZLE_PROGRESS: PuzzleProgress = { solved: [] };
