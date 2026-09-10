# Two Kings Chess

A mobile chess variant for iOS and Android, in the spirit of *Really Bad Chess*:
the pieces move exactly as in chess, but every side has **two kings** and every
army is **randomly generated**.

## The idea

Losing is where the fun starts. At the start of every turn the game measures how
far behind the side to move is (half material, half the engine's own evaluation).
Fall far enough behind and you **draft a power**: three are offered, you keep one,
and they stack. Up to six picks, at most one per turn, so a hopeless army builds
into something strange rather than starting at full strength.

The thirteen powers arrive in four tiers, and the offer opens up as you sink:

| Tier | Behind by | What comes into the pool |
| --- | --- | --- |
| Nudge | 2 | pawns step sideways or back, kings stride two squares, knights step one |
| Slide | 4 | bishops and rooks step one square off their usual line; pawn tricks |
| Leap | 6.5 | sliders jump one piece, kings hop a neighbour, queens jump like knights |
| Ascend | 9 | bishops, rooks and knights gain queen mobility; captured pieces return home |

Because you pick rather than receive, two games at the same deficit play
differently: a rook that vaults is a different problem from a pawn wall that
walks sideways. Power moves are ordinary legal moves, shown in purple, and the
computer drafts too when it is losing. Turn the whole system off for plain
two-king chess.

## Rules

- Each side starts with two kings. Kings can never be captured.
- You **lose** when either
  1. **one** of your kings is checkmated: it is in check and no legal move rescues it, or
  2. **both** of your kings are in check and no move leaves at least one safe.
     (Optional "instant loss" rule: a double check at the start of your turn loses
     on the spot. Self-play shows those games last about ten plies, so it is off
     by default.)
- Because of that, leaving a single king in check is legal, and a king may even
  step into check while the other king is safe. A move is illegal only if it
  would leave *both* kings in check.
- Pawns move, capture, promote and take en passant as usual. There is no castling.
- Draws: stalemate (no legal move and no king in check), fifty moves without a
  capture or pawn move, threefold repetition.

## Random armies

Each game generates a fresh army for each side: a random number of pieces
(6 to 16, configurable), of random types, placed randomly on the two home ranks.
Kings always start on the back rank and pawns never do. Starting positions with
a king already in check are rejected and regenerated.

- **Fair**: different armies, total material within a pawn of each other.
- **Mirror**: both sides get the same set of pieces, placed independently.
- **Chaos**: fully independent random armies.

The *Kings* setting picks how many kings each army gets. Two is the variant;
one is Handicap Chess, where the rules above collapse to ordinary chess (you
lose to checkmate alone) while everything else stays.

Setups are seeded, so the seed shown above the board reproduces the same armies.

## A cheating opponent

With cheating enabled (Sometimes / Often), the computer occasionally plays a
plausible-looking illegal move: a slider jumps over a piece, a piece moves a
little like a different piece, a pawn drifts sideways or backwards, or a minor
piece arrives on its square as a queen. It only cheats when the cheat looks
better than its best legal move, and never with a move that ends the game.

Right after the computer moves you can press **Cheater!**:

- Right: the illegal move is undone, the computer forfeits that turn, and you
  take **two moves in a row**.
- Wrong: the computer takes two moves in a row instead.

Cheats are revealed at the end of the game.

## Modes

- **Quick game** against the computer (easy / medium / hard) with any army settings, or pass-and-play on one device with an optional clock.
- **Daily challenge**: one seeded set of armies per calendar day, with streaks and a shareable result.
- **Ranked ladder**: win to climb, lose to drop. Rank drives the computer's strength, how much it cheats and how much material it gets (you start with the bigger army).
- **Puzzles**: double check in one, mate in one, and forced win in two, mined from random games by `scripts/mine-puzzles.ts` into `assets/puzzles.json`.
- **Handicap Chess**: set *Kings* to one and the game plays by ordinary chess loss conditions — random armies and the comeback draft stay. Good for chess players who bounce off two kings.
- **You can cheat too**: one illegal move per game for the player; the computer notices more often on harder levels and for blatant cheats.

## Features

- Play against the computer (easy / medium / hard, optionally cheating) or pass-and-play on one device.
- Legal-move dots, last-move and check highlighting, a Hint button, promotion picker, undo, resign, move animation, and a scrubber to review any position.
- Gold and silver crown marks tell each side's two kings apart; the computer has a face that reacts to the game.
- Sound effects (synthesized, see `assets/sounds`) and haptic feedback on moves,
  captures, checks and accusations, each switchable.
- Light/dark/system theme, five board colour sets, five comeback auras, solid or classic-print pieces.
- Pieces are drawn with a bundled 17 KB subset of DejaVu Sans (chess glyphs only),
  so they look identical on every device. See `assets/fonts/LICENSE-DejaVu.txt`.
- The current game is saved automatically and can be resumed from the home screen.
- Win/loss/draw record against the computer.

## Monetization

The rule is **sell identity, never relief**. This is a game about being behind,
so nothing that eases being behind is for sale: hints, undo and mid-game review
are free and unlimited, and no purchase changes the armies, the powers or how
the computer plays.

What is sold is cosmetic, and **every cosmetic can also be earned by playing**
(`src/cosmetics.ts`):

| Cosmetic | Earn it by | Or buy |
| --- | --- | --- |
| Embers aura | winning once from 3.5 behind | Aura pack |
| Frost aura | a 3-day daily streak | Aura pack |
| Static aura | five comeback wins | Aura pack |
| Gold leaf aura | ladder rank 10 | Aura pack |
| Slate board | five wins | Board pack |
| Neon board | ladder rank 6 | Board pack |
| Classic pieces | ten puzzles solved | Piece pack |

Comeback auras recolour the frame and meter that appear when a side has drafted
powers, so the thing you own decorates the game's signature moment. A one-time
**Supporter** tip unlocks the lot at once and adds a crown to your stats and
shared results. No ads, no subscriptions, no energy, and the store is one quiet
row on the home screen.

`src/entitlements.tsx` keeps the store behind a `StoreProvider` interface. The
bundled provider is a **local mock** (purchases recorded on the device only);
swap in `react-native-iap` / `expo-iap` with real App Store and Google Play
products before release.

## Tech

- [Expo](https://expo.dev) SDK 57 / React Native, TypeScript. No native code to maintain.
- `src/engine`: a self-contained chess engine written for this variant
  (move generation, two-king rules, seeded army generator, and an alpha-beta
  search with quiescence, a transposition table, killer moves and a history
  heuristic, driven by iterative deepening under a time budget).
- `src/game`: event-sourced game controller (moves, passes, accusations), undo and persistence.
- `src/ui`: screens and board rendering.

## Running

```sh
npm install
npm start          # Expo dev server; scan the QR code with Expo Go (iOS/Android)
npm run android    # open on a connected Android device / emulator
npm run ios        # open on the iOS simulator (macOS)
npm run web        # run in the browser
```

Store builds use EAS (requires an Expo account); profiles live in `eas.json`:

```sh
npx eas build --profile preview --platform android   # installable APK
npx eas build --profile production --platform ios
```

CI (`.github/workflows/ci.yml`) runs the type check, the unit tests, a Metro
bundle for Android and web, and the end-to-end suite on every push.

```sh
npm run e2e        # export the web build and drive it in headless Chromium
```

The e2e suite (`e2e/run.mjs`) plays real games through the UI: settings,
hints/undo/resume, computer cheating and accusations, player cheating, the
daily challenge, the ladder, puzzles, the pass-and-play clock, review and Pro
gating. `.github/workflows/pages.yml` publishes the web build to GitHub Pages
once Pages is enabled for the repository (Settings → Pages → GitHub Actions).

## Balance harness

```sh
npx tsx scripts/simulate.ts 12 medium fair            # games, difficulty, army mode
npx tsx scripts/simulate.ts 12 medium fair answer 1  # ...double-check rule, kings per side
```

Plays the computer against itself with comeback powers off and on and reports
decisive rate, game length, how often the weaker starting side wins, and which
power levels were reached. Thresholds live in `src/engine/powers.ts`.

Reference numbers (medium AI, double check must be answered, 16 chaos games,
drafting): games run about 56 plies and the weaker starting side wins 8/15 with
powers, against 5/14 with them off. If a tuning change pushes that first number
much below half, the draft has stopped doing its job.

## Tests

```sh
npm test           # engine unit tests (perft, two-king rules, setup generator, AI)
npm run typecheck
```
