# Two Kings Chess (chesscheatser) — security & upgrade review (2026-09-09)

Two independent reviewers read every first-party file in this repository; a third then re-read each security or bug claim against the code and tried to refute it. Only claims that survived that check are listed as findings; the ones that did not are recorded at the end so they are not re-raised.

## Summary

Two Kings Chess is a polished, feature-complete Expo SDK 57 / RN 0.86 mobile chess variant: two kings a side, seeded random armies, comeback powers for whoever is losing, a computer that plays plausible illegal moves you can call out, plus daily challenge, ranked ladder, 62 mined puzzles and a Pro entitlement scaffold. The engine (src/engine, ~1500 lines of dependency-free TypeScript with alpha-beta, quiescence, a transposition table and killer/history ordering) is genuinely well built and well tested — 23 commits, perft checks, two-king rule tests, power-move tests and a 13-scenario Playwright suite over the web export. Every dependency is already current for SDK 57 and the 10 moderate npm advisories are all build-time transitives under @expo/config-plugins (xcode -> uuid) whose only 'fix' is a downgrade to Expo 46, so there is nothing to do there. The real gaps are tooling and store readiness, not dependencies: there is no linter or formatter at all (an orphaned eslint-disable sits in src/game/puzzles.ts pointing at a rule that never runs), the LICENSE is still Expo's template with 650 Industries as copyright holder, app.json sets userInterfaceStyle:"dark" which silently defeats the app's own 'System' appearance setting, Android's hardware back button does nothing on any screen, and there is no error boundary, no Dependabot, no pinned actions and no lint/audit/iOS-bundle step in CI. In the product itself the most visible loose end is Stats.biggestComeback: the whole maxDeficit pipeline is computed in fold() and carried through GameState but never written or displayed, so the app's headline mechanic has no scoreboard.

## Attack surface

This is an entirely offline, single-player Expo app: a grep of src/, App.tsx and index.ts finds no fetch, XMLHttpRequest, WebSocket, Linking or openURL anywhere, so PRIVACY.md's claim that the app makes no network requests of its own holds. The only data that crosses a trust boundary is what the app itself wrote earlier: six AsyncStorage keys (settings, in-progress game, stats, daily, ladder, puzzles) plus twokings.appsettings.v1 and twokings.entitlements.v1, all read back through src/storage.ts loadJSON with no schema validation. There is no server, no API key, no account and no analytics, so classic web/server risks (injection, SSRF, CORS, CSRF, auth) do not apply; there are no DOM sinks either, since every string is rendered through a React Native <Text>. The realistic adversary is therefore the device owner: the .github/workflows/pages.yml deploy publishes the web build to GitHub Pages, where AsyncStorage is localStorage and anyone can edit the entitlement record or a saved game from devtools. Secondary surfaces are the CI/CD supply chain (six unpinned GitHub Actions, a node -e in pages.yml that interpolates a workflow expression into a program, a Pages job holding pages:write and id-token:write) and the developer-only static file server in e2e/lib.mjs, which serves arbitrary paths on all interfaces while the e2e suite runs. Bundled third-party content is limited to a DejaVu subset font with its licence recorded (assets/fonts/LICENSE-DejaVu.txt), nine generated WAVs and assets/puzzles.json produced by scripts/mine-puzzles.ts; no code is vendored.

## Already done well

- No network surface at all: no fetch/XHR/WebSocket/Linking/openURL in src/, App.tsx or index.ts, so PRIVACY.md's 'no analytics, no third-party SDKs that phone home' is verifiable rather than aspirational.
- No unsafe sinks: no eval, new Function, innerHTML or dangerouslySetInnerHTML anywhere; every dynamic string (seed, square names, move SAN in src/ui/GameScreen.tsx) is rendered through React Native <Text>, so the web build has no XSS path.
- Every AsyncStorage call is wrapped in try/catch and falls back to a default (src/storage.ts:12-36), so a corrupt or unavailable store degrades instead of crashing.
- Saved event logs are replayed defensively: sanitizeEvents (src/game/useGame.ts:110-121) truncates to the longest prefix that folds without throwing, and App.tsx:71 rejects a saved game whose events is not an array or whose seed is not a number.
- The rules in CLAUDE.md match the implementation on every point I checked: legality = 'does not leave all of the mover's kings in check' (src/engine/position.ts:281), the optional instant-loss double check (position.ts:464), kings never capturable (position.ts:216/237/251, powers.ts:64, cheat.ts:34), power moves never counted as cheats (events.ts:79, useGame.ts:354), and the computer never cheating on the first half of a double move (useGame.ts:304-306).
- Event-sourced game state (src/game/events.ts fold) makes undo, autosave/resume and the whole cheat/accusation rollback fall out of one replay function, and it is directly unit-tested (src/game/__tests__/events.test.ts).
- Strong engine test suite for a hobby project: cheat candidates are asserted to be illegal, to never capture a king and to unmake cleanly across 40 generated positions (src/engine/__tests__/cheat.test.ts:33-57), and power moves are asserted disjoint from ordinary legal moves (src/engine/__tests__/powers.test.ts:74-79).
- Deterministic seeding without a server: mulberry32 in src/engine/random.ts plus an FNV-1a hash of the local date key in src/game/daily.ts:25-32 gives every player the same daily armies with no backend and no PII.
- Supply chain basics are in place: package-lock.json is committed at lockfileVersion 3 with integrity hashes on all 548 entries, no non-registry resolved URLs, no first-party postinstall scripts, and both workflows use npm ci on Node 22.
- .github/workflows/pages.yml declares an explicit least-privilege permissions block and a concurrency group rather than inheriting defaults.
- Accessibility is real, not decorative: every board square carries an accessibilityRole and a descriptive accessibilityLabel (src/ui/Board.tsx:104-106), which is also what the e2e suite drives.
- The end-to-end suite plays real games through the shipped web bundle and fails the run on any console or page error (e2e/lib.mjs:38-42), covering accusations, cheat mode, resume, the clock, Pro gating and puzzles.

## Findings (18)

| # | Severity | Category | Title | Where | Effort | Status |
|---|---|---|---|---|---|---|
| BUG-1 | Medium | bug | Undo stays enabled after the game ends, so one game can record two results (and farm ladder rank) | `src/ui/GameScreen.tsx:346` | trivial | confirmed |
| BUG-2 | Medium | bug | "System" appearance can never resolve to light on a device: app.json pins userInterfaceStyle to "dark" | `app.json:8` | trivial | confirmed |
| SEC-1 | Low | security | Pro entitlement is an unverified local flag and the bundled mock store grants it for free | `src/entitlements.tsx:35` | small | confirmed, severity lowered |
| BUG-3 | Low | bug | Promotion picker offers rook/bishop/knight for a power pawn move that only exists as a queen promotion; the tap is silently swallowed | `src/ui/GameScreen.tsx:234` | trivial | confirmed, severity lowered |
| BUG-4 | Low | bug | Persisted state has no validation or migration; a stale or hand-edited record silently changes the rules or white-screens the app | `src/storage.ts:16` | small | confirmed |
| SEC-2 | Low | security | e2e static server allows path traversal and listens on all interfaces | `e2e/lib.mjs:11` | trivial | confirmed |
| CI-2 | Low | supply-chain | All six GitHub Actions uses are floating major tags, and there is no Dependabot config or SECURITY.md | `.github/workflows/pages.yml:23` | small | confirmed |
| CI-3 | Low | ci-cd | ci.yml declares no permissions block | `.github/workflows/ci.yml:8` | trivial | confirmed |
| REL-1 | Low | reliability | Two search promises have no rejection handler; the puzzle screen can lock permanently | `src/ui/PuzzleScreen.tsx:120` | trivial | confirmed |
| REL-3 | Low | reliability | chooseCheat runs full legal-move generation per cheat candidate, blocking the JS thread when the computer cheats | `src/engine/cheat.ts:149` | small | confirmed |
| MISS-1 | Low | bug | Stats.biggestComeback is stored and initialised but never written or displayed | `src/game/config.ts:78` | trivial | found by second reviewer |
| MISS-2 | Low | reliability | No error boundary anywhere, and several throw sites run during render | `App.tsx:32` | small | found by second reviewer |
| MISS-3 | Low | bug | Android hardware back is unhandled, so back exits the app from every screen | `App.tsx:55` | trivial | found by second reviewer |
| MISS-4 | Low | security | LICENSE is Expo's template and attributes copyright to 650 Industries | `LICENSE:3` | trivial | found by second reviewer |
| MISS-5 | Low | reliability | Comeback measurement runs a synchronous depth-2 search on the JS thread on every ply | `src/game/useGame.ts:294` | small | found by second reviewer |
| BUG-5 | Info | bug | Comeback powers extend movement but never deliver check, and nothing tells the player | `src/engine/position.ts:67` | small | confirmed, severity lowered |
| CI-1 | Info | ci-cd | pages.yml interpolates a workflow expression directly into a node -e program | `.github/workflows/pages.yml:30` | trivial | confirmed, severity lowered |
| REL-2 | Info | reliability | generateSetup retries forever with no attempt cap, synchronously during render | `src/engine/setup.ts:390` | small | confirmed, severity lowered |

### BUG-1 · Undo stays enabled after the game ends, so one game can record two results (and farm ladder rank)

**Severity:** Medium · **Category:** bug · **Effort:** trivial · **Where:** `src/ui/GameScreen.tsx:346`

The Undo button is disabled for moves.length === 0, thinking and flagged, but not for gameOver, and useGame.undo clears `resigned`, so a finished game can be wound back and continued. The once-per-game guard keys on the move count, so the second finish produces a different key and onFinished fires again. Realistic accidental path: the player resigns, changes their mind, presses Review board then Undo, plays on and wins - stats now show 1 W and 1 L and gamesPlayed 2 for a single game. Deliberate path on the ranked ladder: win (rank +1), press Undo once, win again at a different move count (rank +1 again), repeat. App.tsx:105-111 applies the ladder result unconditionally on every report; only the daily is protected, because recordDaily keeps the first result for the date (src/game/daily.ts:59).

Evidence:

```
src/ui/GameScreen.tsx:346  <Button title="Undo" ... disabled={state.moves.length === 0 || state.thinking || state.flagged !== null} />
src/game/useGame.ts:358-362  const undo = useCallback(() => { if (flagged) return; setResigned(null); setEvents((prev) => undoEvents(...)); }, ...)
src/ui/GameScreen.tsx:77-79  const key = `${state.gameId}:${state.setup.seed}:${state.moves.length}:${state.resigned ?? ''}:${state.flagged ?? ''}`; if (reported.current === key) return; reported.current = key;
```

