import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { opposite } from '../engine/board';
import { chooseMoveAsync, clearTranspositionTable } from '../engine/ai';
import { cheatCandidates, chooseActionAsync } from '../engine/cheat';
import { isAttacked, Position } from '../engine/position';
import { generateSetup, type Setup } from '../engine/setup';
import type { Board, Color, GameResult, LegalMove, Move, PieceType, Square } from '../engine/types';
import { ARMY_SIZES, type GameConfig, type SavedGame } from './config';
import { measureDeficit } from './comeback';
import { fold, lostPieces, replayablePrefix, stripMove, undoEvents, type CheatStats, type Folded, type GameEvent } from './events';

export interface CapturedSummary {
  /** Pieces each colour has captured from the opponent. */
  byWhite: PieceType[];
  byBlack: PieceType[];
  /** Material lead for white in pawns (negative = black leads). */
  whiteLead: number;
}

export interface GameState {
  board: Board;
  turn: Color;
  legal: LegalMove[];
  result: GameResult;
  /** Moves for the move list (passes included, caught cheats removed). */
  moves: Move[];
  /** Board after each move-list entry (index 0 = start), for reviewing. */
  boards: Board[];
  /** Last real move on the board, for highlighting. */
  lastMove: Move | null;
  /** Every king on the board currently attacked, regardless of side. */
  kingsInDanger: Square[];
  /** Square -> index of that king within its side (0 or 1), stable for the whole game. */
  kingMarks: Map<Square, number>;
  captured: CapturedSummary;
  setup: Setup;
  humanColor: Color;
  config: GameConfig;
  thinking: boolean;
  resigned: Color | null;
  /** Side whose clock ran out. */
  flagged: Color | null;
  /** Remaining time per side in ms (only meaningful when config.clock > 0). */
  clocks: Record<Color, number>;
  gameOver: boolean;
  /** Cheating mechanics. */
  canAccuse: boolean;
  bonus: Color | null;
  lastEvent: GameEvent | null;
  /** Last move / pass / accusation, ignoring power grants. */
  lastAction: GameEvent | null;
  cheats: CheatStats;
  caughtMove: Move | null;
  daily: string | null;
  ranked: number | null;
  /** Illegal moves the human may play right now (empty unless player cheating is on and unused). */
  cheatMoves: Move[];
  humanCheatsLeft: number;
  gameId: number;
  /** Comeback power granted to each side at the start of its latest turn. */
  powers: Folded['powers'];
  /** True once the side to move has its power for this turn (or comeback is off). */
  powerReady: boolean;
  maxDeficit: Record<Color, number>;
}

export const HUMAN_CHEATS_PER_GAME = 1;

/** Chance the computer notices a human cheat, by difficulty and how blatant the cheat is. */
export function detectionChance(difficulty: GameConfig['difficulty'], cheat: NonNullable<Move['cheat']>): number {
  const base = { easy: 0.3, medium: 0.55, hard: 0.8 }[difficulty];
  const blatant = cheat === 'jump' || cheat === 'resurrect' || cheat === 'upgrade' ? 0.15 : 0;
  return Math.min(0.95, base + blatant);
}

const PIECE_VALUES: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function capturedSummary(start: Board, now: Board): CapturedSummary {
  let lead = 0;
  for (const p of now) if (p) lead += (p.color === 'w' ? 1 : -1) * PIECE_VALUES[p.type];
  return { byWhite: lostPieces(start, now, 'b'), byBlack: lostPieces(start, now, 'w'), whiteLead: lead };
}

function resolveHumanColor(config: GameConfig): Color {
  if (config.playAs === 'random') return Math.random() < 0.5 ? 'w' : 'b';
  return config.playAs;
}

export interface StartOptions {
  config: GameConfig;
  seed?: number;
  humanColor?: Color;
  events?: GameEvent[];
  /** Date key when playing the daily challenge. */
  daily?: string;
  /** Ladder rank when playing a ranked game. */
  ranked?: number;
  /** Extra generator options (ranked handicap). */
  handicap?: number;
  clocks?: Record<Color, number>;
}

