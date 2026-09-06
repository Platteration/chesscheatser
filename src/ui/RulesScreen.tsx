import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from './components';
import { theme } from './theme';

interface Props {
  onBack: () => void;
}

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: 'The twist',
    body: [
      'Each side starts with two kings instead of one. All the usual pieces move exactly as they do in chess: pawns push and capture diagonally (en passant included), and pawns promote on the last rank. There is no castling.',
      'Kings can never be captured. Instead, the game is decided by check.',
    ],
  },
  {
    title: 'How you lose',
    body: [
      '1. Both of your kings are in check at the same time when your turn begins. Your opponent wins instantly.',
      '2. One of your kings is checkmated: it is in check and no legal move can get that king out of check, no matter what your other king does.',
    ],
  },
  {
    title: 'Living with one king in check',
    body: [
      'Because you only lose when both kings are in check, you are allowed to leave a single king in check, and you may even move a king into check, as long as your other king is safe.',
      'A move is illegal only if it would leave both of your kings in check at once.',
      'Watch out: a king left in check is one move away from disaster. If your opponent then attacks the second king too, you lose. And a king that stays in check with no way out is checkmated at the start of your next turn.',
    ],
  },
  {
    title: 'Random armies',
    body: [
      'Every game generates a fresh army for each side: a random number of pieces, of random types, placed randomly on the two home ranks. Kings always start on the back rank and pawns never do.',
      'Fair: different armies with roughly equal total value. Mirror: both sides get the same set of pieces. Chaos: anything goes, one side may be much stronger.',
      'The seed shown above the board identifies a setup, so a rematch replays the same armies with the colours swapped.',
    ],
  },
  {
    title: 'Draws',
    body: [
      'Stalemate (no legal moves and no king in check), fifty moves without a capture or pawn move, or the same position appearing three times.',
    ],
  },
];

export function RulesScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Button title="‹ Back" variant="ghost" small onPress={onBack} />
        <Text style={styles.title}>How to play</Text>
        <View style={{ width: 64 }} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {SECTIONS.map((s) => (
          <View key={s.title} style={styles.section}>
            <Text style={styles.heading}>{s.title}</Text>
            {s.body.map((p, i) => (
              <Text key={i} style={styles.para}>
                {p}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  title: { color: theme.text, fontWeight: '800', fontSize: 16 },
  content: { padding: 16, gap: 18 },
  section: { gap: 8 },
  heading: { color: theme.accent, fontSize: 18, fontWeight: '800' },
  para: { color: theme.text, fontSize: 15, lineHeight: 22 },
});
