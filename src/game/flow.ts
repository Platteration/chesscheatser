import type { Stats } from './config';
import type { GameState } from './useGame';

/**
 * Undo is offered while a game is still running. A finished game must not be
 * wound back: its result has already been reported (and applied to stats and
 * the ladder), so playing on from an undone finish would record a second
 * outcome for the same game.
 */
export function canUndo(state: Pick<GameState, 'moves' | 'thinking' | 'flagged' | 'gameOver'>): boolean {
  return state.moves.length > 0 && !state.thinking && state.flagged === null && !state.gameOver;
}

/**
 * Identity of the finished game an outcome belongs to, used to report it
 * exactly once. It is deliberately the game id alone — `reset()` bumps that on
 * every new game and rematch, which is the only boundary that starts a new
 * result. Anything that can change within one game (the move count, a cleared
 * resignation) would let a single game report twice.
 */
export function reportKey(state: Pick<GameState, 'gameId'>): string {
  return String(state.gameId);
}

/** What a finished game against the computer contributes to the stored record. */
export interface GameOutcome {
  outcome: 'win' | 'loss' | 'draw';
  moves: number;
  cheatsCaught: number;
  cheatsMissed: number;
  falseAccusations: number;
  ownCheats: number;
  ownCheatsCaught: number;
  daily: string | null;
  ranked: number | null;
  /** Largest blended deficit (centipawns) the human was at during the game. */
  maxDeficit: number;
}

/**
 * Folds one finished game into the stored stats. `biggestComeback` only moves
 * on a win: it is how far behind you were in a game you went on to win, so a
 * deficit in a game you lost is not a comeback.
 */
export function applyOutcome(stats: Stats, o: GameOutcome): Stats {
  const comeback = stats.biggestComeback > 0 ? stats.biggestComeback : 0;
  return {
    ...stats,
    wins: stats.wins + (o.outcome === 'win' ? 1 : 0),
    losses: stats.losses + (o.outcome === 'loss' ? 1 : 0),
    draws: stats.draws + (o.outcome === 'draw' ? 1 : 0),
    cheatsCaught: stats.cheatsCaught + o.cheatsCaught,
    cheatsMissed: stats.cheatsMissed + o.cheatsMissed,
    falseAccusations: stats.falseAccusations + o.falseAccusations,
    ownCheats: stats.ownCheats + o.ownCheats,
    ownCheatsCaught: stats.ownCheatsCaught + o.ownCheatsCaught,
    gamesPlayed: stats.gamesPlayed + 1,
    biggestComeback: o.outcome === 'win' ? Math.max(comeback, Math.max(0, o.maxDeficit)) : comeback,
  };
}
