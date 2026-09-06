import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { opposite, squareName } from '../engine/board';
import { moveToSAN } from '../engine/position';
import type { Color, Move, PieceType, Square } from '../engine/types';
import type { GameConfig, SavedGame } from '../game/config';
import { useGame, type GameState, type StartOptions } from '../game/useGame';
import { Board } from './Board';
import { Button } from './components';
import { CHESS_FONT, GLYPH } from './PieceGlyph';
import { haptics } from '../haptics';
import { PromotionPicker } from './PromotionPicker';
import { theme } from './theme';

interface Props {
  start: StartOptions;
  onExit: () => void;
  onSave: (saved: SavedGame | null) => void;
  onFinished: (outcome: 'win' | 'loss' | 'draw') => void;
}

const COLOR_NAME: Record<Color, string> = { w: 'White', b: 'Black' };
const DIFFICULTY_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as const;
const MATERIAL_LABEL = { chaos: 'Chaos', fair: 'Fair', mirror: 'Mirror' } as const;

export function GameScreen({ start, onExit, onSave, onFinished }: Props) {
  const { state, play, accuse, undo, newGame, rematch, resign, getHint } = useGame(start, onSave);
  const [hint, setHint] = useState<Move | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [flipped, setFlipped] = useState<boolean | null>(null);
  const [showResult, setShowResult] = useState(true);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reported = useRef<string | null>(null);

  const boardSize = Math.floor(Math.min(width - 16, height * 0.55));

  const humanTurn = state.config.mode === 'local' || state.turn === state.humanColor;
  const isFlipped = flipped ?? (state.config.mode === 'ai' && state.humanColor === 'b');

  // Report the outcome exactly once per finished game (vs computer only).
  useEffect(() => {
    if (!state.gameOver || state.config.mode !== 'ai') return;
    const key = `${state.setup.seed}:${state.moves.length}:${state.resigned ?? ''}`;
    if (reported.current === key) return;
    reported.current = key;
    const winner = winnerOf(state);
    onFinished(winner === null ? 'draw' : winner === state.humanColor ? 'win' : 'loss');
  }, [state, onFinished]);

  useEffect(() => {
    if (state.gameOver) setShowResult(true);
  }, [state.gameOver]);

  // Feedback for whatever just happened, and drop any stale hint.
  const seen = useRef<string>('');
  useEffect(() => {
    setHint(null);
    const key = `${state.setup.seed}:${state.moves.length}:${state.lastEvent?.type ?? ''}:${state.gameOver}`;
    if (seen.current === key) return;
    const first = seen.current === '';
    seen.current = key;
    if (first) return;
    if (state.gameOver) {
      const winner = winnerOf(state);
      if (winner === null) haptics.move();
      else if (state.config.mode === 'local' || winner === state.humanColor) haptics.win();
      else haptics.loss();
      return;
    }
    const last = state.lastEvent;
    if (last?.type === 'accuse') {
      if (last.caught) haptics.caught();
      else haptics.wrong();
    } else if (last?.type === 'move') {
      const moverChecked = state.kingsInDanger.some((k) => state.board[k]?.color === state.turn);
      if (moverChecked) haptics.check();
      else if (last.move.captured) haptics.capture();
      else haptics.move();
    }
  }, [state]);

  const onHint = useCallback(() => {
    const m = getHint();
    if (m) setHint(m);
  }, [getHint]);

  const targets = useMemo(() => {
    if (selected === null) return [];
    return state.legal.filter((m) => m.from === selected);
  }, [state, selected]);

  const onSquarePress = useCallback(
    (s: Square) => {
      if (state.gameOver || state.thinking || !humanTurn) return;
      if (selected !== null) {
        const candidates = state.legal.filter((m) => m.from === selected && m.to === s);
        if (candidates.length > 0) {
          setSelected(null);
          if (candidates[0].promotion) setPendingPromotion({ from: selected, to: s });
          else play(candidates[0]);
          return;
        }
      }
      const p = state.board[s];
      setSelected(p && p.color === state.turn && s !== selected ? s : null);
    },
    [state, selected, humanTurn, play],
  );

  const onPromote = useCallback(
    (t: PieceType) => {
      if (!pendingPromotion) return;
      const m = state.legal.find(
        (x) => x.from === pendingPromotion.from && x.to === pendingPromotion.to && x.promotion === t,
      );
      setPendingPromotion(null);
      if (m) play(m);
    },
    [pendingPromotion, state, play],
  );

  const topColor: Color = isFlipped ? 'w' : 'b';
  const bottomColor: Color = opposite(topColor);
  const status = describeStatus(state);

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.topBar}>
        <Button title="‹ Home" variant="ghost" small onPress={onExit} />
        <View style={styles.titleBlock}>
          <Text style={styles.title}>Two Kings</Text>
          <Text style={styles.subtitle}>
            {MATERIAL_LABEL[state.config.material]} armies · seed {state.setup.seed}
          </Text>
        </View>
        <Button title="Flip" variant="ghost" small onPress={() => setFlipped(!isFlipped)} />
      </View>

      <PlayerStrip state={state} color={topColor} active={state.turn === topColor && !state.gameOver} />

      <View style={styles.boardWrap}>
        <Board
          board={state.board}
          size={boardSize}
          flipped={isFlipped}
          selected={selected}
          targets={targets}
          lastMove={state.lastMove}
          hint={hint}
          kingsInDanger={state.kingsInDanger}
          onSquarePress={onSquarePress}
          disabled={state.gameOver || !humanTurn}
        />
      </View>

      <PlayerStrip state={state} color={bottomColor} active={state.turn === bottomColor && !state.gameOver} />

      <View style={styles.statusBox}>
        <Text style={[styles.status, status.danger && styles.statusDanger]}>{status.text}</Text>
        {status.detail ? <Text style={styles.statusDetail}>{status.detail}</Text> : null}
      </View>

      <MoveList state={state} />

      {state.canAccuse && state.config.cheating !== 'off' && (
        <View style={styles.accuseRow}>
          <Button title="Cheater!" small onPress={accuse} style={styles.accuseButton} />
          <Text style={styles.accuseHint}>Was that last move legal? Call it out before you move.</Text>
        </View>
      )}

      <View style={styles.controls}>
        <Button title="Hint" variant="secondary" small onPress={onHint} disabled={state.gameOver || state.thinking || !humanTurn} />
        <Button title="Undo" variant="secondary" small onPress={undo} disabled={state.moves.length === 0 || state.thinking} />
        <Button title="New armies" variant="secondary" small onPress={() => newGame()} />
        {state.gameOver ? (
          <Button title="Result" variant="secondary" small onPress={() => setShowResult(true)} />
        ) : (
          <Button title="Resign" variant="danger" small onPress={resign} />
        )}
      </View>

      <PromotionPicker
        visible={pendingPromotion !== null}
        color={state.turn}
        onPick={onPromote}
        onCancel={() => setPendingPromotion(null)}
      />

      <Modal transparent visible={state.gameOver && showResult} animationType="fade" onRequestClose={() => setShowResult(false)}>
        <View style={styles.overlay}>
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>{resultTitle(state)}</Text>
            <Text style={styles.resultText}>{status.text}</Text>
            {status.detail ? <Text style={styles.resultDetail}>{status.detail}</Text> : null}
            {state.config.mode === 'ai' && state.config.cheating !== 'off' && (
              <Text style={styles.resultCheats}>{cheatReport(state)}</Text>
            )}
            <View style={styles.resultButtons}>
              <Button title="Rematch (same armies)" onPress={() => { setShowResult(false); rematch(); }} />
              <Button title="New armies" variant="secondary" onPress={() => { setShowResult(false); newGame(); }} />
              <Button title="Review board" variant="ghost" onPress={() => setShowResult(false)} />
              <Button title="Home" variant="ghost" onPress={onExit} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function winnerOf(state: GameState): Color | null {
  if (state.resigned) return opposite(state.resigned);
  const r = state.result;
  if (r.kind === 'checkmate' || r.kind === 'both-in-check') return r.winner;
  return null;
}

