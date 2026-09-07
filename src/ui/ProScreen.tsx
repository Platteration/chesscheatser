import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PRO_FEATURES, useEntitlements } from '../entitlements';
import { Button, Card } from './components';
import { themedStyles, useTheme } from './theme';

interface Props {
  onBack: () => void;
}

export function ProScreen({ onBack }: Props) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { isPro, products, purchasing, buy, restore } = useEntitlements();
  const [message, setMessage] = useState<string | null>(null);
  const pro = products.find((p) => p.id === 'pro');

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Button title="‹ Back" variant="ghost" small onPress={onBack} />
        <Text style={styles.title}>Two Kings Pro</Text>
        <View style={{ width: 64 }} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.kings}>♚♚</Text>
        <Card>
          {PRO_FEATURES.map((f) => (
            <Text key={f} style={styles.feature}>
              ✓ {f}
            </Text>
          ))}
        </Card>
        {isPro ? (
          <Text style={[styles.status, { color: theme.success }]}>You have Pro. Thank you!</Text>
        ) : (
          <>
            <Button
              title={purchasing ? 'Purchasing…' : `Unlock Pro · ${pro?.price ?? '…'}`}
              onPress={async () => {
                const ok = await buy('pro');
                setMessage(ok ? 'Pro unlocked!' : 'Purchase did not complete.');
              }}
              disabled={purchasing || !pro}
            />
            <Button
              title="Restore purchase"
              variant="ghost"
              onPress={async () => {
                await restore();
                setMessage('Restore finished.');
              }}
            />
          </>
        )}
        {message && <Text style={styles.status}>{message}</Text>}
        <Text style={styles.note}>
          One-time purchase, no subscription. Pro never changes how the computer plays: it is convenience, cosmetics and a thank-you.
        </Text>
      </ScrollView>
    </View>
  );
}

const useStyles = themedStyles((theme) => ({
  root: { flex: 1, backgroundColor: theme.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  title: { color: theme.text, fontWeight: '800', fontSize: 16 },
  content: { padding: 16, gap: 14 },
  kings: { fontSize: 56, color: theme.accent, lineHeight: 66, textAlign: 'center', fontFamily: 'ChessGlyphs' },
  feature: { color: theme.text, fontSize: 15, lineHeight: 24 },
  status: { color: theme.text, textAlign: 'center', fontWeight: '700' },
  note: { color: theme.textMuted, fontSize: 12, textAlign: 'center', lineHeight: 18 },
}));
