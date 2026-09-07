import type { Difficulty } from '../engine/ai';
import type { CheatLevel } from '../engine/cheat';
import type { MaterialMode } from '../engine/setup';
import type { Color } from '../engine/types';
import type { GameEvent } from './events';

export type GameMode = 'ai' | 'local';
export type PlayAs = 'w' | 'b' | 'random';
export type ArmySize = 'small' | 'medium' | 'full' | 'any';

export interface GameConfig {
  mode: GameMode;
  difficulty: Difficulty;
  material: MaterialMode;
  playAs: PlayAs;
  armySize: ArmySize;
  /** How often the computer plays an illegal move it hopes you will miss. */
  cheating: CheatLevel;
  /** Minutes per side for pass-and-play; 0 = no clock. */
  clock?: ClockMinutes;
  /** Whether the human may play one illegal move per game (the computer may notice). */
  playerCheats?: boolean;
}

export type ClockMinutes = 0 | 1 | 3 | 5 | 10;

export const DEFAULT_CONFIG: GameConfig = {
  mode: 'ai',
  difficulty: 'medium',
  material: 'fair',
  playAs: 'random',
  armySize: 'any',
  cheating: 'low',
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
  events: GameEvent[];
  /** Date key when this is the daily challenge. */
  daily?: string;
  /** Ladder rank when this is a ranked game. */
  ranked?: number;
  /** Remaining clock time per side in ms, when a clock is in use. */
  clocks?: Record<Color, number>;
  /** Handicap ratio the armies were generated with (ranked games and their rematches). */
  handicap?: number;
}

export interface Stats {
  wins: number;
  losses: number;
  draws: number;
}

export const EMPTY_STATS: Stats = { wins: 0, losses: 0, draws: 0 };
