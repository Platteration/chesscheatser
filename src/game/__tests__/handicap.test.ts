import { describe, expect, it } from 'vitest';
import { chooseMove, clearTranspositionTable } from '../../engine/ai';
import { kingSquares } from '../../engine/board';
import { Position } from '../../engine/position';
import { offerPowers, powerLevelFor, rampLevel } from '../../engine/powers';
import { generateSetup } from '../../engine/setup';
import { blend, chooseDraft, measureDeficit } from '../comeback';
import { lostPieces } from '../events';

/**
 * Handicap Chess: one king a side. The engine's two-king rules are supposed to
 * degrade to ordinary chess, so these play whole games and check that they do.
 *
 * The games draft comeback powers from the material deficit alone (the same
 * fallback `measureDeficit` takes when its search runs out of time). Its engine
 * term runs under a wall-clock budget, so with it the games changed with machine
 * speed and cost about 3 s idle, past vitest's 5 s limit under CI load. Material
 * drafting keeps the powers in play and makes each game reproducible from its
 * seed: seeds 2, 4, 5, 8, 9 and 10 reach a promotion, three checkmates, a
 * threefold repetition and two long power-heavy games, in about a second.
 */
describe('handicap chess (one king)', () => {
  const playGame = (seed: number, maxPlies = 60) => {
    clearTranspositionTable();
    const setup = generateSetup({ mode: 'fair', seed, kings: 1 });
    const pos = new Position(setup.board);
    let kind = 'ongoing';
    for (let ply = 0; ply < maxPlies; ply++) {
      for (const c of ['w', 'b'] as const) pos.resurrectable[c] = lostPieces(setup.board, pos.board, c);
      const color = pos.turn;
      const material = -pos.material(color);
      const level = rampLevel(powerLevelFor(blend(material, material)), pos.powers[color]);
      const owned = pos.powerTags[color];
      if (level > owned.size) {
        const offered = offerPowers(owned, level, seed * 1000 + ply);
        if (offered.length) pos.grantPower(color, chooseDraft(pos, offered, seed * 1000 + ply));
      }
      // Nobody ever loses to "all kings in check" with a single king.
      expect(pos.allKingsInCheck()).toBe(false);
      const res = pos.result();
      expect(res.kind).not.toBe('both-in-check');
      if (res.kind !== 'ongoing') {
        kind = res.kind;
        break;
      }
      const mv = chooseMove(pos, 'easy', seed * 1000 + ply);
      if (!mv) break;
      pos.makeMove(mv.move);
      // Kings are never captured, powers or not.
      expect(kingSquares(pos.board, 'w')).toHaveLength(1);
      expect(kingSquares(pos.board, 'b')).toHaveLength(1);
    }
    return kind;
  };

  it('plays to an ordinary chess ending, never a double-check loss', () => {
    const kinds = [2, 4, 5, 8, 9, 10].map((seed) => playGame(seed));
    for (const k of kinds) {
      expect(['ongoing', 'checkmate', 'stalemate', 'fifty-move', 'repetition']).toContain(k);
    }
    // The games are deterministic, so the endings they reach are part of the check:
    // a checkmate is where a one-king "both in check" loss would wrongly surface.
    expect(kinds.filter((k) => k === 'checkmate').length).toBeGreaterThanOrEqual(3);
    expect(kinds).toContain('repetition');
  });

  it('still hands comeback powers to the side that is behind', () => {
    // White has a lone king; black has a king and a queen.
    const setup = generateSetup({ mode: 'handicap', seed: 7, kings: 1, handicap: 2.5 });
    const pos = new Position(setup.board, setup.whiteValue < setup.blackValue ? 'w' : 'b');
    const behind = pos.turn;
    const d = measureDeficit(pos, behind, 60);
    expect(d.total).toBeGreaterThan(0);
    expect(d.level).toBeGreaterThan(0);
    const offered = offerPowers(pos.powerTags[behind], d.level, 7);
    expect(offered.length).toBeGreaterThan(0);
  });
});
