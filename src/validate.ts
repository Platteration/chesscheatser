import type { Difficulty } from './engine/ai';
import type { CheatLevel } from './engine/cheat';
import type { MaterialMode } from './engine/setup';
import type { Color } from './engine/types';
import type { GameEvent } from './game/events';
import { ARMY_SIZES, DEFAULT_CONFIG, type ClockMinutes, type GameConfig, type GameMode, type PlayAs, type SavedGame } from './game/config';
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
const EVENT_TYPES: Record<GameEvent['type'], true> = { move: true, pass: true, accuse: true, power: true };

type Fields = Record<string, unknown>;

function fields(raw: unknown): Fields {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Fields) : {};
}

/** `value` when it is one of `table`'s own keys, else `fallback`. */
function pick<T extends string | number>(value: unknown, table: Record<T, unknown>, fallback: T): T {
  if (typeof value !== 'string' && typeof value !== 'number') return fallback;
  return Object.prototype.hasOwnProperty.call(table, value) ? (value as T) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
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

function isEvent(e: unknown): e is GameEvent {
  const f = fields(e);
  return Object.prototype.hasOwnProperty.call(EVENT_TYPES, String(f.type));
}

/**
 * A resumable saved game, or null when the record cannot be trusted. Null means
 * "no game to resume": the caller drops the record rather than letting Resume
 * crash on every launch.
 */
export function cleanSavedGame(raw: unknown): SavedGame | null {
  if (raw === null || typeof raw !== 'object') return null;
  const g = raw as Fields;
  const seed = num(g.seed);
  if (seed === undefined) return null;
  if (g.humanColor !== 'w' && g.humanColor !== 'b') return null;
  if (!Array.isArray(g.events) || !g.events.every(isEvent)) return null;

  const out: SavedGame = {
    config: cleanConfig(g.config),
    seed,
    humanColor: g.humanColor as Color,
    events: g.events as GameEvent[],
  };
  if (typeof g.daily === 'string') out.daily = g.daily;
  const ranked = num(g.ranked);
  if (ranked !== undefined) out.ranked = ranked;
  const handicap = num(g.handicap);
  if (handicap !== undefined) out.handicap = handicap;
  const clocks = fields(g.clocks);
  const w = num(clocks.w);
  const b = num(clocks.b);
  if (w !== undefined && b !== undefined) out.clocks = { w, b };
  return out;
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
