# Two Kings Chess

Read AGENTS.md first. It holds the working rules every coding agent follows in this repository; this file adds the notes specific to this project.

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
- `npm run test:e2e` — build the website for the `/chesscheatser/` sub-path and
  play it in headless Chromium with the site's headers on every response
  (`e2e/run.mjs`); `npm run test:all` runs the unit suite and then this
- `npm run build:web -- --host <host> [--base-url /<path>]` — the website
  (`scripts/build-web.mjs`; see Website below)
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
  resort clears all of them but the purchases, so a key spelled out beside
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
- `src/storage.ts` — the only reader and writer of those keys. A write the store
  refuses is never swallowed: on the Pages build the few megabytes of storage are
  the shared origin's, another app can fill them, and every save then throws.
  `saveJSON` and `remove` record the refusal, `StorageNote` (`src/ui/components.tsx`,
  mounted under every screen in `App.tsx`) says so until the key's next write gets
  through, and each refused record is written again after the next write the store
  accepts, but only while it is still the newest value asked of its key. The game
  and puzzle boards are sized from the window, so they take the note's height off
  (`useStorageNoteHeight`). `e2e/run.mjs` fills the origin's storage, plays on, then
  frees it and checks that everything caught up.
- `src/recovery.ts` — what the error boundary offers after a render throws, as a
  pure state machine so it can be tested without a renderer. Two rules, both
  pinned by tests: the non-destructive recovery is always offered and always
  first, and erasing the records is offered only when the app has *not* rendered
  since the last recovery (`SettleBeacon` in `App.tsx` signals that it has) and
  only behind a confirmation. Escalating on a counter that nothing reset is how
  a second, unrelated failure in one session came to offer "Clear saved data" as
  the only button.
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

## Native configuration

`app.json` states the app's native posture explicitly, and `src/__tests__/appConfig.test.ts` pins it by running `expo config --type introspect` (the merged prebuild result, not the file) and by scanning every AndroidManifest.xml under node_modules: the splash is configured through the `expo-splash-screen` plugin (SDK 57 ignores a top-level `splash` block, and the plugin no-ops without props), `expo-system-ui` is installed because `userInterfaceStyle: "automatic"` does nothing on Android without it, `allowBackup` is true on purpose (the store is the player's own record with no server copy; `validate.ts` bounds what a restore can plant), and INTERNET, the storage/media permissions and the template's SYSTEM_ALERT_WINDOW overlay are blocked because the app has no network code (`Share.share` hands text to the OS) and a game has no reason to draw over other apps; only VIBRATE survives in the merged main manifest. "No network code" is checked against the source as a list of names (`fetch(`, the two socket APIs, `expo-updates`, `expo-network`, `react-native-webview`, an in-app browser) *and* as an address count: the tree holds one URL, the source link, so a remote `<Image>` `uri`, a web font or an endpoint fails that test rather than failing silently on a device with the permission blocked. A dev client still needs INTERNET to fetch its bundle, so `plugins/withDebugInternet.js` (a verbatim copy of drawdraw's) adds it back to `android/app/src/debug/AndroidManifest.xml` alone at prebuild. Adding a native module means checking that test: a module manifest that brings a new permission fails it until the permission is either blocked or listed as used. The former `src/ui/__tests__/appearance.test.ts` lives inside this file now.

## Settings

The player's preferences are one record, `twokings.appsettings.v1`: `colorScheme`
(`system | dark | light`), `boardTheme`, `pieceStyle`, `sounds`, `haptics`, `reduceMotion`
(`system | on | off`), `aura` (a comeback-aura cosmetic id, kept only if it names one in
`AURAS`) and `seenIntro`, the onboarding flag. The other seven keys in
`STORAGE_KEYS` (`src/storage.ts`) are the game config, the saved game, stats, the daily
record, the ladder, puzzle progress and the purchases (`supporter` and the three packs). The record's types and
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
`PRIVACY.md` and `CHANGELOG.md` at `blob/HEAD/` on the source host; the contract test
holds app.json's version and package.json's equal, since nothing else makes one follow
the other.
Starting a game is confirmed through the same helper when a game is saved
(`NEW_GAME_PROMPT` in `src/game/flow.ts`, "Start a new game?"): `GameScreen` autosaves
over the one slot as soon as it mounts, so a game left half-played is replaced before
the first move of the new one. Only then — Resume is that saved game and never asks,
and with nothing stored Play is still one tap. On the web the About links carry `href`
(and `hrefAttrs`), because react-native-web renders a `View` with one as a real anchor
and a link the browser cannot open in a new tab or copy is a link in name only; the
press handler is left off there so the address does not open twice, and everywhere else
`openURL` hands it to the system browser as before.
`src/__tests__/settings-contract.test.ts` pins the keys, the rows, the tables, the
null rule, what Reset touches, what starting a game asks, the About text and its link's
web anchor, and the accessibility floor (every `Pressable` has a role; the shared
`Button` and `Segmented` are where most get it).

