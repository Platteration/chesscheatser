import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fileOf, rankOf, sq } from '../engine/board';
import type { Board as BoardType, LegalMove, Move, Square } from '../engine/types';
import { PieceGlyph } from './PieceGlyph';
import { theme } from './theme';

interface Props {
  board: BoardType;
  size: number;
  flipped: boolean;
  selected: Square | null;
  targets: LegalMove[];
  lastMove: Move | null;
  kingsInDanger: Square[];
  onSquarePress: (s: Square) => void;
  disabled?: boolean;
}

export function Board({ board, size, flipped, selected, targets, lastMove, kingsInDanger, onSquarePress, disabled }: Props) {
  const square = size / 8;
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
          {piece && <PieceGlyph piece={piece} size={square} />}
          {target !== undefined &&
            (target ? (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  styles.captureRing,
                  { borderRadius: square / 2, borderWidth: square * 0.09 },
                ]}
              />
            ) : (
              <View style={[styles.dot, { width: square * 0.3, height: square * 0.3, borderRadius: square * 0.15 }]} />
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

  return (
    <View style={[styles.board, { width: size, height: size }]}>
      {rows}
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#3b2a1a',
  },
  row: { flexDirection: 'row' },
  cell: { alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', backgroundColor: theme.board.target },
  captureRing: { borderColor: theme.board.capture },
  check: { backgroundColor: theme.board.check },
  coord: { position: 'absolute', fontSize: 9, fontWeight: '700', opacity: 0.9 },
  rankCoord: { top: 1, left: 2 },
  fileCoord: { bottom: 0, right: 2 },
});

export { fileOf, rankOf };
