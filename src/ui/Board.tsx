import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { fileOf, rankOf, sq } from '../engine/board';
import type { Board as BoardType, Move, Piece, Square } from '../engine/types';
import { PieceGlyph } from './PieceGlyph';
import { themedStyles, useTheme } from './theme';

interface Props {
  board: BoardType;
  size: number;
  flipped: boolean;
  selected: Square | null;
  targets: Move[];
  /** Style targets as cheat moves (purple) instead of legal moves. */
  cheatMode?: boolean;
  lastMove: Move | null;
  hint?: Move | null;
  kingsInDanger: Square[];
  /** Which of a side's two kings sits on a square (0 = first crown, 1 = second). */
  kingMarks?: Map<Square, number>;
  onSquarePress: (s: Square) => void;
  disabled?: boolean;
  /** Move to animate (piece glides from `from` to `to`); re-triggered when `animationKey` changes. */
  animate?: Move | null;
  animationKey?: number;
}

const ANIM_MS = 170;

export function Board({ board, size, flipped, selected, targets, cheatMode, lastMove, hint, kingsInDanger, kingMarks, onSquarePress, disabled, animate, animationKey }: Props) {
  const styles = useStyles();
  const theme = useTheme();
  const square = size / 8;

  // Glide the moved piece between squares. Passes and spawns (from < 0) are not animated.
  const progress = useRef(new Animated.Value(1)).current;
  const [anim, setAnim] = useState<{ move: Move; piece: Piece } | null>(null);
  const lastKey = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (animationKey === lastKey.current) return;
    const first = lastKey.current === undefined;
    lastKey.current = animationKey;
    if (first || !animate || animate.from < 0 || animate.pass) return;
    const piece = board[animate.to];
    if (!piece) return;
    setAnim({ move: animate, piece });
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: ANIM_MS, useNativeDriver: true }).start(({ finished }) => {
      if (finished) setAnim(null);
    });
  }, [animationKey, animate, board, progress]);

  const px = (s: Square) => {
    const col = flipped ? 7 - fileOf(s) : fileOf(s);
    const row = flipped ? rankOf(s) : 7 - rankOf(s);
    return { x: col * square, y: row * square };
  };
  const targetMap = useMemo(() => {
    const m = new Map<Square, boolean>();
    for (const t of targets) m.set(t.to, !!t.captured);
    return m;
  }, [targets]);
  const danger = useMemo(() => new Set(kingsInDanger), [kingsInDanger]);

  const rows: React.ReactNode[] = [];
  for (let row = 0; row < 8; row++) {
    const rank = flipped ? row : 7 - row;
    const cells: React.ReactNode[] = [];
    for (let col = 0; col < 8; col++) {
      const file = flipped ? 7 - col : col;
      const s = sq(file, rank);
      const piece = board[s];
      const isLight = (file + rank) % 2 === 1;
      const isSelected = selected === s;
      const isLast = !!lastMove && (lastMove.from === s || lastMove.to === s);
      const target = targetMap.get(s);
      const inDanger = danger.has(s);
      const isHint = !!hint && (hint.from === s || hint.to === s);
      const hidden = !!anim && anim.move.to === s;
      cells.push(
        <Pressable
          key={s}
          onPress={() => onSquarePress(s)}
          disabled={disabled}
          style={[
            styles.cell,
            { width: square, height: square, backgroundColor: isLight ? theme.board.light : theme.board.dark },
          ]}
          accessibilityLabel={`${'abcdefgh'[file]}${rank + 1}`}
        >
          {isLast && <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.board.lastMove }]} />}
          {inDanger && <View style={[StyleSheet.absoluteFill, styles.check]} />}
          {isSelected && <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.board.selected }]} />}
          {isHint && <View style={[StyleSheet.absoluteFill, styles.hint, { borderWidth: Math.max(2, square * 0.07) }]} />}
          {col === 0 && (
            <Text style={[styles.coord, styles.rankCoord, { color: isLight ? theme.board.dark : theme.board.light }]}>
              {rank + 1}
            </Text>
          )}
          {row === 7 && (
            <Text style={[styles.coord, styles.fileCoord, { color: isLight ? theme.board.dark : theme.board.light }]}>
              {'abcdefgh'[file]}
            </Text>
          )}
          {piece && !hidden && <PieceGlyph piece={piece} size={square} />}
          {piece?.type === 'k' && kingMarks?.has(s) && (
            <View
              style={[
                styles.crown,
                {
                  width: square * 0.22,
                  height: square * 0.22,
                  borderRadius: square * 0.11,
                  backgroundColor: kingMarks.get(s) === 0 ? theme.kingA : theme.kingB,
                },
              ]}
            />
          )}
          {target !== undefined &&
            (target ? (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  styles.captureRing,
                  cheatMode && styles.cheatRing,
                  { borderRadius: square / 2, borderWidth: square * 0.09 },
                ]}
              />
            ) : (
              <View
                style={[styles.dot, cheatMode && styles.cheatDot, { width: square * 0.3, height: square * 0.3, borderRadius: square * 0.15 }]}
              />
            ))}
        </Pressable>,
      );
    }
    rows.push(
      <View key={row} style={styles.row}>
        {cells}
      </View>,
    );
  }

  let overlay: React.ReactNode = null;
  if (anim) {
    const a = px(anim.move.from);
    const b = px(anim.move.to);
    overlay = (
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: square,
          height: square,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [
            { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [a.x, b.x] }) },
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [a.y, b.y] }) },
          ],
        }}
      >
        <PieceGlyph piece={anim.piece} size={square} />
      </Animated.View>
    );
  }

  return (
    <View style={[styles.board, { width: size, height: size, borderColor: theme.board.border }]}>
      {rows}
      {overlay}
    </View>
  );
}

const useStyles = themedStyles((theme) => ({
  board: {
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 2,
  },
  row: { flexDirection: 'row' },
  cell: { alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', backgroundColor: theme.board.target },
  captureRing: { borderColor: theme.board.capture },
  cheatRing: { borderColor: 'rgba(160, 60, 220, 0.75)' },
  cheatDot: { backgroundColor: 'rgba(160, 60, 220, 0.6)' },
  check: { backgroundColor: theme.board.check },
  hint: { borderColor: theme.board.hint },
  crown: { position: 'absolute', top: 2, right: 2, borderWidth: 1, borderColor: 'rgba(0,0,0,0.5)' },
  coord: { position: 'absolute', fontSize: 9, fontWeight: '700', opacity: 0.9 },
  rankCoord: { top: 1, left: 2 },
  fileCoord: { bottom: 0, right: 2 },
}));

export { fileOf, rankOf };
