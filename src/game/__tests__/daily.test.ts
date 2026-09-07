import { describe, expect, it } from 'vitest';
import { dailySeed, EMPTY_DAILY, liveStreak, recordDaily, shareText, todayKey } from '../daily';

describe('daily challenge', () => {
  it('derives a stable seed from the date', () => {
    expect(dailySeed('2026-09-07')).toBe(dailySeed('2026-09-07'));
    expect(dailySeed('2026-09-07')).not.toBe(dailySeed('2026-09-08'));
    expect(todayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('tracks streaks across consecutive days and keeps the first result', () => {
    let s = recordDaily(EMPTY_DAILY, { date: '2026-09-05', outcome: 'win', moves: 30, cheatsCaught: 1, cheatsMissed: 0, falseAccusations: 0 });
    s = recordDaily(s, { date: '2026-09-06', outcome: 'loss', moves: 20, cheatsCaught: 0, cheatsMissed: 1, falseAccusations: 2 });
    expect(s.streak).toBe(2);
    s = recordDaily(s, { date: '2026-09-06', outcome: 'win', moves: 5, cheatsCaught: 0, cheatsMissed: 0, falseAccusations: 0 });
    expect(s.results['2026-09-06'].outcome).toBe('loss');
    s = recordDaily(s, { date: '2026-09-09', outcome: 'draw', moves: 60, cheatsCaught: 0, cheatsMissed: 0, falseAccusations: 0 });
    expect(s.streak).toBe(1);
    expect(shareText(s.results['2026-09-06'], 2)).toContain('missed: 1');
    expect(shareText(s.results['2026-09-06'], 2)).toContain('2-day streak');
  });

  it('only shows a streak that is still alive', () => {
    const s = { ...EMPTY_DAILY, streak: 5, lastPlayed: '2026-08-20' };
    expect(liveStreak(s, '2026-09-07')).toBe(0);
    expect(liveStreak(s, '2026-08-21')).toBe(5);
    expect(liveStreak(s, '2026-08-20')).toBe(5);
  });
});
