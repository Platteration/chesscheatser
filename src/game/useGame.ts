import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { chooseMove } from '../engine/ai';
import { opposite } from '../engine/board';
import { isAttacked, Position } from '../engine/position';
import { generateSetup, type Setup } from '../engine/setup';
import type { Board, Color, GameResult, LegalMove, Move, PieceType, Square } from '../engine/types';
import { ARMY_SIZES, type GameConfig, type SavedGame } from './config';

export interface CapturedSummary {
  /** Pieces each colour has captured from the opponent. */
  byWhite: PieceType[];
  byBlack: PieceType[];
  /** Material lead for white in centipawns (negative = black leads). */
  whiteLead: number;
}

export interface GameSnapshot {
  board: Board;
  turn: Color;
  legal: LegalMove[];
  result: GameResult;
  moves: Move[];
  lastMove: Move | null;
  /** Every king on the board currently attacked, regardless of side. */
  kingsInDanger: Square[];
  captured: CapturedSummary;
  fullmove: number;
}

export interface GameState extends GameSnapshot {
  setup: Setup;
  humanColor: Color;
  config: GameConfig;
  thinking: boolean;
  resigned: Color | null;
  gameOver: boolean;
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
      // Promotions can make `after` exceed `before` for a piece type; clamp.
      for (let i = 0; i < Math.max(0, before[t] - after[t]); i++) list.push(t);
    }
    return list;
  };
  const byWhite = summarize('b');
  const byBlack = summarize('w');
  let lead = 0;
  for (const p of now) if (p) lead += (p.color === 'w' ? 1 : -1) * PIECE_VALUES[p.type];
  return { byWhite, byBlack, whiteLead: lead };
}

function snapshot(pos: Position, setup: Setup, moves: Move[]): GameSnapshot {
  const legal = pos.legalMoves();
  const result = pos.result(legal);
  const kingsInDanger: Square[] = [];
  for (const color of ['w', 'b'] as Color[]) {
    for (const k of pos.kings[color]) {
      if (isAttacked(pos.board, k, opposite(color))) kingsInDanger.push(k);
    }
  }
  return {
    board: pos.board.slice(),
    turn: pos.turn,
    legal,
    result,
    moves: moves.slice(),
    lastMove: moves.length ? moves[moves.length - 1] : null,
    kingsInDanger,
    captured: capturedSummary(setup.board, pos.board),
    fullmove: pos.fullmove,
  };
}

function stripMove(m: Move): Move {
  const out: Move = { from: m.from, to: m.to, piece: m.piece };
  if (m.captured) out.captured = m.captured;
  if (m.promotion) out.promotion = m.promotion;
  if (m.enPassant) out.enPassant = true;
  if (m.doublePush) out.doublePush = true;
  return out;
}

function resolveHumanColor(config: GameConfig): Color {
  if (config.playAs === 'random') return Math.random() < 0.5 ? 'w' : 'b';
  return config.playAs;
}

export interface StartOptions {
  config: GameConfig;
  seed?: number;
  humanColor?: Color;
  moves?: Move[];
}

