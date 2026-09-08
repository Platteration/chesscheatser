# Changelog

## Unreleased (1.0.0 candidate)

### Game
- Comeback powers (the core idea): the side that is losing, by material and
  by the engine's evaluation, gets stronger pieces in four stacking levels
  (Nudge, Slide, Leap, Ascend), building up one level per turn. Power moves
  are legal, shown in purple, and the computer gets them too. Tuned with the
  self-play harness in `scripts/simulate.ts`.
- Double check: by default both kings in check must be answered (you lose
  only if no move frees a king); the original instant-loss rule is optional.
- Two-king chess: each side has two kings; lose when both are in check at
  once or one is checkmated. Kings are never captured, castling is out,
  en passant and promotion are in, 50-move and threefold draws apply.
- Random armies with seeded generation: fair, mirror, chaos and ranked
  handicap modes; army size bands; openings with an instant win are rejected.
- Computer opponent (easy / medium / hard): alpha-beta with quiescence,
  transposition table, killer moves and history ordering, searched under a
  time budget without blocking the UI.
- Cheating opponent: plausible illegal moves (jump, geometry, pawn tricks,
  upgrade, resurrect). Call it out with "Cheater!": a caught cheat is undone
  and you move twice; a false accusation gives the computer two moves. Cheats
  are revealed at the end.
- You can cheat too: one illegal move per game; the computer notices with a
  chance tied to difficulty and how blatant it is.
- Modes: quick game, pass-and-play with optional clock, daily challenge with
  streaks and sharing, ranked ladder, 62 mined puzzles.
- Hints, undo, resign, rematch with colours swapped, move list, review
  scrubber, move animation, autosave and resume, stats.

### Look and feel
- Light / dark / system theme, five board colour sets, solid or classic-print
  pieces (bundled glyph font), crown marks for each king, a reacting computer
  avatar, sound effects and haptics, landscape layout, accessibility labels,
  first-run explanation.

### Monetization scaffold
- Pro unlock behind a store-provider interface with a local mock: unlimited
  hints, all boards and piece styles, mid-game review.

### Tooling
- Vitest engine and game-layer tests, Playwright end-to-end suite over the web
  build, CI workflow, GitHub Pages deploy workflow, EAS build profiles,
  puzzle miner script.
