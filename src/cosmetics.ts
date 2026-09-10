import type { Stats } from './game/config';
import { liveStreak, type DailyState } from './game/daily';
import type { LadderState } from './game/ladder';

/**
 * Cosmetics are the only thing this game sells, and every one of them can also
 * be earned by playing. Buying is a shortcut for people who want it now, never
 * a wall: nothing here touches how the computer plays or what moves are legal.
 */

export type ProductId = 'supporter' | 'pack.auras' | 'pack.boards' | 'pack.pieces';
export type CosmeticKind = 'aura' | 'board' | 'pieces';

/** Something you did in the app that unlocks a cosmetic. */
export type EarnCondition =
  | { type: 'wins'; n: number }
  | { type: 'comebacks'; n: number }
  | { type: 'ladderRank'; n: number }
  | { type: 'dailyStreak'; n: number }
  | { type: 'puzzles'; n: number };

export interface Cosmetic {
  id: string;
  kind: CosmeticKind;
  label: string;
  /** Available to everyone from the start. */
  free?: boolean;
  /** The pack that includes it. */
  product?: ProductId;
  /** How to earn it by playing instead. */
  earn?: EarnCondition;
}

/**
 * Comeback auras recolour the frame and meter that appear when a side has
 * drafted powers, so they decorate the game's signature moment.
 */
export const AURAS: Record<string, { label: string; dark: string; light: string }> = {
  'aura.violet': { label: 'Violet', dark: '#c07be8', light: '#8a3fc4' },
  'aura.embers': { label: 'Embers', dark: '#ff8a4c', light: '#c2410c' },
  'aura.frost': { label: 'Frost', dark: '#67d8ef', light: '#0e7490' },
  'aura.static': { label: 'Static', dark: '#9ae66e', light: '#3f7d20' },
  'aura.gold': { label: 'Gold leaf', dark: '#f2c14e', light: '#a97a12' },
};

export const DEFAULT_AURA = 'aura.violet';

export const COSMETICS: readonly Cosmetic[] = [
  // Auras
  { id: 'aura.violet', kind: 'aura', label: 'Violet', free: true },
  { id: 'aura.embers', kind: 'aura', label: 'Embers', product: 'pack.auras', earn: { type: 'comebacks', n: 1 } },
  { id: 'aura.frost', kind: 'aura', label: 'Frost', product: 'pack.auras', earn: { type: 'dailyStreak', n: 3 } },
  { id: 'aura.static', kind: 'aura', label: 'Static', product: 'pack.auras', earn: { type: 'comebacks', n: 5 } },
  { id: 'aura.gold', kind: 'aura', label: 'Gold leaf', product: 'pack.auras', earn: { type: 'ladderRank', n: 10 } },
  // Boards
  { id: 'wood', kind: 'board', label: 'Wood', free: true },
  { id: 'tournament', kind: 'board', label: 'Green', free: true },
  { id: 'marble', kind: 'board', label: 'Marble', free: true },
  { id: 'slate', kind: 'board', label: 'Slate', product: 'pack.boards', earn: { type: 'wins', n: 5 } },
  { id: 'neon', kind: 'board', label: 'Neon', product: 'pack.boards', earn: { type: 'ladderRank', n: 6 } },
  // Piece styles
  { id: 'solid', kind: 'pieces', label: 'Solid', free: true },
  { id: 'classic', kind: 'pieces', label: 'Classic print', product: 'pack.pieces', earn: { type: 'puzzles', n: 10 } },
];

/** Everything the unlock rules read, all of it already tracked by the app. */
export interface Progress {
  stats: Stats;
  daily: DailyState;
  ladder: LadderState;
  puzzlesSolved: number;
}

/** How far along an earn condition the player is. */
export function earnProgress(c: EarnCondition, p: Progress): { have: number; need: number } {
  switch (c.type) {
    case 'wins':
      return { have: p.stats.wins, need: c.n };
    case 'comebacks':
      return { have: p.stats.comebackWins, need: c.n };
    case 'ladderRank':
      return { have: p.ladder.best, need: c.n };
    case 'dailyStreak':
      return { have: Math.max(liveStreak(p.daily), 0), need: c.n };
    case 'puzzles':
      return { have: p.puzzlesSolved, need: c.n };
  }
}

export function describeEarn(c: EarnCondition): string {
  switch (c.type) {
    case 'wins':
      return `Win ${c.n} games`;
    case 'comebacks':
      return c.n === 1 ? 'Win a game from 3.5 behind' : `Win ${c.n} games from 3.5 behind`;
    case 'ladderRank':
      return `Reach ladder rank ${c.n}`;
    case 'dailyStreak':
      return `Keep a ${c.n}-day daily streak`;
    case 'puzzles':
      return `Solve ${c.n} puzzles`;
  }
}

/** Everything the player may use right now, whether earned or bought. */
export function unlockedCosmetics(p: Progress, owned: readonly ProductId[]): Set<string> {
  const out = new Set<string>();
  const supporter = owned.includes('supporter');
  for (const c of COSMETICS) {
    if (c.free || supporter) {
      out.add(c.id);
      continue;
    }
    if (c.product && owned.includes(c.product)) {
      out.add(c.id);
      continue;
    }
    if (c.earn) {
      const { have, need } = earnProgress(c.earn, p);
      if (have >= need) out.add(c.id);
    }
  }
  return out;
}

export const cosmeticsOfKind = (kind: CosmeticKind): Cosmetic[] => COSMETICS.filter((c) => c.kind === kind);
