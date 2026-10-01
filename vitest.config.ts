import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'e2e/**/*.test.mjs'],
    /**
     * Explicit, because vitest's 5 s default is roughly what the slowest test
     * here costs: `setup.test.ts`'s first-move check walks 150 generated setups
     * and measured 5.2-6.3 s on a loaded machine, so `npm test` went red about
     * one run in five without anything being wrong. A suite that fails by
     * chance trains people to re-run rather than read. `setup.test.ts` checks
     * this value against what that check actually costs.
     */
    testTimeout: 30_000,
  },
});
