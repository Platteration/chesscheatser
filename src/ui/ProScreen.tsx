import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COSMETICS, describeEarn, earnProgress, type ProductId, type Progress } from '../cosmetics';
import { useAccount } from '../account';
import { SUPPORTER_FEATURES, useEntitlements } from '../entitlements';
import { SHOP_WORDS } from '../shopTypes';
import { Button, Card } from './components';
import { themedStyles, useTheme } from './theme';

interface Props {
  progress: Progress;
  onBack: () => void;
}

/**
 * The store. Everything here is cosmetic and everything here can also be earned
 * by playing, so each pack lists what you would have to do instead of paying.
 * On a website whose shop is on (`server`), buying needs the visitor signed in,
 * and Buy leaves for Stripe's Checkout page: nothing is unlocked here until the
 * site reports it, after Stripe's signed webhook.
 */
export function ProScreen({ progress, onBack }: Props) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { preview, server, owned, isSupporter, products, purchasing, buy, restore } = useEntitlements();
  const account = useAccount();
  const [message, setMessage] = useState<string | null>(null);
  const signedOut = server && !account.user;

  // The website's shop: the price on a line of its own, and Buy, which signed out is the way to
  // sign in and signed in leaves for Stripe's Checkout page.
  const serverTitle = purchasing ? 'Purchasing…' : signedOut ? SHOP_WORDS.signInToBuy : SHOP_WORDS.buy;
  const serverBuy = async (id: ProductId) => {
    if (signedOut) {
      account.signIn();
      return;
    }
    setMessage(null);
    if (!(await buy(id))) setMessage('Purchase did not complete.');
  };

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
        <Text style={styles.title}>{preview ? 'Cosmetic preview' : 'Support the game'}</Text>
        <View style={{ width: 64 }} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.kings}>♚♚</Text>
        <Text style={styles.pitch}>
          Every mode, every power and every puzzle is free, and no purchase changes how the computer plays. These are
          cosmetics, and each one can be earned by playing instead.
        </Text>
        {preview && <Text style={styles.pitch}>Purchases are not enabled in this build. No payment is taken. Previews are saved only on this device.</Text>}

        <Card>
          <Text style={styles.cardTitle}>Supporter</Text>
          {SUPPORTER_FEATURES.map((f) => (
            <Text key={f} style={styles.feature}>
              ✓ {f}
            </Text>
          ))}
          {server && !!supporter?.price && <Text style={styles.price}>{supporter.price}</Text>}
          {isSupporter ? (
            <Text style={[styles.status, { color: theme.success }]}>{preview ? 'Preview enabled on this device.' : server ? SHOP_WORDS.owned : 'You have it. Thank you.'}</Text>
          ) : (
            <Button
              title={
                server
                  ? serverTitle
                  : purchasing
                    ? preview
                      ? 'Enabling preview…'
                      : 'Purchasing…'
                    : preview
                      ? 'Preview everything'
                      : `Unlock everything · ${supporter?.price ?? '…'}`
              }
              onPress={async () => {
                if (server) return serverBuy('supporter');
                const ok = await buy('supporter');
                setMessage(ok ? (preview ? 'Local preview unlocked.' : 'Thank you.') : preview ? 'Preview did not complete.' : 'Purchase did not complete.');
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
                {server && !!p.price && !have && <Text style={styles.price}>{p.price}</Text>}
                {have ? (
                  <Text style={[styles.status, { color: theme.success }]}>{preview ? 'Preview enabled' : SHOP_WORDS.owned}</Text>
                ) : (
                  <Button
                    title={server ? serverTitle : purchasing ? (preview ? 'Enabling preview…' : 'Purchasing…') : preview ? `Preview ${p.title}` : `Buy · ${p.price}`}
                    variant="secondary"
                    onPress={async () => {
                      if (server) return serverBuy(p.id);
                      const ok = await buy(p.id);
                      setMessage(ok ? `${p.title} ${preview ? 'preview enabled.' : 'unlocked.'}` : preview ? 'Preview did not complete.' : 'Purchase did not complete.');
                    }}
                    disabled={purchasing}
                    style={styles.buy}
                  />
                )}
              </Card>
            );
          })}

        <Button
          title={preview ? 'Restore local previews' : 'Restore purchases'}
          variant="ghost"
          onPress={async () => {
            await restore();
            setMessage(preview ? 'Local previews restored.' : 'Restore finished.');
          }}
        />
        {message && <Text style={styles.status}>{message}</Text>}
        <Text style={styles.note}>{preview ? 'Local cosmetic previews are free. No ads, ever.' : 'One-time purchases, no subscription. No ads, ever.'}</Text>
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
  price: { color: theme.text, fontSize: 15, fontWeight: '700', marginTop: 8 },
  status: { color: theme.text, textAlign: 'center', fontWeight: '700', marginTop: 10 },
  buy: { marginTop: 12 },
  note: { color: theme.textMuted, fontSize: 12, textAlign: 'center', lineHeight: 18 },
}));
