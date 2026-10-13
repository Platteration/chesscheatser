import type { ProductId } from './cosmetics';

/**
 * The website's account and shop, as the app sees them. The client is src/shop.web.ts, which
 * talks to the site's own api/ (server/kit) and is bundled for the web build alone; its twin,
 * src/shop.ts, is what every other platform gets, and answers that nothing is configured. Both
 * implement `LoadShop`, so the two cannot drift apart without `tsc` saying so. This module holds
 * types and words only: no network code, no address.
 */

/**
 * A product the site sells, under the app's own id. Every one is a one-time purchase
 * (server/catalogue.js sells no subscription, so there is no Manage subscription either).
 */
export interface ShopProduct {
  id: ProductId;
  name: string;
  description: string;
  /** The price, formatted for the visitor; null when the site could not look it up. */
  price: string | null;
}

/** The signed-in visitor. The email is shown only, and only when Google said it is verified. */
export interface Account {
  email: string | null;
}

/** What `api/me` reports: who is signed in, and what the server holds for them. */
export interface Me {
  user: Account | null;
  owned: ProductId[];
}

/** What the page's address said on the way back from Google or Stripe, read once. */
export type ShopNotice = 'signin-failed' | 'purchase-success' | 'purchase-cancelled';

/** What came of asking to buy: the page is leaving for Stripe's, or why it is not. */
export type CheckoutOutcome = 'leaving' | 'signed-out' | 'owned' | 'failed';

export interface ShopClient {
  /** Sign in with Google is offered. */
  signIn: boolean;
  /** What the shop sells (empty when the shop is off), in the app's own ids. */
  products: readonly ShopProduct[];
  /** What the address said on the way back to the page; the address has been cleaned of it. */
  notice: ShopNotice | null;
  /** `api/me`, or null when it could not be read. */
  me(): Promise<Me | null>;
  /** After a paid checkout: polls `api/me` until what was bought shows, or gives up. */
  awaitPurchase(): Promise<{ me: Me | null; unlocked: ShopProduct | null }>;
  /** Leaves the page for Google, to come back to this one signed in. */
  startSignIn(): void;
  signOut(): Promise<boolean>;
  deleteAccount(): Promise<boolean>;
  checkout(id: ProductId): Promise<CheckoutOutcome>;
}

/** The shop client, or null when the site has none: no backend, nothing configured, or not the web. */
export type LoadShop = () => Promise<ShopClient | null>;

/**
 * The words, the same in every app of the family that has a shop (the integrations charter);
 * src/__tests__/shop.test.ts pins them.
 */
export const SHOP_WORDS = {
  signIn: 'Sign in with Google',
  signedInAs: (email: string) => `Signed in as ${email}`,
  signedIn: 'Signed in with Google',
  signOut: 'Sign out',
  deleteAccount: 'Delete account',
  signInFailed: "Sign-in didn't complete.",
  buy: 'Buy',
  owned: 'Owned',
  signInToBuy: 'Sign in to buy',
  thanks: (name: string) => `Thank you — ${name} is unlocked.`,
  paymentReceived: 'Payment received. It can take a minute to appear — reload to check.',
} as const;
