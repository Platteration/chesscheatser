import type { Difficulty } from './engine/ai';
import type { CheatLevel } from './engine/cheat';
import { MAX_POWER } from './engine/powers';
import type { MaterialMode } from './engine/setup';
import type { CheatKind, Color, Move, PieceType } from './engine/types';
import type { EntitlementState, ProductId } from './entitlements';
import type { GameEvent } from './game/events';
import {
  ARMY_SIZES,
  DEFAULT_CONFIG,
  EMPTY_STATS,
  type ClockMinutes,
  type GameConfig,
  type GameMode,
  type PlayAs,
  type SavedGame,
  type Stats,
} from './game/config';
import { EMPTY_DAILY, type DailyRecord, type DailyState } from './game/daily';
import { EMPTY_LADDER, type LadderState } from './game/ladder';
import type { PuzzleProgress } from './game/puzzles';
import type { AppSettings, BoardTheme, ColorSchemeSetting, PieceStyle } from './settings';

/**
 * Records loaded from storage are untrusted: they may come from an older build
 * (missing fields), a newer one (unknown values), or a hand-edited store — on
 * the web build every key is plain localStorage. `loadJSON` only spreads the
 * defaults under the parsed object, so a nested object is never repaired and no
 * value is type-checked; an unknown `boardTheme` or `armySize` then indexes a
 * lookup table to `undefined` and throws during render, which white-screens the
 * app on every launch until storage is cleared.
 *
 * Everything here clamps to a known value instead. Only the defaults live
 * elsewhere: settings' defaults are passed in, because `settings.tsx` pulls in
 * React Native and this module must stay importable on its own.
 *
 * Every record the app reads back goes through one of these: the two that were
 * validated first are not special, they are just the two whose crash was found
 * first. A record it does not know how to repair is dropped whole.
 */

const GAME_MODES: Record<GameMode, true> = { ai: true, local: true };
const DIFFICULTIES: Record<Difficulty, true> = { easy: true, medium: true, hard: true };
const MATERIALS: Record<MaterialMode, true> = { chaos: true, fair: true, mirror: true, handicap: true };
const PLAY_AS: Record<PlayAs, true> = { w: true, b: true, random: true };
const CHEAT_LEVELS: Record<CheatLevel, true> = { off: true, low: true, high: true };
const DOUBLE_CHECK: Record<NonNullable<GameConfig['doubleCheck']>, true> = { loses: true, answer: true };
const CLOCKS: Record<ClockMinutes, true> = { 0: true, 1: true, 3: true, 5: true, 10: true };
const COLOR_SCHEMES: Record<ColorSchemeSetting, true> = { system: true, dark: true, light: true };
const BOARD_THEME_IDS: Record<BoardTheme, true> = { wood: true, marble: true, slate: true, neon: true, tournament: true };
const PIECE_STYLES: Record<PieceStyle, true> = { solid: true, classic: true };
const PIECE_TYPES: Record<PieceType, true> = { p: true, n: true, b: true, r: true, q: true, k: true };
const CHEAT_KINDS: Record<CheatKind, true> = { jump: true, geometry: true, pawn: true, upgrade: true, resurrect: true };
const OUTCOMES: Record<DailyRecord['outcome'], true> = { win: true, loss: true, draw: true };
const PRODUCT_IDS: Record<ProductId, true> = { pro: true };

/** Date keys, as `todayKey` writes them. The saved game's is the one value that reaches the share sheet. */
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** h8. `from` may also be -1: a resurrected piece arrives from off the board. */
const LAST_SQUARE = 63;

/**
 * How many events a saved game may carry. A game is a move or a pass plus a
 * power grant per ply, and 402 ordinary pass-and-play games driven through the
 * app's own event generation had a median of 180 events, a 99th percentile of
 * 1212 and a longest of 1676 — so "a few hundred" understated real games by an
 * order of magnitude, and the first cap of 2000 sat 1.19x above the longest
 * game anyone had measured. This one is ~4.8x above it.
 *
 * The ceiling is not what makes a record safe to replay: `replayablePrefix`
 * finds the longest prefix that applies with a binary search rather than by
 * retrying every shorter prefix, so a full-length hostile record costs a
 * handful of folds (~30 ms measured at this cap, against ~9 s for the old
 * scan). It is here so a record the app never wrote cannot hand the replay an
 * unbounded list. A longer record is clipped to it and the app says so, rather
 * than being deleted without a word. `validate.test.ts` pins both ends: the cap
 * may not fall below 4x the longest game measured, and may not rise past what
 * still replays inside a second.
 */
