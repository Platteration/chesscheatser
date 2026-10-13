import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ProductId } from './cosmetics';
import { loadJSON, saveJSON, STORAGE_KEYS } from './storage';
import { cleanEntitlements } from './validate';

/**
 * Entitlements: what the player has bought. The store integration sits behind a
 * small provider interface so real in-app purchases (App Store / Google Play via
 * react-native-iap or expo-iap) can replace the local mock without touching the
 * UI. The website's shop is one such provider already (src/account.tsx builds it
 * from src/shop.web.ts when the site's api/config says the shop is on); the
 * mock stays for the phone app and for a site with no backend.
 *
 * Everything sold is cosmetic, and everything sold can also be earned by playing
 * (see src/cosmetics.ts). Nothing here changes the rules, the armies, or how the
 * computer plays.
 */

export interface Product {
  id: ProductId;
  title: string;
  description: string;
  /** Localised display price from the store; the mock uses a placeholder. */
  price: string;
}

export interface EntitlementState {
  owned: ProductId[];
}

const KEY = STORAGE_KEYS.entitlements;

export interface StoreProvider {
  /** Local previews never show prices or imply a real transaction. */
  preview?: boolean;
  /**
   * Set by a store that is itself the record of what was bought: the website's
   * shop, where this is what the site's `api/me` last reported. What the device's
   * entitlements record holds (local previews) then unlocks nothing and is not
   * written, and a purchase grants nothing here: `purchase` hands the page to
   * Stripe's, and the site grants only on Stripe's signed webhook. Nothing in the
   * page unlocks what the server has not reported. Absent, the device keeps the
   * record (the local mock; a native store would cache its receipts the same way).
   */
  owned?: readonly ProductId[];
  getProducts(): Promise<Product[]>;
  purchase(id: ProductId): Promise<boolean>;
  restore(): Promise<ProductId[]>;
}

export const SUPPORTER_FEATURES = [
  'Every comeback aura, board and piece set, now',
  'A crown on your stats and shared results',
  'Nothing withheld from anyone else: the whole game is free',
];

/**
 * The price shown for each product. Not a currency amount while the store is
 * the local mock: the public web build ships the mock, and a button reading
 * "$3.99" that takes no payment would misrepresent it. A real store provider
 * returns its own localised prices from `getProducts`.
 */
const MOCK_PRICE = 'free in this build';

export const CATALOGUE: readonly Product[] = [
  {
    id: 'supporter',
    title: 'Supporter',
    description: SUPPORTER_FEATURES.join(' · '),
    price: MOCK_PRICE,
  },
  { id: 'pack.auras', title: 'Aura pack', description: 'Embers, Frost, Static and Gold leaf comeback auras.', price: MOCK_PRICE },
  { id: 'pack.boards', title: 'Board pack', description: 'The Slate and Neon boards.', price: MOCK_PRICE },
  { id: 'pack.pieces', title: 'Piece pack', description: 'The classic print piece set.', price: MOCK_PRICE },
];

/**
 * Local mock store: "purchases" are recorded on the device only, and nothing is
 * charged. Replace with a real store provider before release. `restore` reads
 * back what this device already owns, so the button behaves like the real thing
 * rather than silently doing nothing.
 */
export const mockStore: StoreProvider = {
  preview: true,
  async getProducts() {
    return [...CATALOGUE];
  },
  async purchase() {
    return true;
  },
  async restore() {
    return cleanEntitlements(await loadJSON<unknown>(KEY, { owned: [] })).owned;
  },
};

interface EntitlementsValue {
  preview: boolean;
  /** The store is the website's shop, which keeps the record of what was bought. */
  server: boolean;
  /** Products this device has bought. */
  owned: ProductId[];
  /** The one-time tip; also unlocks every cosmetic at once. */
  isSupporter: boolean;
  products: Product[];
  purchasing: boolean;
  buy(id: ProductId): Promise<boolean>;
  restore(): Promise<void>;
}

const Ctx = createContext<EntitlementsValue>({
  preview: true,
  server: false,
  owned: [],
  isSupporter: false,
  products: [],
  purchasing: false,
  buy: async () => false,
  restore: async () => {},
});

/**
 * `store` has no default on purpose: which provider ships is a release decision,
 * so it has to be named at the mount site rather than silently falling back to
 * the mock. The entitlement is cached in AsyncStorage, which is plain
 * localStorage on the web build — so a store that keeps the record itself (the
 * website's shop) says so with `owned`, and the stored record then unlocks
 * nothing and is left as it is. `null` is a store not chosen yet (the website
 * asking its site whether it has a shop): nothing is owned and nothing offered
 * until it is.
 */
export function EntitlementsProvider({ children, store }: { children: React.ReactNode; store: StoreProvider | null }) {
  const [state, setState] = useState<EntitlementState>({ owned: [] });
  const [products, setProducts] = useState<Product[]>([]);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    if (!store) return;
    let live = true;
    // Clamped on the way in: an `owned` that is not an array of known ids
    // reaches `.includes` as null, or spreads a string into the next grant.
    loadJSON<unknown>(KEY, { owned: [] }).then((e) => {
      if (live) setState(cleanEntitlements(e));
    });
    store
      .getProducts()
      .then((p) => {
        if (live) setProducts(p);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [store]);

  const serverOwned = store?.owned;
  const owned = useMemo(() => (serverOwned ? cleanEntitlements({ owned: serverOwned }).owned : state.owned), [serverOwned, state.owned]);

  const grant = useCallback((ids: ProductId[]) => {
    setState((prev) => {
      const owned = [...new Set([...prev.owned, ...ids])];
      const next = { owned };
      void saveJSON(KEY, next);
      return next;
    });
  }, []);

  const buy = useCallback(
    async (id: ProductId) => {
      if (!store) return false;
      setPurchasing(true);
      try {
        const ok = await store.purchase(id);
        if (ok && !store.owned) grant([id]);
        return ok;
      } catch {
        return false;
      } finally {
        setPurchasing(false);
      }
    },
    [store, grant],
  );

  const restore = useCallback(async () => {
    if (!store) return;
    try {
      const ids = await store.restore();
      if (!store.owned) grant(ids);
    } catch {
      // ignore
    }
  }, [store, grant]);

  const preview = store ? !!store.preview : true;
  const server = !!serverOwned;
  const value = useMemo<EntitlementsValue>(
    () => ({ preview, server, owned, isSupporter: owned.includes('supporter'), products, purchasing, buy, restore }),
    [preview, server, owned, products, purchasing, buy, restore],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEntitlements(): EntitlementsValue {
  return useContext(Ctx);
}
