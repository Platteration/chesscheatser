import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { chooseMoveAsync } from '../engine/ai';
import { opposite } from '../engine/board';
import { isAttacked, Position } from '../engine/position';
import type { LegalMove, Move, PieceType, Square } from '../engine/types';
import { isSolution, PUZZLE_KIND_LABEL, puzzlePosition, type Puzzle, type PuzzleProgress } from '../game/puzzles';
import { haptics } from '../haptics';
import { playSound } from '../sounds';
import { Board } from './Board';
import { Button } from './components';
import { PromotionPicker } from './PromotionPicker';
import { themedStyles, useTheme } from './theme';

interface Props {
  puzzles: Puzzle[];
  progress: PuzzleProgress;
  onSolved: (id: string) => void;
  onBack: () => void;
}

type Phase = 'solve' | 'reply' | 'finish' | 'solved' | 'wrong';

export function PuzzleScreen(props: Props) {
  if (props.puzzles.length === 0) return <EmptyPuzzles onBack={props.onBack} />;
  return <PuzzlePlayer {...props} />;
}

function EmptyPuzzles({ onBack }: { onBack: () => void }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Button title="‹ Home" variant="ghost" small onPress={onBack} />
        <Text style={styles.title}>Puzzles</Text>
        <View style={{ width: 64 }} />
      </View>
      <Text style={styles.status}>No puzzles are bundled in this build.</Text>
    </View>
  );
}

