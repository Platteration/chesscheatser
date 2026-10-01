import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ProductId } from './cosmetics';
import { loadJSON, saveJSON, STORAGE_KEYS } from './storage';
import { cleanEntitlements } from './validate';

/**
 * Entitlements: what the player has bought. The store integration sits behind a
 * small provider interface so real in-app purchases (App Store / Google Play via
 * react-native-iap or expo-iap) can replace the local mock without touching the
 * UI.
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
 * localStorage on the web build — when a real store lands, derive `isPro` from
 * the store on every launch and treat the stored record as an offline cache
 * only, never as the source of truth.
 */
export function EntitlementsProvider({ children, store }: { children: React.ReactNode; store: StoreProvider }) {
  const [state, setState] = useState<EntitlementState>({ owned: [] });
  const [products, setProducts] = useState<Product[]>([]);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    // Clamped on the way in: an `owned` that is not an array of known ids
    // reaches `.includes` as null, or spreads a string into the next grant.
    loadJSON<unknown>(KEY, { owned: [] }).then((e) => setState(cleanEntitlements(e)));
    store.getProducts().then(setProducts).catch(() => {});
  }, [store]);

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
      setPurchasing(true);
      try {
        const ok = await store.purchase(id);
        if (ok) grant([id]);
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
    try {
      grant(await store.restore());
    } catch {
      // ignore
    }
  }, [store, grant]);

  const value = useMemo<EntitlementsValue>(
    () => ({ owned: state.owned, isSupporter: state.owned.includes('supporter'), products, purchasing, buy, restore }),
    [state.owned, products, purchasing, buy, restore],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEntitlements(): EntitlementsValue {
  return useContext(Ctx);
}
