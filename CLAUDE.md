# Two Kings Chess

Expo (React Native, TypeScript) app for a chess variant: two kings per side,
randomly generated armies, comeback powers for whichever side is losing, and
an optional cheating computer opponent.

## Commands

- `npm install`
- `npm start` — Expo dev server (Expo Go on a phone, or `npm run web`)
- `npm test` — Vitest suite for the engine and game layer
- `npm run lint` — `eslint .` (ESLint 9 flat config, Expo's preset; warnings are
  advice, errors fail)
- `npm run typecheck` — `tsc --noEmit`
- `npm run check` — the gate before a push: the lint, the type check, the unit
  tests and `npm run test:conventions` (the repository's shape against
  `CONVENTIONS.md`)
- `npm run test:e2e` — export the web build and drive it in headless Chromium
  (`e2e/run.mjs`); `npm run test:all` runs the unit suite and then this
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
  `STORAGE_KEYS` is the whole list of what that is (the error boundary's last
  resort clears all of them but the Pro entitlement, so a key spelled out beside
  its own module escapes both). `loadJSON` only spreads defaults under the parsed
  object, so an unknown enum (a board theme, an army size) reaches a lookup table
  as `undefined` and throws during render; these clamp to a known value or drop
  the record. A stored record is also an unbounded input: the saved game's event
  list is capped (`MAX_EVENTS`, sized against measured games rather than a guess
  — the 402 measured had a median of 180 events and a longest of 1676), and each
  move's squares are bounded because `Position.makeMove` writes `board[m.to]` —
  one stored `to` of ten million stretches the board array and every later scan
  walks the holes. A cap on the player's own record is not a licence to delete
  it: an over-long saved game is clipped to the cap and `savedGameNote` says so
  where Resume was. On the Pages build these are all plain localStorage on an
  origin shared with every other project site the account publishes, so the
  device owner is not the only writer.
- `src/recovery.ts` — what the error boundary offers after a render throws, as a
  pure state machine so it can be tested without a renderer. Two rules, both
  pinned by tests: the non-destructive recovery is always offered and always
  first, and erasing the records is offered only when the app has *not* rendered
  since the last recovery (`SettleBeacon` in `App.tsx` signals that it has) and
  only behind a confirmation. Escalating on a counter that nothing reset is how
  a second, unrelated failure in one session came to offer "Clear saved data" as
  the only button.
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

## Native configuration

`app.json` states the app's native posture explicitly, and `src/__tests__/appConfig.test.ts` pins it by running `expo config --type introspect` (the merged prebuild result, not the file) and by scanning every AndroidManifest.xml under node_modules: the splash is configured through the `expo-splash-screen` plugin (SDK 57 ignores a top-level `splash` block, and the plugin no-ops without props), `expo-system-ui` is installed because `userInterfaceStyle: "automatic"` does nothing on Android without it, `allowBackup` is true on purpose (the store is the player's own record with no server copy; `validate.ts` bounds what a restore can plant), and INTERNET, the storage/media permissions and the template's SYSTEM_ALERT_WINDOW overlay are blocked because the app has no network code (`Share.share` hands text to the OS) and a game has no reason to draw over other apps; only VIBRATE survives in the merged main manifest. A dev client still needs INTERNET to fetch its bundle, so `plugins/withDebugInternet.js` (a verbatim copy of drawdraw's) adds it back to `android/app/src/debug/AndroidManifest.xml` alone at prebuild. Adding a native module means checking that test: a module manifest that brings a new permission fails it until the permission is either blocked or listed as used. The former `src/ui/__tests__/appearance.test.ts` lives inside this file now.

## Settings

The player's preferences are one record, `twokings.appsettings.v1`: `colorScheme`
(`system | dark | light`), `boardTheme`, `pieceStyle`, `sounds`, `haptics`, `reduceMotion`
(`system | on | off`) and `seenIntro`, the onboarding flag. The other seven keys in
`STORAGE_KEYS` (`src/storage.ts`) are the game config, the saved game, stats, the daily
record, the ladder, puzzle progress and the Pro entitlement. The record's types and
`DEFAULT_SETTINGS` live in `src/appSettings.ts`, which is free of React Native so the
tests can import it; `src/settings.tsx` is the provider and re-exports them. Every read
goes through `cleanSettings(raw, DEFAULT_SETTINGS)` in `src/validate.ts`, whose enum
tables are `SETTING_TABLES` (`Record<Union, true>`, own-property lookups only). `system`
scheme resolves through `resolveScheme`: a device that states no preference (React
Native answers `null`) is dark, the app's own pre-provider default. `system` motion is
`src/motion.ts`'s `useReduceMotion`, which reads `AccessibilityInfo` and treats a
rejected native query or a web page without `matchMedia` as unknown (false); the one
glide it governs is `Board.tsx`'s. Sound and Vibration are two switches, each gating a
module-level flag (`src/sounds.ts`, `src/haptics.ts`). Reset to defaults goes through
`src/confirm.ts` (`window.confirm` on the web, where react-native-web's `Alert.alert` is
an empty method; `Alert.alert` elsewhere), rewrites this one record and keeps
`seenIntro`. The About card's version is `expo-constants`' `expoConfig.version`, i.e.
app.json's, through `src/about.ts`, which also quotes PRIVACY.md's sentence and links
`PRIVACY.md` and `CHANGELOG.md` at `blob/HEAD/` on the source host.
`src/__tests__/settings-contract.test.ts` pins the keys, the rows, the tables, the
null rule, what Reset touches, the About text, and the accessibility floor (every
`Pressable` has a role; the shared `Button` and `Segmented` are where most get it).

## Conventions

This repository follows `CONVENTIONS.md`, which is identical in every platteration
repository and pinned by the conventions test (`npm run test:conventions`, or
`tests/test_conventions.py` in a Python repository): the script set (`test`,
`typecheck`, `lint`, `check`, `test:e2e`, `test:all`), Node 22 via `.nvmrc`, one
`.editorconfig`, ESLint per stack, the `ci.yml` shape, the documents every repository
carries and the README skeleton. `npm run check` is the gate before a push. To change a
convention, change it in every repository in one pass and update the hashes in the test.
