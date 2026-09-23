import { describe, expect, it } from 'vitest';
import { createRng } from '../random';

describe('createRng', () => {
  it('refuses to pick from an empty list instead of handing back undefined as an item', () => {
    // pick is typed to return an item of the list; from an empty one it used to
    // return undefined, which the army builder would have counted as a piece.
    const rng = createRng(5);
    expect(() => rng.pick([])).toThrow(RangeError);
    // The refusal draws nothing, so the sequence a seed reproduces is unchanged.
    expect(rng.next()).toBe(createRng(5).next());
  });

  it('picks only items of the list', () => {
    const rng = createRng(9);
    const items: readonly string[] = ['p', 'n', 'b'];
    for (let i = 0; i < 200; i++) expect(items).toContain(rng.pick(items));
    expect(createRng(3).pick(['only'])).toBe('only');
  });
});
