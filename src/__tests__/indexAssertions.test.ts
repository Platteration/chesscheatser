/**
 * Under noUncheckedIndexedAccess an index expression reads as `T | undefined`, and a
 * non-null assertion on one is how the code says the index cannot miss: a board square,
 * a masked hash, a loop bound. But `!` removes null as well as undefined, so on a table
 * whose entries can themselves be null (the board, where null is an empty square) it
 * also claims a piece stands there, which no bound establishes, and the checker then
 * lets `captured.type` through on every quiet move. Where the element type holds null,
 * the index is read with `?? null` instead, as `pieceAt` does, and the null stays in
 * the type.
 *
 * The scan covers what `npm run typecheck` checks, tests aside: a wrong assertion in a
 * test throws inside that test and turns it red, which is what a test is for.
 */
import { relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));

interface Scan {
  /** Root-relative paths of the files scanned. */
  files: string[];
  /** How many non-null assertions on an index expression were looked at. */
  examined: number;
  /** `path:line: text` for each one whose element type holds null. */
  found: string[];
}

function scan(program: ts.Program, include: (path: string) => boolean): Scan {
  const checker = program.getTypeChecker();
  const out: Scan = { files: [], examined: 0, found: [] };
  for (const file of program.getSourceFiles()) {
    const path = relative(root, file.fileName).split(sep).join('/');
    if (!include(path)) continue;
    out.files.push(path);
    const visit = (node: ts.Node): void => {
      if (ts.isNonNullExpression(node)) {
        let inner = node.expression;
        while (ts.isParenthesizedExpression(inner)) inner = inner.expression;
        if (ts.isElementAccessExpression(inner)) {
          out.examined++;
          const type = checker.getTypeAtLocation(node.expression);
          const members = type.isUnion() ? type.types : [type];
          if (members.some((t) => (t.flags & ts.TypeFlags.Null) !== 0)) {
            const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
            out.found.push(`${path}:${line + 1}: ${node.getText(file)}`);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return out;
}

const isAppSource = (path: string) =>
  !path.startsWith('..') && !path.split('/').includes('node_modules') && !path.includes('__tests__/') && !/\.test\.tsx?$/.test(path);

function projectProgram(): ts.Program {
  const read = ts.readConfigFile(`${root}tsconfig.json`, ts.sys.readFile);
  if (read.error) throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, root);
  return ts.createProgram(parsed.fileNames, parsed.options);
}

// A program over one file that exists only here, so the scan is shown to find what it is
// for before its empty answer over the app is believed.
function probeProgram(source: string): { program: ts.Program; path: string } {
  const path = 'index-assertion-probe.ts';
  const fileName = `${root}${path}`;
  const options: ts.CompilerOptions = { strict: true, noUncheckedIndexedAccess: true, noEmit: true, types: [] };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, version, ...rest) =>
    name === fileName ? ts.createSourceFile(name, source, version) : getSourceFile(name, version, ...rest);
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (name) => name === fileName || fileExists(name);
  return { program: ts.createProgram([fileName], options, host), path };
}

describe('non-null assertions on an index', () => {
  it('are found where the element type holds null, and only there', () => {
    const { program, path } = probeProgram(
      [
        'declare const board: ({ type: string } | null)[];',
        'declare const table: number[];',
        'declare const s: number;',
        'export const a = board[s]!;',
        'export const b = (board[s])!.type;',
        'export const c = table[s]!;',
        'export const d = board[s] ?? null;',
        '',
      ].join('\n'),
    );
    const result = scan(program, (p) => p === path);
    expect(result.files).toEqual([path]);
    expect(result.examined).toBe(3);
    expect(result.found).toEqual([`${path}:4: board[s]!`, `${path}:5: (board[s])!`]);
  });

  it('never strip null from an element that can be null in the app', () => {
    const result = scan(projectProgram(), isAppSource);
    // The files that hold index assertions are among those read, so an empty answer is
    // not an empty scan.
    expect(result.files).toEqual(expect.arrayContaining(['App.tsx', 'src/engine/position.ts', 'src/engine/ai.ts', 'src/ui/Board.tsx']));
    expect(result.examined).toBeGreaterThan(0);
    expect(result.found).toEqual([]);
  });
});