function playerName(state: GameState, color: Color): string {
  if (state.config.mode === 'local') return COLOR_NAME[color];
  if (color === state.humanColor) return `You (${COLOR_NAME[color]})`;
  return `Computer · ${DIFFICULTY_LABEL[state.config.difficulty]} (${COLOR_NAME[color]})`;
}

function resultTitle(state: GameState): string {
  const winner = winnerOf(state);
  if (winner === null) return 'Draw';
  if (state.config.mode === 'ai') return winner === state.humanColor ? 'You win!' : 'You lose';
  return `${COLOR_NAME[winner]} wins!`;
}

function describeStatus(state: GameState): { text: string; detail?: string; danger: boolean } {
  const r = state.result;
  if (state.resigned) {
    return { text: `${COLOR_NAME[state.resigned]} resigned. ${COLOR_NAME[opposite(state.resigned)]} wins.`, danger: false };
  }
  switch (r.kind) {
    case 'both-in-check':
      return {
        text: `${COLOR_NAME[r.winner]} wins!`,
        detail: `Both of ${COLOR_NAME[opposite(r.winner)]}'s kings (${r.kings.map(squareName).join(' and ')}) are in check at once.`,
        danger: false,
      };
    case 'checkmate':
      return {
        text: `${COLOR_NAME[r.winner]} wins by checkmate.`,
        detail: `${COLOR_NAME[opposite(r.winner)]}'s king on ${squareName(r.king)} is in check and cannot be rescued.`,
        danger: false,
      };
    case 'stalemate':
      return { text: 'Draw by stalemate.', detail: `${COLOR_NAME[state.turn]} has no legal moves.`, danger: false };
    case 'fifty-move':
      return { text: 'Draw by the fifty-move rule.', danger: false };
    case 'repetition':
      return { text: 'Draw by threefold repetition.', danger: false };
    default: {
      const mover = state.turn;
      const other = opposite(mover);
      const moverChecked = state.kingsInDanger.filter((k) => state.board[k]?.color === mover);
      const otherChecked = state.kingsInDanger.filter((k) => state.board[k]?.color === other);
      let text = state.thinking ? 'Computer is thinking…' : `${COLOR_NAME[mover]} to move`;
      const details: string[] = [];
      const notice = cheatNotice(state);
      if (notice) {
        text = notice.text;
        if (notice.detail) details.push(notice.detail);
      }
      if (moverChecked.length) {
        details.push(`${COLOR_NAME[mover]}'s king on ${moverChecked.map(squareName).join(', ')} is in check. Get both kings checked and you lose!`);
      }
      if (otherChecked.length) {
        details.push(`${COLOR_NAME[other]} left a king in check on ${otherChecked.map(squareName).join(', ')}.`);
      }
      if (moverChecked.length && !state.thinking) text += ' — check!';
      return { text, detail: details.join(' '), danger: moverChecked.length > 0 };
    }
  }
}

