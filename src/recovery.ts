/**
 * What the error boundary offers after a render throws, as a pure state machine
 * so it can be tested without a renderer: `App.tsx` pulls in React Native, and
 * the decisions here are the part that has been wrong before.
 *
 * Two rules hold for every reachable state, and both are tested:
 *
 * 1. **The non-destructive way out is always offered, and always first.** The
 *    first version of this screen escalated on a counter that nothing ever
 *    reset, so a second unrelated failure in the same session replaced "Start a
 *    new game" with "Clear saved data" as the *only* button — one tap, and
 *    everything the player owned was gone.
 * 2. **Erasing the records is only offered when the app has not rendered since
 *    the last recovery**, and only behind a confirmation. "It failed again, so
 *    the culprit is one of the other records" is sound reasoning only when
 *    nothing worked in between; a successful render in between says the first
 *    recovery did take and this is a different problem.
 */

/**
 * How long the app has to stay up before a render counts as a recovery. Long
 * enough that a launch which loads storage, waits on fonts, and only then
 * throws is never mistaken for a healthy session; short enough that anyone who
 * actually got to the menu and played is back to the gentle recovery.
 */
export const SETTLE_MS = 8000;

export interface RecoveryState {
  /** A render threw: the fallback screen is showing instead of the app. */
  failed: boolean;
  /** Recoveries taken since the app last rendered for `SETTLE_MS` without failing. */
  tries: number;
  /** Bumped on every recovery so the tree remounts rather than re-rendering the state that threw. */
  generation: number;
  /** The destructive action has been chosen and is waiting to be confirmed. */
  confirming: boolean;
}

export const FRESH: RecoveryState = { failed: false, tries: 0, generation: 0, confirming: false };

export type RecoveryActionId = 'restart' | 'clear' | 'cancel';

export type RecoverySignal =
  /** A render threw (the boundary's `getDerivedStateFromError`). */
  | { type: 'failed' }
  /** The app rendered and stayed up for `SETTLE_MS`. */
  | { type: 'settled' }
  /** A button on the fallback screen was pressed. */
  | { type: 'chose'; action: RecoveryActionId };

/** Storage the boundary has to clear before it remounts, if any. */
export type RecoveryEffect = 'drop-game' | 'clear-records' | null;

export interface RecoveryStep {
  state: RecoveryState;
  effect: RecoveryEffect;
}

/**
 * The patch `getDerivedStateFromError` returns. React hands it no state, so it
 * cannot go through `recoveryStep`; the two are kept in step by a test.
 */
export function onRenderFailed(): Pick<RecoveryState, 'failed' | 'confirming'> {
  return { failed: true, confirming: false };
}

export function recoveryStep(state: RecoveryState, signal: RecoverySignal): RecoveryStep {
  switch (signal.type) {
    case 'failed':
      return { state: { ...state, ...onRenderFailed() }, effect: null };
    case 'settled':
      // The app is up: whatever was wrong before, the recovery taken for it
      // worked, so the next failure starts over from the gentle option.
      return { state: state.failed ? state : { ...state, tries: 0 }, effect: null };
    case 'chose':
      switch (signal.action) {
        case 'restart':
          return { state: recovered(state), effect: 'drop-game' };
        case 'cancel':
          return { state: { ...state, confirming: false }, effect: null };
        case 'clear':
          // Never on the first press: erasing everything is asked for twice.
          return state.confirming ? { state: recovered(state), effect: 'clear-records' } : { state: { ...state, confirming: true }, effect: null };
      }
  }
}

function recovered(state: RecoveryState): RecoveryState {
  return { failed: false, confirming: false, tries: state.tries + 1, generation: state.generation + 1 };
}

export interface RecoveryAction {
  id: RecoveryActionId;
  label: string;
  /** True for the one action that erases records. Never the first in the list. */
  destructive: boolean;
}

export interface RecoveryScreen {
  title: string;
  body: string;
  /** In display order: the first is the primary button, and is never destructive. */
  actions: RecoveryAction[];
}

const RESTART: RecoveryAction = { id: 'restart', label: 'Start a new game', destructive: false };

/**
 * What the fallback screen shows. The copy names every record `clearAll` drops
 * and the one it keeps: consent to erasing everything is only meaningful if the
 * list is complete, and the entitlement is the record that cost money.
 */
export function recoveryScreen(state: RecoveryState): RecoveryScreen {
  if (state.confirming) {
    return {
      title: 'Erase saved data?',
      body:
        'This erases the game in progress, your stats, the daily challenge history and streak, your ladder rank, the puzzles you have solved, and your game and appearance settings. Your Pro unlock is kept. This cannot be undone.',
      actions: [
        { id: 'cancel', label: 'Keep my data', destructive: false },
        { id: 'clear', label: 'Erase everything', destructive: true },
      ],
    };
  }
  if (state.tries === 0) {
    return {
      title: 'Something went wrong',
      body: 'The game could not be shown. Starting a new game clears the game in progress and returns to the menu.',
      actions: [RESTART],
    };
  }
  return {
    title: 'Something went wrong',
    body:
      'It failed again without getting as far as the menu, so something else that was saved may be at fault. Try starting a new game first — erasing everything else is a last resort, and it asks before it does anything.',
    actions: [RESTART, { id: 'clear', label: 'Clear saved data', destructive: true }],
  };
}
