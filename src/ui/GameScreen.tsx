import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { opposite, squareName } from '../engine/board';
import { moveToSAN } from '../engine/position';
import type { Color, Move, PieceType, Square } from '../engine/types';
import type { GameConfig, SavedGame } from '../game/config';
import { shareText, type DailyRecord } from '../game/daily';
import { useGame, type GameState, type StartOptions } from '../game/useGame';
import { Board } from './Board';
import { Button } from './components';
import { CHESS_FONT, GLYPH } from './PieceGlyph';
import { FREE_HINTS_PER_GAME, useEntitlements } from '../entitlements';
import { haptics } from '../haptics';
import { playSound } from '../sounds';
import { PromotionPicker } from './PromotionPicker';
import { themedStyles, useTheme } from './theme';

interface Props {
  start: StartOptions;
  onExit: () => void;
  onSave: (saved: SavedGame | null) => void;
  onFinished: (outcome: GameOutcome) => void;
  /** Current daily streak, shown when sharing a daily result. */
  dailyStreak?: number;
  onPro?: () => void;
}

export interface GameOutcome {
  outcome: 'win' | 'loss' | 'draw';
  moves: number;
  cheatsCaught: number;
  cheatsMissed: number;
  falseAccusations: number;
  daily: string | null;
  ranked: number | null;
}

const COLOR_NAME: Record<Color, string> = { w: 'White', b: 'Black' };
const DIFFICULTY_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as const;
const MATERIAL_LABEL = { chaos: 'Chaos', fair: 'Fair', mirror: 'Mirror', handicap: 'Ranked' } as const;

