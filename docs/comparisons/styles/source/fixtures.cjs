// Run from this workspace to regenerate the real-engine reference boards.
const fs = require('fs');
const path = require('path');
const sourceDirectory = path.dirname(module.filename);
const ts = require('/workspace/sudokuoku/node_modules/typescript');
require.extensions['.ts'] = (mod, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
};
const chess = require('/workspace/chesscheatser/src/engine/setup.ts');
const ck = require('/workspace/multidcheckers/src/engine/index.ts');
const c4 = require('/workspace/multidconnect4/src/engine/index.ts');
let checkers = ck.newGame();
for (const [from, to] of [['b3','a4'], ['g6','h5'], ['d3','c4'], ['e6','f5']]) {
  const square = name => ck.index(Number(name[1])-1, name.charCodeAt(0)-97);
  const board = checkers.timelines[0].boards.at(-1);
  const move = ck.legalMoves(board, checkers.toMove, checkers.rules).find(move => move.from === square(from) && ck.moveTarget(move) === square(to));
  if (!move) throw new Error('Missing legal reference move ' + from + '-' + to);
  checkers = ck.applyAction(checkers, {type:'move', timeline:0, move});
}
let connect4 = c4.newGame();
for (const column of [1,7,2,7]) connect4 = c4.applyAction(connect4, {type:'drop', timeline:0, col:column-1});
const sudoku = JSON.parse(fs.readFileSync(path.resolve(sourceDirectory, '../../sudoku-fixture.json')));
const fixture = {
  chess: {description:'Mirror armies, full size, two kings per side, seed 1; initial state.', board:chess.generateSetup({mode:'mirror',seed:1,kings:2,minPieces:12,maxPieces:16}).board},
  checkers: {description:'After b3-a4, g6-h5, d3-c4, e6-f5; turn 4.', board:checkers.timelines[0].boards.at(-1)},
  connect4: {description:'After drops into columns 1, 7, 2, 7; turn 4.', board:connect4.timelines[0].boards.at(-1)},
  sudoku: {description:'Seed 20261011; selected cell has pencil notes 1, 3, 7.', values:sudoku.values, notes:sudoku.notes, selected:sudoku.selected, given:sudoku.given},
};
fs.writeFileSync(path.join(sourceDirectory,'fixtures.json'),JSON.stringify(fixture,null,2)+'\n');
console.log('Generated four reference boards through the existing engines.');
