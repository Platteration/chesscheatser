import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loadJSON, saveJSON } from './storage';

/**
 * Entitlements: what the player has unlocked. The store integration is behind
 * a small provider interface so real in-app purchases (App Store / Google Play
 * via react-native-iap or expo-iap) can replace the local mock without touching
 * the UI. Nothing here affects playing strength: Pro is convenience and cosmetics.
 */

export type ProductId = 'pro';

export interface Product {
  id: ProductId;
  title: string;
  description: string;
  /** Localised display price from the store; the mock uses a placeholder. */
  price: string;
}

export interface StoreProvider {
  getProducts(): Promise<Product[]>;
  purchase(id: ProductId): Promise<boolean>;
  restore(): Promise<ProductId[]>;
}

export const PRO_FEATURES = [
  'Unlimited hints (free: 3 per game)',
  'Every board theme and piece style',
  'Step through the game while it is still going',
  'Support an indie chess variant',
];

/**
 * Local mock store: "purchases" are recorded on the device only, and nothing is
 * charged. Replace with a real store provider before release. The price is
 * deliberately not a currency amount: the public web build ships this mock, and
 * a button reading "$3.99" that takes no payment would misrepresent it.
 */
export const mockStore: StoreProvider = {
  async getProducts() {
    return [{ id: 'pro', title: 'Two Kings Pro', description: PRO_FEATURES.join(' · '), price: 'free in this build' }];
  },
  async purchase() {
    return true;
  },
  async restore() {
    return [];
  },
};

interface EntitlementState {
  owned: ProductId[];
}

const KEY = 'twokings.entitlements.v1';
export const FREE_HINTS_PER_GAME = 3;

interface EntitlementsValue {
  isPro: boolean;
  products: Product[];
  purchasing: boolean;
  buy(id: ProductId): Promise<boolean>;
  restore(): Promise<void>;
}

const Ctx = createContext<EntitlementsValue>({
  isPro: false,
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
    loadJSON<EntitlementState>(KEY, { owned: [] }).then(setState);
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
    () => ({ isPro: state.owned.includes('pro'), products, purchasing, buy, restore }),
    [state.owned, products, purchasing, buy, restore],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEntitlements(): EntitlementsValue {
  return useContext(Ctx);
}
