import { offset } from './board';
import type { Color } from './types';

/** Precomputed geometry so move generation and attack checks avoid per-call arithmetic. */

const KNIGHT_OFFSETS: [number, number][] = [
  [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];
const KING_OFFSETS: [number, number][] = [
  [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1],
];
/** Directions 0..3 are diagonals (bishop), 4..7 are orthogonals (rook). */
export const DIRS: [number, number][] = [
  [1, 1], [1, -1], [-1, -1], [-1, 1],
  [0, 1], [1, 0], [0, -1], [-1, 0],
];

function stepTargets(offsets: [number, number][]): number[][] {
  const out: number[][] = [];
  for (let s = 0; s < 64; s++) {
    const t: number[] = [];
    for (const [df, dr] of offsets) {
      const x = offset(s, df, dr);
      if (x >= 0) t.push(x);
    }
    out.push(t);
  }
  return out;
}

export const KNIGHT_TARGETS: number[][] = stepTargets(KNIGHT_OFFSETS);
export const KING_TARGETS: number[][] = stepTargets(KING_OFFSETS);

/** RAYS[square][dir] = squares along that direction, nearest first. */
export const RAYS: number[][][] = (() => {
  const out: number[][][] = [];
  for (let s = 0; s < 64; s++) {
    const rays: number[][] = [];
    for (const [df, dr] of DIRS) {
      const ray: number[] = [];
      let x = offset(s, df, dr);
      while (x >= 0) {
        ray.push(x);
        x = offset(x, df, dr);
      }
      rays.push(ray);
    }
    out.push(rays);
  }
  return out;
})();

/** PAWN_ATTACKERS[color][square] = squares from which a pawn of `color` attacks `square`. */
export const PAWN_ATTACKERS: Record<Color, number[][]> = {
  w: stepTargets([[-1, -1], [1, -1]]),
  b: stepTargets([[-1, 1], [1, 1]]),
};

/** PAWN_CAPTURES[color][square] = squares a pawn of `color` on `square` attacks. */
export const PAWN_CAPTURES: Record<Color, number[][]> = {
  w: stepTargets([[-1, 1], [1, 1]]),
  b: stepTargets([[-1, -1], [1, -1]]),
};
