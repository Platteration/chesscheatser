# Two Kings Chess

A mobile chess variant for iOS and Android, in the spirit of *Really Bad Chess*:
the pieces move exactly as in chess, but every side has **two kings** and every
army is **randomly generated**.

## Rules

- Each side starts with two kings. Kings can never be captured.
- You **lose** when either
  1. **both** of your kings are in check at the same time at the start of your turn, or
  2. **one** of your kings is checkmated: it is in check and no legal move rescues it.
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

## Features

- Play against the computer (easy / medium / hard, optionally cheating) or pass-and-play on one device.
- Legal-move dots, last-move and check highlighting, a Hint button, promotion picker, undo, resign.
- Haptic feedback on moves, captures, checks and accusations (native only).
- Pieces are drawn with a bundled 17 KB subset of DejaVu Sans (chess glyphs only),
  so they look identical on every device. See `assets/fonts/LICENSE-DejaVu.txt`.
- The current game is saved automatically and can be resumed from the home screen.
- Win/loss/draw record against the computer.

## Tech

- [Expo](https://expo.dev) SDK 57 / React Native, TypeScript. No native code to maintain.
- `src/engine`: a self-contained chess engine written for this variant
  (move generation, two-king rules, seeded army generator, alpha-beta search AI).
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

CI (`.github/workflows/ci.yml`) runs the type check, the tests and a Metro
bundle for Android and web on every push.

## Tests

```sh
npm test           # engine unit tests (perft, two-king rules, setup generator, AI)
npm run typecheck
```
