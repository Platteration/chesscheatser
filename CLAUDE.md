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
  and `puzzles.ts` hold the mode-specific logic.
- `src/settings.tsx` (appearance/feedback settings), `src/cosmetics.ts` (the
  catalogue plus `unlockedCosmetics`, which decides what is available from
  progression or purchases) and `src/entitlements.tsx` (purchases behind a
  `StoreProvider`; bundled provider is a local mock).
- Monetization rule: only cosmetics are sold, and each one is also earnable by
  playing. Never gate a utility (hints, undo, review) — this is a game about
  being behind, so paywalling help contradicts it.
- `scripts/mine-puzzles.ts` regenerates `assets/puzzles.json`
  (`npx tsx scripts/mine-puzzles.ts 25 1000 12`).
- `scripts/simulate.ts` is the balance harness: computer vs computer with
  comeback powers on and off (`npx tsx scripts/simulate.ts 12 medium fair`).
  Tuning knobs: `POWER_THRESHOLDS` and `MAX_POWER` in `src/engine/powers.ts`,
  the material/engine weights in `src/game/comeback.ts`, and the AI's pick
  policy `chooseDraft`. Watch "weaker side won" in the harness: it should sit
  near half with powers on, versus roughly a third with them off.
- `src/ui/` — screens and the board. Pieces are text glyphs in the bundled
  `assets/fonts/ChessGlyphs.ttf` (DejaVu subset).

## Rules of the variant (keep tests in sync)

- A move is legal unless it leaves *all* of the mover's kings in check.
- You lose when a king in check has no rescuing move (checkmate), or when all
  your kings are in check and no move leaves one safe. Optional rule
  (`doubleCheck: 'loses'`, `Position.doubleCheckLoses`): all kings in check at
  the start of your turn is an instant loss. Kings are never captured.
- Kings per side is a setting (`GameConfig.kings`, `SetupOptions.kings`).
  With one king ("Handicap Chess") the rules above collapse to ordinary chess:
  `allKingsInCheck` and `result()` already guard on `kings.length >= 2`, and
  `setupIsPlayable` skips the instant-win test.
- No castling. En passant, promotion, 50-move and threefold repetition apply.
- Comeback powers (default on): at the start of each turn a `draft` event
  records the side to move's measured deficit (a blend of material and a quick
  engine search, `src/game/comeback.ts`) and which power it drafted, if the
  level rose. Powers are `PowerTag`s from `src/engine/powers.ts`; each level-up
  offers three unowned tags (`offerPowers`) and the side keeps one, up to
  `MAX_POWER` picks, at most one per turn. `Position.powerTags` makes those
  moves legal and is part of the Zobrist key. Power moves carry `power: true`
  and are never counted as cheats.
- Legacy `power` events (a whole numeric level) still replay, via
  `TAGS_FOR_LEVEL`/`tagsForLevel`, so saved games from before drafting work.
- Caught cheat: move undone, computer skips, human moves twice. False
  accusation: computer moves twice. The computer never cheats on the first
  half of a double move (only its last move can be accused).
- Human cheat (one per game) caught by the computer: move undone, human
  skips, computer moves twice.
