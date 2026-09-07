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
  'Unlimited hints and undo (free: 3 hints per game)',
  'Every board theme and piece style',
  'Game review after every game',
  'Support an indie chess variant',
];

/** Local mock store: "purchases" are recorded on the device only. Replace for release. */
export const mockStore: StoreProvider = {
  async getProducts() {
    return [{ id: 'pro', title: 'Two Kings Pro', description: PRO_FEATURES.join(' · '), price: '$3.99' }];
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

export function EntitlementsProvider({ children, store = mockStore }: { children: React.ReactNode; store?: StoreProvider }) {
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
