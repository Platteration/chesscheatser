import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { opposite } from '../engine/board';
import { chooseAction } from '../engine/cheat';
import { isAttacked, Position } from '../engine/position';
import { generateSetup, type Setup } from '../engine/setup';
import type { Board, Color, GameResult, LegalMove, Move, PieceType, Square } from '../engine/types';
import { ARMY_SIZES, type GameConfig, type SavedGame } from './config';
import { fold, stripMove, undoEvents, type CheatStats, type GameEvent } from './events';

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
  /** Last real move on the board, for highlighting. */
  lastMove: Move | null;
  /** Every king on the board currently attacked, regardless of side. */
  kingsInDanger: Square[];
  captured: CapturedSummary;
  setup: Setup;
  humanColor: Color;
  config: GameConfig;
  thinking: boolean;
  resigned: Color | null;
  gameOver: boolean;
  /** Cheating mechanics. */
  canAccuse: boolean;
  bonus: Color | null;
  lastEvent: GameEvent | null;
  cheats: CheatStats;
  caughtMove: Move | null;
}

const PIECE_VALUES: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function countPieces(board: Board, color: Color): Record<PieceType, number> {
  const out: Record<PieceType, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
  for (const p of board) if (p && p.color === color) out[p.type]++;
  return out;
}

function capturedSummary(start: Board, now: Board): CapturedSummary {
  const order: PieceType[] = ['q', 'r', 'b', 'n', 'p'];
  const summarize = (victim: Color): PieceType[] => {
    const before = countPieces(start, victim);
    const after = countPieces(now, victim);
    const list: PieceType[] = [];
    for (const t of order) {
      for (let i = 0; i < Math.max(0, before[t] - after[t]); i++) list.push(t);
    }
    return list;
  };
  let lead = 0;
  for (const p of now) if (p) lead += (p.color === 'w' ? 1 : -1) * PIECE_VALUES[p.type];
  return { byWhite: summarize('b'), byBlack: summarize('w'), whiteLead: lead };
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
}

function buildSetup(config: GameConfig, seed?: number): Setup {
  const size = ARMY_SIZES[config.armySize];
  return generateSetup({ mode: config.material, seed, minPieces: size.min, maxPieces: size.max });
}

/** Replays saved events defensively: anything that fails to apply is dropped. */
function sanitizeEvents(setup: Setup, events: GameEvent[] | undefined, aiColor: Color | null): GameEvent[] {
  if (!events || !events.length) return [];
  for (let n = events.length; n > 0; n--) {
    try {
      fold(setup, events.slice(0, n), aiColor);
      return events.slice(0, n);
    } catch {
      // try a shorter prefix
    }
  }
  return [];
}

export function useGame(initial: StartOptions, onSave?: (saved: SavedGame | null) => void) {
  const [config, setConfig] = useState<GameConfig>(initial.config);
  const [humanColor, setHumanColor] = useState<Color>(initial.humanColor ?? resolveHumanColor(initial.config));
  const [setup, setSetup] = useState<Setup>(() => buildSetup(initial.config, initial.seed));
  const aiColor: Color | null = config.mode === 'ai' ? opposite(humanColor) : null;
  const [events, setEvents] = useState<GameEvent[]>(() =>
    initial.seed === undefined ? [] : sanitizeEvents(buildSetup(initial.config, initial.seed), initial.events, aiColor),
  );
  const [thinking, setThinking] = useState(false);
  const [resigned, setResigned] = useState<Color | null>(null);
  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const folded = useMemo(() => fold(setup, events, aiColor), [setup, events, aiColor]);

  const state: GameState = useMemo(() => {
    const pos = folded.pos;
    const legal = pos.legalMoves();
    const result = pos.result(legal);
    const kingsInDanger: Square[] = [];
    for (const color of ['w', 'b'] as Color[]) {
      for (const k of pos.kings[color]) if (isAttacked(pos.board, k, opposite(color))) kingsInDanger.push(k);
    }
    let lastMove: Move | null = null;
    for (let i = folded.moveList.length - 1; i >= 0; i--) {
      if (!folded.moveList[i].pass) {
        lastMove = folded.moveList[i];
        break;
      }
    }
    const gameOver = result.kind !== 'ongoing' || resigned !== null;
    return {
      board: pos.board.slice(),
      turn: pos.turn,
      legal,
      result,
      moves: folded.moveList,
      lastMove,
      kingsInDanger,
      captured: capturedSummary(setup.board, pos.board),
      setup,
      humanColor,
      config,
      thinking,
      resigned,
      gameOver,
      canAccuse: folded.canAccuse && !gameOver,
      bonus: folded.bonus,
      lastEvent: folded.lastEvent,
      cheats: folded.cheats,
      caughtMove: folded.caughtMove,
    };
  }, [folded, setup, humanColor, config, thinking, resigned]);

  // Persist after every change.
  useEffect(() => {
    if (!onSave) return;
    if (state.gameOver) onSave(null);
    else onSave({ config, seed: setup.seed, humanColor, events });
  }, [state.gameOver, onSave, config, setup.seed, humanColor, events]);

  const append = useCallback((e: GameEvent) => setEvents((prev) => [...prev, e]), []);

  // Drive the game forward: bonus passes and computer moves.
  useEffect(() => {
    if (state.gameOver) return;
    const last = folded.lastEvent;
    // The side that just moved holds a bonus: the other side skips.
    if (last?.type === 'move' && folded.bonus !== null && folded.lastBy === folded.bonus) {
      append({ type: 'pass' });
      return;
    }
    if (aiColor === null || state.turn !== aiColor) return;
    setThinking(true);
    aiTimer.current = setTimeout(() => {
      const action = chooseAction(folded.pos, config.difficulty, config.cheating);
      setThinking(false);
      if (action) append({ type: 'move', move: stripMove(action.move) });
    }, 120);
    return () => {
      if (aiTimer.current) clearTimeout(aiTimer.current);
      setThinking(false);
    };
  }, [folded, state.gameOver, state.turn, aiColor, config.difficulty, config.cheating, append]);

  const play = useCallback(
    (m: Move) => {
      const legal = state.legal.find((x) => x.from === m.from && x.to === m.to && x.promotion === m.promotion);
      if (!legal || state.gameOver) return;
      append({ type: 'move', move: stripMove(legal) });
    },
    [state.legal, state.gameOver, append],
  );

  /** Call out the computer's last move as a cheat. */
  const accuse = useCallback(() => {
    if (!state.canAccuse) return;
    const last = folded.lastEvent;
    const caught = last?.type === 'move' && !!last.move.cheat;
    append({ type: 'accuse', caught });
  }, [state.canAccuse, folded.lastEvent, append]);

  const undo = useCallback(() => {
    setResigned(null);
    setEvents((prev) => undoEvents(setup, prev, aiColor));
  }, [setup, aiColor]);

  const reset = useCallback((cfg: GameConfig, seed: number | undefined, color: Color) => {
    setConfig(cfg);
    setHumanColor(color);
    setSetup(buildSetup(cfg, seed));
    setEvents([]);
    setResigned(null);
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
    reset(config, setup.seed, config.mode === 'ai' ? opposite(humanColor) : humanColor);
  }, [config, setup.seed, humanColor, reset]);

  const resign = useCallback(() => {
    if (state.gameOver) return;
    setResigned(config.mode === 'ai' ? humanColor : state.turn);
  }, [state.gameOver, state.turn, config.mode, humanColor]);

  return { state, play, accuse, undo, newGame, rematch, resign };
}