**Recommendation.** Two one-line fixes, apply both: add `|| state.gameOver` to the Undo button's disabled expression, and reduce the report key to `String(state.gameId)` so at most one outcome is ever recorded per game - gameId already increments in reset() on every newGame/rematch (src/game/useGame.ts:373), which is exactly the boundary you want.

### BUG-2 · "System" appearance can never resolve to light on a device: app.json pins userInterfaceStyle to "dark"

**Severity:** Medium · **Category:** bug · **Effort:** trivial · **Where:** `app.json:8`

app.json sets `"userInterfaceStyle": "dark"`, which Expo writes to UIUserInterfaceStyle in Info.plist on iOS (and applies via AppCompatDelegate night mode on Android). That forces the native trait collection to dark, so React Native's useColorScheme() always returns 'dark' regardless of the phone's setting. src/ui/theme.ts:105 resolves the 'system' preference from exactly that value, and 'system' is the shipped default (src/settings.tsx:21), so every user whose phone is in light mode gets a dark app and a Settings segment that appears to do nothing. Explicit Light still works, because that branch never reads the system scheme - which makes the inconsistency more confusing, not less. The e2e suite cannot catch this: on web userInterfaceStyle has no effect and prefers-color-scheme is honoured, so System behaves correctly in the only environment that is tested. (Separately, expo-system-ui is not in package.json, so on Android the setting may be a no-op, giving different behaviour on each of the three platforms.)

Evidence:

```
app.json:8  "userInterfaceStyle": "dark",
src/ui/theme.ts:104-105  const system = useColorScheme();
  const scheme = settings.colorScheme === 'system' ? (system === 'light' ? 'light' : 'dark') : settings.colorScheme;
src/settings.tsx:21  colorScheme: 'system',
```

**Recommendation.** Change app.json to `"userInterfaceStyle": "automatic"` so the OS scheme reaches useColorScheme(), and add expo-system-ui to dependencies so the setting is actually applied on Android. If a dark-first look is the intent, drop the 'System' option from the appearance control instead, so the UI does not offer a setting that cannot take effect.

### SEC-1 · Pro entitlement is an unverified local flag and the bundled mock store grants it for free

**Severity:** Low (reported as medium, adjusted after review) · **Category:** security · **Effort:** small · **Where:** `src/entitlements.tsx:35`

The bundled StoreProvider returns true from purchase() without any payment, and EntitlementsProvider defaults to it; App.tsx mounts <EntitlementsProvider> with no store prop, so a release build would ship the mock silently. The entitlement itself is a plaintext record written by saveJSON to AsyncStorage, with no receipt check anywhere. On the GitHub Pages web build (published by pages.yml on every push to main) AsyncStorage is localStorage, so localStorage.setItem('twokings.entitlements.v1','{"owned":["pro"]}') unlocks Pro permanently; the e2e suite already relies on the mock granting Pro instantly (e2e/lib.mjs:124-131). README.md and CLAUDE.md both say the mock is a scaffold to be replaced before release, so this is a known state rather than an oversight - but nothing in code enforces it, and the design that survives the swap (an unverified local boolean) is the part worth fixing now. Impact is bounded: Pro is hints, cosmetics and mid-game review, and the README states it never affects playing strength, so the worst case is lost revenue on a $3.99 unlock, not player harm.

Evidence:

```
src/entitlements.tsx:35-45  export const mockStore: StoreProvider = { ... async purchase() { return true; }, async restore() { return []; } };
src/entitlements.tsx:70  export function EntitlementsProvider({ children, store = mockStore }: ...)
App.tsx:35  <EntitlementsProvider>
src/entitlements.tsx:84  const next = { owned }; void saveJSON(KEY, next);
```

**Recommendation.** Make the store prop required (drop the `= mockStore` default) so a release build cannot compile without an explicit provider, and add a guard such as `if (!__DEV__ && store === mockStore) throw new Error('mock store in a release build')`. When a real provider lands (expo-iap / react-native-iap), derive isPro from the store on every launch - `getAvailablePurchases()` plus platform receipt validation - and treat the AsyncStorage record only as an offline cache, not as the source of truth. Also drop the '$3.99' placeholder from mockStore.getProducts so the public Pages build does not present a priced button that charges nothing.

*Reviewer note (confirmed, severity lowered):* Every mechanical claim checks out: mockStore.purchase() returns true unconditionally, EntitlementsProvider defaults store to mockStore, App.tsx mounts it with no store prop, and the grant is a plaintext AsyncStorage record with no receipt check, so on the Pages build localStorage.setItem('twokings.entitlements.v1', '{"owned":["pro"]}') unlocks Pro. But 'medium' overstates it for this app's threat model. There is no store integration at all yet - no expo-iap/react-native-iap in package.json - so there is no revenue to lose today; the only party who can grant themselves Pro is the device owner, and README.md:93-97 already documents the mock as a scaffold to swap before release. Pro is hints/cosmetics/mid-game review and the code never lets it touch playing strength. The residual real risk is exactly the one the auditor names last (the store prop defaults rather than being required, so a release build compiles with the mock), which is a store-readiness defect, not a live vulnerability. Recommendation is sound and idiomatic; the __DEV__ guard is the right shape for RN.

### BUG-3 · Promotion picker offers rook/bishop/knight for a power pawn move that only exists as a queen promotion; the tap is silently swallowed

**Severity:** Low (reported as medium, adjusted after review) · **Category:** bug · **Effort:** trivial · **Where:** `src/ui/GameScreen.tsx:234`

powerMoves only ever attaches promotion 'q' to a pawn power move (src/engine/powers.ts:70), while ordinary promotions generate all four pieces. pickerChoices returns a hardcoded ['q','r','b','n'] for kind 'promote' instead of deriving the list from state.legal, so when the only move to that square is a power move - e.g. at Slide (level 2) a pawn stepping diagonally onto an empty last-rank square, which the level-2 rule explicitly allows (powers.ts:108-111) - the player is offered four choices and onPromote's `state.legal.find(... x.promotion === t)` returns undefined for three of them. The picker closes, no move is played, and the turn is silently lost until the player retries and happens to pick the queen. Comeback powers are on by default (src/game/config.ts:38), so this is reachable in ordinary play whenever the human is behind. Related dead code in the same block: `upgrade = candidates.find((m) => m.promotion && m.piece !== 'p')` at line 196 can never match, because no legal move (ordinary or power) carries a promotion on a non-pawn, so the 'Arrive as a queen?' picker and its 'Just move' option are unreachable even though e2e/lib.mjs:78 still handles them.

Evidence:

```
src/ui/GameScreen.tsx:228-235  const pickerChoices = useMemo<PieceType[]>(() => { ... if (pendingPromotion.kind === 'upgrade') return ['q']; return ['q', 'r', 'b', 'n']; }, ...)
src/ui/GameScreen.tsx:223-224  else m = state.legal.find((x) => x.from === from && x.to === to && x.promotion === t); if (m) play(m);
src/engine/powers.ts:70  if (piece === 'p' && rankOf(to) === (color === 'w' ? 7 : 0) && !m.promotion) m.promotion = 'q';
```

**Recommendation.** Derive the choices from the legal moves that actually exist, exactly as the 'resurrect' branch already does: `return [...new Set(state.legal.filter((x) => x.from === pendingPromotion.from && x.to === pendingPromotion.to && x.promotion).map((x) => x.promotion!))]`. Then either delete the unreachable 'upgrade' branch at GameScreen.tsx:196/198 and its picker copy, or give power pawn moves the full PROMOTIONS set in powers.ts so all four are genuinely available.

*Reviewer note (confirmed, severity lowered):* The mechanism is real and I reproduced it by reading the three call sites: powerMoves' add() stamps promotion 'q' and only 'q' on a pawn power move reaching the last rank; onSquarePress opens the 'promote' picker whenever candidates[0] is a pawn move carrying a promotion; pickerChoices returns a hardcoded four-piece list instead of deriving from state.legal; onPromote looks up `x.promotion === t` and silently does nothing when it misses. At level >= 2 the reachable triggers are the diagonal-to-empty step (powers.ts:108-111) and the straight-ahead capture (powers.ts:117) landing on the promotion rank, where no ordinary move to that square exists, so three of the four buttons are dead. The related dead-code claim also holds: no move in state.legal can carry a promotion on a non-pawn (position.ts:227 promotes only pawns, powers.ts:70 is guarded by piece === 'p', and the 'upgrade' cheat lives in state.cheatMoves, which is played through playCheat without a picker), so the GameScreen.tsx:196/198 'upgrade' branch is unreachable. Downgraded to low because the failure is a single no-op tap that the player recovers from by tapping again and choosing the queen: no state is corrupted, no move is lost, and the trigger needs comeback level >= 2 plus a pawn on the seventh with a power-only promotion square. The recommended fix (derive from state.legal, as the resurrect branch already does) is correct.

### BUG-4 · Persisted state has no validation or migration; a stale or hand-edited record silently changes the rules or white-screens the app

**Severity:** Low · **Category:** bug · **Effort:** small · **Where:** `src/storage.ts:16`

loadJSON does a single shallow `{ ...fallback, ...parsed }`, so nested objects are never repaired and no field is type-checked. Two concrete consequences. (1) Silent rule change across versions: SavedGame.config is nested, so a game saved by a build that predates `comeback`/`doubleCheck` resumes with config.comeback undefined -> `const comeback = !!config.comeback` is false and the UI hides every power affordance, while fold still replays the recorded `power` events through pos.setPower and the engine keeps generating power moves. (2) Unrecoverable crash: App.tsx:71 validates only that events is an array and seed is a number, so a SavedGame whose config is missing reaches buildSetup -> `ARMY_SIZES[config.armySize]` is undefined -> `size.min` throws inside `useState(() => buildSetup(...))` during render. The saved record is never cleared on that path, so every launch plus Resume crashes the same way. The same shape applies to settings: an unknown boardTheme makes BOARD_THEMES[boardTheme] undefined and makeTheme throws on `b.light` for every render. Both are trivially reachable on the public Pages build, where these keys are localStorage.

Evidence:

```
src/storage.ts:16  return { ...fallback, ...(JSON.parse(raw) as T) };
App.tsx:71  setSaved(game && Array.isArray(game.events) && typeof game.seed === 'number' ? game : null);
src/game/useGame.ts:104-107  const size = ARMY_SIZES[config.armySize]; return generateSetup({ mode: config.material, seed, minPieces: size.min, ... });
src/ui/theme.ts:90-95  const b = BOARD_THEMES[boardTheme]; ... board: { light: b.light, ... }
```