export function GameScreen({ start, onExit, onSave, onFinished, dailyStreak = 0, onPro }: Props) {
  const { isPro } = useEntitlements();
  const [hintsUsed, setHintsUsed] = useState(0);
  const styles = useStyles();
  const theme = useTheme();
  const { state, play, playCheat, accuse, undo, newGame, rematch, resign, getHint } = useGame(start, onSave);
  useEffect(() => setHintsUsed(0), [state.gameId]);
  const [cheatMode, setCheatMode] = useState(false);
  useEffect(() => setCheatMode(false), [state.moves.length, state.turn]);
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
    const key = `${state.gameId}:${state.setup.seed}:${state.moves.length}:${state.resigned ?? ''}:${state.flagged ?? ''}`;
    if (reported.current === key) return;
    reported.current = key;
    onFinished(outcomeOf(state));
  }, [state, onFinished]);

  const onShare = useCallback(() => {
    const o = outcomeOf(state);
    const rec: DailyRecord = { date: o.daily ?? state.setup.seed.toString(), ...o };
    Share.share({ message: shareText(rec, dailyStreak) }).catch(() => {});
  }, [state, dailyStreak]);

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
      if (winner === null) {
        haptics.move();
        playSound('check');
      } else if (state.config.mode === 'local' || winner === state.humanColor) {
        haptics.win();
        playSound('win');
      } else {
        haptics.loss();
        playSound('lose');
      }
      return;
    }
    const last = state.lastEvent;
    if (last?.type === 'accuse') {
      if (last.caught) {
        haptics.caught();
        playSound('busted');
      } else {
        haptics.wrong();
        playSound('wrong');
      }
    } else if (last?.type === 'pass') {
      playSound('bonus');
    } else if (last?.type === 'move') {
      const moverChecked = state.kingsInDanger.some((k) => state.board[k]?.color === state.turn);
      if (moverChecked) {
        haptics.check();
        playSound('check');
      } else if (last.move.captured) {
        haptics.capture();
        playSound('capture');
      } else {
        haptics.move();
        playSound('move');
      }
    }
  }, [state]);

  const [hinting, setHinting] = useState(false);
  /** Index into state.boards while reviewing; null = live position. */
  const [viewPly, setViewPly] = useState<number | null>(null);
  useEffect(() => setViewPly(null), [state.moves.length]);
  const reviewing = viewPly !== null && viewPly < state.boards.length - 1;
  const shownBoard = reviewing ? state.boards[viewPly] : state.board;
  const hintsLeft = isPro ? Infinity : Math.max(0, FREE_HINTS_PER_GAME - hintsUsed);
  const onHint = useCallback(() => {
    if (hintsLeft <= 0) {
      onPro?.();
      return;
    }
    setHinting(true);
    setHintsUsed((n) => n + 1);
    getHint()
      .then((m) => setHint(m))
      .finally(() => setHinting(false));
  }, [getHint, hintsLeft, onPro]);

  const targets = useMemo(() => {
    if (selected === null) return [];
    if (cheatMode) return state.cheatMoves.filter((m) => m.from === selected);
    return state.legal.filter((m) => m.from === selected);
  }, [state, selected, cheatMode]);

  const onSquarePress = useCallback(
    (s: Square) => {
      if (state.gameOver || state.thinking || !humanTurn) return;
      if (selected !== null) {
        if (cheatMode) {
          const cheat = state.cheatMoves.find((m) => m.from === selected && m.to === s);
          if (cheat) {
            setSelected(null);
            setCheatMode(false);
            playCheat(cheat);
            return;
          }
        } else {
          const candidates = state.legal.filter((m) => m.from === selected && m.to === s);
          if (candidates.length > 0) {
            setSelected(null);
            if (candidates[0].promotion) setPendingPromotion({ from: selected, to: s });
            else play(candidates[0]);
            return;
          }
        }
      }
      const p = state.board[s];
      setSelected(p && p.color === state.turn && s !== selected ? s : null);
    },
    [state, selected, humanTurn, play, playCheat, cheatMode],
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
  const status = describeStatus(state, cheatMode);

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.topBar}>
        <Button title="‹ Home" variant="ghost" small onPress={onExit} />
        <View style={styles.titleBlock}>
          <Text style={styles.title}>Two Kings</Text>
          <Text style={styles.subtitle}>
            {state.daily
              ? `Daily challenge · ${state.daily}`
              : state.ranked
                ? `Ranked · rank ${state.ranked} · seed ${state.setup.seed}`
                : `${MATERIAL_LABEL[state.config.material]} armies · seed ${state.setup.seed}`}
          </Text>
        </View>
        <Button title="Flip" variant="ghost" small onPress={() => setFlipped(!isFlipped)} />
      </View>

      <PlayerStrip state={state} color={topColor} active={state.turn === topColor && !state.gameOver} />

      <View style={styles.boardWrap}>
        <Board
          board={shownBoard}
          animate={reviewing ? null : state.lastMove}
          animationKey={state.moves.length}
          size={boardSize}
          flipped={isFlipped}
          selected={reviewing ? null : selected}
          targets={reviewing ? [] : targets}
          cheatMode={cheatMode}
          lastMove={reviewing ? null : state.lastMove}
          hint={reviewing ? null : hint}
          kingsInDanger={reviewing ? [] : state.kingsInDanger}
          kingMarks={reviewing ? undefined : state.kingMarks}
          onSquarePress={onSquarePress}
          disabled={reviewing || state.gameOver || !humanTurn}
        />
      </View>

      <PlayerStrip state={state} color={bottomColor} active={state.turn === bottomColor && !state.gameOver} />

      <View style={styles.statusBox}>
        <Text style={[styles.status, status.danger && styles.statusDanger]}>{status.text}</Text>
        {status.detail ? <Text style={styles.statusDetail}>{status.detail}</Text> : null}
      </View>

      <MoveList state={state} />
      {state.moves.length > 0 && (isPro || state.gameOver) && (
        <View style={styles.scrubber}>
          <Button title="⏮" variant="ghost" small onPress={() => setViewPly(0)} disabled={viewPly === 0} />
          <Button
            title="◀"
            variant="ghost"
            small
            onPress={() => setViewPly(Math.max(0, (viewPly ?? state.boards.length - 1) - 1))}
            disabled={viewPly === 0}
          />
          <Text style={styles.scrubberText}>
            {reviewing ? `Reviewing ${viewPly}/${state.boards.length - 1}` : `Move ${state.boards.length - 1}`}
          </Text>
          <Button
            title="▶"
            variant="ghost"
            small
            onPress={() => setViewPly(Math.min(state.boards.length - 1, (viewPly ?? state.boards.length - 1) + 1))}
            disabled={!reviewing}
          />
          <Button title="⏭" variant="ghost" small onPress={() => setViewPly(null)} disabled={!reviewing} />
        </View>
      )}

      {state.canAccuse && state.config.cheating !== 'off' && (
        <View style={styles.accuseRow}>
          <Button title="Cheater!" small onPress={accuse} style={styles.accuseButton} />
          <Text style={styles.accuseHint}>Was that last move legal? Call it out before you move.</Text>
        </View>
      )}

      <View style={styles.controls}>
        {state.config.playerCheats && state.config.mode === 'ai' && state.humanCheatsLeft > 0 && !state.gameOver && (
          <Button
            title={cheatMode ? 'Cancel' : 'Cheat'}
            variant={cheatMode ? 'secondary' : 'primary'}
            small
            onPress={() => {
              setSelected(null);
              setCheatMode((c) => !c);
            }}
            disabled={state.thinking || !humanTurn || reviewing}
          />
        )}
        <Button
          title={hinting ? '…' : isPro ? 'Hint' : `Hint (${hintsLeft})`}
          variant="secondary"
          small
          onPress={onHint}
          disabled={state.gameOver || state.thinking || hinting || !humanTurn}
        />
        <Button title="Undo" variant="secondary" small onPress={undo} disabled={state.moves.length === 0 || state.thinking || state.flagged !== null} />
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
            {state.ranked !== null && (
              <Text style={styles.resultRank}>
                {winnerOf(state) === state.humanColor
                  ? `Rank up! Now rank ${state.ranked + 1}.`
                  : winnerOf(state) === null
                    ? `Rank ${state.ranked} holds.`
                    : `Down to rank ${Math.max(1, state.ranked - 1)}.`}
              </Text>
            )}
            <Text style={styles.resultText}>{status.text}</Text>
            {status.detail ? <Text style={styles.resultDetail}>{status.detail}</Text> : null}
            {state.config.mode === 'ai' && (state.config.cheating !== 'off' || state.config.playerCheats) && (
              <Text style={styles.resultCheats}>{cheatReport(state)}</Text>
            )}
            <View style={styles.resultButtons}>
              {state.daily && <Button title="Share result" onPress={onShare} />}
              <Button title="Rematch (same armies)" variant={state.daily ? 'secondary' : 'primary'} onPress={() => { setShowResult(false); rematch(); }} />
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

