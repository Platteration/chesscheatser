import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// entitlements.tsx and App.tsx cannot be imported here (React Native), so the
// two properties that keep the bundled mock from shipping unnoticed are checked
// against the source.
const entitlements = readFileSync(new URL('../entitlements.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');

describe('entitlements store', () => {
  it('has no default store, so a release build cannot ship the mock by omission', () => {
    expect(entitlements).toMatch(/function EntitlementsProvider\(\{ children, store \}/);
    expect(entitlements).not.toMatch(/store\s*=\s*mockStore/);
  });

  it('is mounted with a store named at the mount site', () => {
    expect(app).toMatch(/<EntitlementsProvider store=\{\w+\}>/);
  });

  it('does not price the mock, which grants Pro without taking payment', () => {
    // The public web build serves this provider: a currency amount on a button
    // that charges nothing misrepresents what the tap does.
    const price = /price:\s*'([^']*)'/.exec(entitlements)?.[1];
    expect(price).toBeDefined();
    expect(price).not.toMatch(/[$£€¥]|\d+[.,]\d\d/);
  });
});