export function useGame(initial: StartOptions, onSave?: (saved: SavedGame | null) => void) {
  const posRef = useRef<Position | null>(null);
  const movesRef = useRef<Move[]>([]);
  const [setup, setSetup] = useState<Setup>(() => buildSetup(initial));
  const [config, setConfig] = useState<GameConfig>(initial.config);
  const [humanColor, setHumanColor] = useState<Color>(initial.humanColor ?? resolveHumanColor(initial.config));
  const [snap, setSnap] = useState<GameSnapshot | null>(null);
  const [thinking, setThinking] = useState(false);
  const [resigned, setResigned] = useState<Color | null>(null);
  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Moves to replay into the very first setup (resuming a saved game). Consumed once. */
  const replayRef = useRef<{ seed: number | undefined; moves: Move[] } | null>(
    initial.moves && initial.moves.length ? { seed: initial.seed, moves: initial.moves } : null,
  );

  const refresh = useCallback(
    (pos: Position, s: Setup) => {
      const next = snapshot(pos, s, movesRef.current);
      setSnap(next);
      return next;
    },
    [],
  );

  // (Re)initialise the position whenever the setup changes.
  useEffect(() => {
    const pos = new Position(setup.board);
    posRef.current = pos;
    movesRef.current = [];
    const replay = replayRef.current;
    replayRef.current = null;
    const toReplay = replay && replay.seed === setup.seed ? replay.moves : [];
    for (const m of toReplay) {
      const legal = pos.legalMoves().find((x) => x.from === m.from && x.to === m.to && x.promotion === m.promotion);
      if (!legal) break;
      pos.makeMove(legal);
      movesRef.current.push(stripMove(legal));
    }
    setResigned(null);
    refresh(pos, setup);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup]);

  const gameOver = !!snap && (snap.result.kind !== 'ongoing' || resigned !== null);

  // Persist after every change.
  useEffect(() => {
    if (!snap || !onSave) return;
    if (gameOver) onSave(null);
    else onSave({ config, seed: setup.seed, humanColor, moves: movesRef.current.slice() });
  }, [snap, gameOver, onSave, config, setup.seed, humanColor]);

  const play = useCallback(
    (m: Move) => {
      const pos = posRef.current;
      if (!pos) return;
      const legal = pos.legalMoves().find((x) => x.from === m.from && x.to === m.to && x.promotion === m.promotion);
      if (!legal) return;
      pos.makeMove(legal);
      movesRef.current.push(stripMove(legal));
      refresh(pos, setup);
    },
    [refresh, setup],
  );

  // Computer moves.
  const aiColor: Color | null = config.mode === 'ai' ? opposite(humanColor) : null;
  useEffect(() => {
    if (!snap || gameOver || aiColor === null || snap.turn !== aiColor) return;
    setThinking(true);
    aiTimer.current = setTimeout(() => {
      const pos = posRef.current;
      if (!pos) return;
      const res = chooseMove(pos, config.difficulty);
      setThinking(false);
      if (res) play(res.move);
    }, 120);
    return () => {
      if (aiTimer.current) clearTimeout(aiTimer.current);
      setThinking(false);
    };
  }, [snap, gameOver, aiColor, config.difficulty, play]);

  const undo = useCallback(() => {
    const pos = posRef.current;
    if (!pos || movesRef.current.length === 0) return;
    // Against the computer, take back the pair of moves so it is the human's turn again.
    let plies = 1;
    if (aiColor !== null) {
      plies = pos.turn === humanColor ? 2 : 1;
    }
    plies = Math.min(plies, movesRef.current.length);
    for (let i = 0; i < plies; i++) {
      pos.unmakeMove();
      movesRef.current.pop();
    }
    setResigned(null);
    refresh(pos, setup);
  }, [aiColor, humanColor, refresh, setup]);

  const newGame = useCallback(
    (nextConfig?: GameConfig, seed?: number) => {
      const cfg = nextConfig ?? config;
      setConfig(cfg);
      setHumanColor(resolveHumanColor(cfg));
      setSetup(buildSetup({ config: cfg, seed }));
    },
    [config],
  );

  /** Same seed and armies; the human takes the other colour. */
  const rematch = useCallback(() => {
    setHumanColor((c) => (config.mode === 'ai' ? opposite(c) : c));
    // A fresh Setup object (same seed) forces the position to reinitialise.
    setSetup(buildSetup({ config, seed: setup.seed }));
  }, [config, setup.seed]);

  const resign = useCallback(() => {
    if (!snap || gameOver) return;
    setResigned(config.mode === 'ai' ? humanColor : snap.turn);
  }, [snap, gameOver, config.mode, humanColor]);

  const state: GameState | null = useMemo(() => {
    if (!snap) return null;
    return { ...snap, setup, humanColor, config, thinking, resigned, gameOver };
  }, [snap, setup, humanColor, config, thinking, resigned, gameOver]);

  return { state, play, undo, newGame, rematch, resign };
}

function buildSetup(opts: StartOptions): Setup {
  const size = ARMY_SIZES[opts.config.armySize];
  return generateSetup({ mode: opts.config.material, seed: opts.seed, minPieces: size.min, maxPieces: size.max });
}
