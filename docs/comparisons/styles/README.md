# Extra sprites and visuals

These are original concept assets added on 13 October 2026. Open [index.html](index.html) to compare all three styles. The existing app screenshots are preserved one folder above.

## Styles

- **Arcade Pop:** bold colours, faceted chess pieces, simple enamel tokens.
- **Neon Circuit:** midnight surfaces, luminous rims, cyan-violet chess pieces.
- **Porcelain Studio:** warm ivory, glazed blue pieces, brass details.

## Included in each style

- 12 chess sprites: white and black pawn, knight, bishop, rook, queen and king.
- 4 checkers sprites: red and black men and kings.
- 2 Connect Four sprites: red and yellow discs.
- 13 Sudoku tiles: digits 1–9 plus blank, selected, pencil notes and error states.
- 4 shared effect sprites: selection ring, timeline portal, shift arrows and crown badge.
- 4 board concepts: one for each app, with the same position across styles.
- A transparent 1792 × 1280 atlas with JSON frame coordinates.
- An editable Blender project containing a Sprite library scene and four concept board scenes.

There are **105 individual transparent PNG sprites**, **12 board concept PNGs**, **3 atlases**, and **3 Blender projects** in total. Individual sprites are 256 × 256. Board renders are 1024 × 1024. Sprites have clear alpha padding on every edge; alpha bounds and file hashes are recorded in each manifest. Atlas frames preserve the entire 256 × 256 sprite; sprites are not rotated or trimmed.

## Comparison sheets

- [Board styles](comparisons/board-styles.png)
- [Sprite overview, light](comparisons/sprite-styles-light.png) / [dark](comparisons/sprite-styles-dark.png)
- [48 and 96 px readability, light](comparisons/small-sizes-light.png) / [dark](comparisons/small-sizes-dark.png)
- Complete Chess, Checkers, Connect Four, Sudoku and effect sheets for light and dark backgrounds are in comparisons/.

The HTML gallery lets you choose an app, a sprite family, a light/dark/checkerboard preview background, and 48/96/160/256 px display sizes. It uses local relative files and has no external dependencies. Extract the entire archive before opening the gallery.

## Source and provenance

All shapes, materials and effects were authored procedurally in Blender 4.3.2 and rendered with Cycles on CPU. There are no downloaded textures or artwork. Digits use Blender's built-in font converted to mesh geometry. The current Blender build lacks OpenImageDenoise, so renders use 32 samples for sprites and 64 samples for boards with denoising disabled. The individual sprite and board PNGs are unaltered Blender output. Comparison sheets uniformly scale and arrange these outputs; their labels are outside the artwork.

The positions were generated through the existing game engines and saved in source/fixtures.json. Chess uses the same mirror-army seed 1 as the original screenshots. Checkers and Connect Four use the same four opening moves. Sudoku uses the same seed 20261011 puzzle and pencil notes. Palettes intentionally explore different colours and materials; these are concept options for visual review. Application and native device integration has not been performed for these options.

From this folder, regenerate a pack using:

```sh
blender -b -t 2 --python-exit-code 1 --python source/render_styles.py -- --style arcade
blender -b -t 2 --python-exit-code 1 --python source/render_styles.py -- --style neon
blender -b -t 2 --python-exit-code 1 --python source/render_styles.py -- --style porcelain
```

The renderer requires only Blender and the included JSON files. The optional fixtures.cjs helper regenerates reference states from the existing /workspace repositories. The comparison-sheet helper build_gallery.py requires Python with Pillow and the DejaVu fonts used by this workspace. No app checkout is needed to edit or re-render the Blender projects.