function cheatNotice(state: GameState): { text: string; detail?: string } | null {
  if (state.config.mode !== 'ai') return null;
  const last = state.lastEvent;
  const isHuman = state.turn === state.humanColor;
  if (last?.type === 'accuse') {
    const name = state.caughtMove ? moveToSAN(state.caughtMove) : 'That move';
    return last.caught
      ? { text: 'Caught cheating!', detail: `${name} was illegal. It has been undone and you get two moves in a row.` }
      : { text: 'That move was legal.', detail: 'False accusation: the computer gets two moves in a row.' };
  }
  if (last?.type === 'pass') {
    return isHuman
      ? { text: 'Bonus move: your turn again!' }
      : { text: state.thinking ? 'Computer takes its extra move…' : 'Computer takes an extra move.' };
  }
  return null;
}

function cheatReport(state: GameState): string {
  const { made, caught, falseAccusations } = state.cheats;
  const parts: string[] = [];
  parts.push(made === 0 ? 'The computer never cheated.' : `The computer cheated ${made} time${made === 1 ? '' : 's'} and you caught ${caught}.`);
  if (falseAccusations) parts.push(`False accusations: ${falseAccusations}.`);
  return parts.join(' ');
}

function PlayerStrip({ state, color, active }: { state: GameState; color: Color; active: boolean }) {
  const captured = color === 'w' ? state.captured.byWhite : state.captured.byBlack;
  const lead = color === 'w' ? state.captured.whiteLead : -state.captured.whiteLead;
  const kings = state.kingsInDanger.filter((k) => state.board[k]?.color === color).length;
  return (
    <View style={[styles.strip, active && styles.stripActive]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.stripName}>
          {playerName(state, color)}
          {active && state.thinking && color !== state.humanColor ? '  ⏳' : ''}
        </Text>
        <Text style={styles.stripCaptured} numberOfLines={1}>
          {captured.map((t) => GLYPH[t]).join('') || '—'}
          {lead > 0 ? <Text style={styles.stripLead}>{`  +${lead}`}</Text> : null}
        </Text>
      </View>
      <View style={styles.kingBadges}>
        <Text style={[styles.kingBadge, kings >= 1 && styles.kingBadgeDanger]}>♚</Text>
        <Text style={[styles.kingBadge, kings >= 2 && styles.kingBadgeDanger]}>♚</Text>
      </View>
    </View>
  );
}

