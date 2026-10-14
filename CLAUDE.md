# Two Kings Chess

Read AGENTS.md first. It holds the working rules every coding agent follows in this repository; this file adds the notes specific to this project.

Expo (React Native, TypeScript) app for a chess variant: two kings per side,
randomly generated armies, comeback powers for whichever side is losing, and
an optional cheating computer opponent.

## Commands

- `npm install`
- `npm start` — Expo dev server (Expo Go on a phone, or `npm run web`)
- `npm test` — Vitest suite for the engine and game layer, then
  `node --test server/kit/selftest.mjs`, the shared kit's own self-test
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
- `node .github/audit/npm-audit.mjs` — CI's audit job: `npm audit --omit=dev` against
  the lockfile, red on every high or critical advisory `.github/audit/accepted.json`
  does not accept (the shared gate, pinned by the conventions test; each entry names
  every route it arrives by and expires within 90 days)

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
  `StoreProvider`: the bundled local mock on the phone and on a site with no
  backend, the website's shop where the site sells, chosen in `App.tsx`).
- Monetization rule: only cosmetics are sold, and each one is also earnable by
  playing. Never gate a utility (hints, undo, review) — this is a game about
  being behind, so paywalling help contradicts it.
- The website's sign-in and shop (see "Sign-in and the shop" below):
  `server/kit/` is the family's shared kit, copied verbatim and whole from the
  canonical copy, its `.d.ts` files included, and never edited here (a change goes
  to the canonical copy; `diff -r` against it is empty, and the conventions test
  holds it to the canonical copy's hash, `KIT_SHA`); `server/catalogue.js` sells
  the four existing purchases, one Stripe product each; `server/start.mjs` is the
  Node start script; `server/package.json` only makes `server/` ES modules (as the
  kit's own does), so Node loads the catalogue without reparsing it;
  `functions/api/[[path]].js` is the Cloudflare Pages entry. The page's side:
  `src/shop.web.ts` (the client, web only), `src/shop.ts` (its inert twin for
  every other platform), `src/shopTypes.ts` (types and the shared words),
  `src/account.tsx` (the provider) and `src/ui/AccountCard.tsx`.
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

`app.json` states the app's native posture explicitly, and `src/__tests__/appConfig.test.ts` pins it by running `expo config --type introspect` (the merged prebuild result, not the file) and by scanning every AndroidManifest.xml under node_modules: the splash is configured through the `expo-splash-screen` plugin (SDK 57 ignores a top-level `splash` block, and the plugin no-ops without props), `expo-system-ui` is installed because `userInterfaceStyle: "automatic"` does nothing on Android without it, `allowBackup` is true on purpose (the store is the player's own record with no server copy; `validate.ts` bounds what a restore can plant), and INTERNET, the storage/media permissions and the template's SYSTEM_ALERT_WINDOW overlay are blocked because the app has no network code (`Share.share` hands text to the OS) and a game has no reason to draw over other apps; only VIBRATE survives in the merged main manifest. "No network code" is checked against the source as a list of names (`fetch(`, the two socket APIs, `expo-updates`, `expo-network`, `react-native-webview`, an in-app browser) *and* as an address count: the tree holds one URL, the source link, so a remote `<Image>` `uri`, a web font or an endpoint fails that test rather than failing silently on a device with the permission blocked. A dev client still needs INTERNET to fetch its bundle, so `plugins/withDebugInternet.js` (a verbatim copy of drawdraw's) adds it back to `android/app/src/debug/AndroidManifest.xml` alone at prebuild. Adding a native module means checking that test: a module manifest that brings a new permission fails it until the permission is either blocked or listed as used. The former `src/ui/__tests__/appearance.test.ts` lives inside this file now. The no-network scan reads the phone app's source: it leaves out exactly the `*.web.ts(x)` modules (today `src/shop.web.ts` alone, pinned), which Metro bundles for the web build in place of a twin of the same name, and `server/` and `functions/`, which are not app source; `src/__tests__/shop.test.ts` holds the twin (`src/shop.ts`) inert and the web module reached only by its bare name, since importing `./shop.web` anywhere would put it in the phone app.

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
app.json's, through `src/about.ts`, which also quotes PRIVACY.md's two sentences (the
phone app's, and on the web the browser build's, which says what leaves the device if
the visitor signs in or buys), and links
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

## Sign-in and the shop

