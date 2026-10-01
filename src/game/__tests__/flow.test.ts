import { describe, expect, it } from 'vitest';
import { EMPTY_STATS } from '../config';
import { applyOutcome, canUndo, reportKey, type GameOutcome } from '../flow';

type UndoState = Parameters<typeof canUndo>[0];

const running: UndoState = { moves: [{}, {}] as UndoState['moves'], thinking: false, flagged: null, gameOver: false };

describe('canUndo', () => {
  it('allows winding back a running game that has moves', () => {
    expect(canUndo(running)).toBe(true);
  });

  it('refuses at the start, while the computer thinks, and after a flag fall', () => {
    expect(canUndo({ ...running, moves: [] })).toBe(false);
    expect(canUndo({ ...running, thinking: true })).toBe(false);
    expect(canUndo({ ...running, flagged: 'w' })).toBe(false);
  });

  it('refuses once the game is over, so a recorded result cannot be played past', () => {
    expect(canUndo({ ...running, gameOver: true })).toBe(false);
  });
});

describe('reportKey', () => {
  /** Mirrors GameScreen's report effect: report only when the key changes. */
  function reportedOutcomes(states: { gameId: number }[]): number {
    let last: string | null = null;
    let reports = 0;
    for (const s of states) {
      const key = reportKey(s);
      if (key === last) continue;
      last = key;
      reports += 1;
    }
    return reports;
  }

  it('is the same for one game however it reaches its end', () => {
    // Resign, undo (resignation cleared, one fewer move), play on, win.
    const resigned = { gameId: 3, moves: [{}, {}, {}], resigned: 'w', flagged: null, setup: { seed: 42 } };
    const wonLater = { gameId: 3, moves: [{}, {}, {}, {}, {}], resigned: null, flagged: null, setup: { seed: 42 } };
    expect(reportKey(wonLater)).toBe(reportKey(resigned));
    expect(reportedOutcomes([resigned, wonLater])).toBe(1);
  });

  it('changes only when a new game or rematch bumps the game id', () => {
    expect(reportKey({ gameId: 4 })).not.toBe(reportKey({ gameId: 3 }));
    expect(reportedOutcomes([{ gameId: 1 }, { gameId: 1 }, { gameId: 2 }, { gameId: 2 }])).toBe(2);
  });
});

describe('applyOutcome', () => {
  const outcome: GameOutcome = {
    outcome: 'win',
    moves: 30,
    cheatsCaught: 1,
    cheatsMissed: 2,
    falseAccusations: 0,
    ownCheats: 1,
    ownCheatsCaught: 1,
    daily: null,
    ranked: null,
    maxDeficit: 640,
  };

  it('counts the game and its cheating record', () => {
    const s = applyOutcome(EMPTY_STATS, outcome);
    expect(s).toMatchObject({ gamesPlayed: 1, wins: 1, losses: 0, draws: 0, cheatsCaught: 1, cheatsMissed: 2, ownCheats: 1, ownCheatsCaught: 1 });
    expect(applyOutcome(s, { ...outcome, outcome: 'loss' })).toMatchObject({ gamesPlayed: 2, wins: 1, losses: 1 });
    expect(applyOutcome(s, { ...outcome, outcome: 'draw' })).toMatchObject({ gamesPlayed: 2, draws: 1 });
  });

  it('records how far behind you were in a game you went on to win', () => {
    expect(applyOutcome(EMPTY_STATS, outcome).biggestComeback).toBe(640);
  });

  it('keeps the largest comeback, and does not count a deficit you lost from', () => {
    const won = applyOutcome(EMPTY_STATS, outcome);
    expect(applyOutcome(won, { ...outcome, maxDeficit: 200 }).biggestComeback).toBe(640);
    expect(applyOutcome(won, { ...outcome, maxDeficit: 2000 }).biggestComeback).toBe(2000);
    expect(applyOutcome(won, { ...outcome, outcome: 'loss', maxDeficit: 5000 }).biggestComeback).toBe(640);
    expect(applyOutcome(won, { ...outcome, outcome: 'draw', maxDeficit: 5000 }).biggestComeback).toBe(640);
  });

  it('starts from zero when the stored record predates the field', () => {
    const legacy = { ...EMPTY_STATS, biggestComeback: undefined as unknown as number };
    expect(applyOutcome(legacy, { ...outcome, maxDeficit: 300 }).biggestComeback).toBe(300);
    expect(applyOutcome(legacy, { ...outcome, outcome: 'loss' }).biggestComeback).toBe(0);
  });
});
