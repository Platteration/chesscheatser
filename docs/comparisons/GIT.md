# Working with the comparisons from Git

The complete comparison bundle for Chess, Sudoku, Checkers and Connect Four is versioned in this directory. The other app repositories link here so the original images, galleries and source files have one home.

## Get the files

```sh
git clone --branch codex/publish-comparison-assets-20261015 https://github.com/Platteration/chesscheatser.git
cd chesscheatser
```

The assets are ordinary Git files, including the PNGs and three `.blend` projects. No Git LFS, generated archive, running app or account credentials are needed to use them.

## Open the galleries

Open `docs/comparisons/index.html` for the original before-and-after screenshot comparisons, or `docs/comparisons/styles/index.html` for the three sprite styles. Keep their relative folders together. If your browser does not allow local HTML, serve this directory with:

```sh
python -m http.server --directory docs/comparisons 8080
```

Open the server's address in your browser. This serves only the comparison folder and uses no app backend. GitHub previews the individual PNGs and Markdown files; clone or download the files to run the interactive HTML galleries.

## What is included

- 48 browser screenshots in 24 matched before-and-after pairs, plus comparison sheets and the original/current icon assets.
- 105 transparent PNG sprites in Arcade Pop, Neon Circuit and Porcelain Studio styles.
- 12 board concepts, three transparent atlases with JSON frame coordinates, and three editable Blender projects.
- Blender rendering scripts, palette values, the exact reference positions and validation metadata.

The screenshots were captured on 11 October 2026 at the commits recorded in `captures.json`. "Current" in those image labels refers to that capture date. The Blender style concepts were added on 13 October 2026. Later changes on the apps' main branches are outside these dated comparisons. The styles are concept options for choosing a look.

## Edit or export

The individual sprites are under `styles/<style>/sprites/`, board renders under `styles/<style>/boards/`, and editable projects under `styles/source/`. Open a `.blend` file and choose its Sprite library or one of its four board scenes. The renderer uses the included JSON reference boards, so the application repositories are not needed to re-render the assets. See [the asset guide](styles/README.md) for the commands and dimensions.

To make a ZIP from the versioned files, run this from the Chess repository root:

```sh
git archive --format=zip --prefix=comparisons/ --output=comparisons.zip HEAD:docs/comparisons
```

`comparisons.zip` is a local export; the expanded files in this directory are the versioned copy.
