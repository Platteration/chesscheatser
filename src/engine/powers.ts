import { fileOf, offset, rankOf } from './board';
import type { Position } from './position';
import { DIRS, KING_TARGETS, KNIGHT_TARGETS, RAYS } from './tables';
import type { CheatKind, Move, PieceType, Square } from './types';

/**
 * Comeback powers: the side that is losing gets extra, fully legal moves.
 *
 * Each power is a `PowerTag`. A side earns one pick per level-up and drafts a
 * tag from an offer, so two games with the same deficit can play very
 * differently. `TAGS_FOR_LEVEL` preserves the older cumulative-level meaning so
 * saved games, puzzles and the balance harness keep working.
 *
 * Levels ramp: a side gains at most one level per turn (see `rampLevel`), so a
 * hopeless-looking army builds up instead of starting at full power.
 */
export type PowerTag =
  // tier 1
  | 'pawn.nudge'
  | 'king.step2'
  | 'knight.step'
  // tier 2
  | 'bishop.step'
  | 'rook.step'
  | 'pawn.tricks'
  // tier 3
  | 'slider.jump'
  | 'king.hop'
  | 'queen.knight'
  // tier 4
  | 'bishop.queen'
  | 'rook.queen'
  | 'knight.queen'
  | 'resurrect';

export interface PowerSpec {
  tag: PowerTag;
  /** The level-up at which this power first enters the offer pool. */
  tier: number;
  name: string;
  description: string;
}

export const POWER_SPECS: readonly PowerSpec[] = [
  { tag: 'pawn.nudge', tier: 1, name: 'Sidestep', description: 'Pawns may step sideways or straight back.' },
  { tag: 'king.step2', tier: 1, name: 'Stride', description: 'Kings may step two squares in a line through an empty square.' },
  { tag: 'knight.step', tier: 1, name: 'Trot', description: 'Knights may also step one square in any direction.' },
  { tag: 'bishop.step', tier: 2, name: 'Shuffle', description: 'Bishops may step one square straight.' },
  { tag: 'rook.step', tier: 2, name: 'Sidle', description: 'Rooks may step one square diagonally.' },
  { tag: 'pawn.tricks', tier: 2, name: 'Swarm', description: 'Pawns capture straight ahead, move diagonally without capturing, and double-push from anywhere.' },
  { tag: 'slider.jump', tier: 3, name: 'Vault', description: 'Bishops, rooks and queens may jump over one piece.' },
  { tag: 'king.hop', tier: 3, name: 'Leapfrog', description: 'Kings may hop over a neighbouring piece.' },
  { tag: 'queen.knight', tier: 3, name: 'Caper', description: 'Queens may also jump like knights.' },
  { tag: 'bishop.queen', tier: 4, name: 'Ascend', description: 'Bishops also move like rooks.' },
  { tag: 'rook.queen', tier: 4, name: 'Enthrone', description: 'Rooks also move like bishops.' },
  { tag: 'knight.queen', tier: 4, name: 'Gallop', description: 'Knights also move like queens.' },
  { tag: 'resurrect', tier: 4, name: 'Rally', description: 'Instead of moving, bring a captured piece back to your home ranks.' },
];

export const POWER_TAGS: readonly PowerTag[] = POWER_SPECS.map((s) => s.tag);

/**
 * How many powers a side can draft. Higher than the four tiers: once every tier
 * is open, further level-ups keep handing out picks from whatever is left.
 * Tuned with `scripts/simulate.ts` — one pick per tier was far too weak to
 * actually turn games around.
 */
export const MAX_POWER = 6;
/** The highest tier any power belongs to; the offer pool is fully open from here. */
export const MAX_TIER = 4;

/** Tier labels, indexed by tier (0 = none). */
export const POWER_NAMES = ['None', 'Nudge', 'Slide', 'Leap', 'Ascend'] as const;

/** What the pool at each tier opens up, for the rules screen. */
export const POWER_DESCRIPTIONS = [
  'No extra powers.',
  'Pawn sidesteps, two-square king strides, knights that step.',
  'Bishops and rooks that step off their colour, and pawn tricks.',
  'Jumping sliders, hopping kings, queens that move like knights.',
  'Bishops, rooks and knights with queen mobility, and raising the dead.',
] as const;

