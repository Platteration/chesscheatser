import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ProductId } from './cosmetics';
import { loadJSON, saveJSON } from './storage';

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

interface EntitlementState {
  owned: ProductId[];
}

const KEY = 'twokings.entitlements.v1';

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

export const CATALOGUE: readonly Product[] = [
  {
    id: 'supporter',
    title: 'Supporter',
    description: SUPPORTER_FEATURES.join(' · '),
    price: '$3.99',
  },
  { id: 'pack.auras', title: 'Aura pack', description: 'Embers, Frost, Static and Gold leaf comeback auras.', price: '$1.99' },
  { id: 'pack.boards', title: 'Board pack', description: 'The Slate and Neon boards.', price: '$0.99' },
  { id: 'pack.pieces', title: 'Piece pack', description: 'The classic print piece set.', price: '$0.99' },
];

/**
 * Local mock store: "purchases" are recorded on the device only. Replace for
 * release. `restore` reads back what this device already owns, so the button
 * behaves like the real thing rather than silently doing nothing.
 */
export const mockStore: StoreProvider = {
  async getProducts() {
    return [...CATALOGUE];
  },
  async purchase() {
    return true;
  },
  async restore() {
    const state = await loadJSON<EntitlementState>(KEY, { owned: [] });
    return state.owned;
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
    () => ({ owned: state.owned, isSupporter: state.owned.includes('supporter'), products, purchasing, buy, restore }),
    [state.owned, products, purchasing, buy, restore],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEntitlements(): EntitlementsValue {
  return useContext(Ctx);
}