function outcomeOf(state: GameState): GameOutcome {
  const winner = winnerOf(state);
  return {
    outcome: winner === null ? 'draw' : winner === state.humanColor ? 'win' : 'loss',
    moves: Math.ceil(state.moves.filter((m) => !m.pass).length / 2),
    cheatsCaught: state.cheats.caught,
    cheatsMissed: state.cheats.made - state.cheats.caught,
    falseAccusations: state.cheats.falseAccusations,
    daily: state.daily,
    ranked: state.ranked,
  };
}

function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function winnerOf(state: GameState): Color | null {
  if (state.flagged) return opposite(state.flagged);
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

function describeStatus(state: GameState, cheatMode = false): { text: string; detail?: string; danger: boolean } {
  const r = state.result;
  if (state.flagged) {
    return { text: `${COLOR_NAME[state.flagged]} ran out of time. ${COLOR_NAME[opposite(state.flagged)]} wins.`, danger: false };
  }
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
      const notice = cheatMode ? { text: 'Cheat mode', detail: 'Pick a piece and slide it somewhere it cannot go. The computer might notice…' } : cheatNotice(state);
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
      if (moverChecked.length && !state.thinking && !notice) text += ' — check!';
      return { text, detail: details.join(' '), danger: moverChecked.length > 0 };
    }
  }
}

