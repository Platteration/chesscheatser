import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COSMETICS, describeEarn, earnProgress, type ProductId, type Progress } from '../cosmetics';
import { SUPPORTER_FEATURES, useEntitlements } from '../entitlements';
import { Button, Card } from './components';
import { themedStyles, useTheme } from './theme';

interface Props {
  progress: Progress;
  onBack: () => void;
}

/**
 * The store. Everything here is cosmetic and everything here can also be earned
 * by playing, so each pack lists what you would have to do instead of paying.
 */
export function ProScreen({ progress, onBack }: Props) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { owned, isSupporter, products, purchasing, buy, restore } = useEntitlements();
  const [message, setMessage] = useState<string | null>(null);

  const supporter = products.find((p) => p.id === 'supporter');
  const packs = products.filter((p) => p.id !== 'supporter');

  const earnLines = (product: ProductId) =>
    COSMETICS.filter((c) => c.product === product && c.earn).map((c) => {
      const { have, need } = earnProgress(c.earn!, progress);
      return `${c.label} — ${describeEarn(c.earn!)} (${Math.min(have, need)}/${need})`;
    });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Button title="‹ Back" variant="ghost" small onPress={onBack} />
        <Text style={styles.title}>Support the game</Text>
        <View style={{ width: 64 }} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.kings}>♚♚</Text>
        <Text style={styles.pitch}>
          Every mode, every power and every puzzle is free, and no purchase changes how the computer plays. These are
          cosmetics, and each one can be earned by playing instead.
        </Text>

        <Card>
          <Text style={styles.cardTitle}>Supporter</Text>
          {SUPPORTER_FEATURES.map((f) => (
            <Text key={f} style={styles.feature}>
              ✓ {f}
            </Text>
          ))}
          {isSupporter ? (
            <Text style={[styles.status, { color: theme.success }]}>You have it. Thank you.</Text>
          ) : (
            <Button
              title={purchasing ? 'Purchasing…' : `Unlock everything · ${supporter?.price ?? '…'}`}
              onPress={async () => {
                const ok = await buy('supporter');
                setMessage(ok ? 'Thank you.' : 'Purchase did not complete.');
              }}
              disabled={purchasing || !supporter}
              style={styles.buy}
            />
          )}
        </Card>

        {!isSupporter &&
          packs.map((p) => {
            const have = owned.includes(p.id);
            return (
              <Card key={p.id}>
                <Text style={styles.cardTitle}>{p.title}</Text>
                <Text style={styles.feature}>{p.description}</Text>
                {earnLines(p.id).map((line) => (
                  <Text key={line} style={styles.earn}>
                    or {line}
                  </Text>
                ))}
                {have ? (
                  <Text style={[styles.status, { color: theme.success }]}>Owned</Text>
                ) : (
                  <Button
                    title={purchasing ? 'Purchasing…' : `Buy · ${p.price}`}
                    variant="secondary"
                    onPress={async () => {
                      const ok = await buy(p.id);
                      setMessage(ok ? `${p.title} unlocked.` : 'Purchase did not complete.');
                    }}
                    disabled={purchasing}
                    style={styles.buy}
                  />
                )}
              </Card>
            );
          })}

        <Button
          title="Restore purchases"
          variant="ghost"
          onPress={async () => {
            await restore();
            setMessage('Restore finished.');
          }}
        />
        {message && <Text style={styles.status}>{message}</Text>}
        <Text style={styles.note}>One-time purchases, no subscription. No ads, ever.</Text>
      </ScrollView>
    </View>
  );
}

const useStyles = themedStyles((theme) => ({
  root: { flex: 1, backgroundColor: theme.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  title: { color: theme.text, fontWeight: '800', fontSize: 16 },
  content: { padding: 16, gap: 14 },
  kings: { fontSize: 52, color: theme.accent, lineHeight: 62, textAlign: 'center', fontFamily: 'ChessGlyphs' },
  pitch: { color: theme.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  cardTitle: { color: theme.text, fontSize: 17, fontWeight: '800', marginBottom: 6 },
  feature: { color: theme.text, fontSize: 14, lineHeight: 22 },
  earn: { color: theme.textMuted, fontSize: 12, lineHeight: 19 },
  status: { color: theme.text, textAlign: 'center', fontWeight: '700', marginTop: 10 },
  buy: { marginTop: 12 },
  note: { color: theme.textMuted, fontSize: 12, textAlign: 'center', lineHeight: 18 },
}));