## Website

The browser build is also a website, on the art app's model: the game stays in the
browser and the host does only the hosting (headers, cache lifetimes, the 404 page,
refusing what is not part of the site). `public/` is that layer and the web export
copies it into the site: `index.html` is SDK 57's template for a single-page export
(the CLI replaces the first `%LANG_ISO_CODE%` and `%WEB_TITLE%` and appends the bundle's
script before the first `</body>`, so none of those may appear earlier, comments
included), `guard.js` the safety net (loaded first, ahead of `site.css` too, since
it hears only the load failures it is already listening for; ES5, using nothing in
the page newer than IE 9 has, which the website test parses; it notes a stylesheet
or bundle that fails to load, or a bundle that throws or rejects before `#root` has
children, and stays silent once the app has drawn, where `src/recovery.ts` takes
over: the browser suite holds both halves, a sound that fails after a move included),
`site.css`, `404.html`, `robots.txt`, `.well-known/security.txt` and the host
configs `_headers`, `_redirects`, `.htaccess`; `deploy/nginx.conf` is nginx's.
`scripts/build-web.mjs` runs the export and then writes the CSP and referrer
`<meta>` tags into every page from `public/_headers`. They are not in
`public/index.html` because that is also the dev server's page, whose live reload a
policy would block. It also moves `404.html`'s root-absolute addresses and
`.htaccess`'s `ErrorDocument` under `--base-url`, keeps only the `--host`'s config,
drops `metadata.json`, and refuses a page that names a file the site does not hold.
The export empties its output folder first, so `outputRefusal` checks `--output-dir`
before anything runs: inside the checkout only `dist-web`, `dist` or `web-build`
(`OUT_FOLDERS`, each in `.gitignore`), never the checkout or a folder holding it, and
elsewhere a folder that is new, empty or a previous build (`index.html` and `_expo/`),
compared by real path. The website test runs the script against a stand-in exporter in
a temporary folder, because a broken guard tried on the checkout deletes it.
`app.config.js` exists only to pass `WEB_BASE_URL` into `experiments.baseUrl` for a
sub-path build; unset, app.json is used as written.

The policy is one set of values in four places (`_headers`, `.htaccess`,
`nginx.conf`, the `<meta>`, which drops only `frame-ancestors`), and
`src/__tests__/website.test.ts` reads it back out of each and fails when they
differ, along with the cache lifetimes, where nginx sets its headers (at server level
only: a location with an `add_header` of its own, at any depth, drops them all) and
what each host serves. nginx and Apache serve the site's own paths and answer 404 for
everything else; Netlify cannot, so `_redirects` refuses the repository's entries by
name; the test runs every file `git ls-files` lists through all three, read the way
each host reads its config (`e2e/hosts.mjs`), and the browser suite runs every file of
a real build through them. `nginx.conf` is for a site at the root of its domain: its
locations and cache map all start at `/`. It was measured: `style-src` has
`'unsafe-inline'` because expo-font writes the glyph font's `@font-face` into a
`<style>` as text, and that text holds the base path and the font's content hash, so
no fixed hash covers every build; react-native-web's own `<style>` would need only the
hash of the empty string, since it fills it through `insertRule`. The browser suite
measures both, and fails once nothing needs `'unsafe-inline'`. Trusted Types are
enforced with `trusted-types 'none'`. The browser suite serves every scenario through
`e2e/serve.mjs`, which sends `_headers` as written under the sub-path, answers
`404.html` for anything missing, refuses dotfiles and the host configs, and records
requests outside the site; `openApp` fails a scenario on any violation, any console
line about the policy, the permissions policy or Trusted Types, and any request
outside the site. So a change that loads something new (a font, an image, a fetch)
fails there until the policy allows it in every place at once. Not 4190 for the
suite's port: Node's `fetch` refuses it as a bad port.

What the browser cannot do degrades visibly: the Vibration switch shows off and is
disabled on the web, with a hint saying why (`src/haptics.ts` plays nothing there; the
stored choice is left alone for the phone), and Share result
goes through `shareOnWeb` in `src/share.ts` (the share sheet, else the clipboard,
else the text shown to copy) with a note under the button, since react-native-web's
`Share.share` simply rejects where `navigator.share` is missing.

## Conventions

This repository follows `CONVENTIONS.md`, which is identical in every platteration
repository and pinned by the conventions test (`npm run test:conventions`, or
`tests/test_conventions.py` in a Python repository): the script set (`test`,
`typecheck`, `lint`, `check`, `test:e2e`, `test:all`), Node 22 via `.nvmrc`, one
`.editorconfig`, ESLint per stack, the `ci.yml` shape, the documents every repository
carries and the README skeleton. The repository's check command (`npm run check`, or
`ruff check .` then `pytest -q` in a Python repository) is the gate before a push. To
change a convention, change it in every repository in one pass and update the hashes in
the test.
