import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { MAX_POWER, powerSpec, type PowerTag } from '../engine/powers';
import { blend } from '../game/comeback';
import type { PendingDraft } from '../game/useGame';
import { themedStyles, useTheme } from './theme';

interface Props {
  draft: PendingDraft | null;
  /** Whose choice this is, in words: "You" for a solo game, a colour in pass-and-play. */
  who: string;
  onPick: (tag: PowerTag) => void;
}

/**
 * The comeback draft. Deliberately not dismissible: falling behind earns a
 * power, and the turn does not start until one is taken.
 */
export function PowerDraftPicker({ draft, who, onPick }: Props) {
  const styles = useStyles();
  const theme = useTheme();
  if (!draft) return null;
  const behind = blend(draft.material, draft.engine) / 100;
  return (
    <Modal transparent visible animationType="fade">
      <View style={styles.backdrop} testID="power-draft">
        <View style={styles.sheet}>
          <Text style={styles.title}>{who} fell behind</Text>
          <Text style={styles.subtitle}>
            {behind.toFixed(1)} down · take a power ({draft.level} of {MAX_POWER})
          </Text>
          <View style={styles.options}>
            {draft.offered.map((tag) => {
              const spec = powerSpec(tag);
              return (
                <Pressable
                  key={tag}
                  testID="power-option"
                  onPress={() => onPick(tag)}
                  accessibilityRole="button"
                  accessibilityLabel={`Take ${spec.name}: ${spec.description}`}
                  style={({ pressed }) => [styles.option, pressed && { opacity: 0.65, borderColor: theme.power }]}
                >
                  <Text style={styles.optionName}>{spec.name}</Text>
                  <Text style={styles.optionText}>{spec.description}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = themedStyles((theme) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: theme.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: theme.power,
  },
  title: { color: theme.power, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: theme.textMuted, fontSize: 13, textAlign: 'center', marginTop: 4 },
  options: { marginTop: 16, gap: 10 },
  option: {
    backgroundColor: theme.surfaceAlt,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  optionName: { color: theme.text, fontSize: 16, fontWeight: '800' },
  optionText: { color: theme.textMuted, fontSize: 13, lineHeight: 19, marginTop: 3 },
}));
