# chesscheatser — security audit (2026-09-11)

A dedicated security pass, separate from and later than the review in `REVIEW.md`. Specialist reviewers read the repository through a combined lens (L13), each required to *demonstrate* a finding rather than argue for it.

**4 findings** — 2 medium, 2 low. 2 of 4 were reproduced with command output; the others are reasoned from the code.

## Status

Every finding below was fixed on `claude/repo-review-security-baiyud` in 3a4697d, each with a regression test that was checked by reverting the fix and confirming the test fails. The findings are kept as written so the reasoning behind each change stays with it.

These were deliberately left for a decision rather than guessed at:

- L13-4 — deriving the Pro flag from a store rather than from storage needs a real store provider, which is a release decision; serving from a custom domain to get a private origin is an ownership one.

## Findings

### L13-1 · medium — Four of the six storage records (stats, daily, ladder, puzzles) plus the entitlement record bypass src/validate.ts entirely, and the ErrorBoundary's recovery cannot clear them

`App.tsx`:107 · CWE-20 · reproduced

**Who.** Anyone who can write the app's key/value store without owning the app's code. On the GitHub Pages build (pages.yml publishes to https://platteration.github.io/chesscheatser/) AsyncStorage is localStorage and the origin is `platteration.github.io`, which is shared by every other project Pages site the same account publishes — so any script running on any sibling page of that account reaches these keys (see L13-4). On Android, app.json sets no `android.allowBackup: false`, so a crafted adb/Auto-Backup restore also plants them. On any platform, the device owner with devtools.

**How.** 1. Write one of: `twokings.daily.v1` = {"results":null}, or `twokings.puzzles.v1` = {"solved":null}, or `twokings.entitlements.v1` = {"owned":null}. 2. Open the app. App.tsx's load effect (lines 104-114) passes `daily`, `ladder`, `stats` and `puzzles` straight from loadJSON into state with no cleanX call — only `settings` (cleanConfig) and `game` (cleanSavedGame) are validated — and EntitlementsProvider does the same at entitlements.tsx:89. 3. The first render of the home screen dereferences the poisoned field and throws: HomeScreen.tsx:269 `daily.results[today]`, App.tsx:245/266 `puzzleProgress.solved.length`, entitlements.tsx:127 `state.owned.includes('pro')`. 4. The ErrorBoundary catches it and offers "Start a new game" — but ErrorBoundary.reset (App.tsx:64-67) calls `remove(STORAGE_KEYS.game)` and nothing else. STORAGE_KEYS has no entitlements entry at all, and stats/daily/ladder/puzzles are never removed. 5. The remount re-reads the same poisoned record and throws again. The app is stuck on the error screen on every launch, with no in-app way out.

**Why it matters.** Permanent denial of service against the installed app / the Pages build: the only remaining recovery is clearing site data or reinstalling. Secondarily it shows the validator's real coverage — the previous review's BUG-4 fix validates 2 of the 7 records the app reads back, so any later field added to stats/daily/ladder/puzzles inherits the same unchecked path.

**Evidence.**

App.tsx:104-115 — the load effect:
      const [cfg, game, st, dy, ld, pz] = await Promise.all([
        loadJSON<unknown>(STORAGE_KEYS.settings, DEFAULT_CONFIG),
        loadJSON<unknown>(STORAGE_KEYS.game, null),
        loadJSON<Stats>(STORAGE_KEYS.stats, EMPTY_STATS),
        loadJSON<DailyState>(STORAGE_KEYS.daily, EMPTY_DAILY),
        loadJSON<LadderState>(STORAGE_KEYS.ladder, EMPTY_LADDER),
        loadJSON<PuzzleProgress>(STORAGE_KEYS.puzzles, EMPTY_PUZZLE_PROGRESS),
      ]);
      setDaily(dy); setLadder(ld); setPuzzleProgress(pz);
      setConfig(cleanConfig(cfg));          <-- only these two are cleaned
      ... cleanSavedGame(game) ...
      setStats(st);
App.tsx:64-67 — the only recovery path:
  reset = () => { void remove(STORAGE_KEYS.game); this.setState((s) => ({ failed: false, attempt: s.attempt + 1 })); };
src/storage.ts:3-10 — STORAGE_KEYS does not even list 'twokings.entitlements.v1'.
src/entitlements.tsx:89 — loadJSON<EntitlementState>(KEY, { owned: [] }).then(setState);  // no validation

Output of the reproduction script (each case runs loadJSON's exact `{ ...fallback, ...JSON.parse(raw) }` merge and then the exact expression from the render path):

twokings.puzzles.v1 = {"solved":null}
   App.tsx:245/266  puzzleProgress.solved.length
   THROWS: TypeError: Cannot read properties of null (reading 'length')

twokings.puzzles.v1 = {"solved":7}
   PuzzleScreen.tsx:51  new Set(progress.solved)
   THROWS: TypeError: number 7 is not iterable

twokings.daily.v1 = {"results":null}
   HomeScreen.tsx:269  daily.results[today]
   THROWS: TypeError: Cannot read properties of null (reading '2026-09-11')

twokings.entitlements.v1 = {"owned":null}
   entitlements.tsx:127  state.owned.includes()
   THROWS: TypeError: Cannot read properties of null (reading 'includes')

twokings.entitlements.v1 = {"owned":"pro"}
   entitlements.tsx:95  [...prev.owned]
   no throw -> ["p","r","o","pro"]   (a string is spread character by character and then persisted)

src/__tests__/validate.test.ts covers only cleanConfig, cleanSavedGame and cleanSettings — there is no test, and no cleanX function, for stats, daily, ladder, puzzles or entitlements.

**Fix.** Add cleanStats / cleanDaily / cleanLadder / cleanPuzzleProgress / cleanEntitlements to src/validate.ts alongside the three that exist, each clamping every field to a finite number, a boolean, or an array of strings (for DailyState, also drop any `results` entry whose value is not a DailyRecord, and rebuild `results` with Object.create(null) so a key like 'toString' cannot read truthy through the prototype at daily.ts:59). Call them in App.tsx's load effect and in EntitlementsProvider's useEffect. Separately, add 'entitlements' to STORAGE_KEYS and make ErrorBoundary.reset clear every key in STORAGE_KEYS plus the entitlement key — a boundary whose recovery can only clear one of seven records cannot recover from six of them. Extend src/__tests__/validate.test.ts with the five hostile records above.


### L13-2 · medium — cleanSavedGame validates only each event's `type` and caps nothing, so an accepted saved game freezes the JS thread for minutes and is never dropped

`src/validate.ts`:89 · CWE-1284 · reproduced

**Who.** Same writer as L13-1: a script on the shared platteration.github.io origin for the Pages build, an Android backup restore, or the device owner with devtools. The record only has to be written once.

**How.** Two independent primitives, both accepted by cleanSavedGame because isEvent (validate.ts:73-76) checks nothing but `type`.
(a) Unbounded event list x quadratic replay. Write `twokings.game.v1` with N/2 `{"type":"pass"}` events followed by N/2 `{"type":"move","move":{"from":27,"to":28,"piece":"q"}}` (square 27 is empty at the start, so makeMove throws there and nowhere earlier). cleanSavedGame accepts it, so App.tsx keeps it and shows Resume. Tapping Resume runs sanitizeEvents (useGame.ts:110-121) inside `useState(() => ...)` during render: it re-folds the whole prefix from scratch for every n from N down to N/2, and each fold pushes a fresh 64-element board snapshot per event.
(b) One move event with an out-of-range target. `{"type":"move","move":{"from":<any occupied square>,"to":10000000,"piece":"r"}}` — 113 bytes of JSON. Position.makeMove (position.ts:335) does `board[m.to] = placed` with no bound on m.to, so the board array's length becomes 10,000,001. Nothing throws, so sanitizeEvents *keeps* the event and the game resumes. Thereafter every recompute pays O(to): fold's `pos.board.slice()` snapshots, capturedSummary's `for (const p of now)` (useGame.ts:81) and lostPieces' `for (const p of b)` (events.ts:146) all walk the whole sparse array, holes included. `to` may go up to 4294967294 before it stops being an array index.
Also in the same gap: a `power` event's `level` is stored raw at events.ts:86 and reaches `'★'.repeat(p.level)` at GameScreen.tsx:437, and `daily` is accepted as any string of any length (validate.ts:97) and is the only value the app ever puts on the system share sheet (GameScreen.tsx:77-78 -> daily.ts:74).

**Why it matters.** The app freezes — not crashes — so the ErrorBoundary never fires and the record is never dropped; every launch plus Resume repeats it. Measured: 16,000 events (~300 KB, well under any localStorage or AsyncStorage limit) blocked the thread for 350 seconds on a desktop CPU; a 113-byte record blocked it for 3.4 seconds per recompute and scales linearly with the attacker's chosen `to`. Secondary impacts: `'★'.repeat(-1)` and `'★'.repeat(1e9)` both throw RangeError during GameScreen render, and arbitrary attacker text of arbitrary length is placed into the share-sheet message the user then sends to another app.

**Evidence.**

src/validate.ts:73-76 and 89 — the whole event check:
  function isEvent(e: unknown): e is GameEvent {
    const f = fields(e);
    return Object.prototype.hasOwnProperty.call(EVENT_TYPES, String(f.type));
  }
  ...
  if (!Array.isArray(g.events) || !g.events.every(isEvent)) return null;
src/game/useGame.ts:110-121 — the quadratic replay:
  for (let n = events.length; n > 0; n--) {
    try { fold(setup, events.slice(0, n), aiColor); return events.slice(0, n); } catch {}
  }
src/engine/position.ts:333-335 — the unbounded write:
  board[capturedSquare] = null;
  board[m.from] = null;
  board[m.to] = placed;
src/game/events.ts:86 — the unclamped level kept for the UI (setPower clamps only the Position's own copy):
  powers[e.color] = { level: e.level, material: e.material, engine: e.engine };

Measured (a) — verbatim copy of sanitizeEvents driving the real fold():
  N=1000  events -> 117 ms
  N=2000  events -> 413 ms
  N=4000  events -> 1384 ms
  N=8000  events -> 5774 ms
  N=16000 events -> 350803 ms   (5 minutes 51 seconds, kept 8000)

Measured (b):
  localStorage value ( 113 bytes ): {"seed":1234,"humanColor":"w","config":{},"events":[{"type":"move","move":{"from":0,"to":10000000,"piece":"r"}}]}
  cleanSavedGame accepted: true
  board.length after one move event: 10000001
  fold(): 1489 ms   capturedSummary(): 1430 ms   board.slice(): 501 ms
  => roughly 3420 ms of blocked JS thread per recompute
  (to=100000 -> fold 86 ms; to=1000000 -> 879 ms; to=10000000 -> 7169 ms on the first run: linear in `to`)

Measured (the star string):
  PowerMeter '★'.repeat(-1)         -> THROWS RangeError: Invalid count value: -1
  PowerMeter '★'.repeat(1000000000) -> THROWS RangeError: Invalid string length

**Fix.** In src/validate.ts: (1) cap the list — `if (g.events.length > MAX_EVENTS) return null;` with MAX_EVENTS around 2000, which is far above any real game; (2) replace isEvent with a per-type payload validator that rebuilds the event rather than passing the parsed object through — for 'move', require `from` and `to` to be integers with `from >= -1 && from <= 63` and `to >= 0 && to <= 63`, `piece`/`promotion`/`captured` to be members of the piece table (own-property lookup), and the flags to be booleans; for 'power', require `color` to be exactly 'w' or 'b', `level` to be an integer in [0, MAX_POWER] and `material`/`engine` to be finite; for 'accuse', require `caught` boolean and `by` undefined or 'ai'; (3) constrain `daily` to /^\d{4}-\d{2}-\d{2}$/ rather than any string, since it is the value that reaches the share sheet. Independently, make sanitizeEvents linear: fold once, applying events one at a time and remembering the last index that applied cleanly, instead of re-folding every prefix. Defence in depth: bound `m.to` in Position.makeMove (`if (m.to < 0 || m.to > 63) throw`), which costs nothing on the hot path that already only generates 0..63.


### L13-3 · low — pages.yml grants pages:write and id-token:write to the build job, which runs `npm ci` and `npx expo export`; only the deploy job needs them

`.github/workflows/pages.yml`:10 · CWE-250 · reasoned

**Who.** Whoever controls any package in the dependency tree that `npm ci` installs and executes (548 lockfile entries, including install lifecycle scripts of transitives), or any future compromise of the expo CLI that `npx expo export` runs.

**How.** 1. The `permissions:` block is declared once at workflow level (lines 10-13: contents: read, pages: write, id-token: write) and neither job overrides it, so GitHub hands the `build` job a GITHUB_TOKEN carrying pages:write and id-token:write. 2. actions/checkout runs with its default persist-credentials: true, leaving that token in .git/config inside the workspace. 3. Any code the build job executes — a transitive postinstall, or anything expo's exporter loads — can read it and call the Pages API directly to publish arbitrary content to https://platteration.github.io/chesscheatser/, and mint an OIDC id-token bound to this repository for any cloud role that trusts it. The `deploy` job, which is the only step that actually needs those scopes, does nothing but call actions/deploy-pages.

**Why it matters.** A supply-chain compromise that would otherwise be confined to 'read this public repository' gains the ability to replace the project's public web page and to assert this repository's identity to any OIDC relying party. Low because it requires a compromised dependency first, and because the fix is two lines.

**Evidence.**

.github/workflows/pages.yml:10-13
permissions:
  contents: read
  pages: write
  id-token: write

.github/workflows/pages.yml:19-37 — the build job declares no permissions of its own:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
      ...
      - run: npm ci
      ...
      - run: npx expo export --platform web --output-dir dist-web

REVIEW.md records CI-2/CI-3 ('least-privilege permissions block') as addressed; the block exists and the actions are SHA-pinned, but the scoping stops at workflow level, so the privilege is still wider than the job that holds it needs.

**Fix.** Set `permissions: contents: read` at workflow level and move the elevated scopes onto the deploy job only:

permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
    # inherits contents: read
    ...
  deploy:
    needs: build
    permissions:
      pages: write
      id-token: write
    ...

While there, pass `persist-credentials: false` to actions/checkout in the build job — nothing after the checkout uses git.


### L13-4 · low — On the GitHub Pages build every stored record, including the Pro entitlement, lives in localStorage on an origin shared with every other Pages site the account publishes

`src/storage.ts`:3 · CWE-1275 · reasoned

**Who.** Any script that runs on https://platteration.github.io — that is, any other GitHub Pages project site this account publishes, or an injection in one of them. The account's sibling repositories do publish to Pages and at least one of them (abientnoiser) accepts attacker-supplied `?mix=` share links, so a DOM injection there lands on this app's origin.

**How.** 1. pages.yml deploys a project site, so the app is served from https://platteration.github.io/chesscheatser/. GitHub Pages project sites for one account all share the origin https://platteration.github.io; localStorage is partitioned by origin, not by path. 2. A page at https://platteration.github.io/<any-other-repo>/ runs `localStorage.setItem('twokings.entitlements.v1', '{"owned":["pro"]}')` to grant Pro, or `localStorage.getItem('twokings.daily.v1')` to read the player's daily history and ladder rank, or writes one of the poisoned records from L13-1 / L13-2 to brick the app.

**Why it matters.** The trust boundary the code reasons about is 'the device owner', but on the published web build it is 'anything on platteration.github.io'. That converts L13-1 and L13-2 from self-inflicted damage into a cross-application attack, and makes the Pro flag (already noted as unverified in REVIEW SEC-1) settable by a third party rather than only by the owner. It also makes PRIVACY.md's 'saved only on your device, using the platform's app storage ... Deleting the app deletes it' inaccurate for the Pages build.

**Evidence.**

src/storage.ts:3-10 — six keys, plus 'twokings.entitlements.v1' in src/entitlements.tsx:56 and 'twokings.appsettings.v1' in src/settings.tsx:30, all plain AsyncStorage.
.github/workflows/pages.yml:29-30 — the deploy is a project sub-path, not a user site:
  - name: Serve from the repository sub-path (<user>.github.io/<repo>/)
    run: node -e "... baseUrl:'/${{ github.event.repository.name }}' ..."
git remote: https://github.com/Platteration/chesscheatser -> published at https://platteration.github.io/chesscheatser/.
The exported build confirms there is no service worker, no source map and no separate data file to isolate (dist-web is index.html + one 709 KB JS bundle + hashed font/wav assets), so the only cross-page surface is the shared origin itself.
src/entitlements.tsx:75-82 already documents that the record must be treated as a cache once a real store lands; what is not accounted for is that on this origin a third party can write it.

**Fix.** Treat the Pages origin as shared: (a) correct PRIVACY.md so the web build's storage is not described as device-private; (b) never let a value read back from storage decide an entitlement — derive isPro from the store provider on every launch when a real store lands, as the comment at entitlements.tsx:75-82 already intends, and until then keep the mock's grant obviously non-authoritative; (c) fix L13-1 and L13-2 so a hostile record from a sibling page degrades instead of bricking. If the web build ever carries anything worth protecting, serve it from a custom domain so it gets its own origin — GitHub Pages cannot set response headers, so there is no CSP or storage-partitioning lever available on *.github.io.


## Checked and sound

What the reviewers tried and could not break. Recorded so it is not re-raised, and so a future change that undoes one of these is recognisable as a regression.

- ASKED SPECIFICALLY — .github/workflows/pages.yml line 30 is NOT exploitable, and I could not make it so. The line interpolates ${{ github.event.repository.name }} into a single-quoted JS string literal inside a double-quoted shell word: run: node -e "const fs=require('fs');const a=JSON.parse(fs.readFileSync('app.json'));a.expo.experiments={...(a.expo.experiments||{}),baseUrl:'/${{ github.event.repository.name }}'};fs.writeFileSync('app.json',JSON.stringify(a,null,2))". To break out you need one of ' \ " ` $ or a newline. GitHub restricts repository names to ASCII letters, digits and . - _ (other characters are rewritten to - at creation, and . and .. are rejected outright), so none of those characters can appear in the value. The value is also not contributor-controlled: repository.name changes only when someone with admin on the repository renames it, and the workflow triggers only on push to main/master and workflow_dispatch — there is no pull_request_target, no github.head_ref, no issue/PR title or body anywhere in either workflow. The worst a legal repository name can do is produce a nonsensical baseUrl such as '/a..b'. It remains worth converting to an env var (the shape is the canonical script-injection pattern and invites a later swap to a field an outsider does control), but as written it is hardening, not a vulnerability — the same verdict REVIEW.md's CI-1 reached, and I confirmed it against the current file rather than inheriting it.
- Prototype pollution through the validator and the fold: cleanConfig/cleanSettings' pick() uses Object.prototype.hasOwnProperty.call(table, value), so 'constructor', '__proto__' and 'toString' are all rejected — I ran cleanConfig({mode:'constructor', armySize:'__proto__'}) and got DEFAULT_CONFIG back unchanged. In fold(), `powers[e.color] = {...}` and `maxDeficit[e.color] = ...` with e.color='__proto__' are computed-key assignments in a plain object, which create or ignore an own property rather than reaching Object.prototype (assigning a primitive to __proto__ is a silent no-op); Position.setPower's `this.powers[color] = clamped` is likewise a primitive assignment. recordDaily's `{ ...state.results, [rec.date]: rec }` is a computed key in an object literal, which is CreateDataProperty, so a date of '__proto__' makes an own property and does not set a prototype. I could not construct a pollution path.
- assets/puzzles.json is loaded by a bare cast (`require('../../assets/puzzles.json') as Puzzle[]` at puzzles.ts:27) with no shape check, and a bad `kind` would make PUZZLE_KIND_LABEL[puzzle.kind] undefined and throw at PuzzleScreen.tsx:184, while a bad `board` would throw in boardFromString. I confirmed the shipped file is well formed (62 entries, only the three declared kinds, exactly the six declared keys) and — more importantly — that Metro inlines it into the single web bundle rather than shipping it as a fetchable file (grep for 'double-1-1' hits the bundle; dist-web contains no .json but metadata.json). So there is no attacker who controls it short of controlling the bundle, and the missing validation is a build-time robustness gap, not a reachable defect. Worth a shape check in scripts/mine-puzzles.ts's writer rather than in the app.
- No URL-borne input exists at all. I grepped src/, App.tsx and index.ts for location, window., document., Linking, openURL, URLSearchParams, atob/btoa, fetch, XMLHttpRequest and WebSocket: the only hits are React Native's Share import in GameScreen.tsx and test-only code in e2e/. The app has no router, no deep-link scheme in app.json, and no query/hash parsing, so on the Pages build a hostile link by itself carries nothing — which is why every finding above needs a same-origin writer rather than a link.
- No DOM sink reachable from data. There is no eval, new Function, innerHTML or dangerouslySetInnerHTML in first-party code; every dynamic string (seed, square names, SAN, the daily date, the share text) renders through a React Native <Text>. The exported index.html is static markup plus one <script src>, with no inline data.
- e2e/serve.mjs is now contained and loopback-bound (REVIEW SEC-2's fix holds). I tried to defeat resolvePath: `path.resolve(base, '.' + decoded)` followed by `p !== base && !p.startsWith(base + path.sep)` rejects ../ and its single-encoded form; double-encoded %252e%252e%252f decodes once to a literal directory name that does not exist; a malformed % sequence is caught and becomes ''; a NUL is rejected explicitly; a sibling prefix such as /a/bc against base /a/b fails the startsWith check because of the trailing separator. The read stream now has an 'error' listener and server.listen binds 127.0.0.1. I found no bypass.
- The ladder record is unvalidated (L13-1) but I could not turn a hostile rank into anything worse than nonsense: ladderParams clamps with Math.max(1, rank) and Math.min(3, ...), and I traced a NaN handicap all the way through generateSetup — ratio stays NaN, every comparison against it is false, matchValue's `diff <= tolerance` and `Math.abs(...) > tolerance` are both false so both of its loops fall through immediately and it returns the fallback army, and the `for (;;)` at setup.ts:179 terminates on the first tryBuild. REVIEW's REL-2 (unbounded generator loop) is not reachable from storage.
- The engine ignores an out-of-range board index rather than trusting it: pseudoLegalMoves, powerMoves, cheatCandidates, isAttacked, hashPosition and Board.tsx all iterate 0..63 explicitly, and the AI's history table is indexed only by generated moves, so the oversized board from L13-2(b) costs time but never produces an out-of-bounds read or a move the UI will play. makeMove also throws rather than writing when m.from names an empty or non-existent square, and `board['__proto__'] = piece` (the string-keyed variant) only reparents that one array and is caught by the next board.slice().
- CHEAT_PROBABILITY[level], ARMY_SIZES[config.armySize], BOARD_THEMES[boardTheme], MATERIAL_HINT/CHEAT_HINT[...] and the difficulty label tables are all indexed by values that cleanConfig/cleanSettings have already clamped with an own-property check, so none of them can be driven to undefined from storage. src/__tests__/validate.test.ts pins that for boardTheme and armySize specifically.
- The entitlement mock does not claim more than it does: EntitlementsProvider's store prop has no default (entitlements.tsx:83), App.tsx names it explicitly at the mount site, the mock's price is the string 'free in this build' rather than a currency amount, and src/__tests__/entitlements.test.ts enforces all three against the source. README.md and the module comment both state it is a scaffold. The residual issue is only that the grant is a plain stored record (REVIEW SEC-1, already reported) plus the shared-origin writer in L13-4.
- What ships in the web build is clean: I ran `expo export --platform web` and the output is index.html, one 709 KB bundle, a hashed font and nine hashed wavs. No .map files, no serviceWorker registration, no test fixtures, no metadata beyond a 49-byte metadata.json, and no secrets — .gitignore covers .env*, keystores and provisioning profiles, and nothing sensitive exists in the tree to leak.
- ci.yml is sound for a fork-PR threat model: permissions is contents: read at workflow level, all four action uses are pinned to full commit SHAs, there is no pull_request_target, and nothing in either workflow interpolates a title, body, branch name or any other contributor-controlled github.event field into a run: block. A fork PR gets a read-only token, so the setup-node npm cache it writes is scoped to its own branch and cannot poison main's.
- npm test is green at 114 tests across 15 files on the current tree, so none of the above is a pre-existing breakage; the gaps are in what the suite does not cover (no test exercises stats, daily, ladder, puzzles or entitlements loaded from storage, and none feeds an oversized or malformed event payload).