function buildSetup(config: GameConfig, seed?: number, handicap?: number): Setup {
  const size = ARMY_SIZES[config.armySize];
  return generateSetup({ mode: config.material, seed, minPieces: size.min, maxPieces: size.max, handicap });
}

export function useGame(initial: StartOptions, onSave?: (saved: SavedGame | null) => void) {
  const [config, setConfig] = useState<GameConfig>(initial.config);
  const [humanColor, setHumanColor] = useState<Color>(initial.humanColor ?? resolveHumanColor(initial.config));
  const [handicap, setHandicap] = useState<number | undefined>(initial.handicap);
  const [setup, setSetup] = useState<Setup>(() => buildSetup(initial.config, initial.seed, initial.handicap));
  const aiColor: Color | null = config.mode === 'ai' ? opposite(humanColor) : null;
  const [events, setEvents] = useState<GameEvent[]>(() =>
    initial.seed === undefined ? [] : replayablePrefix(setup, initial.events, aiColor),
  );
  /** Increments on every new game or rematch, so callers can tell games with the same seed apart. */
  const [gameId, setGameId] = useState(0);
  const [thinking, setThinking] = useState(false);
  const [resigned, setResigned] = useState<Color | null>(null);
  const [daily, setDaily] = useState<string | null>(initial.daily ?? null);
  const [ranked, setRanked] = useState<number | null>(initial.ranked ?? null);
  const clockMs = (initial.config.clock ?? 0) * 60_000;
  const [clocks, setClocks] = useState<Record<Color, number>>(initial.clocks ?? { w: clockMs, b: clockMs });
  const [flagged, setFlagged] = useState<Color | null>(null);
  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const foldOptions = useMemo(() => ({ doubleCheckLoses: config.doubleCheck === 'loses' }), [config.doubleCheck]);
  const folded = useMemo(() => fold(setup, events, aiColor, foldOptions), [setup, events, aiColor, foldOptions]);
  // Depends only on the position, so effects can use it without churning on unrelated state changes.
  const captured = useMemo(() => capturedSummary(setup.board, folded.pos.board), [setup, folded]);

  // Everything that derives from the position alone.
  const derived = useMemo(() => {
    const pos = folded.pos;
    const legal = pos.legalMoves();
    const result = pos.result(legal);
    const kingsInDanger: Square[] = [];
    const kingMarks = new Map<Square, number>();
    for (const color of ['w', 'b'] as Color[]) {
      pos.kings[color].forEach((k, i) => {
        kingMarks.set(k, i);
        if (isAttacked(pos.board, k, opposite(color))) kingsInDanger.push(k);
      });
    }
    let lastMove: Move | null = null;
    for (let i = folded.moveList.length - 1; i >= 0; i--) {
      if (!folded.moveList[i].pass) {
        lastMove = folded.moveList[i];
        break;
      }
    }
    const positionOver = result.kind !== 'ongoing';
    const humanCheatsLeft = Math.max(0, HUMAN_CHEATS_PER_GAME - folded.cheats.humanMade);
    let cheatMoves: Move[] = [];
    if (config.playerCheats && aiColor !== null && pos.turn === humanColor && humanCheatsLeft > 0 && !positionOver) {
      const me = pos.turn;
      cheatMoves = cheatCandidates(pos).filter((m) => {
        pos.makeMove(m);
        const ok = !pos.allKingsInCheck(me);
        pos.unmakeMove();
        return ok;
      });
    }
    return {
      board: pos.board.slice(),
      turn: pos.turn,
      legal,
      result,
      positionOver,
      moves: folded.moveList,
      boards: folded.boards,
      lastMove,
      kingsInDanger,
      kingMarks,
      cheatMoves,
      humanCheatsLeft,
    };
  }, [folded, config.playerCheats, humanColor, aiColor]);

  const comeback = !!config.comeback;
  // The side to move needs a power grant recorded for this turn before anyone moves.
  const powerReady = !comeback || folded.lastEvent?.type === 'power' || derived.positionOver;

  const state: GameState = useMemo(() => {
    const gameOver = derived.positionOver || resigned !== null || flagged !== null;
    const { positionOver: _ignored, ...rest } = derived;
    return {
      ...rest,
      cheatMoves: gameOver ? [] : derived.cheatMoves,
      captured,
      setup,
      humanColor,
      config,
      thinking,
      resigned,
      flagged,
      clocks,
      gameOver,
      canAccuse: folded.canAccuse && !gameOver,
      bonus: folded.bonus,
      lastEvent: folded.lastEvent,
      lastAction: folded.lastAction,
      cheats: folded.cheats,
      caughtMove: folded.caughtMove,
      daily,
      ranked,
      gameId,
      powers: folded.powers,
      powerReady,
      maxDeficit: folded.maxDeficit,
    };
  }, [derived, folded, captured, setup, humanColor, config, thinking, resigned, flagged, clocks, daily, ranked, gameId, powerReady]);

  // Pass-and-play clock: runs for the side to move once the first move has been made.
  const clockActive = (config.clock ?? 0) > 0 && config.mode === 'local' && !state.gameOver && events.length > 0;
  useEffect(() => {
    if (!clockActive) return;
    const side = state.turn;
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const dt = now - last;
      last = now;
      setClocks((c) => ({ ...c, [side]: Math.max(0, c[side] - dt) }));
    }, 200);
    return () => clearInterval(id);
  }, [clockActive, state.turn]);
  useEffect(() => {
    if (clockActive && clocks[state.turn] <= 0) setFlagged(state.turn);
  }, [clockActive, clocks, state.turn]);

  // Persist after every change. Clock time is read through a ref so the 200ms
  // tick does not rewrite the whole game; while a clock runs it is also saved
  // every few seconds and whenever the app leaves the foreground.
  const clocksRef = useRef(clocks);
  clocksRef.current = clocks;
  const save = useCallback(() => {
    if (!onSave) return;
    if (state.gameOver) onSave(null);
    else
      onSave({
        config,
        seed: setup.seed,
        humanColor,
        events,
        daily: daily ?? undefined,
        ranked: ranked ?? undefined,
        clocks: config.clock ? clocksRef.current : undefined,
        handicap,
      });
  }, [state.gameOver, onSave, config, setup.seed, humanColor, events, daily, ranked, handicap]);
  useEffect(() => save(), [save]);
  useEffect(() => {
    if (!clockActive) return;
    const id = setInterval(save, 5000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') save();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [clockActive, save]);

  const append = useCallback((e: GameEvent) => setEvents((prev) => [...prev, e]), []);

  // Drive the game forward: bonus passes and computer moves.
  useEffect(() => {
    if (state.gameOver) return;
    const last = folded.lastAction;
    // The side that just moved holds a bonus: the other side skips (before any power grant).
    if (last?.type === 'move' && folded.lastEvent === last && folded.bonus !== null && folded.lastBy === folded.bonus) {
      append({ type: 'pass' });
      return;
    }
    // Comeback: measure how far behind the side to move is and grant its power for this turn.
    // Runs in a timeout so the previous move paints before the short search.
    if (comeback && folded.lastEvent?.type !== 'power') {
      const id = setTimeout(() => {
        const d = measureDeficit(folded.pos, folded.pos.turn, 100);
        append({ type: 'power', color: folded.pos.turn, level: d.level, material: d.material, engine: d.engine });
      }, 0);
      return () => clearTimeout(id);
    }
    if (aiColor === null || state.turn !== aiColor) return;
    let cancelled = false;
    setThinking(true);
    // Only the computer's *last* move can be called out, so the first half of a
    // double move is always played honestly.
    const cheating = folded.bonus === aiColor ? 'off' : config.cheating;
    aiTimer.current = setTimeout(() => {
      const lost = aiColor === 'w' ? captured.byBlack : captured.byWhite;
      chooseActionAsync(folded.pos, config.difficulty, cheating, undefined, () => cancelled, { resurrectable: lost })
        .then((action) => {
          if (cancelled) return;
          setThinking(false);
          if (action) append({ type: 'move', move: stripMove(action.move) });
        })
        .catch(() => {
          if (!cancelled) setThinking(false);
        });
    }, 60);
    return () => {
      cancelled = true;
      if (aiTimer.current) clearTimeout(aiTimer.current);
      setThinking(false);
    };
  }, [folded, captured, state.gameOver, state.turn, aiColor, config.difficulty, config.cheating, comeback, append]);

  const play = useCallback(
    (m: Move) => {
      const legal = state.legal.find((x) => x.from === m.from && x.to === m.to && x.promotion === m.promotion);
      if (!legal || state.gameOver || !state.powerReady) return;
      append({ type: 'move', move: stripMove(legal) });
    },
    [state.legal, state.gameOver, state.powerReady, append],
  );

  /** Play one of `state.cheatMoves`; the computer may notice and punish it. */
  const playCheat = useCallback(
    (m: Move) => {
      const found = state.cheatMoves.find((x) => x.from === m.from && x.to === m.to && x.promotion === m.promotion && x.piece === m.piece);
      if (!found || state.gameOver) return;
      const noticed = Math.random() < detectionChance(config.difficulty, found.cheat!);
      setEvents((prev) => {
        const next: GameEvent[] = [...prev, { type: 'move', move: stripMove(found) }];
        if (noticed) next.push({ type: 'accuse', caught: true, by: 'ai' });
        return next;
      });
    },
    [state.cheatMoves, state.gameOver, config.difficulty],
  );

  /** Call out the computer's last move as a cheat. */
  const accuse = useCallback(() => {
    if (!state.canAccuse) return;
    const last = folded.lastAction;
    const caught = last?.type === 'move' && !!last.move.cheat && !last.move.power;
    append({ type: 'accuse', caught });
  }, [state.canAccuse, folded.lastEvent, append]);

  const undo = useCallback(() => {
    if (flagged) return; // a lost clock cannot be wound back
    setResigned(null);
    setEvents((prev) => undoEvents(setup, prev, aiColor, foldOptions));
  }, [setup, aiColor, flagged, foldOptions]);

  const reset = useCallback((cfg: GameConfig, seed: number | undefined, color: Color, nextHandicap?: number) => {
    // A ranked (handicap) army set only makes sense with its ratio; new armies fall back to fair play.
    const material = cfg.material === 'handicap' && nextHandicap === undefined ? 'fair' : cfg.material;
    const finalCfg = material === cfg.material ? cfg : { ...cfg, material };
    clearTranspositionTable();
    setConfig(finalCfg);
    setHumanColor(color);
    setHandicap(nextHandicap);
    setSetup(buildSetup(finalCfg, seed, nextHandicap));
    setGameId((n) => n + 1);
    setEvents([]);
    setResigned(null);
    setFlagged(null);
    const ms = (cfg.clock ?? 0) * 60_000;
    setClocks({ w: ms, b: ms });
    setDaily(null);
    setRanked(null);
  }, []);

  const newGame = useCallback(
    (nextConfig?: GameConfig, seed?: number) => {
      const cfg = nextConfig ?? config;
      reset(cfg, seed, resolveHumanColor(cfg));
    },
    [config, reset],
  );

  /** Same seed and armies; against the computer the human takes the other colour. */
  const rematch = useCallback(() => {
    reset(config, setup.seed, config.mode === 'ai' ? opposite(humanColor) : humanColor, handicap);
  }, [config, setup.seed, humanColor, handicap, reset]);

  /** A decent legal move for the side to move (medium-strength search, UI-yielding). */
  const getHint = useCallback(async (): Promise<Move | null> => {
    if (state.gameOver) return null;
    const res = await chooseMoveAsync(folded.pos, 'medium');
    return res?.move ?? null;
  }, [folded.pos, state.gameOver]);

  const resign = useCallback(() => {
    if (state.gameOver) return;
    setResigned(config.mode === 'ai' ? humanColor : state.turn);
  }, [state.gameOver, state.turn, config.mode, humanColor]);

  return { state, play, playCheat, accuse, undo, newGame, rematch, resign, getHint };
}