function MoveList({ state }: { state: GameState }) {
  const ref = useRef<ScrollView>(null);
  useEffect(() => {
    ref.current?.scrollToEnd({ animated: true });
  }, [state.moves.length]);
  if (state.moves.length === 0) return <View style={styles.moves} />;
  const items: string[] = [];
  for (let i = 0; i < state.moves.length; i += 2) {
    const n = i / 2 + 1;
    const w = moveToSAN(state.moves[i]);
    const b = state.moves[i + 1] ? moveToSAN(state.moves[i + 1]) : '';
    items.push(`${n}. ${w} ${b}`.trim());
  }
  return (
    <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} style={styles.moves} contentContainerStyle={styles.movesContent}>
      {items.map((t, i) => (
        <Text key={i} style={styles.moveItem}>
          {t}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  titleBlock: { alignItems: 'center' },
  title: { color: theme.text, fontWeight: '800', fontSize: 16 },
  subtitle: { color: theme.textMuted, fontSize: 11 },
  boardWrap: { alignItems: 'center', marginVertical: 6 },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  stripActive: { borderColor: theme.accent },
  stripName: { color: theme.text, fontWeight: '700', fontSize: 14 },
  stripCaptured: { color: theme.textMuted, fontSize: 14, marginTop: 1, fontFamily: CHESS_FONT },
  stripLead: { fontFamily: undefined, color: theme.textMuted },
  kingBadges: { flexDirection: 'row', gap: 2 },
  kingBadge: { color: theme.textMuted, fontSize: 20, opacity: 0.6, fontFamily: CHESS_FONT },
  kingBadgeDanger: { color: theme.danger, opacity: 1 },
  statusBox: { paddingHorizontal: 16, paddingTop: 8, minHeight: 44 },
  accuseRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 6 },
  accuseButton: { backgroundColor: theme.danger },
  accuseHint: { color: theme.textMuted, fontSize: 12, flex: 1 },
  resultCheats: { color: theme.accent, fontSize: 13, textAlign: 'center', marginTop: 10 },
  status: { color: theme.text, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  statusDanger: { color: theme.danger },
  statusDetail: { color: theme.textMuted, fontSize: 12, textAlign: 'center', marginTop: 2 },
  moves: { maxHeight: 28, marginTop: 4 },
  movesContent: { paddingHorizontal: 12, alignItems: 'center', gap: 12 },
  moveItem: { color: theme.textMuted, fontSize: 12, fontVariant: ['tabular-nums'] },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 'auto',
  },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  resultCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: theme.surface,
    borderRadius: 16,
    padding: 22,
    borderWidth: 1,
    borderColor: theme.border,
  },
  resultTitle: { color: theme.accent, fontSize: 28, fontWeight: '800', textAlign: 'center' },
  resultText: { color: theme.text, fontSize: 16, textAlign: 'center', marginTop: 8 },
  resultDetail: { color: theme.textMuted, fontSize: 13, textAlign: 'center', marginTop: 4 },
  resultButtons: { marginTop: 18, gap: 10 },
});

export type { GameConfig };