The website can sign people in with Google and sell the four existing purchases
(`supporter`, `pack.auras`, `pack.boards`, `pack.pieces`) through Stripe Checkout,
backed by the shared kit on the site's own origin under `api/`. It is off until the
owner sets the kit's variables (`server/kit/README.md`): with none, and on GitHub
Pages, the page draws no sign-in and no Buy, and the local preview store is what it
was. The kit allows no dot in an id, so the catalogue's `pack-auras` is the app's
`pack.auras`: `SERVER_ID` in `src/shop.web.ts` is the one table between them, typed
by `ProductId`, and the shop test holds the catalogue's names and descriptions equal
to `CATALOGUE` in `src/entitlements.tsx`. Prices are `STRIPE_PRICE_SUPPORTER`,
`STRIPE_PRICE_PACK_AURAS`, `STRIPE_PRICE_PACK_BOARDS`, `STRIPE_PRICE_PACK_PIECES`.

- The page asks `api/config` once at launch (`src/account.tsx`, web only:
  `SHOP_POSSIBLE` is false in the twin, so a phone is `off` from the first frame). A
  host with no backend answers it from `public/api/config`, a static file saying
  nothing is on, rather than a 404 that every visitor's console would show red; a
  404, a network error, a body that is not JSON or sign-in off are all "no shop".
  While the web build is asking, `EntitlementsProvider` has no store (`null`):
  nothing owned, nothing offered.
- With the shop on, the store `App.tsx` mounts is the server's (`owned` set on the
  `StoreProvider`): what `api/me` reports is what is owned, the device's entitlements
  record (local previews) unlocks nothing and is never written, and Buy leaves for
  Stripe's Checkout (only an `https://checkout.stripe.com/` address is followed).
  Only Stripe's signed webhook grants. With sign-in on and the shop off, the Account
  card is drawn and the local preview store stays.
- What is drawn follows the same record. The board, the piece set and the aura are
  drawn from `useDrawnCosmetics()` (`src/ui/theme.ts`; `PieceGlyph` and `useTheme`
  read it), which passes the settings record through `drawnCosmetics`
  (`src/appSettings.ts`) with the unlocked set `App.tsx`'s Root provides
  (`UnlockedCosmetics`): null, every choice as stored, where the store keeps its
  record on the device (`local` in `EntitlementsProvider`: the mock, so every phone
  and a site with no backend); otherwise `unlockedCosmetics(progress, owned)`, so
  with the shop on, and while the site is still being asked, a choice that is
  neither earned nor reported bought (refunded, signed out of, deleted with the
  account, a preview chosen before the shop was on) is drawn as its default. The
  record is never rewritten for it. Only the home screen's pickers read
  `settings.boardTheme`, `pieceStyle` or `aura` directly, and
  `src/__tests__/cosmetics.test.ts` holds that; the shop scenario reads the board,
  the pieces and the aura off a game on the screen.
- The Account card (`src/ui/AccountCard.tsx`, on the home screen beside the settings
  and About) and the store screen use the family's words (`SHOP_WORDS`, pinned);
  Delete account is confirmed through `src/confirm.ts`. What the address says on the
  way back (`?signin=failed`, `?purchase=success|cancelled`) is read once and taken
  out with `history.replaceState`; after a paid checkout `api/me` is asked five
  times over fifteen seconds. What it said (the thank-you) is cleared on sign-out
  and on Delete account, which take the purchase with them; a sign-out or delete
  the site refuses (anything but its 204) changes nothing and says so on the card.
  The product sent to Checkout is kept in `sessionStorage`
  (`SESSION_KEYS.checkout` in `src/storage.ts`, the tab's own, read once through
  `productOf`) to name it in the thank-you; nothing reads it at launch, so it is
  named beside `STORAGE_KEYS` rather than in it, and recovery has nothing there to
  clear.
- The kit gives a visitor one Checkout session per product: a second Buy before
  Stripe's webhook (another tab, a reload, the page back from Checkout) is given the
  session the first was, which it remembers for 30 days and asks Stripe about, and
  once that one is paid it makes no new one but answers 409 `payment_pending` until
  the webhook is recorded. The client reads every 409 as owned (it asks `api/me`
  again and leaves for nowhere), and a 502 (Stripe failed, or a press that met
  another still making its session) as "Purchase did not complete.", which can be
  pressed again; the store screen keeps Buy disabled while a press is out
  (`purchasing`). `e2e/fakes.mjs` answers as Stripe does: it serves
  `GET /v1/checkout/sessions/<id>` (open, then complete with its payment once
  `pay()` or `completed()` has paid it), gives a request sent again under an
  Idempotency-Key it has answered the first answer, and its `completed()` names the
  session it completes. The shop test presses Buy twice, and twice at once, for one
  product, before and after it is paid.
