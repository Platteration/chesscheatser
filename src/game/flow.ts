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
