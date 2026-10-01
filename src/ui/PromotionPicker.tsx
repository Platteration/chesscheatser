import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Color, PieceType } from '../engine/types';
import { PieceGlyph } from './PieceGlyph';
import { themedStyles, useTheme } from './theme';

interface Props {
  visible: boolean;
  color: Color;
  title?: string;
  choices?: PieceType[];
  /** When set, an extra option that picks `null` (e.g. "Just move" for an optional upgrade). */
  keepLabel?: string;
  onPick: (t: PieceType | null) => void;
  onCancel: () => void;
}

const DEFAULT_CHOICES: PieceType[] = ['q', 'r', 'b', 'n'];
const PIECE_LABEL: Record<PieceType, string> = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight', p: 'Pawn', k: 'King' };

export function PromotionPicker({ visible, color, title = 'Promote to', choices = DEFAULT_CHOICES, keepLabel, onPick, onCancel }: Props) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        {/*
          A sibling behind the sheet rather than its parent, which changes two
          things. A button that wraps other buttons is announced as one control,
          and a tap on the sheet's own surface — the title, the padding, the gap
          between two choices — no longer cancels the pick: only the backdrop
          outside the sheet dismisses it, which is what a sheet should do. The
          sheet stays on top as the later sibling on both platforms
          (react-native-web gives every View `position: relative`, so the
          absolutely positioned fill paints behind it).
        */}
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={onCancel} style={StyleSheet.absoluteFill} />
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.row}>
            {choices.map((t) => (
              <Pressable
                key={t}
                onPress={() => onPick(t)}
                accessibilityRole="button"
                accessibilityLabel={PIECE_LABEL[t]}
                style={({ pressed }) => [styles.choice, pressed && { opacity: 0.6 }]}
              >
                <PieceGlyph piece={{ type: t, color }} size={64} />
              </Pressable>
            ))}
          </View>
          {keepLabel && (
            <Pressable accessibilityRole="button" onPress={() => onPick(null)} style={({ pressed }) => [styles.keep, pressed && { opacity: 0.6 }]}>
              <Text style={[styles.keepText, { color: theme.text }]}>{keepLabel}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const useStyles = themedStyles((theme) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  sheet: { backgroundColor: theme.surface, borderRadius: theme.radius, padding: 20, borderWidth: 1, borderColor: theme.border },
  title: { color: theme.text, fontWeight: '700', fontSize: 16, marginBottom: 12, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 8 },
  choice: { backgroundColor: theme.board.light, borderRadius: 10, padding: 4 },
  keep: { marginTop: 12, paddingVertical: 10, alignItems: 'center', borderRadius: 10, backgroundColor: theme.surfaceAlt },
  keepText: { fontWeight: '700' },
}));