- No subscription is sold, so there is no Manage subscription, and the kit's
  `subscription_active` refusal of Delete account cannot arise here.

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
`site.css`, `404.html`, `robots.txt`, `.well-known/security.txt`, `api/config` (the
static "nothing is on" a host with no backend answers; with one, the backend answers
it) and the host configs `_headers`, `_redirects`, `.htaccess`; `deploy/nginx.conf`
is nginx's. A `--host cloudflare` build also gets `_routes.json` (`routesJson`),
sending `api/` and nothing else to the Pages Function; Cloudflare's own documentation
says `_headers` and `_redirects` are not applied to what a Function serves, which is
why the kit sets its own headers. Pages routes a Function by its file's path, so a
`--host cloudflare` build is refused unless `cloudflareEntry(base)` exists
(`functions/api/[[path]].js` at the root, `functions/<path>/api/` under
`--base-url`, which `server/kit/README.md` describes moving it to).
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
only: a location with an `add_header` of its own, at any depth, drops them all; the
one exception is `location ^~ /api/`, the proxy to the site's API, which adds exactly
the server's Strict-Transport-Security line so that the kit's own headers go out
alone, and the test pins that and reads the server block's headers from its own
scope) and what each host serves, `api/` proxied on nginx. nginx and Apache serve the site's own paths and answer 404 for
everything else; Netlify cannot, so `_redirects` refuses the repository's entries by
name; the test runs every file `git ls-files` lists through all three, read the way
each host reads its config (`e2e/hosts.mjs`), and the browser suite runs every file of
a real build through them. `nginx.conf` is for a site at the root of its domain: its
locations and cache map all start at `/`. It asks for HTTP/2 on its `listen` lines,
never with `http2 on;` (nginx 1.25.1 and later; the 1.24 of Ubuntu 24.04 and GitHub's
runner refuses the whole file over it, checked with `nginx -t`), and its allow-list
holds `api/config`, so a server whose `location ^~ /api/` was deleted, as the file
says to do without an API, still answers it; the website test pins both. That
location's `error_page 502 504 /404.html` answers an API that is not running with the
site's not-found page and every header (status kept) where nginx's own page went out
with HSTS alone, and both server blocks, the port-80 redirect's too, set
`server_tokens off`. `.htaccess` wraps nothing in `<IfModule>` (on a stock Debian or
Ubuntu Apache, with `mod_rewrite` and `mod_headers` off, a wrapped rule was skipped
without a word and the folder went out with no headers and no refusals; unwrapped, it
is a 500 and a log line) and sends Strict-Transport-Security unconditionally
(`env=HTTPS` is mod_ssl's alone, so behind a proxy that ends TLS it was never sent);
the conventions test holds both files to that, and the website test holds README to
what the server configuration must give Apache (`AllowOverride All`, `a2enmod rewrite
headers`, `ServerTokens Prod`, and the API's `ProxyPass` with its `ErrorDocument 502`,
`503` and `504` lines). `.well-known/security.txt` lists the private advisory form and
then the issues page (SECURITY.md says to ask there for a private channel while
private reporting is off), and its `Policy` is SECURITY.md on `main`. It was
measured: `style-src` has `'unsafe-inline'` because expo-font writes the glyph
font's `@font-face` into a `<style>` as text, and that text holds the base path and the font's content hash, so
no fixed hash covers every build; react-native-web's own `<style>` would need only the
hash of the empty string, since it fills it through `insertRule`. The browser suite
measures both, and fails once nothing needs `'unsafe-inline'`. `connect-src 'self'`
is the site's own `api/` and nothing else (Google and Stripe are top-level
navigations, which the policy does not govern); the shop scenario fails with
`'none'`. Trusted Types are enforced with `trusted-types 'none'`. The browser suite serves every scenario through
`e2e/serve.mjs`, which sends `_headers` as written under the sub-path, answers
`404.html` for anything missing, refuses dotfiles and the host configs, and records
requests outside the site; `openApp` fails a scenario on any violation, any console
line about the policy, the permissions policy or Trusted Types, and any request
outside the site. So a change that loads something new (a font, an image, a fetch)
fails there until the policy allows it in every place at once. Not 4190 for the
suite's port: Node's `fetch` refuses it as a bad port. The shop scenario serves the same
build on the next port with the kit behind `api/` (`serve(..., { api })`, as a Pages
Function or nginx's proxy would: none of `_headers`' headers on its answers) and
Google and Stripe as fakes handed to the kit as its `fetch` (`e2e/fakes.mjs`, shared
with the unit test). Playwright routes no redirect's target, and the kit's sign-in
start answers with a redirect to Google, so the scenario takes that redirect where the
browser receives it and answers as Google would; Stripe's Checkout is a navigation of
the page's own, which `page.route` takes as it is.

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
