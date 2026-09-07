import { describe, expect, it } from 'vitest';
import { applyLadderResult, EMPTY_LADDER, ladderParams } from '../ladder';

describe('ladder', () => {
  it('ramps difficulty, cheating and handicap with rank', () => {
    expect(ladderParams(1)).toMatchObject({ difficulty: 'easy', cheating: 'off', handicap: 0.7 });
    expect(ladderParams(6)).toMatchObject({ difficulty: 'medium', cheating: 'low', handicap: 1 });
    expect(ladderParams(20)).toMatchObject({ difficulty: 'hard', cheating: 'high' });
    expect(ladderParams(100).handicap).toBe(3);
  });

  it('moves rank with results and never drops below 1', () => {
    let s = applyLadderResult(EMPTY_LADDER, 'loss');
    expect(s.rank).toBe(1);
    s = applyLadderResult(s, 'win');
    s = applyLadderResult(s, 'win');
    expect(s).toMatchObject({ rank: 3, best: 3, games: 3 });
    s = applyLadderResult(s, 'draw');
    expect(s.rank).toBe(3);
    s = applyLadderResult(s, 'loss');
    expect(s).toMatchObject({ rank: 2, best: 3 });
  });
});