function PuzzlePlayer({ puzzles, progress, onSolved, onBack }: Props) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const boardSize = Math.floor(Math.min(width - 16, height * 0.55));
  const solved = useMemo(() => new Set(progress.solved), [progress.solved]);

  const firstUnsolved = Math.max(0, puzzles.findIndex((p) => !solved.has(p.id)));
  const [index, setIndex] = useState(firstUnsolved);
  const puzzle = puzzles[index];
  const posRef = useRef<Position | null>(null);
  if (posRef.current === null) posRef.current = puzzlePosition(puzzle);
  const [tick, setTick] = useState(0);
  const [phase, setPhase] = useState<Phase>('solve');
  const [selected, setSelected] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [lastMove, setLastMove] = useState<Move | null>(null);
  const moveCount = useRef(0);

  const reset = useCallback(
    (i: number) => {
      posRef.current = puzzlePosition(puzzles[i]);
      setPhase('solve');
      setSelected(null);
      setLastMove(null);
      moveCount.current = 0;
      setTick((t) => t + 1);
    },
    [puzzles],
  );

  useEffect(() => reset(index), [index, reset]);

  const pos = posRef.current!;
  const legal = useMemo(() => (phase === 'solve' || phase === 'finish' ? pos.legalMoves() : []), [pos, phase, tick]);
  const targets = useMemo(() => (selected === null ? [] : legal.filter((m) => m.from === selected)), [legal, selected]);
  const kingMarks = useMemo(() => {
    const m = new Map<Square, number>();
    for (const c of ['w', 'b'] as const) pos.kings[c].forEach((k, i) => m.set(k, i));
    return m;
  }, [pos, tick]);
  const kingsInDanger = useMemo(() => {
    const out: Square[] = [];
    for (const c of ['w', 'b'] as const) for (const k of pos.kings[c]) if (isAttacked(pos.board, k, opposite(c))) out.push(k);
    return out;
  }, [pos, tick]);

  const apply = useCallback(
    (m: LegalMove) => {
      const p = posRef.current!;
      setSelected(null);
      if (phase === 'solve') {
        if (!isSolution(puzzle, p, m)) {
          p.makeMove(m);
          setLastMove(m);
          setPhase('wrong');
          setTick((t) => t + 1);
          haptics.wrong();
          playSound('wrong');
          return;
        }
        p.makeMove(m);
        setLastMove(m);
        moveCount.current++;
        setTick((t) => t + 1);
        if (puzzle.kind !== 'win-2') {
          setPhase('solved');
          haptics.win();
          playSound('win');
          onSolved(puzzle.id);
          return;
        }
        setPhase('reply');
        playSound('move');
        chooseMoveAsync(p, 'hard').then((res) => {
          if (posRef.current !== p) return;
          if (res) {
            p.makeMove(res.move);
            setLastMove(res.move);
          }
          setPhase('finish');
          setTick((t) => t + 1);
        });
        return;
      }
      if (phase === 'finish') {
        p.makeMove(m);
        setLastMove(m);
        setTick((t) => t + 1);
        if (p.result().kind !== 'ongoing') {
          setPhase('solved');
          haptics.win();
          playSound('win');
          onSolved(puzzle.id);
        } else {
          setPhase('wrong');
          haptics.wrong();
          playSound('wrong');
        }
      }
    },
    [phase, puzzle, onSolved],
  );

  const onSquarePress = useCallback(
    (s: Square) => {
      if (phase !== 'solve' && phase !== 'finish') return;
      if (selected !== null) {
        const candidates = legal.filter((m) => m.from === selected && m.to === s);
        if (candidates.length) {
          if (candidates[0].promotion) setPendingPromotion({ from: selected, to: s });
          else apply(candidates[0]);
          return;
        }
      }
      const piece = pos.board[s];
      setSelected(piece && piece.color === pos.turn && s !== selected ? s : null);
    },
    [phase, selected, legal, pos, apply],
  );

  const onPromote = useCallback(
    (t: PieceType) => {
      if (!pendingPromotion) return;
      const m = legal.find((x) => x.from === pendingPromotion.from && x.to === pendingPromotion.to && x.promotion === t);
      setPendingPromotion(null);
      if (m) apply(m);
    },
    [pendingPromotion, legal, apply],
  );

  const label = PUZZLE_KIND_LABEL[puzzle.kind];
  const sideName = puzzle.turn === 'w' ? 'White' : 'Black';
  const status =
    phase === 'solve'
      ? `${sideName} to move. ${label.goal}`
      : phase === 'reply'
        ? 'Opponent is defending…'
        : phase === 'finish'
          ? 'Now finish it.'
          : phase === 'solved'
            ? 'Solved!'
            : 'Not that one. Try again.';
  const solvedCount = puzzles.filter((p) => solved.has(p.id)).length;

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.topBar}>
        <Button title="‹ Home" variant="ghost" small onPress={onBack} />
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{label.title}</Text>
          <Text style={styles.subtitle}>
            Puzzle {index + 1}/{puzzles.length} · {solvedCount} solved{solved.has(puzzle.id) ? ' · ✓' : ''}
          </Text>
        </View>
        <View style={{ width: 64 }} />
      </View>

      <View style={styles.boardWrap}>
        <Board
          board={pos.board}
          size={boardSize}
          flipped={puzzle.turn === 'b'}
          selected={selected}
          targets={targets}
          lastMove={lastMove}
          animate={lastMove}
          animationKey={tick}
          kingsInDanger={kingsInDanger}
          kingMarks={kingMarks}
          onSquarePress={onSquarePress}
          disabled={phase !== 'solve' && phase !== 'finish'}
        />
      </View>

      <Text style={[styles.status, phase === 'solved' && { color: theme.success }, phase === 'wrong' && { color: theme.danger }]}>{status}</Text>

      <View style={styles.controls}>
        <Button title="◀ Prev" variant="secondary" small onPress={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0} />
        {phase === 'wrong' ? (
          <Button title="Retry" small onPress={() => reset(index)} />
        ) : (
          <Button title="Reset" variant="secondary" small onPress={() => reset(index)} />
        )}
        <Button
          title={phase === 'solved' ? 'Next ▶' : 'Skip ▶'}
          variant={phase === 'solved' ? 'primary' : 'secondary'}
          small
          onPress={() => setIndex((i) => Math.min(puzzles.length - 1, i + 1))}
          disabled={index >= puzzles.length - 1}
        />
      </View>

      <PromotionPicker visible={pendingPromotion !== null} color={pos.turn} onPick={onPromote} onCancel={() => setPendingPromotion(null)} />
    </View>
  );
}

const useStyles = themedStyles((theme) => ({
  root: { flex: 1, backgroundColor: theme.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  titleBlock: { alignItems: 'center' },
  title: { color: theme.text, fontWeight: '800', fontSize: 16 },
  subtitle: { color: theme.textMuted, fontSize: 11 },
  boardWrap: { alignItems: 'center', marginVertical: 10 },
  status: { color: theme.text, fontSize: 15, fontWeight: '600', textAlign: 'center', paddingHorizontal: 16, minHeight: 44 },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: 10, paddingVertical: 10, marginTop: 'auto' },
}));
