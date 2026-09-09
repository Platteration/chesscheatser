import { describe, expect, it } from 'vitest';
import { canUndo, reportKey } from '../flow';

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