**Recommendation.** Add a small hand-rolled validator per key next to the defaults (no new dependency needed): clamp each enum against the literal union (`ARMY_SIZES[c.armySize] ? c.armySize : DEFAULT_CONFIG.armySize`, same for material/difficulty/cheating/playAs/boardTheme/colorScheme/pieceStyle), deep-merge SavedGame.config over DEFAULT_CONFIG, and drop the saved game entirely if validation fails. Wrap the resume path in App.tsx in a try/catch that calls remove(STORAGE_KEYS.game) so one bad record cannot permanently brick the Resume button.

### SEC-2 · e2e static server allows path traversal and listens on all interfaces

**Severity:** Low · **Category:** security · **Effort:** trivial · **Where:** `e2e/lib.mjs:11`

serve() joins the decoded request path onto the root with no containment check. path.join normalises .. segments, so a request target of /../../../etc/passwd (sent with curl --path-as-is, or as %2e%2e%2f from a browser, which decodeURIComponent unfolds before the join) escapes dist-web and streams any file the process can read. server.listen(port) with no host binds 0.0.0.0, so on a shared network or a CI runner the server is reachable from off-box for the duration of the run. Scope is developer/CI tooling only - it is never bundled into the app and only runs during npm run e2e - which is why this is low rather than high. The same handler also pipes a read stream with no 'error' listener, so an unreadable path emits an unhandled 'error' event and kills the whole e2e run rather than returning a 500.

Evidence:

```
e2e/lib.mjs:11-15  let p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(root, 'index.html');
    res.setHeader('Content-Type', TYPES[path.extname(p)] || 'application/octet-stream');
    fs.createReadStream(p).pipe(res);
e2e/lib.mjs:16  return new Promise((resolve) => server.listen(port, () => resolve(server)));
```

**Recommendation.** Contain the path and bind to loopback:
  const base = path.resolve(root);
  let p = path.resolve(base, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(base + path.sep) && p !== base) p = path.join(base, 'index.html');
  ...
  const s = fs.createReadStream(p); s.on('error', () => { res.statusCode = 500; res.end(); }); s.pipe(res);
and `server.listen(port, '127.0.0.1', ...)`.

### CI-2 · All six GitHub Actions uses are floating major tags, and there is no Dependabot config or SECURITY.md

**Severity:** Low · **Category:** supply-chain · **Effort:** small · **Where:** `.github/workflows/pages.yml:23`

ci.yml and pages.yml reference actions/checkout@v4, actions/setup-node@v4, actions/upload-pages-artifact@v3 and actions/deploy-pages@v4 - all mutable tags. A compromise of any of those repos (or of a tag re-point) executes attacker code in a job that in the Pages workflow holds pages: write and id-token: write, i.e. it can publish arbitrary content to the project's public site and mint an OIDC token for it. First-party actions make this unlikely, but pinning costs nothing. There is also no .github/dependabot.yml, so the 10 moderate transitive advisories already reported (uuid via xcode via @expo/config-plugins - all build-time, none reachable from the shipped bundle) and any future ones go unnoticed, and no SECURITY.md telling a finder where to report.

Evidence:

```
.github/workflows/pages.yml:23,26,35,46  - uses: actions/checkout@v4 / actions/setup-node@v4 / actions/upload-pages-artifact@v3 / actions/deploy-pages@v4
.github/workflows/ci.yml:12-13  - uses: actions/checkout@v4 / - uses: actions/setup-node@v4
```

**Recommendation.** Pin each `uses:` to a full commit SHA with the version in a trailing comment (e.g. `actions/checkout@11bd719...  # v4.2.2`), add .github/dependabot.yml with `package-ecosystem: github-actions` and `npm` on a weekly schedule so the pins get bumped automatically, and add a short SECURITY.md pointing at GitHub issues (PRIVACY.md already uses that channel).

### CI-3 · ci.yml declares no permissions block

**Severity:** Low · **Category:** ci-cd · **Effort:** trivial · **Where:** `.github/workflows/ci.yml:8`

pages.yml scopes its GITHUB_TOKEN explicitly, but ci.yml does not, so it inherits the repository/organisation default - which is read/write for all scopes unless the default has been tightened. The workflow runs on push to every branch and on pull_request, and it executes third-party code from node_modules (npm ci, expo export, playwright install --with-deps, which also runs apt-get as root). A malicious or compromised build-time dependency would find a writable token in the environment. pull_request (rather than pull_request_target) means fork PRs get a read-only token regardless, so the exposure is limited to branches pushed to the repo itself.

Evidence:

```
.github/workflows/ci.yml:8-11  jobs:
  test:
    runs-on: ubuntu-latest
    steps:      # no `permissions:` at workflow or job level
```

**Recommendation.** Add `permissions:\n  contents: read` at the top of .github/workflows/ci.yml (workflow level), and set the repository default workflow permissions to read-only in Settings -> Actions -> General.

### REL-1 · Two search promises have no rejection handler; the puzzle screen can lock permanently

**Severity:** Low · **Category:** reliability · **Effort:** trivial · **Where:** `src/ui/PuzzleScreen.tsx:120`

chooseMoveAsync's promise is consumed with .then() and no .catch() in two places. In PuzzleScreen the call happens in the 'reply' phase of a win-2 puzzle; if the search throws anything other than TimeUp (Searcher.search rethrows non-TimeUp errors, ai.ts:440-441), setPhase('finish') never runs, the board stays disabled (`disabled={phase !== 'solve' && phase !== 'finish'}`) and the status text stays on 'Opponent is defending...' forever - the only escape is Reset or Home. GameScreen's hint has the same shape with a .finally but no .catch, so a failure there produces an unhandled rejection (a red console error on the Pages build, a LogBox warning on device) and the hint silently never appears. Neither is reachable through known code paths today, which is why this is low, but they are the two places where an engine bug would present as a frozen UI rather than a caught error.

Evidence:

```
src/ui/PuzzleScreen.tsx:120-128  chooseMoveAsync(p, 'hard').then((res) => { ... setPhase('finish'); setTick((t) => t + 1); });
src/ui/GameScreen.tsx:170-172  getHint().then((m) => setHint(m)).finally(() => setHinting(false));
```

**Recommendation.** Add a .catch to both. In PuzzleScreen recover the phase so the player can keep going: `.catch(() => { setPhase('finish'); setTick((t) => t + 1); })`. In GameScreen: `.catch(() => setHint(null))` before the .finally.

### REL-3 · chooseCheat runs full legal-move generation per cheat candidate, blocking the JS thread when the computer cheats

**Severity:** Low · **Category:** reliability · **Effort:** small · **Where:** `src/engine/cheat.ts:149`

chooseCheat iterates every cheat candidate - on an open board with a full army that is typically a few hundred moves - and for each one calls pos.result(), which regenerates the entire legal move list (including power moves) plus a repetition scan, on top of makeMove/unmakeMove and evaluate. cheatCandidates itself already calls pos.legalMoves() twice (cheat.ts:114 and 128) before that loop starts. All of it runs synchronously inside decide(), after chooseMoveAsync has finished yielding to the UI, so unlike the search it never hands control back: the whole scan lands in one frame on roughly 18% (low) or 40% (high) of the computer's moves. On a mid-range phone this is a visible stall while the thinking indicator is frozen. Costed from the code rather than measured, so treat the magnitude as an estimate.

Evidence:

```
src/engine/cheat.ts:146-154  for (const m of cheatCandidates(pos, resurrectable)) { pos.makeMove(m); let score = -Infinity; if (!pos.allKingsInCheck(me) && pos.result().kind === 'ongoing') { score = -evaluate(pos) + ... } pos.unmakeMove(); ... }
src/engine/cheat.ts:196-208  function decide(position, legal, level, seed, ctx) { ... const cheat = chooseCheat(pos, rng, ctx.resurrectable); ... }   // called synchronously from chooseActionAsync
```

**Recommendation.** Score first, verify later: keep the cheap `allKingsInCheck` filter plus `-evaluate(pos)` for every candidate, sort, and only call the expensive pos.result() on the top handful until one is 'ongoing'. That preserves the 'never ends the game on the spot' invariant the tests assert (src/engine/__tests__/cheat.test.ts:87-98) while cutting the full move generation from a few hundred calls to a few. If it is still noticeable, move the loop into the same await-yield structure chooseMoveAsync already uses.

### MISS-1 · Stats.biggestComeback is stored and initialised but never written or displayed

**Severity:** Low · **Category:** bug · **Effort:** trivial · **Where:** `src/game/config.ts:78`

The Stats record declares biggestComeback ('Largest deficit ... during a game you went on to win') and EMPTY_STATS seeds it to 0, but App.tsx's onFinished builds the next Stats without ever touching that field, GameOutcome has no deficit member, and no screen renders it. The data it needs is already computed and carried all the way to the UI: fold() maintains maxDeficit per colour from the recorded power events and useGame exposes it on GameState. So the app's headline mechanic - how far behind you were when you turned a game around - is measured, persisted through the event log, threaded through state, and then dropped on the floor, and the stored counter is permanently 0 for every player. This is a one-field wiring gap, not a redesign.

Evidence:

```
src/game/config.ts:77-78  /** Largest deficit (in pawns, x100) you were at during a game you went on to win. */ biggestComeback: number;
src/game/config.ts:91  biggestComeback: 0,
App.tsx:88-104  onFinished builds { ...s, wins, losses, draws, cheatsCaught, cheatsMissed, falseAccusations, ownCheats, ownCheatsCaught, gamesPlayed } - biggestComeback is only carried by the spread
src/game/events.ts:87  maxDeficit[e.color] = Math.max(maxDeficit[e.color], Math.round(0.5 * e.material + 0.5 * e.engine));
src/game/useGame.ts:226  maxDeficit: folded.maxDeficit,
grep for 'biggestComeback' across src/ matches only config.ts:78 and :91 (and scripts/simulate.ts, a separate harness field) - no UI reference anywhere, including StatsScreen.tsx.
```