const SPEC_BY_TAG = new Map<PowerTag, PowerSpec>(POWER_SPECS.map((s) => [s.tag, s]));
export function powerSpec(tag: PowerTag): PowerSpec {
  const s = SPEC_BY_TAG.get(tag);
  if (!s) throw new Error(`Unknown power: ${tag}`);
  return s;
}

/**
 * The cumulative tag set each old numeric level granted. Index 0 is empty.
 * Legacy `power` events and the balance harness resolve through this.
 */
export const TAGS_FOR_LEVEL: readonly (readonly PowerTag[])[] = [0, 1, 2, 3, 4].map((level) =>
  POWER_SPECS.filter((s) => s.tier <= level).map((s) => s.tag),
);

/** The cumulative set for a legacy numeric level, clamped to the tiers that exist. */
export function tagsForLevel(level: number): readonly PowerTag[] {
  return TAGS_FOR_LEVEL[Math.max(0, Math.min(MAX_TIER, level | 0))];
}

/** Deficit thresholds (centipawns) for each level; index = level. */
export const POWER_THRESHOLDS = [0, 200, 400, 650, 900, 1200, 1600] as const;

/** Powers build up one level per turn: the granted level is capped at the previous level plus one. */
export function rampLevel(target: number, previous: number): number {
  return Math.min(target, previous + 1);
}

export function powerLevelFor(deficit: number): number {
  let level = 0;
  for (let l = 1; l <= MAX_POWER; l++) if (deficit >= POWER_THRESHOLDS[l]) level = l;
  return level;
}

/** Names for display: the drafted powers, or "None". */
export function describePowers(tags: Iterable<PowerTag>): string {
  const names = [...tags].map((t) => powerSpec(t).name);
  return names.length ? names.join(' · ') : 'None';
}

/**
 * The powers offered at a level-up: up to `count` unowned tags whose tier has
 * been reached, drawn with a seeded shuffle so replays are deterministic.
 * Newly reached tiers come first so an offer usually shows something new.
 */
export function offerPowers(granted: Iterable<PowerTag>, level: number, seed: number, count = 3): PowerTag[] {
  const owned = new Set(granted);
  const pool = POWER_SPECS.filter((s) => s.tier <= level && !owned.has(s.tag));
  if (pool.length <= count) return pool.map((s) => s.tag);
  // Deterministic shuffle (mulberry32-style), then prefer the highest tiers reached.
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const keyed = pool.map((s) => ({ s, k: rand() + (s.tier === level ? 1 : 0) }));
  keyed.sort((x, y) => y.k - x.k);
  return keyed.slice(0, count).map((x) => x.s.tag);
}

/**
 * Pseudo-legal power moves for the side to move. Every move carries
 * `power: true` and a `cheat` kind naming the trick, so the UI can label it.
 * Ordinary legal moves are never duplicated here.
 *
 * `granted` accepts a tag set or, for legacy callers, a numeric level.
 */