export const MAX_EVENTS = 8000;

/**
 * Solved puzzle ids. The bundled set is smaller than this by more than an order
 * of magnitude; the cap is only here so a record the app did not write cannot
 * hand `new Set(...)` an arbitrarily long list on every visit to the puzzles screen.
 */
const MAX_SOLVED = 1000;

type Fields = Record<string, unknown>;

function fields(raw: unknown): Fields {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Fields) : {};
}

/** True when `value` is one of `table`'s own keys — never an inherited one like `constructor` or `toString`. */
function has<T extends string | number>(table: Record<T, unknown>, value: unknown): value is T {
  if (typeof value !== 'string' && typeof value !== 'number') return false;
  return Object.prototype.hasOwnProperty.call(table, value);
}

/** `value` when it is one of `table`'s own keys, else `fallback`. */
function pick<T extends string | number>(value: unknown, table: Record<T, unknown>, fallback: T): T {
  return has(table, value) ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** A whole number within `[min, max]`, or undefined. */
function int(value: unknown, min: number, max: number): number | undefined {
  const n = num(value);
  return n !== undefined && Number.isInteger(n) && n >= min && n <= max ? n : undefined;
}

/** A counter: whole and not negative, or `fallback`. */
function count(value: unknown, fallback: number): number {
  return int(value, 0, Number.MAX_SAFE_INTEGER) ?? fallback;
}

/** A stored game config, with every unknown or missing field replaced by the default. */
export function cleanConfig(raw: unknown): GameConfig {
  const c = fields(raw);
  const out: GameConfig = {
    mode: pick(c.mode, GAME_MODES, DEFAULT_CONFIG.mode),
    difficulty: pick(c.difficulty, DIFFICULTIES, DEFAULT_CONFIG.difficulty),
    material: pick(c.material, MATERIALS, DEFAULT_CONFIG.material),
    playAs: pick(c.playAs, PLAY_AS, DEFAULT_CONFIG.playAs),
    armySize: pick(c.armySize, ARMY_SIZES, DEFAULT_CONFIG.armySize),
    cheating: pick(c.cheating, CHEAT_LEVELS, DEFAULT_CONFIG.cheating),
    comeback: bool(c.comeback, DEFAULT_CONFIG.comeback !== false),
    doubleCheck: pick(c.doubleCheck, DOUBLE_CHECK, DEFAULT_CONFIG.doubleCheck ?? 'answer'),
  };
  if (c.clock !== undefined) out.clock = pick(c.clock, CLOCKS, 0);
  if (c.playerCheats !== undefined) out.playerCheats = bool(c.playerCheats, false);
  return out;
}

/**
 * A move as `stripMove` writes it, rebuilt field by field, or null. Rebuilding
 * rather than passing the parsed object on is what keeps the squares on the
 * board: `Position.makeMove` writes `board[m.to]` unchecked, so a stored `to` of
 * ten million grows the board array to ten million entries and every later
 * scan of it — each snapshot, each captured-piece tally — walks the holes.
 */
function cleanMove(raw: unknown): Move | null {
  const m = fields(raw);
  const from = int(m.from, -1, LAST_SQUARE);
  const to = int(m.to, 0, LAST_SQUARE);
  if (from === undefined || to === undefined || !has(PIECE_TYPES, m.piece)) return null;
  const out: Move = { from, to, piece: m.piece };
  if (m.captured !== undefined) {
    if (!has(PIECE_TYPES, m.captured)) return null;
    out.captured = m.captured;
  }
  if (m.promotion !== undefined) {
    if (!has(PIECE_TYPES, m.promotion)) return null;
    out.promotion = m.promotion;
  }
  if (m.cheat !== undefined) {
    if (!has(CHEAT_KINDS, m.cheat)) return null;
    out.cheat = m.cheat;
  }
  // The flags are only ever written when set, so anything but `true` is not ours.
  if (m.enPassant !== undefined) {
    if (m.enPassant !== true) return null;
    out.enPassant = true;
  }
  if (m.doublePush !== undefined) {
    if (m.doublePush !== true) return null;
    out.doublePush = true;
  }
  if (m.power !== undefined) {
    if (m.power !== true) return null;
    out.power = true;
  }
  return out;
}

/** One replayable event, rebuilt from its own payload, or null when nothing here is usable. */
function cleanEvent(raw: unknown): GameEvent | null {
  const e = fields(raw);
  switch (e.type) {
    case 'pass':
      return { type: 'pass' };
    case 'move': {
      const move = cleanMove(e.move);
      return move === null ? null : { type: 'move', move };
    }
    case 'accuse': {
      if (typeof e.caught !== 'boolean' || (e.by !== undefined && e.by !== 'ai')) return null;
      return e.by === 'ai' ? { type: 'accuse', caught: e.caught, by: 'ai' } : { type: 'accuse', caught: e.caught };
    }
    case 'power': {
      // `setPower` clamps the Position's own copy, but the level recorded here is
      // what the power meter repeats a star for: '★'.repeat(-1) throws mid-render.
      const level = int(e.level, 0, MAX_POWER);
      const material = num(e.material);
      const engine = num(e.engine);
      if ((e.color !== 'w' && e.color !== 'b') || level === undefined || material === undefined || engine === undefined) return null;
      return { type: 'power', color: e.color, level, material, engine };
    }
    default:
      return null;
  }
}

export interface SavedGameCheck {
  /** The resumable game, or null when the record cannot be trusted at all. */
  game: SavedGame | null;
  /** Events dropped from the end of an over-long record, so the caller can say so. */
  dropped: number;
}

const NO_GAME: SavedGameCheck = { game: null, dropped: 0 };

/**
 * A resumable saved game, or null when the record cannot be trusted. Null means
 * "no game to resume": the caller drops the record rather than letting Resume
 * crash on every launch. Length alone never costs a record its whole self — an
 * over-long one keeps its first `MAX_EVENTS` and reports the rest as `dropped`,
 * because losing the end of a long game is bad but losing all of it silently,
 * which is what the cap used to do at 2001 events, is worse.
 */
export function checkSavedGame(raw: unknown): SavedGameCheck {
  if (raw === null || typeof raw !== 'object') return NO_GAME;
  const g = raw as Fields;
  const seed = num(g.seed);
  if (seed === undefined) return NO_GAME;
  if (g.humanColor !== 'w' && g.humanColor !== 'b') return NO_GAME;
  if (!Array.isArray(g.events)) return NO_GAME;
  const dropped = Math.max(0, g.events.length - MAX_EVENTS);
  const events: GameEvent[] = [];
  for (const stored of dropped > 0 ? g.events.slice(0, MAX_EVENTS) : g.events) {
    const event = cleanEvent(stored);
    if (event === null) return NO_GAME;
    events.push(event);
  }

  const out: SavedGame = {
    config: cleanConfig(g.config),
    seed,
    humanColor: g.humanColor as Color,
    events,
  };
  if (typeof g.daily === 'string' && DATE_KEY.test(g.daily)) out.daily = g.daily;
  const ranked = num(g.ranked);
  if (ranked !== undefined) out.ranked = ranked;
  const handicap = num(g.handicap);
  if (handicap !== undefined) out.handicap = handicap;
  const clocks = fields(g.clocks);
  const w = num(clocks.w);
  const b = num(clocks.b);
  if (w !== undefined && b !== undefined) out.clocks = { w, b };
  return { game: out, dropped };
}

/**
 * What to tell the player about a stored game that did not come back as it was.
 * A record that goes missing from the menu with no explanation is
 * indistinguishable from a bug, and it is the player's own game — so both of
 * the ways one can be lost say so. Null when there is nothing to report,
 * including when there was no saved game in the first place.
 */
export function savedGameNote(stored: unknown, check: SavedGameCheck): string | null {
  if (stored === null || stored === undefined) return null;
  if (check.game === null) return 'A saved game could not be read, so it has been removed.';
  if (check.dropped > 0) return 'The saved game was too long to restore in full, so the end of it was dropped.';
  return null;
}

/** The game alone, for callers that have nothing to say about a clipped one. */
export function cleanSavedGame(raw: unknown): SavedGame | null {
  return checkSavedGame(raw).game;
}

/** Lifetime counters. Every field of `Stats` is one, so the list cannot drift from the type. */
export function cleanStats(raw: unknown): Stats {
  const s = fields(raw);
  const out = { ...EMPTY_STATS };
  for (const key of Object.keys(EMPTY_STATS) as (keyof Stats)[]) out[key] = count(s[key], EMPTY_STATS[key]);
  return out;
}

function cleanDailyRecord(raw: unknown, date: string): DailyRecord | null {
  const r = fields(raw);
  if (!has(OUTCOMES, r.outcome)) return null;
  return {
    date,
    outcome: r.outcome,
    moves: count(r.moves, 0),
    cheatsCaught: count(r.cheatsCaught, 0),
    cheatsMissed: count(r.cheatsMissed, 0),
    falseAccusations: count(r.falseAccusations, 0),
  };
}

/**
 * Daily challenge history. `results` is rebuilt on a null-prototype object:
 * `recordDaily` asks `state.results[rec.date]` whether today is already played,
 * and on a plain object every name on `Object.prototype` answers that truthily.
 * Each record's `date` is taken from its key, so the two cannot disagree.
 */
export function cleanDaily(raw: unknown): DailyState {
  const d = fields(raw);
  const stored = fields(d.results);
  const results: Record<string, DailyRecord> = Object.create(null);
  for (const key of Object.keys(stored)) {
    if (!DATE_KEY.test(key)) continue;
    const rec = cleanDailyRecord(stored[key], key);
    if (rec !== null) results[key] = rec;
  }
  const lastPlayed = typeof d.lastPlayed === 'string' && DATE_KEY.test(d.lastPlayed) ? d.lastPlayed : EMPTY_DAILY.lastPlayed;
  return { results, streak: count(d.streak, EMPTY_DAILY.streak), lastPlayed };
}

/** Ladder standing. Rank starts at 1, and the best rank can never be behind the current one. */
export function cleanLadder(raw: unknown): LadderState {
  const l = fields(raw);
  const rank = Math.max(EMPTY_LADDER.rank, count(l.rank, EMPTY_LADDER.rank));
  return { rank, best: Math.max(rank, count(l.best, EMPTY_LADDER.best)), games: count(l.games, EMPTY_LADDER.games) };
}

/** Solved puzzle ids. An id the bundled set no longer has is harmless: it simply never matches. */
export function cleanPuzzleProgress(raw: unknown): PuzzleProgress {
  const p = fields(raw);
  if (!Array.isArray(p.solved)) return { solved: [] };
  return { solved: p.solved.filter((id): id is string => typeof id === 'string').slice(0, MAX_SOLVED) };
}

/**
 * Unlocked products. `owned` has to be an array of known ids: a stored string
 * spreads character by character into the next grant, which then persists
 * `['p', 'r', 'o', 'pro']` over the record.
 */
export function cleanEntitlements(raw: unknown): EntitlementState {
  const e = fields(raw);
  if (!Array.isArray(e.owned)) return { owned: [] };
  return { owned: [...new Set(e.owned.filter((id): id is ProductId => has(PRODUCT_IDS, id)))] };
}

/** Stored appearance settings, with every unknown or missing field replaced from `fallback`. */
export function cleanSettings(raw: unknown, fallback: AppSettings): AppSettings {
  const s = fields(raw);
  return {
    colorScheme: pick(s.colorScheme, COLOR_SCHEMES, fallback.colorScheme),
    boardTheme: pick(s.boardTheme, BOARD_THEME_IDS, fallback.boardTheme),
    pieceStyle: pick(s.pieceStyle, PIECE_STYLES, fallback.pieceStyle),
    sounds: bool(s.sounds, fallback.sounds),
    haptics: bool(s.haptics, fallback.haptics),
    seenIntro: bool(s.seenIntro, fallback.seenIntro),
  };
}
