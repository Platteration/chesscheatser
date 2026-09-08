import { scoreAtDepth } from '../engine/ai';
import type { Position } from '../engine/position';
import { powerLevelFor, rampLevel } from '../engine/powers';
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