function cheatNotice(state: GameState): { text: string; detail?: string } | null {
  if (state.config.mode !== 'ai') return null;
  const last = state.lastEvent;
  const isHuman = state.turn === state.humanColor;
  if (last?.type === 'accuse' && last.by === 'ai') {
    const name = state.caughtMove ? moveToSAN(state.caughtMove) : 'Your move';
    return { text: 'Busted!', detail: `The computer spotted that ${name} was illegal. It is undone, you skip, and the computer moves twice.` };
  }
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

const CHEAT_LABEL: Record<NonNullable<Move['cheat']>, string> = {
  jump: 'jumped over a piece',
  geometry: 'moved like a different piece',
  pawn: 'pawn trick',
  upgrade: 'arrived as a queen',
  resurrect: 'came back from the dead',
};

/** The computer's face: reacts to thinking, being caught, and the result. */
function avatarFor(state: GameState): string {
  if (state.gameOver) {
    const winner = winnerOf(state);
    if (winner === null) return '😐';
    return winner === state.humanColor ? '😩' : '😎';
  }
  if (state.thinking) return '🤔';
  const last = state.lastEvent;
  if (last?.type === 'accuse') return last.by === 'ai' ? '🧐' : last.caught ? '😳' : '😏';
  if (last?.type === 'pass' && state.turn !== state.humanColor) return '😈';
  const humanChecked = state.kingsInDanger.some((k) => state.board[k]?.color === state.humanColor);
  if (humanChecked && state.turn === state.humanColor) return '😼';
  return '🙂';
}

function cheatReport(state: GameState): string {
  const { made, caught, falseAccusations } = state.cheats;
  const parts: string[] = [];
  parts.push(made === 0 ? 'The computer never cheated.' : `The computer cheated ${made} time${made === 1 ? '' : 's'} and you caught ${caught}.`);
  // Every move-list entry flips the turn, so the mover of entry i is white for even i.
  const aiColor = opposite(state.humanColor);
  const missed = state.moves
    .filter((m, i) => m.cheat && (i % 2 === 0 ? 'w' : 'b') === aiColor)
    .map((m) => `${moveToSAN(m)} (${CHEAT_LABEL[m.cheat!]})`);
  if (missed.length) parts.push(`Got away with: ${missed.join(', ')}.`);
  if (falseAccusations) parts.push(`False accusation${falseAccusations === 1 ? '' : 's'}: ${falseAccusations}.`);
  const { humanMade, humanCaught } = state.cheats;
  if (humanMade) parts.push(humanCaught ? 'You cheated and got caught.' : 'You cheated and got away with it.');
  return parts.join(' ');
}

function PlayerStrip({ state, color, active }: { state: GameState; color: Color; active: boolean }) {
  const styles = useStyles();
  const theme = useTheme();
  const captured = color === 'w' ? state.captured.byWhite : state.captured.byBlack;
  const lead = color === 'w' ? state.captured.whiteLead : -state.captured.whiteLead;
  const kingSquares = [...state.kingMarks.entries()].filter(([sq]) => state.board[sq]?.color === color).sort((a, b) => a[1] - b[1]);
  const danger = new Set(state.kingsInDanger);
  const isComputer = state.config.mode === 'ai' && color !== state.humanColor;
  return (
    <View style={[styles.strip, active && styles.stripActive]}>
      {isComputer && <Text style={styles.avatar}>{avatarFor(state)}</Text>}
      <View style={{ flex: 1 }}>
        <Text style={styles.stripName}>{playerName(state, color)}</Text>
        <Text style={styles.stripCaptured} numberOfLines={1}>
          {captured.map((t) => GLYPH[t]).join('') || '—'}
          {lead > 0 ? <Text style={styles.stripLead}>{`  +${lead}`}</Text> : null}
        </Text>
      </View>
      {(state.config.clock ?? 0) > 0 && state.config.mode === 'local' && (
        <Text style={[styles.clock, { color: state.clocks[color] < 20_000 ? theme.danger : theme.text }]}>{formatClock(state.clocks[color])}</Text>
      )}
      <View style={styles.kingBadges}>
        {kingSquares.map(([sq, idx]) => (
          <Text
            key={idx}
            style={[styles.kingBadge, { color: idx === 0 ? theme.kingA : theme.kingB }, danger.has(sq) && styles.kingBadgeDanger]}
          >
            ♚
          </Text>
        ))}
      </View>
    </View>
  );
}

function MoveList({ state }: { state: GameState }) {
  const styles = useStyles();
  const theme = useTheme();
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

const useStyles = themedStyles((theme) => ({
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
  kingBadge: { fontSize: 20, opacity: 0.85, fontFamily: CHESS_FONT },
  kingBadgeDanger: { color: theme.danger, opacity: 1 },
  avatar: { fontSize: 26, marginRight: 10 },
  statusBox: { paddingHorizontal: 16, paddingTop: 8, minHeight: 44 },
  accuseRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 6 },
  accuseButton: { backgroundColor: theme.danger },
  accuseHint: { color: theme.textMuted, fontSize: 12, flex: 1 },
  resultCheats: { color: theme.accent, fontSize: 13, textAlign: 'center', marginTop: 10 },
  status: { color: theme.text, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  statusDanger: { color: theme.danger },
  statusDetail: { color: theme.textMuted, fontSize: 12, textAlign: 'center', marginTop: 2 },
  moves: { maxHeight: 28, marginTop: 4 },
  scrubber: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  scrubberText: { color: theme.textMuted, fontSize: 12, minWidth: 110, textAlign: 'center' },
  clock: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'], marginLeft: 10 },
  movesContent: { paddingHorizontal: 12, alignItems: 'center', gap: 12 },
  moveItem: { color: theme.textMuted, fontSize: 12, fontVariant: ['tabular-nums'] },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
  resultRank: { color: theme.text, fontSize: 15, fontWeight: '700', textAlign: 'center', marginTop: 6 },
  resultText: { color: theme.text, fontSize: 16, textAlign: 'center', marginTop: 8 },
  resultDetail: { color: theme.textMuted, fontSize: 13, textAlign: 'center', marginTop: 4 },
  resultButtons: { marginTop: 18, gap: 10 },
}));

export type { GameConfig };
