import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARMY_SIZES, DEFAULT_CONFIG, EMPTY_STATS } from '../game/config';
import { EMPTY_LADDER } from '../game/ladder';
import { fold, replayablePrefix, type GameEvent } from '../game/events';
import { recordDaily, todayKey } from '../game/daily';
import { generateSetup } from '../engine/setup';
import { Position } from '../engine/position';
import { stripMove } from '../game/events';
import { MAX_POWER } from '../engine/powers';
import { PASS_MOVE, type Color } from '../engine/types';
import type { Setup } from '../engine/setup';
import type { AppSettings } from '../settings';
import { STORAGE_KEYS } from '../storage';
import {
  checkSavedGame,
  cleanConfig,
  cleanDaily,
  cleanEntitlements,
  cleanLadder,
  cleanPuzzleProgress,
  cleanSavedGame,
  cleanSettings,
  cleanStats,
  MAX_EVENTS,
  savedGameNote,
} from '../validate';

/** Ids of the puzzles the app actually bundles, so the cap cannot be set below the real set. */
const puzzleIds: string[] = JSON.parse(readFileSync(new URL('../../assets/puzzles.json', import.meta.url), 'utf8')).map(
  (p: { id: string }) => p.id,
);

/** Board theme ids as the theme table actually declares them (it cannot be imported: it pulls in React Native). */
const themeSource = readFileSync(new URL('../ui/theme.ts', import.meta.url), 'utf8');
const boardThemeIds = [...themeSource.slice(themeSource.indexOf('BOARD_THEMES')).matchAll(/^ {2}(\w+): \{ label:/gm)].map((m) => m[1]);

const SETTINGS: AppSettings = {
  colorScheme: 'light',
  boardTheme: 'slate',
  pieceStyle: 'classic',
  sounds: false,
  haptics: false,
  seenIntro: true,
};

describe('cleanConfig', () => {
  it('fills in a config a previous build never wrote', () => {
    expect(cleanConfig({ mode: 'ai', difficulty: 'hard' })).toEqual({ ...DEFAULT_CONFIG, difficulty: 'hard' });
  });

  it('clamps every unknown value to the default instead of passing it on', () => {
    const c = cleanConfig({
      mode: 'network',
      difficulty: 'impossible',
      material: 'lopsided',
      playAs: 'green',
      armySize: 'enormous',
      cheating: 'always',
      doubleCheck: 'ignore',
      comeback: 'yes',
    });
    expect(c).toEqual(DEFAULT_CONFIG);
    // The crash this exists to stop: an army size that is not in the table.
    expect(ARMY_SIZES[c.armySize]).toBeDefined();
  });

  it('keeps the optional fields only when they are usable', () => {
    expect(cleanConfig({ clock: 5, playerCheats: true }).clock).toBe(5);
    expect(cleanConfig({ clock: 7 }).clock).toBe(0);
    expect(cleanConfig({ playerCheats: 'sure' }).playerCheats).toBe(false);
    expect(cleanConfig({}).clock).toBeUndefined();
  });

  it('survives a record that is not an object at all', () => {
    expect(cleanConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(cleanConfig('wat')).toEqual(DEFAULT_CONFIG);
    expect(cleanConfig([1, 2])).toEqual(DEFAULT_CONFIG);
  });
});

describe('cleanSavedGame', () => {
  const good = { config: { ...DEFAULT_CONFIG, armySize: 'small' }, seed: 7, humanColor: 'w', events: [{ type: 'pass' }] };

  it('keeps a usable record, including its optional fields', () => {
    const g = cleanSavedGame({ ...good, daily: '2026-01-02', ranked: 4, handicap: 1.2, clocks: { w: 1000, b: 900 } })!;
    expect(g.config.armySize).toBe('small');
    expect(g.seed).toBe(7);
    expect(g.events).toHaveLength(1);
    expect(g).toMatchObject({ daily: '2026-01-02', ranked: 4, handicap: 1.2, clocks: { w: 1000, b: 900 } });
  });

  it('rebuilds a record saved before comeback and double check existed, so the setup still generates', () => {
    // What a pre-comeback build wrote: no comeback/doubleCheck, and here no config at all.
    const stored = JSON.parse('{"seed":11,"humanColor":"b","events":[]}');
    const g = cleanSavedGame(stored)!;
    expect(g).not.toBeNull();
    const size = ARMY_SIZES[g.config.armySize];
    expect(size).toBeDefined();
    expect(() =>
      generateSetup({ mode: g.config.material, seed: g.seed, minPieces: size.min, maxPieces: size.max }),
    ).not.toThrow();
  });

  it('drops a record that cannot be replayed rather than crashing Resume', () => {
    expect(cleanSavedGame(null)).toBeNull();
    expect(cleanSavedGame('{}')).toBeNull();
    expect(cleanSavedGame({ ...good, seed: 'seven' })).toBeNull();
    expect(cleanSavedGame({ ...good, seed: Number.NaN })).toBeNull();
    expect(cleanSavedGame({ ...good, humanColor: 'q' })).toBeNull();
    expect(cleanSavedGame({ ...good, events: 'none' })).toBeNull();
    expect(cleanSavedGame({ ...good, events: [{ type: 'teleport' }] })).toBeNull();
    expect(cleanSavedGame({ ...good, events: [null] })).toBeNull();
  });

  it('ignores a half-written clock rather than resuming with one side on NaN', () => {
    expect(cleanSavedGame({ ...good, clocks: { w: 1000 } })!.clocks).toBeUndefined();
    expect(cleanSavedGame({ ...good, clocks: 'gone' })!.clocks).toBeUndefined();
  });

  it('drops a move that leaves the board, which the engine would otherwise grow the board array to fit', () => {
    // 113 bytes of stored JSON: makeMove writes board[m.to] unchecked, so one
    // event stretches the board to ten million entries and every later snapshot
    // and captured-piece tally walks the holes. Nothing throws, so the record stays.
    const hostile = JSON.parse('{"seed":1234,"humanColor":"w","config":{},"events":[{"type":"move","move":{"from":0,"to":10000000,"piece":"r"}}]}');
    expect(cleanSavedGame(hostile)).toBeNull();
    for (const move of [
      { from: 0, to: 64, piece: 'r' },
      { from: 0, to: -1, piece: 'r' },
      { from: 64, to: 0, piece: 'r' },
      { from: -2, to: 0, piece: 'r' },
      { from: 0.5, to: 1, piece: 'r' },
      { from: 0, to: 1, piece: 'rook' },
      { from: 0, to: 1, piece: 'r', promotion: 'duck' },
      { from: 0, to: 1, piece: 'r', cheat: 'teleport' },
      { from: 0, to: 1, piece: 'r', enPassant: 'yes' },
    ]) {
      expect(cleanSavedGame({ ...good, events: [{ type: 'move', move }] })).toBeNull();
    }
  });

  it('keeps a move the game itself would write, and replays it on a board that is still 64 squares', () => {
    // The bound the engine actually has, taken from the board rather than from
    // the validator: whatever is accepted has to replay without resizing it.
    const size = ARMY_SIZES[DEFAULT_CONFIG.armySize];
    const setup = generateSetup({ mode: DEFAULT_CONFIG.material, seed: 7, minPieces: size.min, maxPieces: size.max });
    const move = stripMove(new Position(setup.board).legalMoves()[0]);
    const g = cleanSavedGame({ seed: 7, humanColor: 'w', config: DEFAULT_CONFIG, events: [{ type: 'move', move }] })!;
    expect(g.events).toEqual([{ type: 'move', move }]);
    expect(fold(setup, g.events, 'b').pos.board.length).toBe(setup.board.length);
  });

  it('bounds an event list no game could produce, and says how much it dropped', () => {
    // The cap is a bound on what the replay is handed, not a judgement about
    // whose game it is: a record past it keeps everything up to the cap and
    // reports the rest, because the old behaviour — delete the whole record,
    // show nothing — lost a long game without a word at one event past it.
    const absurd = Array.from({ length: 100_000 }, () => ({ type: 'pass' }));
    const clipped = checkSavedGame({ ...good, events: absurd });
    expect(clipped.game!.events).toHaveLength(MAX_EVENTS);
    expect(clipped.dropped).toBe(100_000 - MAX_EVENTS);
    const justOver = checkSavedGame({ ...good, events: Array.from({ length: MAX_EVENTS + 1 }, () => ({ type: 'pass' })) });
    expect(justOver.game).not.toBeNull();
    expect(justOver.dropped).toBe(1);
    const atTheCap = checkSavedGame({ ...good, events: Array.from({ length: MAX_EVENTS }, () => ({ type: 'pass' })) });
    expect(atTheCap.game!.events).toHaveLength(MAX_EVENTS);
    expect(atTheCap.dropped).toBe(0);
    const long = Array.from({ length: 500 }, () => ({ type: 'pass' }));
    expect(cleanSavedGame({ ...good, events: long })!.events).toHaveLength(500);
  });

  it('clamps a power grant to a level the meter can draw', () => {
    // GameScreen repeats a star per level: '★'.repeat(-1) and '★'.repeat(1e9)
    // both throw RangeError mid-render, and setPower only clamps its own copy.
    const power = (level: unknown) => cleanSavedGame({ ...good, events: [{ type: 'power', color: 'w', level, material: 0, engine: 0 }] });
    for (const level of [-1, MAX_POWER + 1, 1e9, 1.5, '2', null]) expect(power(level)).toBeNull();
    const kept = power(MAX_POWER)!.events[0];
    expect(kept).toEqual({ type: 'power', color: 'w', level: MAX_POWER, material: 0, engine: 0 });
    expect(() => '★'.repeat(kept.type === 'power' ? kept.level : 0)).not.toThrow();
    expect(cleanSavedGame({ ...good, events: [{ type: 'power', color: 'green', level: 1, material: 0, engine: 0 }] })).toBeNull();
    expect(cleanSavedGame({ ...good, events: [{ type: 'power', color: 'w', level: 1, material: 'lots', engine: 0 }] })).toBeNull();
  });

  it('rebuilds a move rather than passing the stored object on', () => {
    // The rebuild is the whole mechanism: a move that is validated and then
    // handed on carries every key nobody checked. `pass` is the one that costs
    // most — it sends makeMove down the null-move branch instead of moving the
    // piece — but `checkedAfter` and anything else ride in the same way.
    const stored = { from: 8, to: 16, piece: 'p', pass: true, checkedAfter: [1], junk: 1 };
    expect(cleanSavedGame({ ...good, events: [{ type: 'move', move: stored }] })!.events[0]).toEqual({
      type: 'move',
      move: { from: 8, to: 16, piece: 'p' },
    });
    // The fields it does keep are kept exactly, so this is not just a narrower object.
    expect(
      cleanSavedGame({ ...good, events: [{ type: 'move', move: { from: 8, to: 16, piece: 'p', captured: 'q', promotion: 'n', cheat: 'jump', enPassant: true, doublePush: true, power: true } }] })!
        .events[0],
    ).toEqual({
      type: 'move',
      move: { from: 8, to: 16, piece: 'p', captured: 'q', promotion: 'n', cheat: 'jump', enPassant: true, doublePush: true, power: true },
    });
  });

  it('rebuilds an accusation rather than passing the stored object on', () => {
    expect(cleanSavedGame({ ...good, events: [{ type: 'accuse', caught: true, by: 'ai', extra: 1 }] })!.events).toEqual([
      { type: 'accuse', caught: true, by: 'ai' },
    ]);
    expect(cleanSavedGame({ ...good, events: [{ type: 'accuse', caught: 'yes' }] })).toBeNull();
    expect(cleanSavedGame({ ...good, events: [{ type: 'accuse', caught: true, by: 'human' }] })).toBeNull();
  });

  it('keeps `daily` only when it is a date key, since it is the one stored value that reaches the share sheet', () => {
    expect(cleanSavedGame({ ...good, daily: todayKey() })!.daily).toBe(todayKey());
    expect(cleanSavedGame({ ...good, daily: 'x'.repeat(5000) })!.daily).toBeUndefined();
    expect(cleanSavedGame({ ...good, daily: '2026-1-2' })!.daily).toBeUndefined();
  });
});

/**
 * A game of `n` events as the app writes them — a power grant per turn, then a
 * move — played with real legal moves, so the replay costs what a real record
 * costs. Quiet moves are preferred over captures: a game that trades everything
 * off is a short one.
 */
function longGame(n: number, seed = 5): { setup: Setup; events: GameEvent[] } {
  const setup = generateSetup({ mode: 'mirror', seed, minPieces: 14, maxPieces: 16 });
  const pos = new Position(setup.board);
  const events: GameEvent[] = [];
  let r = seed >>> 0;
  const next = () => ((r = (r * 1103515245 + 12345) >>> 0), r);
  while (events.length < n) {
    events.push({ type: 'power', color: pos.turn, level: next() % (MAX_POWER + 1), material: 0, engine: 0 });
    const legal = pos.legalMoves();
    if (!legal.length) {
      events.push({ type: 'pass' });
      pos.makeMove(PASS_MOVE);
      continue;
    }
    let move = stripMove(legal[next() % legal.length]);
    for (let tries = 0; tries < 4 && move.captured; tries++) move = stripMove(legal[next() % legal.length]);
    events.push({ type: 'move', move });
    pos.makeMove(move);
  }
  return { setup, events: events.slice(0, n) };
}

/** A whole game, played to a real finish: what the app itself would have written. */
function playedOut(seed: number): { setup: Setup; events: GameEvent[] } {
  const setup = generateSetup({ mode: 'mirror', seed, minPieces: 6, maxPieces: 8 });
  const pos = new Position(setup.board);
  const events: GameEvent[] = [];
  let r = seed >>> 0;
  const next = () => ((r = (r * 1103515245 + 12345) >>> 0), r);
  for (let ply = 0; ply < 4000; ply++) {
    const legal = pos.legalMoves();
    if (pos.result(legal).kind !== 'ongoing' || !legal.length) break;
    events.push({ type: 'power', color: pos.turn, level: 0, material: 0, engine: 0 });
    const move = stripMove(legal[next() % legal.length]);
    events.push({ type: 'move', move });
    pos.makeMove(move);
  }
  return { setup, events };
}

describe('MAX_EVENTS', () => {
  /**
   * The longest of 402 ordinary pass-and-play games measured through the app's
   * own event generation (median 180, 99th percentile 1212). The cap is checked
   * against this rather than against its own value: the first one was described
   * as "far above any real game" while sitting 1.19x above this, and a game one
   * event past it was deleted.
   */
  const LONGEST_GAME_MEASURED = 1676;

  it('leaves room above the longest game anyone has measured', () => {
    expect(MAX_EVENTS).toBeGreaterThanOrEqual(4 * LONGEST_GAME_MEASURED);
  });

  it('keeps a game played out to its finish, whole', () => {
    for (const seed of [3, 11, 29]) {
      const { setup, events } = playedOut(seed);
      expect(events.length).toBeGreaterThan(20);
      expect(() => fold(setup, events, null)).not.toThrow();
      const check = checkSavedGame({ config: DEFAULT_CONFIG, seed, humanColor: 'w', events });
      expect(check.dropped).toBe(0);
      expect(check.game!.events).toHaveLength(events.length);
      // Room for a game several times longer than the ones this actually produces.
      expect(MAX_EVENTS).toBeGreaterThan(2 * events.length);
    }
  });

  it('replays the worst record it still accepts well inside a second', () => {
    // This is what the cap is really for, so this is what pins it: a full-length
    // record, every event well formed, that stops applying early — the replay
    // has to find that out before the first frame is drawn. It is also the other
    // half of the bound. At 2000 events this cost 268-490 ms with the scan that
    // tried every shorter prefix, and 9.3 s at 8000; the binary search in
    // `replayablePrefix` costs a handful of folds instead.
    const { setup, events } = longGame(MAX_EVENTS);
    // Halfway is the worst place for it: a fold stops at the event that throws,
    // so a record that fails early is cheap however it is searched. The scan
    // this replaced paid the whole prefix for every one of the n/2 attempts.
    const at = MAX_EVENTS >> 1;
    const empty = fold(setup, events.slice(0, at), null).pos.board.findIndex((p) => p === null);
    const broken = events.slice();
    broken[at] = { type: 'move', move: { from: empty, to: (empty + 1) % 64, piece: 'r' } };
    expect(() => fold(setup, broken, null)).toThrow();

    const accepted = checkSavedGame({ config: DEFAULT_CONFIG, seed: 5, humanColor: 'w', events: broken });
    expect(accepted.game!.events).toHaveLength(MAX_EVENTS);
    const started = Date.now();
    const prefix = replayablePrefix(setup, accepted.game!.events, null);
    const ms = Date.now() - started;
    expect(prefix).toHaveLength(at);
    expect(ms).toBeLessThan(1000);
  });
});

describe('savedGameNote', () => {
  const good = { config: DEFAULT_CONFIG, seed: 7, humanColor: 'w', events: [{ type: 'pass' }] };

  it('says nothing when there was nothing to say', () => {
    expect(savedGameNote(null, checkSavedGame(null))).toBeNull();
    expect(savedGameNote(undefined, checkSavedGame(undefined))).toBeNull();
    expect(savedGameNote(good, checkSavedGame(good))).toBeNull();
  });

  it('says so when the record was removed, and when it was only clipped', () => {
    // Both of the ways a saved game can be lost used to be silent: the record
    // was removed from storage and Resume simply was not on the menu.
    const hostile = { ...good, events: [{ type: 'move', move: { from: 0, to: 10_000_000, piece: 'r' } }] };
    expect(checkSavedGame(hostile).game).toBeNull();
    expect(savedGameNote(hostile, checkSavedGame(hostile))).toMatch(/removed/);
    const tooLong = { ...good, events: Array.from({ length: MAX_EVENTS + 1 }, () => ({ type: 'pass' })) };
    expect(savedGameNote(tooLong, checkSavedGame(tooLong))).toMatch(/too long/);
  });
});

describe('cleanStats', () => {
  it('clamps every counter the stats screen reads', () => {
    // Derived from the type, so a field added to Stats cannot skip the check.
    const hostile = Object.fromEntries(Object.keys(EMPTY_STATS).map((k) => [k, null]));
    expect(cleanStats(hostile)).toEqual(EMPTY_STATS);
    expect(cleanStats({ wins: -5, losses: 1.5, gamesPlayed: 'lots' })).toEqual(EMPTY_STATS);
    expect(cleanStats({ ...EMPTY_STATS, wins: 3, gamesPlayed: 4 })).toMatchObject({ wins: 3, gamesPlayed: 4 });
    expect(cleanStats(null)).toEqual(EMPTY_STATS);
  });
});

describe('cleanDaily', () => {
  it('survives a results map that is not a map, which the home screen indexes on first render', () => {
    // HomeScreen does daily.results[today] before anything else is drawn.
    for (const raw of [{ results: null }, { results: 7 }, { results: ['x'] }, null, 'gone']) {
      expect(() => cleanDaily(raw).results[todayKey()]).not.toThrow();
      expect(cleanDaily(raw).results[todayKey()]).toBeUndefined();
    }
  });

  it('drops entries that are not results, and keys that are not dates', () => {
    const d = cleanDaily({
      // The stored record carries a date of its own that disagrees with its key:
      // with no disagreement to resolve, an implementation that trusted the
      // record would pass this too.
      results: { '2026-01-02': { date: '1999-01-01', outcome: 'win', moves: 12 }, '2026-01-03': 'won', nonsense: { outcome: 'win' } },
      streak: 2,
      lastPlayed: '2026-01-02',
    });
    expect(Object.keys(d.results)).toEqual(['2026-01-02']);
    // The record's own date comes from its key, so the share text cannot disagree with it.
    expect(d.results['2026-01-02'].date).toBe('2026-01-02');
    expect(d.results['2026-01-02']).toEqual({ date: '2026-01-02', outcome: 'win', moves: 12, cheatsCaught: 0, cheatsMissed: 0, falseAccusations: 0 });
    expect(d).toMatchObject({ streak: 2, lastPlayed: '2026-01-02' });
    expect(cleanDaily({ streak: -1, lastPlayed: 'never' })).toMatchObject({ streak: 0, lastPlayed: null });
  });

  it('rebuilds results without a prototype, so recordDaily cannot read a day back off Object.prototype', () => {
    // recordDaily tests `state.results[rec.date]` to see whether today is played:
    // on a plain object every inherited name answers that truthily.
    const d = cleanDaily({ results: {} });
    expect(d.results['toString']).toBeUndefined();
    expect(d.results['constructor']).toBeUndefined();
    const rec = { date: 'toString', outcome: 'win', moves: 1, cheatsCaught: 0, cheatsMissed: 0, falseAccusations: 0 } as const;
    expect(recordDaily(d, rec).results['toString']).toEqual(rec);
  });
});

describe('cleanLadder', () => {
  it('clamps a rank the ladder cannot have', () => {
    expect(cleanLadder({ rank: null, best: null, games: null })).toEqual(EMPTY_LADDER);
    expect(cleanLadder({ rank: 0 })).toMatchObject({ rank: EMPTY_LADDER.rank });
    expect(cleanLadder({ rank: -9, best: -9, games: -9 })).toEqual(EMPTY_LADDER);
    // Best is a high-water mark: it can never be behind the current rank.
    expect(cleanLadder({ rank: 12, best: 3, games: 40 })).toEqual({ rank: 12, best: 12, games: 40 });
    expect(cleanLadder({ rank: 4, best: 9, games: 30 })).toEqual({ rank: 4, best: 9, games: 30 });
  });
});

describe('cleanPuzzleProgress', () => {
  it('always returns a list of ids, which App and the puzzle screen read straight away', () => {
    // App.tsx reads progress.solved.length and PuzzleScreen does new Set(progress.solved).
    for (const raw of [{ solved: null }, { solved: 7 }, { solved: 'abc' }, null, 42]) {
      expect(() => new Set(cleanPuzzleProgress(raw).solved).size + cleanPuzzleProgress(raw).solved.length).not.toThrow();
      expect(cleanPuzzleProgress(raw).solved).toEqual([]);
    }
    expect(cleanPuzzleProgress({ solved: ['a', 7, null, 'b'] }).solved).toEqual(['a', 'b']);
  });

  it('keeps every puzzle the app bundles, and bounds a list the app never wrote', () => {
    // The cap is checked against the real set, not against its own constant.
    expect(puzzleIds.length).toBeGreaterThan(1);
    expect(cleanPuzzleProgress({ solved: puzzleIds }).solved).toEqual(puzzleIds);
    const flood = Array.from({ length: 200_000 }, (_, i) => `p${i}`);
    expect(cleanPuzzleProgress({ solved: flood }).solved.length).toBeLessThan(flood.length);
    expect(cleanPuzzleProgress({ solved: flood }).solved.length).toBeGreaterThanOrEqual(puzzleIds.length);
  });
});

describe('cleanEntitlements', () => {
  it('only ever returns known product ids', () => {
    expect(cleanEntitlements({ owned: ['pro'] }).owned).toEqual(['pro']);
    expect(cleanEntitlements({ owned: ['pro', 'pro'] }).owned).toEqual(['pro']);
    expect(cleanEntitlements({ owned: ['gold', 7, null] }).owned).toEqual([]);
    expect(cleanEntitlements({ owned: ['constructor', 'toString'] }).owned).toEqual([]);
  });

  it('refuses an owned list that is not a list', () => {
    // `.includes` on null throws during the provider's own render; a string
    // spreads character by character into the next grant and is then persisted.
    expect(() => cleanEntitlements({ owned: null }).owned.includes('pro')).not.toThrow();
    expect(cleanEntitlements({ owned: 'pro' }).owned).toEqual([]);
    expect([...new Set([...cleanEntitlements({ owned: 'pro' }).owned, 'pro'])]).toEqual(['pro']);
    expect(cleanEntitlements(null).owned).toEqual([]);
  });
});

describe('cleanSettings', () => {
  it('keeps values the app knows', () => {
    const s = { colorScheme: 'dark', boardTheme: 'neon', pieceStyle: 'solid', sounds: true, haptics: false, seenIntro: true };
    expect(cleanSettings(s, SETTINGS)).toEqual(s);
  });

  it('replaces an unknown board theme, which would otherwise throw on every render', () => {
    // makeTheme reads BOARD_THEMES[boardTheme].light with no guard, and useTheme
    // runs in the app's own root: an unknown value white-screens the app at launch.
    const s = cleanSettings({ boardTheme: 'chartreuse', colorScheme: 'sepia', pieceStyle: 'outline' }, SETTINGS);
    expect(boardThemeIds).toContain(s.boardTheme);
    expect(s.boardTheme).toBe(SETTINGS.boardTheme);
    expect(s.colorScheme).toBe(SETTINGS.colorScheme);
    expect(s.pieceStyle).toBe(SETTINGS.pieceStyle);
  });

  it('falls back for missing and mistyped fields, and for a record that is not an object', () => {
    expect(cleanSettings({ sounds: 'on' }, SETTINGS)).toEqual(SETTINGS);
    expect(cleanSettings(undefined, SETTINGS)).toEqual(SETTINGS);
    expect(cleanSettings(42, SETTINGS)).toEqual(SETTINGS);
  });

  it('reads every board theme the theme table declares', () => {
    // Guards the list in validate.ts against the table drifting away from it.
    expect(boardThemeIds.length).toBeGreaterThan(1);
    for (const id of boardThemeIds) {
      expect(cleanSettings({ boardTheme: id }, SETTINGS).boardTheme).toBe(id);
    }
  });
});

/**
 * The validators only help if every record goes through one. App.tsx,
 * entitlements.tsx and settings.tsx cannot be imported here (React Native), so
 * the wiring is checked against the source, as the entitlements suite does.
 */
describe('records the app reads back', () => {
  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
  const app = read('../../App.tsx');
  const loadEffect = app.slice(app.indexOf('] = await Promise.all(['), app.indexOf('setReady(true)'));

  it('cleans every record App.tsx loads at launch', () => {
    // The names come from the destructuring, so a seventh record added to the
    // effect without a validator fails here rather than on someone's first render.
    const loaded = app.slice(app.lastIndexOf('[', app.indexOf('] = await Promise.all([')) + 1, app.indexOf('] = await Promise.all([')).split(',').map((v) => v.trim());
    expect(loaded).toHaveLength((loadEffect.match(/loadJSON</g) ?? []).length);
    expect(loaded.length).toBeGreaterThan(5);
    for (const name of loaded) expect(loadEffect).toMatch(new RegExp(`(clean|check)\\w+\\(${name}[,)]`));
  });

  it('cleans the entitlement record, which decides Pro and is a plain key on the web build', () => {
    expect(read('../entitlements.tsx')).toMatch(/setState\(cleanEntitlements\(/);
    expect(read('../settings.tsx')).toMatch(/cleanSettings\(/);
  });

  it('says so when a saved game is dropped or clipped, instead of removing it without a word', () => {
    // The decision itself is `savedGameNote`, tested above; this is the wiring,
    // which is the half that cannot be imported here.
    expect(loadEffect).toMatch(/checkSavedGame\(game\)/);
    expect(loadEffect).toMatch(/setResumeNote\(savedGameNote\(game, check\)\)/);
    expect(app).toMatch(/resumeNote=\{resumeNote\}/);
    expect(read('../ui/HomeScreen.tsx')).toMatch(/resumeNote/);
  });

  it('lists every storage key in STORAGE_KEYS, so the error boundary can clear all of them', () => {
    // Keys spelled out beside their own module are exactly how entitlements and
    // appsettings escaped both the key list and the recovery path.
    const keys = new Set(Object.values(STORAGE_KEYS));
    const sources = [app, ...walk(new URL('..', import.meta.url)).map((f) => readFileSync(f, 'utf8'))];
    // Any quote, not just a single one: a key spelled "twokings.foo.v1" is the
    // same escape this guard exists to catch, and nothing here enforces a quote
    // style — the repository has no linter or formatter.
    const found = new Set(sources.flatMap((src) => [...src.matchAll(/["'`](twokings\.[\w.]+)["'`]/g)].map((m) => m[1])));
    expect(found.size).toBe(keys.size);
    for (const key of found) expect(keys).toContain(key);
  });
});

/** Every source file under src/, tests excluded. */
function walk(dir: URL): URL[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const child = new URL(`${e.name}${e.isDirectory() ? '/' : ''}`, dir);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(child);
    return /\.tsx?$/.test(e.name) ? [child] : [];
  });
}
