# Two Kings Chess

Expo (React Native, TypeScript) app for a chess variant: two kings per side,
randomly generated armies, comeback powers for whichever side is losing, and
an optional cheating computer opponent.

## Commands

- `npm install`
- `npm start` — Expo dev server (Expo Go on a phone, or `npm run web`)
- `npm test` — Vitest suite for the engine and game layer
- `npm run typecheck` — `tsc --noEmit`
- `CI=1 npx expo export --platform web|android --output-dir <dir>` — Metro bundle check

## Layout

- `src/engine/` — pure TypeScript, no React. `position.ts` holds the board,
  move generation, make/unmake and the variant's game-result rules.
  `setup.ts` generates seeded random armies. `ai.ts` is the alpha-beta search
  (sync `chooseMove`, UI-yielding `chooseMoveAsync`). `cheat.ts` generates
  illegal-but-plausible moves and decides when the computer plays one.
- `src/game/` — `events.ts` folds an append-only event log (move / pass /
  accuse, with `by: 'ai'` for the computer catching the human) onto a setup;
  `useGame.ts` is the React hook that drives a game. `daily.ts`, `ladder.ts`
  and `puzzles.ts` hold the mode-specific logic. `flow.ts` holds the pure
  decisions the screens fold through (undo eligibility, reporting a result once,
  folding an outcome into the stats), so they can be tested without a renderer.
- `src/validate.ts` — everything loaded from storage goes through it first, and
  `STORAGE_KEYS` is the whole list of what that is (the error boundary's second
  attempt clears every one of them, so a key spelled out beside its own module
  escapes both). `loadJSON` only spreads defaults under the parsed object, so an
  unknown enum (a board theme, an army size) reaches a lookup table as
  `undefined` and throws during render; these clamp to a known value or drop the
  record. A stored record is also an unbounded input: the saved game's event list
  is capped (`MAX_EVENTS`) because `sanitizeEvents` re-folds every shorter prefix
  when the tail does not apply, and each move's squares are bounded because
  `Position.makeMove` writes `board[m.to]` — one stored `to` of ten million
  stretches the board array and every later scan walks the holes. On the Pages
  build these are all plain localStorage on an origin shared with every other
  project site the account publishes, so the device owner is not the only writer.
- `src/settings.tsx` (appearance/feedback settings) and `src/entitlements.tsx`
  (Pro unlock behind a `StoreProvider`; bundled provider is a local mock).
- `scripts/mine-puzzles.ts` regenerates `assets/puzzles.json`
  (`npx tsx scripts/mine-puzzles.ts 25 1000 12`).
- `scripts/simulate.ts` is the balance harness: computer vs computer with
  comeback powers on and off (`npx tsx scripts/simulate.ts 12 medium fair`).
  Tuning knobs: `POWER_THRESHOLDS` in `src/engine/powers.ts`, the
  material/engine weights in `src/game/comeback.ts`.
- `src/ui/` — screens and the board. Pieces are text glyphs in the bundled
  `assets/fonts/ChessGlyphs.ttf` (DejaVu subset).

## Rules of the variant (keep tests in sync)

- A move is legal unless it leaves *all* of the mover's kings in check.
- You lose when a king in check has no rescuing move (checkmate), or when all
  your kings are in check and no move leaves one safe. Optional rule
  (`doubleCheck: 'loses'`, `Position.doubleCheckLoses`): all kings in check at
  the start of your turn is an instant loss. Kings are never captured.
- No castling. En passant, promotion, 50-move and threefold repetition apply.
- Comeback powers (default on): at the start of each turn a `power` event
  records the side to move's level (0–4) from a blend of material deficit and
  a quick engine search (`src/game/comeback.ts`); `Position.powers` makes the
  extra moves from `src/engine/powers.ts` legal for that side. Levels ramp by
  at most one per turn. Power moves carry `power: true` and are never counted
  as cheats.
- Caught cheat: move undone, computer skips, human moves twice. False
  accusation: computer moves twice. The computer never cheats on the first
  half of a double move (only its last move can be accused).
- Human cheat (one per game) caught by the computer: move undone, human
  skips, computer moves twice.
