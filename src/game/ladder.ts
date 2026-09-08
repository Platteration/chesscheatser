import type { Difficulty } from '../engine/ai';
import type { CheatLevel } from '../engine/cheat';
import type { GameConfig } from './config';

/**
 * Ranked ladder: win to climb, lose to drop. Rank drives the computer's
 * strength, how much it cheats, and how much material it gets relative to you.
 */
export interface LadderState {
  rank: number;
  best: number;
  games: number;
}

export const EMPTY_LADDER: LadderState = { rank: 1, best: 1, games: 0 };

export interface LadderParams {
  difficulty: Difficulty;
  cheating: CheatLevel;
  /** Computer army value as a multiple of yours. */
  handicap: number;
  label: string;
}

export function ladderParams(rank: number): LadderParams {
  const r = Math.max(1, rank);
  const difficulty: Difficulty = r <= 5 ? 'easy' : r <= 14 ? 'medium' : 'hard';
  const cheating: CheatLevel = r <= 3 ? 'off' : r <= 11 ? 'low' : 'high';
  const handicap = Math.min(3, Math.round((0.7 + (r - 1) * 0.06) * 100) / 100);
  const label =
    handicap < 0.95 ? 'You have the bigger army' : handicap <= 1.05 ? 'Even armies' : `Computer has ${Math.round((handicap - 1) * 100)}% more material`;
  return { difficulty, cheating, handicap, label };
}

export function ladderConfig(rank: number): GameConfig {
  const p = ladderParams(rank);
  return { mode: 'ai', difficulty: p.difficulty, material: 'handicap', playAs: 'w', armySize: 'any', cheating: p.cheating, comeback: true, doubleCheck: 'answer' };
}

export function applyLadderResult(state: LadderState, outcome: 'win' | 'loss' | 'draw'): LadderState {
  const rank = outcome === 'win' ? state.rank + 1 : outcome === 'loss' ? Math.max(1, state.rank - 1) : state.rank;
  return { rank, best: Math.max(state.best, rank), games: state.games + 1 };
}
