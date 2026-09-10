import { scoreAtDepth } from '../engine/ai';
import type { Position } from '../engine/position';
import { powerLevelFor, powerMoves, rampLevel, type PowerTag } from '../engine/powers';
import { createRng } from '../engine/random';
import type { Color } from '../engine/types';

/**
 * How far behind the side to move is, blending two signals:
 *  - material: piece values, in centipawns (a pawn = 100)
 *  - engine:   a quick search from the side to move's point of view
 * Both are "deficits": positive means losing. The blend feeds the power level.
 */
export interface Deficit {
  material: number;
  engine: number;
  /** Blended deficit in centipawns, never negative. */
  total: number;
  level: number;
}

export const MATERIAL_WEIGHT = 0.5;
export const ENGINE_WEIGHT = 0.5;

export function measureDeficit(pos: Position, color: Color = pos.turn, timeMs = 150, previousLevel = pos.powers[color]): Deficit {
  const material = -pos.material(color);
  let engine = material;
  if (pos.turn === color) {
    const score = scoreAtDepth(pos, 2, timeMs);
    if (score !== null && Math.abs(score) < 50_000) engine = -score;
  }
  const total = blend(material, engine);
  return { material, engine, total, level: rampLevel(powerLevelFor(total), previousLevel) };
}

/** Pure mapping used by tests and the UI meter. */
export function blend(material: number, engine: number): number {
  return Math.max(0, Math.round(MATERIAL_WEIGHT * material + ENGINE_WEIGHT * engine));
}

/**
 * Which power the computer drafts. Scored by how much the tag actually opens up
 * in *this* position — extra moves, weighted toward ones that take something —
 * with a seeded nudge so repeated offers do not always resolve the same way.
 * Deliberately cheap: this runs on the turn-start path, ahead of the search.
 */
export function chooseDraft(pos: Position, offered: readonly PowerTag[], seed: number): PowerTag {
  const rng = createRng(seed);
  let best = offered[0];
  let bestScore = -Infinity;
  for (const tag of offered) {
    const moves = powerMoves(pos, [tag], pos.resurrectable[pos.turn]);
    let captures = 0;
    for (const m of moves) if (m.captured) captures++;
    const score = moves.length + 4 * captures + rng.next() * 3;
    if (score > bestScore) {
      bestScore = score;
      best = tag;
    }
  }
  return best;
}
