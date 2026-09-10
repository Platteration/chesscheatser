/**
 * Self-play tuning harness for comeback powers.
 *   npx tsx scripts/simulate.ts [games] [difficulty] [mode]
 * Plays computer vs computer with powers on and off and reports how games end,
 * how long they last, and how often the side that started weaker wins.
 */
import { chooseMove, clearTranspositionTable, type Difficulty } from '../src/engine/ai';
import { Position } from '../src/engine/position';
import { generateSetup, type MaterialMode } from '../src/engine/setup';
import { MAX_POWER, offerPowers } from '../src/engine/powers';
import { chooseDraft, measureDeficit } from '../src/game/comeback';
import { lostPieces } from '../src/game/events';

const games = Number(process.argv[2] ?? 20);
const difficulty = (process.argv[3] ?? 'easy') as Difficulty;
const mode = (process.argv[4] ?? 'chaos') as MaterialMode;
const rule = process.argv[5] ?? 'loses'; // 'loses' | 'answer'
const MAX_PLIES = 200;

interface Outcome {
  kind: string;
  plies: number;
  weakerWon: boolean | null;
  maxLevel: number;
  poweredTurns: number;
  biggestComebackWin: number;
}

function play(seed: number, comeback: boolean): Outcome {
  clearTranspositionTable();
  const setup = generateSetup({ mode, seed });
  const pos = new Position(setup.board);
  pos.doubleCheckLoses = rule !== 'answer';
  const weaker = setup.whiteValue === setup.blackValue ? null : setup.whiteValue < setup.blackValue ? 'w' : 'b';
  let maxLevel = 0;
  let poweredTurns = 0;
  let maxDeficitBy: Record<'w' | 'b', number> = { w: 0, b: 0 };
  let plies = 0;
  let kind = 'unfinished';
  for (; plies < MAX_PLIES; plies++) {
    for (const c of ['w', 'b'] as const) pos.resurrectable[c] = lostPieces(setup.board, pos.board, c);
    if (comeback) {
      const color = pos.turn;
      const d = measureDeficit(pos, color, 60);
      const owned = pos.powerTags[color];
      // Same draft the game plays: one pick per level-up, chosen by the AI policy.
      if (d.level > owned.size) {
        const offered = offerPowers(owned, d.level, seed * 1000 + plies);
        if (offered.length) pos.grantPower(color, chooseDraft(pos, offered, seed * 1000 + plies));
      }
      maxLevel = Math.max(maxLevel, pos.powerTags[color].size);
      if (pos.powerTags[color].size > 0) poweredTurns++;
      maxDeficitBy[color] = Math.max(maxDeficitBy[color], d.total);
    }
    const res = pos.result();
    if (res.kind !== 'ongoing') {
      kind = res.kind;
      break;
    }
    const mv = chooseMove(pos, difficulty, seed * 1000 + plies);
    if (!mv) break;
    pos.makeMove(mv.move);
  }
  const res = pos.result();
  const winner = res.kind === 'checkmate' || res.kind === 'both-in-check' ? res.winner : null;
  return {
    kind: winner ? `${res.kind} (${winner})` : kind === 'unfinished' ? 'unfinished' : res.kind,
    plies,
    weakerWon: weaker && winner ? winner === weaker : null,
    maxLevel,
    poweredTurns,
    biggestComebackWin: winner ? maxDeficitBy[winner] : 0,
  };
}

for (const comeback of [false, true]) {
  const outcomes: Outcome[] = [];
  const t0 = Date.now();
  for (let seed = 1; seed <= games; seed++) outcomes.push(play(seed, comeback));
  const decisive = outcomes.filter((o) => o.kind.startsWith('checkmate') || o.kind.startsWith('both')).length;
  const weakerGames = outcomes.filter((o) => o.weakerWon !== null);
  const weakerWins = weakerGames.filter((o) => o.weakerWon).length;
  const avgPlies = outcomes.reduce((a, o) => a + o.plies, 0) / outcomes.length;
  const byKind: Record<string, number> = {};
  for (const o of outcomes) {
    const k = o.kind.replace(/ \((w|b)\)/, '');
    byKind[k] = (byKind[k] ?? 0) + 1;
  }
  const comebacks = outcomes.filter((o) => o.biggestComebackWin >= 350).length;
  console.log(`\n== comeback ${comeback ? 'ON' : 'OFF'} · double check ${rule} · ${games} ${mode} games · ${difficulty} · ${((Date.now() - t0) / 1000).toFixed(0)}s ==`);
  console.log(`decisive ${decisive}/${games} · avg plies ${avgPlies.toFixed(0)} · endings ${JSON.stringify(byKind)}`);
  console.log(`weaker side won ${weakerWins}/${weakerGames.length} · wins from >=3.5 behind: ${comebacks}`);
  if (comeback) {
    const avgPowered = outcomes.reduce((a, o) => a + o.poweredTurns, 0) / outcomes.length;
    const levels = Array.from({ length: MAX_POWER + 1 }, (_, l) => outcomes.filter((o) => o.maxLevel === l).length);
    console.log(`avg powered turns/game ${avgPowered.toFixed(1)} · picks reached (0..${MAX_POWER}) = ${JSON.stringify(levels)}`);
  }
}