**Recommendation.** Add maxDeficit to GameOutcome in outcomeOf() (state.maxDeficit[state.humanColor]) and in App.tsx set biggestComeback: o.outcome === 'win' ? Math.max(s.biggestComeback, o.maxDeficit) : s.biggestComeback, then show it on StatsScreen next to the win/loss line (divide by 100 for pawns, matching PowerMeter's formatting).

### MISS-2 · No error boundary anywhere, and several throw sites run during render

**Severity:** Low · **Category:** reliability · **Effort:** small · **Where:** `App.tsx:32`

There is no React error boundary in the tree (no componentDidCatch, no ErrorBoundary component, no react-error-boundary dependency), so any throw during render unmounts the whole app: a red screen in dev, a fatal crash on device, a blank page on the Pages build. That matters here because the app has real render-time throw sites rather than only event-handler ones: buildSetup runs inside a useState initialiser, fold() (which calls Position.makeMove, itself capable of throwing 'No piece on N' or 'Bad spawn') runs inside a useMemo, makeTheme dereferences a theme table in Root's own useTheme, and loadPuzzles/boardFromString run at module scope. Storage-driven versions of these are exactly what BUG-4 describes, but the exposure is broader than storage: any engine invariant violation surfaces as a dead app with no way back rather than a caught error. A single boundary above Root that offers 'Start a new game' and clears the saved-game key would turn every one of those into a recoverable state.

Evidence:

```
grep -rn 'ErrorBoundary|componentDidCatch' over src/ and App.tsx returns nothing; package.json:18-23 devDependencies list only @types/react, playwright, typescript, vitest.
App.tsx:32-42  export default function App() { return (<SettingsProvider><EntitlementsProvider><SafeAreaProvider><Root /></SafeAreaProvider></EntitlementsProvider></SettingsProvider>); }
src/game/useGame.ts:127  const [setup, setSetup] = useState<Setup>(() => buildSetup(initial.config, initial.seed, initial.handicap));
src/game/useGame.ts:144  const folded = useMemo(() => fold(setup, events, aiColor, foldOptions), [...]);
src/engine/position.ts:311  if (!mover) throw new Error(`No piece on ${m.from}`);
src/engine/position.ts:353  if (this.board[m.to] || m.piece === 'k') throw new Error('Bad spawn');
App.tsx:30  const PUZZLES = loadPuzzles();   // module scope, calls boardFromString later at puzzles.ts:32
```

**Recommendation.** Add a small class component with getDerivedStateFromError/componentDidCatch wrapping <Root /> in App.tsx; render a plain 'Something went wrong' view with a button that calls remove(STORAGE_KEYS.game) and resets to the home screen. Keep it dependency-free - about 25 lines - so nothing new enters package.json.

### MISS-3 · Android hardware back is unhandled, so back exits the app from every screen

**Severity:** Low · **Category:** bug · **Effort:** trivial · **Where:** `App.tsx:55`

Navigation is a single `screen` state value in Root with no router and no BackHandler subscriber anywhere in the project. On Android the hardware/gesture back therefore falls through to the default behaviour and finishes the activity, so pressing back on the Rules, Pro, Stats, Puzzles or Game screen closes the app instead of returning Home - and app.json disables the predictive back gesture, so the user does not even get the preview that would warn them. The in-progress game is autosaved so nothing is lost permanently, but on Android this reads as the app crashing on the most-used system gesture. It is also the single most common store-review complaint for Expo apps that roll their own screen state.

Evidence:

```
App.tsx:22-28  type Screen = { name: 'home' } | { name: 'rules' } | ... | { name: 'game'; start: StartOptions; key: number };
App.tsx:55  const [screen, setScreen] = useState<Screen>({ name: 'home' });
grep -rn 'BackHandler' over src/ and App.tsx returns nothing (react-navigation/expo-router are not dependencies either - package.json:5-17).
app.json:27  "predictiveBackGestureEnabled": false
```

**Recommendation.** In Root, subscribe with BackHandler.addEventListener('hardwareBackPress', ...) in a useEffect keyed on screen: return true after setScreen({name:'home'}) for any non-home screen, and false on home so the OS closes the app. Remove the subscription on cleanup (the RN 0.86 API returns a subscription with .remove()).

### MISS-4 · LICENSE is Expo's template and attributes copyright to 650 Industries

**Severity:** Low · **Category:** security · **Effort:** trivial · **Where:** `LICENSE:3`

The repository ships the unmodified MIT LICENSE that comes with the Expo template, so the only copyright line in the project names 650 Industries, Inc. (Expo) as the rights holder for code the repository owner wrote. The app is published publicly (GitHub Pages via pages.yml on every push to main) and is set up for store submission (eas.json production/submit profiles, com.platteration.twokingschess bundle ids), so the licence file is part of what is distributed. Practically this means the author has granted MIT rights over their own work under someone else's name, and a downstream consumer cannot tell who actually owns it; it is also the kind of thing that surfaces awkwardly in a store or acquisition review. Nothing else in the repo asserts ownership - README.md has no licence section.

Evidence:

```
LICENSE:1-3  The MIT License (MIT)\n\nCopyright (c) 2015-present 650 Industries, Inc. (aka Expo)
app.json:17,20  "bundleIdentifier": "com.platteration.twokingschess" / "package": "com.platteration.twokingschess"
eas.json:16-21  "production": { "autoIncrement": true }, "submit": { "production": {} }
.github/workflows/pages.yml:5-7  on: push: branches: [main, master]   (publishes the build publicly)
```

**Recommendation.** Replace the copyright line with the author's own name and the current year, keeping MIT if that is the intent (or switch to a proprietary/all-rights-reserved notice if the app is meant to be sold), and add a one-line Licence section to README.md.

### MISS-5 · Comeback measurement runs a synchronous depth-2 search on the JS thread on every ply

**Severity:** Low · **Category:** reliability · **Effort:** small · **Where:** `src/game/useGame.ts:294`

With comeback powers on - the default for casual games, the daily and the whole ranked ladder - every single ply is preceded by a power grant that calls measureDeficit, which runs scoreAtDepth(pos, 2, 100): a full alpha-beta at depth 2 with quiescence, capped only by a 100 ms deadline that Searcher.tick checks every 1024 nodes. It runs inside a setTimeout(0) on the JS thread with no yielding, for both sides, before the player may move (play() refuses while powerReady is false). So the app pays an up-to-100 ms freeze twice per full move, where the AI search itself deliberately yields to the UI every 40 ms. On a mid-range phone this is the most frequent stall in the app - more frequent than the cheat scan flagged as REL-3, which fires on 18-40% of the computer's moves only - and when the deadline is hit the search returns null and the engine signal silently degrades to plain material, so the power level quietly changes character on slower devices.

Evidence:

```
src/game/useGame.ts:294-300  if (comeback && folded.lastEvent?.type !== 'power') { const id = setTimeout(() => { const d = measureDeficit(folded.pos, folded.pos.turn, 100); append({ type: 'power', color: folded.pos.turn, level: d.level, material: d.material, engine: d.engine }); }, 0); return () => clearTimeout(id); }
src/game/comeback.ts:26-29  if (pos.turn === color) { const score = scoreAtDepth(pos, 2, timeMs); if (score !== null && Math.abs(score) < 50_000) engine = -score; }
src/engine/ai.ts:396-404  scoreAtDepth -> new Searcher(pos, timeMs); searcher.search(depth, alpha, beta, 0) - fully synchronous, no yielding
src/engine/ai.ts:220-223  private tick() { this.nodes++; if ((this.nodes & 1023) === 0 && Date.now() > this.deadline) throw new TimeUp(); }
src/game/useGame.ts:198  const powerReady = !comeback || folded.lastEvent?.type === 'power' || derived.positionOver;   // taps are refused until the grant lands
src/game/config.ts:38  comeback: true   (default), src/game/daily.ts:12 and src/game/ladder.ts:37 also set it
```

**Recommendation.** Measure it on a device first. If it shows, either drop the engine term to a cheaper signal on the human's own turn (material only, or reuse the score the AI's last search already produced) or move measureDeficit onto the same await-yield structure chooseMoveAsync uses, so the grant lands a frame later instead of blocking. Do not simply shorten timeMs: the null-on-timeout path silently changes the power level's meaning rather than making it cheaper.

### BUG-5 · Comeback powers extend movement but never deliver check, and nothing tells the player

**Severity:** Info (reported as low, adjusted after review) · **Category:** bug · **Effort:** small · **Where:** `src/engine/position.ts:67`

isAttacked implements ordinary chess geometry and has no knowledge of Position.powers, while checkedKings(), allKingsInCheck() and result() all decide the game through it. Power moves that use new geometry therefore never count as attacks: an Ascend knight that 'moves like a queen' (powers.ts:157) sliding down an open file is not giving check, a Slide bishop standing orthogonally next to the enemy king is not giving check, and a Leap queen's knight-jump square is not attacked. The implementation is at least self-consistent - powers.ts:64 refuses any power move whose target holds a king, so a powered piece can never take one, and the AI's evaluate() reads the same isAttacked - but the game shows purple target dots reaching squares beside the enemy king while refusing to score the resulting position as check or mate, so the player granted the strongest comeback level can find they cannot convert. Neither README.md, RulesScreen.tsx nor CLAUDE.md mentions the limitation.

Evidence:

```
src/engine/position.ts:67  export function isAttacked(board: Board, square: Square, by: Color): boolean {   // no `powers` parameter
src/engine/position.ts:436-438  checkedKings() { const enemy = opposite(this.turn); return this.kings[this.turn].filter((k) => isAttacked(this.board, k, enemy)); }
src/engine/powers.ts:64  if (t && (t.color === color || t.type === 'k')) return;
src/engine/__tests__/powers.test.ts:60  expect(has(m, 'g1', 'g8', 'geometry')).toBe(true); // knight slides up the file like a queen
```

