import type { GameConfig } from './config';

/** The daily challenge: everyone gets the same armies on the same day. */

export const DAILY_CONFIG: GameConfig = {
  mode: 'ai',
  difficulty: 'medium',
  material: 'fair',
  playAs: 'w',
  armySize: 'any',
  cheating: 'off',
  comeback: true,
};

/** Local calendar date as YYYY-MM-DD. */
export function todayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Deterministic 32-bit seed for a date key (FNV-1a). */
export function dailySeed(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface DailyRecord {
  date: string;
  outcome: 'win' | 'loss' | 'draw';
  moves: number;
  cheatsCaught: number;
  cheatsMissed: number;
  falseAccusations: number;
}

export interface DailyState {
  /** Results by date key. */
  results: Record<string, DailyRecord>;
  /** Consecutive days with a completed daily, ending on `lastPlayed`. */
  streak: number;
  lastPlayed: string | null;
}

export const EMPTY_DAILY: DailyState = { results: {}, streak: 0, lastPlayed: null };

export function previousDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return todayKey(new Date(y, m - 1, d - 1));
}

export function recordDaily(state: DailyState, rec: DailyRecord): DailyState {
  if (state.results[rec.date]) return state; // first result of the day stands
  const streak = state.lastPlayed === previousDay(rec.date) ? state.streak + 1 : 1;
  return { results: { ...state.results, [rec.date]: rec }, streak, lastPlayed: rec.date };
}

/** The streak as it should be displayed today: only alive if the last daily was today or yesterday. */
export function liveStreak(state: DailyState, today = todayKey()): number {
  if (state.lastPlayed === today || state.lastPlayed === previousDay(today)) return state.streak;
  return 0;
}

/** Text for the share sheet. */
export function shareText(rec: DailyRecord, streak: number): string {
  const result = rec.outcome === 'win' ? 'won 🏆' : rec.outcome === 'loss' ? 'lost 💀' : 'drew 🤝';
  const lines = [
    `Two Kings Chess · Daily ${rec.date}`,
    `I ${result} in ${rec.moves} moves.`,
    `Cheats caught: ${rec.cheatsCaught}${rec.cheatsMissed ? ` · missed: ${rec.cheatsMissed}` : ''}${rec.falseAccusations ? ` · false calls: ${rec.falseAccusations}` : ''}`,
  ];
  if (streak > 1) lines.push(`🔥 ${streak}-day streak`);
  return lines.join('\n');
}
