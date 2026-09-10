import { describe, expect, it } from 'vitest';
import {
  AURAS,
  COSMETICS,
  cosmeticsOfKind,
  DEFAULT_AURA,
  describeEarn,
  earnProgress,
  unlockedCosmetics,
  type Progress,
} from '../cosmetics';
import { EMPTY_STATS } from '../game/config';
import { EMPTY_DAILY, todayKey } from '../game/daily';
import { EMPTY_LADDER } from '../game/ladder';

const blank: Progress = { stats: EMPTY_STATS, daily: EMPTY_DAILY, ladder: EMPTY_LADDER, puzzlesSolved: 0 };

describe('cosmetics catalogue', () => {
  it('offers a free option of every kind, so nothing is paywalled outright', () => {
    for (const kind of ['aura', 'board', 'pieces'] as const) {
      const of = cosmeticsOfKind(kind);
      expect(of.length).toBeGreaterThan(0);
      expect(of.some((c) => c.free)).toBe(true);
    }
    expect(unlockedCosmetics(blank, []).has(DEFAULT_AURA)).toBe(true);
  });

  it('gives every paid cosmetic a way to earn it instead', () => {
    for (const c of COSMETICS) {
      if (c.free) continue;
      expect(c.product, `${c.id} should belong to a pack`).toBeDefined();
      expect(c.earn, `${c.id} should be earnable by playing`).toBeDefined();
      expect(describeEarn(c.earn!).length).toBeGreaterThan(0);
    }
  });

  it('has a palette for every aura in the catalogue', () => {
    for (const c of cosmeticsOfKind('aura')) expect(AURAS[c.id]).toBeDefined();
  });

  it('locks paid cosmetics for a new player and unlocks them by playing', () => {
    const fresh = unlockedCosmetics(blank, []);
    expect(fresh.has('slate')).toBe(false);
    expect(fresh.has('classic')).toBe(false);

    // Five wins earns the Slate board, and nothing else.
    const withWins: Progress = { ...blank, stats: { ...EMPTY_STATS, wins: 5 } };
    const afterWins = unlockedCosmetics(withWins, []);
    expect(afterWins.has('slate')).toBe(true);
    expect(afterWins.has('neon')).toBe(false);

    // Ten solved puzzles earns the classic pieces.
    expect(unlockedCosmetics({ ...blank, puzzlesSolved: 10 }, []).has('classic')).toBe(true);
    expect(unlockedCosmetics({ ...blank, puzzlesSolved: 9 }, []).has('classic')).toBe(false);

    // A comeback win earns the Embers aura.
    const oneComeback: Progress = { ...blank, stats: { ...EMPTY_STATS, comebackWins: 1 } };
    expect(unlockedCosmetics(oneComeback, []).has('aura.embers')).toBe(true);
    expect(unlockedCosmetics(oneComeback, []).has('aura.static')).toBe(false);
  });

  it('uses the best ladder rank ever reached, not the current one', () => {
    const dropped: Progress = { ...blank, ladder: { rank: 1, best: 6, games: 20 } };
    expect(unlockedCosmetics(dropped, []).has('neon')).toBe(true);
  });

  it('counts a daily streak only while it is still alive', () => {
    const today = todayKey();
    const alive: Progress = { ...blank, daily: { results: {}, streak: 3, lastPlayed: today } };
    expect(unlockedCosmetics(alive, []).has('aura.frost')).toBe(true);
    const lapsed: Progress = { ...blank, daily: { results: {}, streak: 3, lastPlayed: '2020-01-01' } };
    expect(unlockedCosmetics(lapsed, []).has('aura.frost')).toBe(false);
  });

  it('unlocks a pack by purchase without unlocking the others', () => {
    const boards = unlockedCosmetics(blank, ['pack.boards']);
    expect(boards.has('slate')).toBe(true);
    expect(boards.has('neon')).toBe(true);
    expect(boards.has('classic')).toBe(false);
    expect(boards.has('aura.embers')).toBe(false);
  });

  it('unlocks everything for a supporter', () => {
    const all = unlockedCosmetics(blank, ['supporter']);
    for (const c of COSMETICS) expect(all.has(c.id)).toBe(true);
  });

  it('reports earn progress without ever exceeding what is needed', () => {
    const c = COSMETICS.find((x) => x.id === 'slate')!;
    expect(earnProgress(c.earn!, blank)).toEqual({ have: 0, need: 5 });
    const far: Progress = { ...blank, stats: { ...EMPTY_STATS, wins: 99 } };
    const { have, need } = earnProgress(c.earn!, far);
    expect(have).toBeGreaterThanOrEqual(need);
  });
});
