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

export function PromotionPicker({ visible, color, title = 'Promote to', choices = DEFAULT_CHOICES, keepLabel, onPick, onCancel }: Props) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.row}>
            {choices.map((t) => (
              <Pressable key={t} onPress={() => onPick(t)} style={({ pressed }) => [styles.choice, pressed && { opacity: 0.6 }]}>
                <PieceGlyph piece={{ type: t, color }} size={64} />
              </Pressable>
            ))}
          </View>
          {keepLabel && (
            <Pressable onPress={() => onPick(null)} style={({ pressed }) => [styles.keep, pressed && { opacity: 0.6 }]}>
              <Text style={[styles.keepText, { color: theme.text }]}>{keepLabel}</Text>
            </Pressable>
          )}
        </View>
      </Pressable>
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