export function powerMoves(
  pos: Position,
  granted: Iterable<PowerTag> | number,
  resurrectable: PieceType[] = [],
  ordinary?: Move[],
): Move[] {
  const tags = new Set<PowerTag>(typeof granted === 'number' ? tagsForLevel(granted) : granted);
  if (tags.size === 0) return [];
  const has = (t: PowerTag) => tags.has(t);
  const plain = ordinary ?? pos.pseudoLegalMoves();
  const color = pos.turn;
  const board = pos.board;
  const out: Move[] = [];
  const seen = new Set<number>();

  const add = (from: Square, to: Square, piece: PieceType, kind: CheatKind, extra: Partial<Move> = {}) => {
    const t = board[to];
    if (t && (t.color === color || t.type === 'k')) return;
    const key = from * 64 + to + (extra.promotion ? 4096 * 'qrbn'.indexOf(extra.promotion) + 4096 : 0);
    if (seen.has(key)) return;
    seen.add(key);
    const m: Move = { from, to, piece, cheat: kind, power: true, ...extra };
    if (t) m.captured = t.type;
    if (piece === 'p' && rankOf(to) === (color === 'w' ? 7 : 0) && !m.promotion) m.promotion = 'q';
    out.push(m);
  };

  /** Slide along rays; with `jump` the ray continues past the first blocker once. */
  const slide = (from: Square, piece: PieceType, d0: number, d1: number, kind: CheatKind, jump: boolean) => {
    for (let d = d0; d < d1; d++) {
      const ray = RAYS[from][d];
      let blocked = false;
      for (let i = 0; i < ray.length; i++) {
        const to = ray[i];
        const t = board[to];
        if (!blocked) {
          if (!t) {
            add(from, to, piece, kind);
            continue;
          }
          add(from, to, piece, kind);
          if (!jump) break;
          blocked = true;
          continue;
        }
        // past the single blocker
        add(from, to, piece, kind);
        if (t) break;
      }
    }
  };

  for (let from = 0; from < 64; from++) {
    const p = board[from];
    if (!p || p.color !== color) continue;
    switch (p.type) {
      case 'p': {
        const dir = color === 'w' ? 1 : -1;
        if (has('pawn.nudge')) {
          for (const df of [-1, 1]) {
            const side = offset(from, df, 0);
            if (side >= 0 && !board[side]) add(from, side, 'p', 'pawn');
          }
          const back = offset(from, 0, -dir);
          if (back >= 0 && !board[back]) add(from, back, 'p', 'pawn');
        }
        if (has('pawn.tricks')) {
          for (const df of [-1, 1]) {
            const diag = offset(from, df, dir);
            if (diag >= 0 && !board[diag]) add(from, diag, 'p', 'pawn');
          }
          const one = offset(from, 0, dir);
          if (one >= 0 && board[one]) add(from, one, 'p', 'pawn');
          const two = offset(from, 0, 2 * dir);
          if (one >= 0 && two >= 0 && !board[one] && !board[two]) add(from, two, 'p', 'pawn', { doublePush: true });
        }
        break;
      }
      case 'k':
        for (const [df, dr] of DIRS) {
          const mid = offset(from, df, dr);
          const to = mid >= 0 ? offset(mid, df, dr) : -1;
          if (mid < 0 || to < 0) continue;
          if (!board[mid]) {
            if (has('king.step2')) add(from, to, 'k', 'geometry');
          } else if (has('king.hop')) add(from, to, 'k', 'jump');
        }
        break;
      case 'n':
        if (has('knight.step')) for (const to of KING_TARGETS[from]) add(from, to, 'n', 'geometry');
        if (has('knight.queen')) slide(from, 'n', 0, 8, 'geometry', false);
        break;
      case 'b':
        if (has('bishop.step')) {
          for (const to of KING_TARGETS[from]) if (fileOf(to) === fileOf(from) || rankOf(to) === rankOf(from)) add(from, to, 'b', 'geometry');
        }
        if (has('slider.jump')) slide(from, 'b', 0, 4, 'jump', true);
        if (has('bishop.queen')) slide(from, 'b', 4, 8, 'geometry', false);
        break;
      case 'r':
        if (has('rook.step')) {
          for (const to of KING_TARGETS[from]) if (fileOf(to) !== fileOf(from) && rankOf(to) !== rankOf(from)) add(from, to, 'r', 'geometry');
        }
        if (has('slider.jump')) slide(from, 'r', 4, 8, 'jump', true);
        if (has('rook.queen')) slide(from, 'r', 0, 4, 'geometry', false);
        break;
      case 'q':
        if (has('slider.jump')) slide(from, 'q', 0, 8, 'jump', true);
        if (has('queen.knight')) for (const to of KNIGHT_TARGETS[from]) add(from, to, 'q', 'geometry');
        break;
    }
  }

  if (has('resurrect')) {
    const types = [...new Set(resurrectable.filter((t) => t !== 'k'))];
    const ranks = color === 'w' ? [0, 1] : [7, 6];
    for (const r of ranks) {
      for (let f = 0; f < 8; f++) {
        const to = r * 8 + f;
        if (board[to]) continue;
        for (const t of types) {
          if (t === 'p' && r === ranks[0]) continue;
          out.push({ from: -1, to, piece: t, cheat: 'resurrect', power: true });
        }
      }
    }
  }

  // Drop anything that is already an ordinary legal move (same from/to/promotion).
  const keyOf = (m: Move) => m.from * 64 + m.to + (m.promotion ? 4096 * 'qrbn'.indexOf(m.promotion) + 4096 : 0);
  const ordinaryKeys = new Set(plain.map(keyOf));
  return out.filter((m) => m.from < 0 || !ordinaryKeys.has(keyOf(m)));
}
