import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useAccount } from '../account';
import { confirmAction } from '../confirm';
import { SHOP_WORDS } from '../shopTypes';
import { Button, Card } from './components';
import { themedStyles } from './theme';

/** Asked before Delete account: there is no undo, and the purchases go with the account. */
export const DELETE_ACCOUNT_PROMPT = {
  title: 'Delete your account?',
  message:
    'Your sign-in and the purchases recorded with it are removed from this site, and cannot be brought back. Payments already made stay with Stripe.',
  cancelLabel: 'Cancel',
  confirmLabel: 'Delete account',
} as const;

/**
 * The website's account, beside the settings: drawn only when the site's api/config offers
 * sign-in (src/account.tsx), so on a phone and on a site with no backend it is not there at all.
 */
export function AccountCard() {
  const styles = useStyles();
  const account = useAccount();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!account.signInOffered) return null;

  const run = async (task: () => Promise<boolean>, failed: string) => {
    setBusy(true);
    setMessage(null);
    const ok = await task();
    setBusy(false);
    if (!ok) setMessage(failed);
  };
  const onDelete = () =>
    confirmAction({ ...DELETE_ACCOUNT_PROMPT, onConfirm: () => void run(account.deleteAccount, 'The account was not deleted. Try again in a moment.') });

  return (
    <Card>
      <Text style={styles.cardTitle}>Account</Text>
      {account.user ? (
        <>
          <Text style={styles.text}>{account.user.email ? SHOP_WORDS.signedInAs(account.user.email) : SHOP_WORDS.signedIn}</Text>
          <View style={styles.row}>
            <Button title={SHOP_WORDS.signOut} variant="secondary" small disabled={busy} onPress={() => void run(account.signOut, 'Sign-out did not complete. Try again in a moment.')} />
            <Button title={SHOP_WORDS.deleteAccount} variant="danger" small disabled={busy} onPress={onDelete} />
          </View>
        </>
      ) : (
        <>
          {!!account.store && <Text style={styles.text}>What you buy on this site is kept with your Google account, so it follows you to another browser.</Text>}
          <Button title={SHOP_WORDS.signIn} small onPress={account.signIn} style={styles.signIn} />
        </>
      )}
      {!!message && <Text style={styles.text}>{message}</Text>}
    </Card>
  );
}

const useStyles = themedStyles((theme) => ({
  cardTitle: { color: theme.text, fontSize: 16, fontWeight: '800' },
  text: { color: theme.textMuted, fontSize: 13, lineHeight: 18, marginTop: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  signIn: { marginTop: 10, alignSelf: 'flex-start' },
}));
