import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Color, PieceType } from '../engine/types';
import { PieceGlyph } from './PieceGlyph';
import { themedStyles, useTheme } from './theme';

interface Props {
  visible: boolean;
  color: Color;
  onPick: (t: PieceType) => void;
  onCancel: () => void;
}

const CHOICES: PieceType[] = ['q', 'r', 'b', 'n'];

export function PromotionPicker({ visible, color, onPick, onCancel }: Props) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Promote to</Text>
          <View style={styles.row}>
            {CHOICES.map((t) => (
              <Pressable key={t} onPress={() => onPick(t)} style={({ pressed }) => [styles.choice, pressed && { opacity: 0.6 }]}>
                <PieceGlyph piece={{ type: t, color }} size={64} />
              </Pressable>
            ))}
          </View>
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
}));
