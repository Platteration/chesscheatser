import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FRESH,
  onRenderFailed,
  recoveryScreen,
  recoveryStep,
  type RecoveryActionId,
  type RecoveryEffect,
  type RecoverySignal,
  type RecoveryState,
} from '../recovery';
import { CLEARED_KEYS, KEPT_ON_CLEAR, STORAGE_KEYS } from '../storage';

const failed: RecoverySignal = { type: 'failed' };
const settled: RecoverySignal = { type: 'settled' };
const chose = (action: RecoveryActionId): RecoverySignal => ({ type: 'chose', action });

/** Runs a sequence of signals and collects what the boundary would have cleared. */
function play(signals: RecoverySignal[], from: RecoveryState = FRESH): { state: RecoveryState; effects: RecoveryEffect[] } {
  let state = from;
  const effects: RecoveryEffect[] = [];
  for (const signal of signals) {
    const step = recoveryStep(state, signal);
    state = step.state;
    if (step.effect !== null) effects.push(step.effect);
  }
  return { state, effects };
}

const actionIds = (state: RecoveryState) => recoveryScreen(state).actions.map((a) => a.id);

describe('error recovery', () => {
  it('offers only the gentle recovery for the first failure', () => {
    const { state, effects } = play([failed]);
    expect(state.failed).toBe(true);
    expect(actionIds(state)).toEqual(['restart']);
    expect(effects).toEqual([]);
    const after = play([chose('restart')], state);
    expect(after.effects).toEqual(['drop-game']);
    expect(after.state.failed).toBe(false);
    // A remount, so the render that threw is not simply re-run.
    expect(after.state.generation).toBe(state.generation + 1);
  });

  it('does not escalate when the app rendered between the two failures', () => {
    // The bug this replaced: the counter was monotonic for the life of the
    // mount, so a second, unrelated failure in the same session — with the home
    // screen rendering perfectly well in between — offered "Clear saved data"
    // as the only button, and one tap emptied the store.
    const { state } = play([failed, chose('restart'), settled, failed]);
    expect(state.tries).toBe(0);
    expect(actionIds(state)).toEqual(['restart']);
    const thirdTime = play([failed, chose('restart'), settled, failed, chose('restart'), settled, failed]);
    expect(recoveryScreen(thirdTime.state).actions.some((a) => a.destructive)).toBe(false);
  });

  it('escalates only when the app never came back up', () => {
    const { state } = play([failed, chose('restart'), failed]);
    expect(state.tries).toBe(1);
    expect(actionIds(state)).toEqual(['restart', 'clear']);
    // Escalating adds an option; it never takes the safe one away or demotes it.
    expect(recoveryScreen(state).actions[0]).toMatchObject({ id: 'restart', destructive: false });
  });

  it('never erases on one press, and offers to keep the data when it asks', () => {
    const stuck = play([failed, chose('restart'), failed]);
    const asked = play([chose('clear')], stuck.state);
    expect(asked.effects).toEqual([]); // still nothing erased
    expect(asked.state.confirming).toBe(true);
    expect(actionIds(asked.state)).toEqual(['cancel', 'clear']);
    const kept = play([chose('cancel')], asked.state);
    expect(kept.effects).toEqual([]);
    expect(actionIds(kept.state)).toEqual(['restart', 'clear']);
    const erased = play([chose('clear')], asked.state);
    expect(erased.effects).toEqual(['clear-records']);
    expect(erased.state.failed).toBe(false);
    expect(erased.state.confirming).toBe(false);
  });

  it('always offers a way out that destroys nothing, and never puts the destructive one first', () => {
    // Every state reachable in six signals, rather than the handful written out
    // above: the property that failed before was reachability, not any one screen.
    const seen = new Map<string, RecoveryState>();
    const queue: RecoveryState[] = [FRESH];
    const signals: RecoverySignal[] = [failed, settled, chose('restart'), chose('clear'), chose('cancel')];
    for (let depth = 0; depth < 6 && queue.length; depth++) {
      const next: RecoveryState[] = [];
      for (const state of queue) {
        for (const signal of signals) {
          const after = recoveryStep(state, signal).state;
          const key = `${after.failed}:${after.tries > 2 ? 'many' : after.tries}:${after.confirming}`;
          if (seen.has(key)) continue;
          seen.set(key, after);
          next.push(after);
        }
      }
      queue.length = 0;
      queue.push(...next);
    }
    expect(seen.size).toBeGreaterThan(3);
    for (const state of [...seen.values(), FRESH]) {
      const screen = recoveryScreen(state);
      expect(screen.actions.length).toBeGreaterThan(0);
      expect(screen.actions[0].destructive).toBe(false);
      expect(screen.actions.some((a) => !a.destructive)).toBe(true);
      expect(screen.actions.filter((a) => a.destructive).length).toBeLessThan(2);
      expect(screen.title.length).toBeGreaterThan(0);
      expect(screen.body.length).toBeGreaterThan(0);
    }
  });

  it('names every record erasing takes, and the one it keeps', () => {
    // Consent to a destructive action is only worth anything if the list is
    // complete. The record left off the first version of this copy was the
    // entitlement — the only one that cost money.
    const confirm = recoveryScreen({ ...FRESH, failed: true, tries: 1, confirming: true });
    const named: Record<keyof typeof STORAGE_KEYS, RegExp> = {
      game: /game in progress/,
      stats: /stats/,
      daily: /daily challenge history/,
      ladder: /ladder rank/,
      puzzles: /puzzles you have solved/,
      settings: /settings/,
      appsettings: /settings/,
      entitlements: /Pro unlock is kept/,
    };
    for (const key of Object.keys(STORAGE_KEYS) as (keyof typeof STORAGE_KEYS)[]) {
      expect(confirm.body).toMatch(named[key]);
    }
    // …and the entitlement is named as kept because it really is kept.
    expect(CLEARED_KEYS).not.toContain(STORAGE_KEYS.entitlements);
    expect(KEPT_ON_CLEAR).toEqual([STORAGE_KEYS.entitlements]);
    expect(confirm.body).toMatch(/cannot be undone/i);
  });

  it('keeps getDerivedStateFromError in step with the model', () => {
    // React hands it no state, so it cannot go through recoveryStep; a mid-flight
    // confirmation has to be dropped by both or the next render erases on one tap.
    const confirming: RecoveryState = { failed: true, tries: 1, generation: 2, confirming: true };
    expect(recoveryStep(confirming, failed).state).toMatchObject(onRenderFailed());
    expect(onRenderFailed()).toEqual({ failed: true, confirming: false });
    expect(recoveryStep(confirming, failed).state.tries).toBe(1);
  });
});

/** The boundary itself cannot be imported here (React Native), so its wiring is checked against the source. */
describe('the boundary renders the model', () => {
  const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');

  it('decides nothing of its own', () => {
    expect(app).toMatch(/static getDerivedStateFromError\(\)\s*\{\s*return onRenderFailed\(\);/);
    expect(app).toMatch(/recoveryScreen\(this\.state\)/);
    expect(app).toMatch(/screen\.actions\.map\(/);
    // The labels and the copy live in the model, so a screen cannot be written
    // here that the tests above never see.
    expect(app).not.toMatch(/Clear saved data|Start a new game|Erase everything/);
  });

  it('signals a settled render from inside the tree, and stops when it unmounts', () => {
    // The beacon mounts only once the whole subtree has committed, so a render
    // that threw never signals; the timer is what tells a recovery that took
    // from one that came straight back up and fell over again.
    expect(app).toMatch(/\{this\.props\.children\}\s*<SettleBeacon onSettled=\{this\.settled\} \/>/);
    expect(app).toMatch(/setTimeout\(this\.props\.onSettled, SETTLE_MS\)/);
    expect(app).toMatch(/componentWillUnmount\(\)\s*\{[\s\S]*clearTimeout\(this\.timer\)/);
  });
});
