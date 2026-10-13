import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, drawnCosmetics, type CosmeticChoice } from '../appSettings';
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

describe('what is drawn', () => {
  const chosen: CosmeticChoice = { boardTheme: 'neon', pieceStyle: 'classic', aura: 'aura.embers' };
  const defaults: CosmeticChoice = { boardTheme: DEFAULT_SETTINGS.boardTheme, pieceStyle: DEFAULT_SETTINGS.pieceStyle, aura: DEFAULT_SETTINGS.aura };

  it('is every choice as it stands where the store keeps its record on the device', () => {
    // The local store, every phone and a site with no backend: the record of what was bought is
    // the device's, and nothing between the choice and the board second-guesses it.
    expect(drawnCosmetics(chosen, null)).toEqual(chosen);
  });

  it("is each choice while it is unlocked, and that choice's default once it is not", () => {
    // The website's shop: a purchase refunded, signed out of or deleted with the account, or a
    // preview chosen on the device before the shop was on, is no longer drawn.
    expect(drawnCosmetics(chosen, unlockedCosmetics(blank, []))).toEqual(defaults);
    expect(drawnCosmetics(chosen, unlockedCosmetics(blank, ['pack.boards']))).toEqual({ ...defaults, boardTheme: 'neon' });
    expect(drawnCosmetics(chosen, unlockedCosmetics(blank, ['pack.pieces']))).toEqual({ ...defaults, pieceStyle: 'classic' });
    expect(drawnCosmetics(chosen, unlockedCosmetics(blank, ['pack.auras']))).toEqual({ ...defaults, aura: 'aura.embers' });
    expect(drawnCosmetics(chosen, unlockedCosmetics(blank, ['supporter']))).toEqual(chosen);
    // Earned by playing counts as much as bought.
    const earned: Progress = { ...blank, stats: { ...EMPTY_STATS, comebackWins: 1 }, ladder: { rank: 6, best: 6, games: 20 } };
    expect(drawnCosmetics(chosen, unlockedCosmetics(earned, []))).toEqual({ ...defaults, boardTheme: 'neon', aura: 'aura.embers' });
    // Each free choice is drawn whatever is owned, and every default is one of them.
    const free = { boardTheme: 'marble', pieceStyle: 'solid', aura: 'aura.violet' } as const;
    expect(drawnCosmetics(free, unlockedCosmetics(blank, []))).toEqual(free);
    for (const id of Object.values(defaults)) expect(COSMETICS.find((c) => c.id === id)?.free, id).toBe(true);
  });

  it('is what the board, the pieces and the aura are drawn from, never the stored record', () => {
    // theme.ts reads the drawn choice for the board and the aura, and PieceGlyph for the pieces;
    // only the home screen's pickers, which show and change the choice, read the record's.
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const sources: string[] = ['App.tsx'];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__') walk(path);
        } else if (/\.tsx?$/.test(entry.name)) sources.push(path);
      }
    };
    walk('src');
    const readers = sources.filter((f) => /settings\.(boardTheme|pieceStyle|aura)\b/.test(readFileSync(join(root, f), 'utf8')));
    expect(readers.sort()).toEqual(['src/ui/HomeScreen.tsx']);
    expect(readFileSync(join(root, 'src/ui/theme.ts'), 'utf8')).toMatch(/drawnCosmetics\(settings, unlocked\)/);
    expect(readFileSync(join(root, 'src/ui/PieceGlyph.tsx'), 'utf8')).toMatch(/= useDrawnCosmetics\(\)/);
  });
});
