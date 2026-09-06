import type { Difficulty } from '../engine/ai';
import type { MaterialMode } from '../engine/setup';
import type { Color, Move } from '../engine/types';

export type GameMode = 'ai' | 'local';
export type PlayAs = 'w' | 'b' | 'random';
export type ArmySize = 'small' | 'medium' | 'full' | 'any';

export interface GameConfig {
  mode: GameMode;
  difficulty: Difficulty;
  material: MaterialMode;
  playAs: PlayAs;
  armySize: ArmySize;
}

export const DEFAULT_CONFIG: GameConfig = {
  mode: 'ai',
  difficulty: 'medium',
  material: 'fair',
  playAs: 'random',
  armySize: 'any',
};

export const ARMY_SIZES: Record<ArmySize, { label: string; min: number; max: number }> = {
  small: { label: 'Small', min: 6, max: 9 },
  medium: { label: 'Medium', min: 9, max: 12 },
  full: { label: 'Full', min: 12, max: 16 },
  any: { label: 'Any', min: 6, max: 16 },
};

/** Everything needed to rebuild an in-progress game. */
export interface SavedGame {
  config: GameConfig;
  seed: number;
  humanColor: Color;
  moves: Move[];
}

export interface Stats {
  wins: number;
  losses: number;
  draws: number;
}

export const EMPTY_STATS: Stats = { wins: 0, losses: 0, draws: 0 };