**Recommendation.** Cheapest fix is documentation: add a line to RulesScreen's 'Comeback powers' section and to CLAUDE.md - 'power moves extend where a piece may go, not what it attacks; check and mate are always judged by ordinary chess geometry'. If you would rather make it true, thread the mover's level into a poweredAttacks(board, square, by, level) helper and use it from checkedKings/allKingsInCheck only (leave the search's evaluate() on the fast path), and add a test asserting an Ascend knight on an open file gives check.

*Reviewer note (confirmed, severity lowered):* Factually correct: isAttacked takes only (board, square, by) and hard-codes ordinary chess geometry, and checkedKings/allKingsInCheck/result all go through it, so power geometry never produces check. But this is a self-consistent design, not a defect that yields a wrong result. Powers are additive move generation; legality, check, mate and the AI's evaluate() all use the same ordinary geometry, so the engine, the UI and the tests agree with each other, kings remain uncapturable on every path (position.ts:216/237/251, powers.ts:64), and no game is ever scored incorrectly. Checked against CLAUDE.md and RulesScreen.tsx, which define the loss conditions purely in terms of check and say nothing that this contradicts - so there is no documented rule being violated, only an undocumented limitation. The auditor's own headline recommendation is a doc line, which is what an info item looks like. Threading powered attacks into checkedKings would be a rules change, not a bug fix, and would need the AI's evaluate() to follow or the search would misjudge every powered position.

### CI-1 · pages.yml interpolates a workflow expression directly into a node -e program

**Severity:** Info (reported as low, adjusted after review) · **Category:** ci-cd · **Effort:** trivial · **Where:** `.github/workflows/pages.yml:30`

The baseUrl rewrite substitutes ${{ github.event.repository.name }} into the middle of a JavaScript string literal that is itself inside a double-quoted shell argument. GitHub restricts repository names to [A-Za-z0-9._-], so there is no quote, backslash or $ to break out with and this is not exploitable as written. It is still the canonical GitHub Actions script-injection shape, in a job that holds pages: write and id-token: write, and it will become exploitable the moment the expression is swapped for anything a non-collaborator can influence (github.head_ref, a PR title, an issue body) - a mistake that is easy to make when copying this pattern. Reporting it as hardening, not as a live vulnerability.

Evidence:

```
.github/workflows/pages.yml:30  run: node -e "const fs=require('fs');const a=JSON.parse(fs.readFileSync('app.json'));a.expo.experiments={...(a.expo.experiments||{}),baseUrl:'/${{ github.event.repository.name }}'};fs.writeFileSync('app.json',JSON.stringify(a,null,2))"
```

**Recommendation.** Pass the value through the environment so the expression never enters the program text:
  - name: Serve from the repository sub-path
    env:
      REPO_NAME: ${{ github.event.repository.name }}
    run: node -e "const fs=require('fs');const a=JSON.parse(fs.readFileSync('app.json'));a.expo.experiments={...(a.expo.experiments||{}),baseUrl:'/'+process.env.REPO_NAME};fs.writeFileSync('app.json',JSON.stringify(a,null,2))"

*Reviewer note (confirmed, severity lowered):* The line is exactly as quoted and the pattern is the classic Actions script-injection shape, so it is worth fixing. It is not a vulnerability at any severity today: github.event.repository.name is settable only by someone who already has admin on the repository, and GitHub's own charset for repository names ([A-Za-z0-9._-]) contains no quote, backslash, backtick, $ or newline, so there is nothing to break out of the JS string literal or the double-quoted shell word with. The finding text itself concedes 'this is not exploitable as written ... Reporting it as hardening', which is an info item rather than a low. The env-var recommendation is correct and is the idiomatic fix.

### REL-2 · generateSetup retries forever with no attempt cap, synchronously during render

**Severity:** Info (reported as low, adjusted after review) · **Category:** reliability · **Effort:** small · **Where:** `src/engine/setup.ts:390`

The generator loops `for (;;)` until tryBuild returns a board, and tryBuild itself gives up after 20 placement attempts and returns null. There is no cap on the outer loop and no fallback. It is called from `useState(() => buildSetup(...))` in useGame (src/game/useGame.ts:127), i.e. synchronously on the JS thread during the first render of GameScreen, so any combination of armySize, material mode and handicap for which setupIsPlayable (no king already in check, neither side able to double-check on move one) is unreachable would hang the app on a blank screen with no way back. Today's reachable parameter space - ARMY_SIZES 6-16 and the ladder's handicap capped at 3 - almost certainly always terminates, so this is a latent robustness gap rather than an observed hang, but it is the one place in the app where a bad parameter cannot fail loudly.

Evidence:

```
src/engine/setup.ts:390  for (;;) {
src/engine/setup.ts:374-382  function tryBuild(rng, white, black) { for (let attempt = 0; attempt < 20; attempt++) { ... } return null; }
src/game/useGame.ts:127  const [setup, setSetup] = useState<Setup>(() => buildSetup(initial.config, initial.seed, initial.handicap));
```

**Recommendation.** Bound the outer loop (e.g. 200 iterations) and, on exhaustion, relax the constraints rather than spin: retry with mode 'chaos' and the widest size band, and as a last resort accept a board that only satisfies `kingsInCheck(...).length === 0` without the hasInstantWin check. Add a unit test that calls generateSetup across the full ARMY_SIZES x MaterialMode x handicap grid and asserts it returns.

*Reviewer note (confirmed, severity lowered):* The substance is right but the citations are wrong: setup.ts is 217 lines long, so there is no line 390 or 374-382. The unbounded loop is at setup.ts:179 and tryBuild at 163-171; the quoted excerpts do match that code, so this is a mis-numbered finding rather than a fabricated one. Downgraded to info because the loop is far more robust than 'retries forever' suggests: each outer iteration draws a completely fresh pair of armies from the RNG (not just a re-placement), tryBuild only fails after 20 unplayable placements of that particular pair, and the reachable parameter space is tiny (ARMY_SIZES 6-16, four material modes, ladder handicap clamped to 3 at ladder.ts:29 and re-clamped to [0.3,4] at setup.ts:181). The existing suite already hammers generateSetup over hundreds of seeds and non-default size bands without hanging. No hang has been observed and no plausible input produces one; the value here is the suggested grid test, not a fix.

## Upgrades

| Value | Effort | Upgrade | Now | Move to |
|---|---|---|---|---|
| high | trivial | userInterfaceStyle:"dark" defeats the app's own light/system theme | app.json sets "userInterfaceStyle": "dark" (and backgroundColor #15161a), while src/ui/theme.ts resolves 'system' via useColorScheme() and DEFAULT_SETTINGS.colorScheme is 'system' | Set "userInterfaceStyle": "automatic" (the app already ships a full LIGHT palette and honours an explicit 'light' choice). Keep the dark splash/background or add a light variant. |
| high | trivial | LICENSE is the Expo template's, not this project's | LICENSE reads "Copyright (c) 2015-present 650 Industries, Inc. (aka Expo)" — the unmodified create-expo-app boilerplate | Replace the copyright line with the project's own holder and year, or pick a licence deliberately. Add a `license` field to package.json (currently absent, and the package is `private: true`). |
| high | small | No linter or formatter anywhere in the repo | No .eslintrc / eslint.config.js, no prettier config, no `lint` script; src/game/puzzles.ts:25 carries `// eslint-disable-next-line @typescript-eslint/no-require-imports` for a rule that never runs | Add `eslint-config-expo` (flat config) plus `eslint-plugin-react-hooks` and Prettier, an `npm run lint` script, and a lint step in ci.yml before typecheck. |
| high | small | Android hardware back button does nothing on any screen | App.tsx drives navigation with a `Screen` union in useState; there is no BackHandler listener anywhere in src/ or App.tsx, and app.json sets `predictiveBackGestureEnabled: false` | Add a BackHandler.addEventListener('hardwareBackPress') in App.tsx's Root that pops to `{name:'home'}` when `screen.name !== 'home'` (and closes the result/promotion modals in GameScreen first), returning true to consume the event. |
| high | small | No React error boundary: one render throw blanks the whole app | No componentDidCatch / ErrorBoundary anywhere; App.tsx mounts Root directly under SafeAreaProvider | Wrap `<Root/>` in a small class ErrorBoundary that renders a 'Something went wrong' card with a button that clears STORAGE_KEYS.game (the most likely poison pill) and returns Home. |
| medium | small | CI misses lint, expo-doctor, an iOS bundle and an audit gate | .github/workflows/ci.yml runs checkout, setup-node 22, npm ci, typecheck, test, `expo export --platform android` + `--platform web`, then Playwright | Add `npm run lint`, `npx expo-doctor`, `npx expo export --platform ios` and `npm audit --audit-level=high` steps; cache the Playwright browser download keyed on the playwright version in package-lock.json; add `concurrency: {group: ci-${{github.ref}}, cancel-in-progress: true}`. |
| medium | trivial | GitHub Actions are unpinned and ci.yml has no permissions block | 0 of 6 action uses are pinned (actions/checkout@v4, actions/setup-node@v4 in both workflows, actions/upload-pages-artifact@v3, actions/deploy-pages@v4); pages.yml declares permissions, ci.yml does not | Pin every `uses:` to a full commit SHA with a version comment, and add `permissions: {contents: read}` at the top of ci.yml. |
| medium | trivial | No Dependabot or Renovate | No .github/dependabot.yml; a lockfile pinning 548 packages with no update automation | Add .github/dependabot.yml with `github-actions` (weekly) and `npm` (monthly, grouped, ignoring the expo-* SDK family so Expo SDK bumps stay a deliberate manual step). |
| medium | trivial | `tsx` is used by two documented scripts but is not a dependency | README and CLAUDE.md both document `npx tsx scripts/mine-puzzles.ts` and `npx tsx scripts/simulate.ts`; package.json devDependencies list only @types/react, playwright, typescript, vitest | Add `tsx` to devDependencies (pinned, as playwright is) and add `mine:puzzles` / `simulate` npm scripts so the entry points are discoverable and the version is reproducible. |
| medium | trivial | TypeScript strictness stops at `strict: true` | tsconfig.json extends expo/tsconfig.base and sets only `strict: true` | Add `noUnusedLocals`, `noUnusedParameters` and `noFallthroughCasesInSwitch`. Skip `noUncheckedIndexedAccess` — this codebase indexes 64-element board and table arrays constantly and it would be pure noise. |
| medium | small | iOS privacy manifest not declared for the App Store | app.json ios block has only supportsTablet and bundleIdentifier; no `ios.privacyManifests` | Add `ios.privacyManifests.NSPrivacyAccessedAPITypes` declaring the UserDefaults required-reason API (CA92.1) for @react-native-async-storage/async-storage, and `NSPrivacyCollectedDataTypes: []` to match PRIVACY.md's 'collects nothing'. |
| medium | small | No app scheme, no OTA updates channel | app.json has no `scheme` and no `updates`/`runtimeVersion`; eas.json profiles declare no `channel` | Add `"scheme": "twokingschess"` (needed for development builds and any future deep link into a seed or daily), and decide on expo-updates: either add it with `runtimeVersion: {policy: 'appVersion'}` and per-profile channels in eas.json, or note in CLAUDE.md's 'deliberately not done' section that OTA is out of scope. |
| medium | small | Accessibility: buttons have no role, pickers have no labels, the board announces no move state | Only src/ui/components.tsx Segmented and src/ui/Board.tsx squares set accessibilityRole/accessibilityLabel. The shared `Button` (used on every screen) is a bare Pressable+Text with no accessibilityRole; PromotionPicker's piece choices are Pressables wrapping a raw glyph; Board's describeSquare() reports only 'e2, white pawn' | Add `accessibilityRole="button"` and `accessibilityState={{disabled}}` to Button; give PromotionPicker choices `accessibilityLabel={PIECE_NAME[t]}` (the map already exists in Board.tsx); extend describeSquare to append ', legal move', ', capture' and ', in check' from the target/danger sets already computed in Board.tsx. |
| low | trivial | No Node version declared outside CI | ci.yml and pages.yml both set node-version: 22; package.json has no `engines`, and there is no .nvmrc | Add `"engines": {"node": ">=22"}` to package.json and a `.nvmrc` containing `22`. |
| low | trivial | Missing SECURITY.md and CONTRIBUTING.md | README, CHANGELOG, PRIVACY and LICENSE are present; no SECURITY.md, no CONTRIBUTING.md, no issue or PR templates | Add a short SECURITY.md pointing at private vulnerability reporting (the app has no backend, so the honest content is 'the app makes no network requests; report issues here'), and a CONTRIBUTING.md that names the three gates already in CI (typecheck, vitest, e2e). |
| low | trivial | Board animation ignores reduce-motion | src/ui/Board.tsx always runs a 170ms Animated.timing glide for every move; no AccessibilityInfo usage anywhere in the repo | Read `AccessibilityInfo.isReduceMotionEnabled()` (plus its change listener) once in Board or a small hook and set ANIM_MS to 0 when it is on; the existing `if (!animate \|\| ...) return;` early-exit already handles the no-animation path cleanly. |
| low | small | Vitest include pattern misses .tsx and there is no coverage reporting | vitest.config.ts: `include: ['src/**/*.test.ts']`; no coverage provider, no thresholds | Broaden to `src/**/*.test.{ts,tsx}`, add `@vitest/coverage-v8` with `coverage.include: ['src/engine/**', 'src/game/**']` and a floor (the engine and game layers are already close to fully covered), and print the summary in CI. |
| low | small | Pages deploy runs no gate; the web demo has no PWA metadata | pages.yml goes straight from `npm ci` to `expo export --platform web` and deploys on every push to main; app.json's web block sets only favicon and bundler | Make the deploy job `needs:` the CI test job (or run typecheck+test inline first), and fill in `web.name`, `web.shortName`, `web.themeColor` and `web.description` so the Pages build is installable and shows the right title. |
| low | trivial | npm audit: 10 moderate advisories, all build-time transitives — do not 'fix' them | 10 moderate, every one chaining to `uuid` (missing buffer bounds check in v3/v5/v6) via `xcode` via `@expo/config-plugins`, under expo 57.0.20. `npm audit fix --force` reports the fix as expo@46.0.21 | Take no action beyond documenting it: add a line to CLAUDE.md's 'Things deliberately not done' saying the audit noise is @expo/config-plugins -> xcode -> uuid, is prebuild/build-time only, never reaches the app bundle, and that the advertised fix is an eleven-major-version Expo downgrade. Re-check when Expo bumps its uuid. |
| low | trivial | Legacy top-level `splash` key in app.json | app.json declares `splash: {image, resizeMode, backgroundColor}` at the expo root | Verify against node_modules/expo/dist/docs for this SDK; if the config-plugin form is now the supported one, move it to `plugins: [["expo-splash-screen", {image, resizeMode, backgroundColor}]]`. Also add a light-scheme splash variant once userInterfaceStyle is 'automatic'. |

- **userInterfaceStyle:"dark" defeats the app's own light/system theme** (high value, trivial, `app.json`). Locking UIUserInterfaceStyle to Dark makes Appearance.getColorScheme() return 'dark' on device regardless of the OS setting, so the default 'System' option in HomeScreen's Appearance card can never produce the light theme. The e2e 'home settings persist' scenario only exercises the explicit 'Light' setting on web, so this never fails a test. The whole LIGHT theme in src/ui/theme.ts is effectively unreachable for anyone who does not manually pick Light.
- **LICENSE is the Expo template's, not this project's** (high value, trivial, `LICENSE`). The repo currently tells the world Expo owns the copyright in this game, including the engine, the puzzle set and the artwork. It also means the MIT grant is being made by a party that has no rights in the work, which is the wrong answer for something heading to two app stores and GitHub Pages.
- **No linter or formatter anywhere in the repo** (high value, small, `package.json`). Lint would already catch real defects sitting in the tree: four unused `const theme = useTheme()` locals in src/ui/components.tsx (Button, Segmented, Label, Card) and one in RulesScreen.tsx; dead styles `styles.stats` (HomeScreen) and `styles.center` (GameScreen); the pointless `export { fileOf, rankOf }` at the bottom of Board.tsx; and the exhaustive-deps mismatch in useGame.ts's `accuse` callback, which lists `folded.lastEvent` in its dependency array while the body reads `folded.lastAction`. The stale eslint-disable comment shows a linter was assumed at some point.
- **Android hardware back button does nothing on any screen** (high value, small, `App.tsx`). On Android, pressing back from Rules, Stats, Pro, Puzzles or a game in progress currently backgrounds or exits the app instead of returning Home — a guaranteed Play Store review complaint and a good way to lose a game mid-move. This is the single most visible platform-convention gap in the app.
- **No React error boundary: one render throw blanks the whole app** (high value, small, `App.tsx`). The game replays a persisted event log through `fold`, which calls `pos.makeMove` and can `throw new Error('No piece on ...')` or `'Bad spawn'`. `sanitizeEvents` in useGame.ts guards the resume path, but nothing guards a render-time throw elsewhere, and there is no telemetry to notice it. PRIVACY.md rightly promises no analytics, so a local recovery screen (rather than Sentry) is the right shape here.
- **CI misses lint, expo-doctor, an iOS bundle and an audit gate** (medium value, small, `.github/workflows/ci.yml`). iOS is a shipping target (eas.json has an ios production profile, app.json has a bundleIdentifier) but only Android and web are ever bundled in CI, so an iOS-only Metro resolution failure would reach a build minute rather than a PR. expo-doctor is the standard check for SDK/dependency-version drift on an Expo project and is cheap. The Chromium download is re-fetched on every push.
- **GitHub Actions are unpinned and ci.yml has no permissions block** (medium value, trivial, `.github/workflows/ci.yml`). A mutable v4 tag is a supply-chain foothold in a workflow that runs `npm ci` and Playwright with the default GITHUB_TOKEN. ci.yml inherits the repository default token permissions, which for a job that only reads code should be narrowed explicitly — pages.yml already models the right pattern.
- **No Dependabot or Renovate** (medium value, trivial, `.github/dependabot.yml`). The expo-* packages must move together with the SDK, so a naive npm updater is harmful here — but the GitHub Actions ecosystem and the two dev-only deps (playwright, typescript, vitest) are exactly what Dependabot handles well, and the actions updates pair with SHA pinning above.
- **`tsx` is used by two documented scripts but is not a dependency** (medium value, trivial, `package.json`). `npx tsx` silently downloads whatever tsx is current, so `scripts/mine-puzzles.ts` — the tool that regenerates the bundled assets/puzzles.json — has no pinned runtime. The repo's own convention (CLAUDE.md: 'the lockfile pins the version these suites were written against') is not being followed for these two tools.
- **TypeScript strictness stops at `strict: true`** (medium value, trivial, `tsconfig.json`). The three cheap flags catch what is already in the tree (the five unused `theme` locals, the two dead style entries) at zero false-positive cost, and noFallthroughCasesInSwitch is worth having in a file like src/engine/position.ts and src/engine/powers.ts where the move generators are large switch statements over piece type.
- **iOS privacy manifest not declared for the App Store** (medium value, small, `app.json`). App Store submission rejects binaries using required-reason APIs without a declaration. AsyncStorage is backed by NSUserDefaults on iOS and is used for every persisted key in src/storage.ts, plus the entitlements and settings keys. Expo generates PrivacyInfo.xcprivacy from this config field, so it is a config-only change with no native code.
- **No app scheme, no OTA updates channel** (medium value, small, `app.json`). Without a scheme, `eas build --profile development` produces a client that cannot be opened by URL. Without channels the production profile has no update lane, so every bugfix in a pure-JS app is a full store review — a real cost for a game whose entire logic is JavaScript.
- **Accessibility: buttons have no role, pickers have no labels, the board announces no move state** (medium value, small, `src/ui/components.tsx`). On react-native-web a Pressable without accessibilityRole renders a plain div — not focusable, not announced as a button — so the entire GitHub Pages build is keyboard-inaccessible except for the Segmented controls and the board. On device, VoiceOver/TalkBack reads the promotion picker as four unnamed buttons. And a screen-reader player can hear where every piece is but has no way to discover which squares are legal targets, which makes the game unplayable rather than merely awkward.
- **No Node version declared outside CI** (low value, trivial, `package.json`). Nothing tells a contributor (or a future you on a new machine) which Node the vitest/Playwright/Metro combination was validated against; the number lives only inside two workflow files.
- **Missing SECURITY.md and CONTRIBUTING.md** (low value, trivial, `SECURITY.md`). PRIVACY.md ends with 'open an issue on the project repository', which is exactly the wrong channel for a security report. CONTRIBUTING would also give the CLAUDE.md rules (engine stays React-free, keep tests in sync with the variant rules) a home outside an agent-oriented file.
- **Board animation ignores reduce-motion** (low value, trivial, `src/ui/Board.tsx`). Piece glide is the only motion in the app, so this is a one-line honouring of an OS setting that Apple and Google both surface prominently. The `settings` context in src/settings.tsx is the natural place to expose it as a manual override too.
- **Vitest include pattern misses .tsx and there is no coverage reporting** (low value, small, `vitest.config.ts`). The pattern silently excludes any future component test, which matters because CLAUDE.md's own convention is that testable logic lives outside .tsx — a rule with no enforcement. A coverage floor over src/engine and src/game would make it visible that src/game/puzzles.ts and src/game/comeback.ts's UI-facing helpers have no tests at all.
- **Pages deploy runs no gate; the web demo has no PWA metadata** (low value, small, `.github/workflows/pages.yml`). The Pages site is how testers try the game, and it currently publishes whatever compiles even if `npm test` is red. The exported page also inherits a generic title/theme colour, which is a cheap fix given the app already has icons and a defined palette.
- **npm audit: 10 moderate advisories, all build-time transitives — do not 'fix' them** (low value, trivial, `CLAUDE.md`). Without a written note, a future pass will either run `--force` (destroying the SDK 57 setup) or spend time re-deriving that these packages only run during `expo prebuild`/EAS native builds and are not part of the Metro bundle shipped to a device. Adding an `npm audit --audit-level=high` step (see the CI item) keeps the gate meaningful while ignoring these ten.
- **Legacy top-level `splash` key in app.json** (low value, trivial, `app.json`). Recent SDKs moved splash configuration to the expo-splash-screen config plugin and left the top-level key as a compatibility shim; the plugin form is also the only place to declare per-scheme splash images, which the app will want as soon as light mode actually works.

## Features worth adding

- **Finish the comeback scoreboard (Stats.biggestComeback is computed but never stored)** (high value, trivial). The plumbing already exists end to end and stops one step short: events.ts fold() computes `maxDeficit` per colour, useGame exposes it as `state.maxDeficit`, and config.ts declares `Stats.biggestComeback` with an EMPTY_STATS entry — but GameScreen's `outcomeOf()` never puts it in GameOutcome, App.tsx's `onFinished` never writes it, and StatsScreen never renders it. Add `biggestComeback: state.maxDeficit[state.humanColor]` to GameOutcome, take `Math.max` in App.tsx's stats reducer when the outcome is a win, and add a 'Biggest comeback' row to the 'Versus computer' card in StatsScreen.tsx. The self-play harness already reports the same figure (`biggestComebackWin` in scripts/simulate.ts, threshold 350cp), so the number is calibrated.
- **Play a seed / share a setup** (high value, small). GameScreen's subtitle shows 'seed 1234567' on every non-daily game and the README sells seeds as reproducible, but there is no way to enter one. `useGame.newGame(config, seed)` already takes a seed and `generateSetup` is fully deterministic. Add a small 'Play a seed' input next to the main Play button on HomeScreen that calls `onStart` with a parsed seed (App.tsx's `startNew` would gain an optional seed argument), and add a 'Copy seed' action to the result modal beside the existing Share button. Turns 'that army was ridiculous' into something a player can hand to a friend.
- **Show the solution in puzzle mode** (high value, small). PuzzleScreen offers Prev / Retry / Reset / Next but no way out of a puzzle you cannot see. Every bundled puzzle already carries `solution` in from/to string form (assets/puzzles.json, written by scripts/mine-puzzles.ts via moveToString for all three kinds — not just win-2). Add a 'Show solution' button that appears after the second wrong attempt, parses `puzzle.solution` with `parseSquare` (already in engine/board.ts) and either highlights the from/to squares via Board's existing `hint` prop or plays the move, marking the puzzle as seen-but-unsolved rather than solved.
- **'Was that legal?' spotting drill** (high value, medium). The cheating opponent is the app's most distinctive idea and it is only reachable inside a full game. `cheatCandidates()` in src/engine/cheat.ts already generates plausible illegal moves for any position, and `Position.legalMoves()` gives the honest ones. Build a mode alongside PuzzleScreen that shows a position with one move just played (animated by Board's existing `animate`/`animationKey` props) and two buttons, Legal / Cheat — drawing positions from the bundled puzzle boards or from a seeded self-play game. Score a streak, reuse the busted/wrong sounds. It trains the exact skill the ladder rewards and needs no new engine code.
- **Post-game review with an evaluation bar** (medium value, medium). The Pro scrubber already steps through `state.boards` (every position after every move-list entry) and the engine already exposes `scoreAtDepth(position, depth, timeMs, alpha, beta)`. After a game ends, run a shallow pass over `folded.boards`, cache the scores, and draw them as a sparkline under the scrubber with the largest swing marked 'the move that lost it'. Hooks into GameScreen's existing scrubber block; the async yield pattern from `chooseMoveAsync` keeps it off the UI thread. This is the natural second Pro feature and makes the Pro pitch ('step through the game while it is still going') feel like more than a toggle.
- **Daily archive screen** (medium value, small). DailyState.results already keeps a DailyRecord for every date ever played (date, outcome, moves, cheats caught/missed, false accusations) and nothing ever reads it back except a count in StatsScreen. Add a scrollable list on the Stats screen or behind the daily card: date, win/loss/draw glyph, move count, and a tap to replay that day's seed (`dailySeed(date)` is pure and DAILY_CONFIG is fixed, so the armies come back exactly). Gives the streak mechanic a history to defend.
- **Draft your own army** (medium value, medium). setup.ts already has `armyValue`, `randomArmy`, `matchValue` and `placeArmy` as separable pieces. Add a mode where the player spends a budget (say the value of the opponent's generated army, from `Setup.blackValue`) on piece types, then lets `placeArmy` scatter them across the home ranks with the same playability check (`setupIsPlayable`). It is the obvious counterpart to random armies, reuses the whole generator, and makes the ladder's handicap ('you have the bigger army') into a choice rather than a gift.
- **An 'Expert' difficulty and a think-time control** (medium value, small). PROFILES in src/engine/ai.ts is three hardcoded rows (easy maxDepth 1/400ms, medium 3/900ms, hard 6/2200ms). `chooseMoveAsync` already yields to the UI every 40ms so a longer budget costs nothing in responsiveness, and the transposition table plus killer/history ordering are already in place. Add an `expert` profile (maxDepth 8, timeMs 5000, slack 0, noise 0) to the Difficulty union and the HomeScreen Segmented, and optionally expose the time budget as a slider for pass-and-play analysis. Cheap way to give the engine work somewhere to land.
- **Ranked integrity: no undo, no hints, no resign-farming** (medium value, small). GameScreen shows Undo, Hint and Resign identically in every mode, and `applyLadderResult` drops rank by exactly one on a loss regardless. In a ranked game (`state.ranked !== null`) hide Undo and Hint, and make the result modal's 'New armies' end the ranked game rather than silently starting an unranked one. Optionally make the daily challenge single-attempt (the daily card already flips to 'Replay', and `recordDaily` already keeps only the first result — the UI just does not say so).
- **Achievements from the stats you already keep** (medium value, small). Stats already tracks wins/losses/draws, cheatsCaught/Missed, falseAccusations, ownCheats/ownCheatsCaught, gamesPlayed and (once wired) biggestComeback; DailyState tracks streaks and LadderState a best rank. Add a small pure `achievements.ts` in src/game that maps a Stats+DailyState+LadderState triple onto a list of earned badges ('caught ten cheats', 'won from four pawns down', 'seven-day streak', 'cheated and got away with it'), rendered as a card on StatsScreen. Pure function, trivially unit-testable, and it gives the cheat-detection counters — currently the most interesting numbers in the app — something to build toward.
- **Interactive tutorial instead of a text tip** (medium value, medium). IntroTip in GameScreen.tsx is one modal of three paragraphs, and RulesScreen is 800 words of prose. The two rules that actually surprise people (you may leave one king in check; power moves are legal and purple) are both demonstrable on a tiny board. Add a scripted three-position tutorial reusing the PuzzleScreen shell with hand-written boards in placement-string form (`boardFromString` already parses them) — 'take the free rook even though it exposes your other king', 'find the double check', 'use a Nudge move to escape'. Replaces the wall of text with the thing itself.
- **Fischer increment and per-side clocks for pass-and-play** (low value, small). config.ts's `ClockMinutes` is a fixed 0|1|3|5|10 union and useGame's clock effect just decrements the side to move every 200ms. Add an increment (add N seconds to the mover's clock in the same place the flag is checked) and let the two sides start at different times — the natural handicap for a stronger player, and a small change to a code path that already persists `clocks` in SavedGame and saves every 5s and on backgrounding.

## Code quality

- **The comeback blend weights are hardcoded in fold(), bypassing blend()** (high value, trivial, `src/game/events.ts`). comeback.ts exports MATERIAL_WEIGHT, ENGINE_WEIGHT and `blend(material, engine)` as 'the pure mapping used by tests and the UI meter' — and GameScreen's PowerMeter does call `blend()`. But events.ts:87 computes the same thing by hand: `Math.round(0.5 * e.material + 0.5 * e.engine)`. Retuning the weights (the exact knob CLAUDE.md points at) would silently change the meter and the level while leaving maxDeficit on the old formula. Import blend() in events.ts. Add a test asserting maxDeficit tracks blend() for a synthetic power-event sequence.
- **cheatCandidates and powerMoves duplicate the same trick geometry** (high value, medium, `src/engine/cheat.ts`). engine/cheat.ts's `cheatCandidates` and engine/powers.ts's `powerMoves` generate essentially the same illegal-move families — slider jumps past exactly one blocker, bishop stepping orthogonally, rook stepping diagonally, knight stepping like a king, king two-stepping/hopping, queen knight-jumping, the pawn tricks, and the resurrect spawn — with near-identical `add()` helpers, the same 'never capture a king or your own piece' guard, and the same auto-queen-on-last-rank rule. They differ only in gating by power level and in the dedupe key. Extract one generator (`trickMoves(pos, {level})`) in a shared module and have both call it; cheat.ts then becomes 'level 4 tricks minus what is currently legal' and powers.ts 'tricks up to level N'. Roughly 150 duplicated lines, and today a fix to one (say the pawn double-push guard, which differs subtly: cheat.ts excludes the real start rank, powers.ts does not) does not reach the other.
- **GameScreen.tsx is 740 lines mixing pure status logic with rendering** (high value, medium, `src/ui/GameScreen.tsx`). The file holds the screen, IntroTip, PowerMeter, PlayerStrip, MoveList, the result modal, and six pure functions — `outcomeOf`, `winnerOf`, `resultTitle`, `describeStatus`, `cheatNotice`, `cheatReport`, `avatarFor`, `formatClock`, `playerName`. Those pure functions encode real rules (who won under resign/flag/checkmate/both-in-check; which cheats the player got away with; the CHEAT_LABEL wording) and are completely untestable where they sit, in direct tension with CLAUDE.md's own convention that logic lives outside .tsx. Move them to `src/game/status.ts` taking a GameState, and split PlayerStrip/MoveList/PowerMeter into src/ui/. Then unit-test `winnerOf` across all five ending kinds and `cheatReport` for the got-away-with list.
- **assets/puzzles.json has no test asserting the bundled puzzles are valid** (high value, small, `src/game/puzzles.ts`). 62 puzzles are shipped and drive a whole mode, and nothing checks them: no test loads the file. Add a data test in a new src/game/__tests__/puzzles.test.ts that, for every entry, asserts the id is unique, `boardFromString(p.board)` parses and yields exactly two kings per side, `pieces` equals the actual piece count, the side to move is `p.turn`, `parseSquare` accepts both halves of `solution`, and — the important one — that `isSolution(p, pos, move)` is true for the recorded solution and false for every other legal move (uniqueness is what the miner claims and what makes the puzzle fair). Also test loadPuzzles()'s ordering contract (kind order then piece count). Currently a regenerated puzzles.json could ship an unsolvable puzzle and only the e2e's first-puzzle scenario would notice.
- **Piece values are defined three times, in two different scales** (medium value, trivial, `src/engine/types.ts`). `PIECE_VALUE` (centipawns) lives in engine/types.ts; `Position.material()` in engine/position.ts re-declares the identical object inline inside its reduce (`{p:100,n:320,b:330,r:500,q:900,k:0}`); and useGame.ts declares a third `PIECE_VALUES` in pawns (`{p:1,n:3,b:3,r:5,q:9,k:0}`) for the captured-material lead. Import PIECE_VALUE in position.ts, and derive the pawn-scale display values from it (`PIECE_VALUE[t]/100`) or at least name the scale in the constant. Two scales that both look like 'piece values' is how a centipawn number ends up in a UI that expects pawns.
- **The transposition table is global and its key omits the rules in force** (medium value, small, `src/engine/ai.ts`). ttKey/ttScore/ttDepth/ttFlag/ttMove are module-level arrays shared by every search in the process, and `hashPosition` covers board, turn, en-passant and power level — but not `Position.doubleCheckLoses` or `Position.resurrectable`, both of which change what `legalMoves()` and `result()` return. `clearTranspositionTable()` is called only from useGame's `reset`, so a hint or a PuzzleScreen search (which builds Positions with the default doubleCheckLoses=true) shares the table with a game running under 'must be answered', and level-4 searches share it across different resurrectable sets. Fold a small config nonce into the hash, or clear the table whenever the rule set or resurrectable set changes. Test: search the same position under both doubleCheck settings back to back and assert the scores differ where they should.
- **chooseCheat runs a full legal-move generation per candidate** (medium value, small, `src/engine/cheat.ts`). `chooseCheat` loops over every candidate from `cheatCandidates` (often hundreds) and calls `pos.result()` on each; `result()` with no argument calls `this.legalMoves()`, which itself make/unmakes every pseudo-legal move. That is a nested full generation per candidate. On top of that `cheatCandidates` itself calls `pos.legalMoves()` twice — once to decide whether resurrects are already available, once to build `legalKeys`. Reuse a single `legalMoves()` result inside cheatCandidates, and in chooseCheat replace the `result()` call with the two cheaper facts it actually needs (the cheat must not leave the cheater's kings all in check — already checked separately — and must leave the victim at least one reply, which an early-exit 'has any legal move' helper answers without materialising the list).
- **chooseMove and chooseMoveAsync duplicate the iterative-deepening loop** (medium value, small, `src/engine/ai.ts`). The two exported entry points repeat the same setup (clone, legalMoves, empty-check, new Searcher, `best` seeded from legal, completedDepth), the same depth loop with the same mate-score early break, and the same `pickFromScores` tail; the async one just inlines rootScores so it can await between root moves. Express the sync path as the async path driven to completion, or factor the shared body into a generator/iterator over depths that both drive. As it stands a search fix (the mate-window break, the previous-best move ordering seed) has to be made twice, and only chooseMoveAsync is exercised by the app while chooseMove is what the puzzle miner and the balance harness use.
- **cheatReport infers the mover from move-list parity** (medium value, small, `src/ui/GameScreen.tsx`). `cheatReport` finds the computer's undetected cheats with `state.moves.filter((m, i) => m.cheat && !m.power && (i % 2 === 0 ? 'w' : 'b') === aiColor)`, with the comment 'Every move-list entry flips the turn, so the mover of entry i is white for even i'. That holds today only because caught cheats are removed and replaced by a PASS entry in fold(), keeping parity — an invariant enforced nowhere and easy to break (a future rule that removes a ply, or a resurrect that does not flip the turn, would silently mis-attribute cheats to the wrong side in the end-of-game report). fold() already knows `lastBy` for every event; have it emit the mover colour alongside each moveList entry instead of re-deriving it. Add a test that a caught-cheat-plus-bonus-move game still attributes the remaining cheats correctly.
- **PuzzleScreen mutates a Position in a ref and forces renders with a tick counter** (medium value, medium, `src/ui/PuzzleScreen.tsx`). `posRef.current` is a mutable Position that `apply()` calls makeMove on, with `setTick(t => t + 1)` to force a re-render and `tick` listed in the dependency arrays of three useMemos that never read it. React sees no state change, so a missed setTick is an invisible stale board, and the async reply path guards with `if (posRef.current !== p) return;` — object identity as a cancellation token. Replace with the pattern the rest of the app uses (an event/move list in state, position derived with useMemo, exactly like game/events.ts fold), or at minimum keep a `moves: Move[]` state array as the source of truth and rebuild the Position from `puzzlePosition(puzzle)` in a useMemo. The tick-in-deps is also precisely what an exhaustive-deps lint rule would flag.
- **Missing tests around the UI-facing game helpers** (medium value, small, `src/game/useGame.ts`). `detectionChance(difficulty, cheat)` decides whether the player's one cheat per game is caught — pure, three lines, zero tests. Same for `daily.shareText` (the only string the app puts on a share sheet), `storage.loadJSON`'s shallow-merge-over-fallback behaviour (which is what makes an old persisted shape survive a schema change, and what would quietly let a corrupt Stats value through), and `entitlements`'s grant/restore dedupe. Add src/game/__tests__/detection.test.ts asserting the base rates and the +0.15 blatant bump and the 0.95 ceiling; a shareText snapshot for win/loss/draw with and without a streak; and a loadJSON test with a partial stored object, a corrupt string and a throwing backend.
- **Dead code and unused locals across the UI** (low value, trivial, `src/ui/components.tsx`). `const theme = useTheme()` is fetched and never used in Button, Segmented, Label and Card (components.tsx) and in RulesScreen — five needless hook subscriptions that re-render those components on every theme change. `styles.stats` (HomeScreen) and `styles.center` (GameScreen) are defined and never referenced. Board.tsx ends with `export { fileOf, rankOf }`, a re-export nothing imports (both call sites import from engine/board directly). In the engine, `Position.pieceAt`, `Position.legalMovesFrom` and `setup.setupIsQuiet` are exported and called by nothing, tests included. Delete them, or in the engine's case decide they are public API and cover them.
- **The Puzzle type is declared twice** (low value, trivial, `scripts/mine-puzzles.ts`). scripts/mine-puzzles.ts re-declares `interface Puzzle` with the same six fields as src/game/puzzles.ts, plus its own inline kind union that must stay in sync with `PuzzleKind`. The script already imports from src/engine, so importing the type from src/game/puzzles.ts costs nothing and makes a field rename a compile error in the writer as well as the reader.
- **The e2e web server is path-traversal-prone and binds a fixed port** (low value, trivial, `e2e/lib.mjs`). `serve()` does `path.join(root, decodeURIComponent(req.url.split('?')[0]))` with no normalisation check, so a request for `/../../etc/passwd` escapes the export directory, and it binds a hardcoded default port 4190 (E2E_PORT overrides it) so two runs on one machine collide. It is test-only code driving a browser you control, so the traversal is not a live risk — but a `path.resolve(root, '.' + url).startsWith(root)` guard is two lines, and listening on port 0 and reading `server.address().port` (as the sibling repos' harnesses do) removes the collision.
- **AI profile constants are undocumented magic numbers** (low value, trivial, `src/engine/ai.ts`). PROFILES' `slack` (150/25/0) and `noise` (40/10/0), CHECK_PENALTY = 70, the quiescence depth of 4 passed as a literal at both call sites, and the `MATE - 100` / `MATE - 1000` mate-window constants all sit without a note on how they were arrived at or what changing them does. The repo has a self-play harness (scripts/simulate.ts) that could measure them and a CLAUDE.md section that names POWER_THRESHOLDS and the comeback weights as the tuning knobs — extend that list to the AI profile and add one comment per constant saying what it trades off (slack/noise = how often a lower difficulty plays a near-best move; CHECK_PENALTY = how much a checked king is worth in a variant where being in check is survivable).
- **resolveHumanColor uses Math.random, breaking the seeded-game story** (low value, trivial, `src/game/useGame.ts`). Every other random decision in the app flows through `createRng(seed)` — armies, AI move selection, cheat choice. `resolveHumanColor` (playAs: 'random') and `playCheat`'s detection roll use bare `Math.random()`, and `chooseActionAsync` is called with `seed = undefined` so the computer's per-move seed is `randomSeed()`. That is defensible (a fully deterministic opponent would be exploitable), but it is worth one comment saying so, because README and the on-screen 'seed N' invite the reading that a seed reproduces a game rather than only the armies. Alternatively derive the colour from the setup seed so at least the starting conditions are fully reproducible.

## Shared across all Platteration repositories

The same gaps recur in every repository; fixing them once as a template and copying it is cheaper than fixing them fourteen times.

### CI and supply chain

1. **No workflow sets `permissions:`** (except the two Pages deploy jobs). Add `permissions: { contents: read }` at the top of every workflow so the `GITHUB_TOKEN` handed to third-party actions cannot write to the repository.
2. **No action is pinned to a commit SHA** (0 of 50 `uses:` lines across the fourteen repositories). `actions/checkout@v4` follows a movable tag; pin to the full 40-character SHA with the version in a comment, and let Dependabot bump it.
3. **No repository has Dependabot or Renovate.** Add `.github/dependabot.yml` with `npm` (or `pip`) and `github-actions` ecosystems, weekly.
4. **No CI step runs `npm audit`** (two workflows pass `--no-audit` explicitly). Add `npm audit --audit-level=high` after `npm ci`; for the Expo apps the current transitive advisories are build-time only (`uuid` via `xcode` via `@expo/config-plugins`), so gate on `high` rather than `moderate` until Expo ships the fix.
5. **`tvsham` runs `npm ci || npm install` in CI and in its Dockerfile.** The fallback silently discards the lockfile guarantee; drop it and fix the lockfile instead.
6. **`selfreportle`, `simplacad` and `phonogeometry` have no lockfile** and install Playwright ad hoc in CI. Add a `package-lock.json` (even with devDependencies only) and use `npm ci`.
7. **Enable secret scanning and push protection** in each repository's settings; nothing is committed today, and this keeps it that way.

### Repository hygiene

8. **Ten repositories have no `LICENSE`** (battleshiple, collectcollect, drawdraw, multidcheckers, multidconnect4, notenote, randostats, selfreportle, simplacad, tvsham). Without one, nobody else may legally use or contribute to the code. The siblings that have one use MIT.
9. **Only `simplacad` has a `SECURITY.md`.** Copy it to the others with a private reporting address.
10. **No repository has a `main` branch.** In all fourteen the default branch is the original `claude/...` feature branch, so branch protection, Dependabot targets and the two GitHub Pages workflows (`abientnoiser`, `chesscheatser` both trigger on `main`/`master`) all point at a branch that does not exist; those deploys have never run. Create `main` from the current branch, make it the default, and protect it.
11. **`drawdraw` is the one repository still on Expo SDK 53** (the rest are on 57). Its eight high-severity `npm audit` findings (`image-size`, `metro`) disappear with the SDK upgrade; it is also the only app not written in TypeScript and the only one pinned to Node 20 in CI.
12. **`multidcheckers` and `multidconnect4` are near-identical copies** (same branch name, same 65-file layout, same dependencies). The timeline/multiverse engine, persistence and share code should live in one shared package so fixes land in both.

### A hardened workflow to copy

```yaml
name: CI
on:
  push:
    branches: ["**"]
  pull_request:
permissions:
  contents: read
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@<full-sha> # v4
      - uses: actions/setup-node@<full-sha> # v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npm audit --audit-level=high
      - run: npm run lint --if-present
      - run: npm run typecheck --if-present
      - run: npm test
```
