import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ProductId } from './cosmetics';
import type { Product, StoreProvider } from './entitlements';
import { loadShop, SHOP_POSSIBLE } from './shop';
import { SHOP_WORDS, type Account, type Me, type ShopClient } from './shopTypes';

/**
 * The website's account: whether the site offers sign-in and a shop, who is signed in, and the
 * store the shop is. Platform-neutral and free of network code: what talks to the site is
 * src/shop.web.ts, bundled for the web build only, and everywhere else src/shop.ts answers that
 * nothing is configured, so on a phone this is `off` from the first frame and draws nothing.
 *
 * On the web it asks once, at launch. A site with no backend (GitHub Pages, any static host)
 * answers that nothing is on, and the app is what it was: the local preview store, no Account
 * card, no Buy. A site whose backend has sign-in on gets the Account card; one whose shop is on
 * as well gets the store below, whose record is the server's (`api/me`), never the device's.
 */

type State =
  | { status: 'loading' }
  | { status: 'off' }
  | { status: 'on'; client: ShopClient; user: Account | null; owned: ProductId[] };

export interface AccountValue {
  /** `loading` while the web build asks its site; `off` with no sign-in to offer, and on every phone. */
  status: State['status'];
  /** Sign in with Google is offered. */
  signInOffered: boolean;
  /** The signed-in visitor, or null. */
  user: Account | null;
  /** The website's shop, when the site sells something; null otherwise (the local store stays). */
  store: StoreProvider | null;
  /** What came of a sign-in or a purchase, said once at the top of the menu. */
  notice: string | null;
  signIn(): void;
  signOut(): Promise<boolean>;
  deleteAccount(): Promise<boolean>;
}

const OFF: AccountValue = {
  status: 'off',
  signInOffered: false,
  user: null,
  store: null,
  notice: null,
  signIn: () => {},
  signOut: async () => false,
  deleteAccount: async () => false,
};

const Ctx = createContext<AccountValue>(OFF);

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>(SHOP_POSSIBLE ? { status: 'loading' } : { status: 'off' });
  const [notice, setNotice] = useState<string | null>(null);

  /** What `api/me` said, taken as the record; an answer that could not be read changes nothing. */
  const apply = useCallback((me: Me | null) => {
    if (!me) return;
    setState((s) => (s.status === 'on' ? { ...s, user: me.user, owned: me.owned } : s));
  }, []);

  useEffect(() => {
    if (!SHOP_POSSIBLE) return;
    let live = true;
    (async () => {
      const client = await loadShop().catch(() => null);
      if (!live) return;
      if (!client) {
        setState({ status: 'off' });
        return;
      }
      const me = await client.me();
      if (!live) return;
      setState({ status: 'on', client, user: me?.user ?? null, owned: me?.owned ?? [] });
      if (client.notice === 'signin-failed') setNotice(SHOP_WORDS.signInFailed);
      if (client.notice === 'purchase-success') {
        // The webhook that grants the purchase may land after the visitor does.
        const { me: latest, unlocked } = await client.awaitPurchase();
        if (!live) return;
        apply(latest);
        setNotice(unlocked ? SHOP_WORDS.thanks(unlocked.name) : SHOP_WORDS.paymentReceived);
      }
    })();
    return () => {
      live = false;
    };
  }, [apply]);

  const store = useMemo<StoreProvider | null>(() => {
    if (state.status !== 'on' || state.client.products.length === 0) return null;
    const { client, owned } = state;
    const products: Product[] = client.products.map((p) => ({ id: p.id, title: p.name, description: p.description, price: p.price ?? '' }));
    return {
      owned,
      getProducts: async () => products,
      async purchase(id) {
        const outcome = await client.checkout(id);
        // Signed out elsewhere, or already bought in another tab: show what the server holds.
        if (outcome === 'signed-out' || outcome === 'owned') apply(await client.me());
        return outcome === 'leaving';
      },
      async restore() {
        const me = await client.me();
        apply(me);
        return me?.owned ?? owned;
      },
    };
  }, [state, apply]);

  const signedOut = useCallback(() => setState((s) => (s.status === 'on' ? { ...s, user: null, owned: [] } : s)), []);

  const value = useMemo<AccountValue>(() => {
    if (state.status !== 'on') return { ...OFF, status: state.status };
    const { client, user } = state;
    return {
      status: 'on',
      signInOffered: client.signIn,
      user,
      store,
      notice,
      signIn: () => client.startSignIn(),
      async signOut() {
        const ok = await client.signOut();
        if (ok) signedOut();
        return ok;
      },
      async deleteAccount() {
        const ok = await client.deleteAccount();
        if (ok) signedOut();
        return ok;
      },
    };
  }, [state, store, notice, signedOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccount(): AccountValue {
  return useContext(Ctx);
}
