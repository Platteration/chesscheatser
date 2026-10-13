import type { ProductId } from './cosmetics';
import type { Account, CheckoutOutcome, LoadShop, Me, ShopClient, ShopNotice, ShopProduct } from './shopTypes';
import { SESSION_KEYS } from './storage';

/**
 * The website's account and shop: sign in with Google and Stripe Checkout, through the site's
 * own backend under `api/` (server/kit, with server/catalogue.js). Metro bundles this file for
 * the web build alone, and its twin, src/shop.ts, everywhere else, so no network code reaches
 * the phone app: the no-network scan in src/__tests__/appConfig.test.ts exempts exactly the
 * `.web` modules, and src/__tests__/shop.test.ts holds the twin inert.
 *
 * The feature exists only when the site says so. `api/config` is asked once, relative to the
 * page; a host with no backend answers it with the static public/api/config, which says nothing
 * is on, and a 404, a network error, a body that is not JSON or sign-in off all mean the same:
 * nothing is drawn, nothing stored, nothing asked again. Google and Stripe are top-level
 * navigations (the site's policy governs neither, and loads nothing of theirs): the page never
 * sees a card, and only Stripe's signed webhook, at the backend, grants a purchase.
 *
 * Everything the backend sends is checked here before the app sees it, and shown as text.
 */

/** Whether this platform can have the shop at all: the web build can; the twin says no. */
export const SHOP_POSSIBLE: boolean = true;

/**
 * The app's product ids as the backend spells them. The kit allows no dot in an id, so the
 * catalogue's `pack-auras` is the app's `pack.auras` (and grants it); one table, typed by the
 * app's ids, so a new product fails `tsc` until it is spelled here too.
 */
export const SERVER_ID: Record<ProductId, string> = {
  supporter: 'supporter',
  'pack.auras': 'pack-auras',
  'pack.boards': 'pack-boards',
  'pack.pieces': 'pack-pieces',
};
const PRODUCT_IDS = Object.keys(SERVER_ID) as ProductId[];

/** How many times, and how far apart, `api/me` is asked after a paid checkout: five over fifteen seconds. */
export const POLL_ATTEMPTS = 5;
export const POLL_INTERVAL_MS = 3_750;
/** How long one call to the site's API may take before the page stops waiting for it. */
const TIMEOUT_MS = 10_000;
/** Where this tab keeps the product it sent to Checkout, for the thank-you on the way back. */
const PENDING_KEY = SESSION_KEYS.checkout;
/** Only Stripe's own Checkout address is followed. */
const CHECKOUT_ORIGIN = 'https://checkout.stripe.com';

/** Stripe's currencies whose smallest unit is the whole unit, and those with three decimals. */
const ZERO_DECIMAL = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']);
const THREE_DECIMAL = new Set(['bhd', 'jod', 'kwd', 'omr', 'tnd']);

type Fields = Record<string, unknown>;
const isRecord = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Text of a sane length with no control character in it. */
function isText(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && value.length >= min && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
}

/** The app's id for one the backend sent, or null for anything it does not sell here. */
export function productOf(serverId: unknown): ProductId | null {
  return PRODUCT_IDS.find((id) => SERVER_ID[id] === serverId) ?? null;
}

/**
 * A Stripe price as the visitor reads it: `unit_amount` is in the currency's smallest unit as
 * Stripe counts it (cents for USD and EUR, whole yen for JPY, thousandths for BHD). Null when
 * it is not a price.
 */
export function formatPrice(raw: unknown, locale?: string): string | null {
  if (!isRecord(raw)) return null;
  const amount = raw.unit_amount;
  const currency = raw.currency;
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 0) return null;
  if (typeof currency !== 'string' || !/^[a-z]{3}$/.test(currency)) return null;
  const decimals = ZERO_DECIMAL.has(currency) ? 0 : THREE_DECIMAL.has(currency) ? 3 : 2;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: currency.toUpperCase() }).format(amount / 10 ** decimals);
  } catch {
    return null;
  }
}

/**
 * `api/config`, checked: null unless sign-in is on (the shop needs it, and the kit turns it on
 * only with sign-in). The products are the one-time purchases this app knows; anything else the
 * backend lists is left out, since there is nothing here it would unlock.
 */
export function parseConfig(raw: unknown, locale?: string): { signIn: boolean; products: ShopProduct[] } | null {
  if (!isRecord(raw) || !isRecord(raw.auth) || !isRecord(raw.shop)) return null;
  if (raw.auth.google !== true) return null;
  const listed = Array.isArray(raw.shop.products) ? raw.shop.products.slice(0, 50) : [];
  const products: ShopProduct[] = [];
  for (const item of listed) {
    if (!isRecord(item)) continue;
    const id = productOf(item.id);
    if (!id || products.some((p) => p.id === id) || item.mode !== 'payment') continue;
    if (!isText(item.name, 1, 100) || !isText(item.description, 0, 500)) continue;
    products.push({ id, name: item.name, description: item.description, price: item.price === undefined ? null : formatPrice(item.price, locale) });
  }
  return { signIn: true, products };
}

/** `api/me`, checked: null when it is not what the backend sends. Signed out owns nothing. */
export function parseMe(raw: unknown): Me | null {
  if (!isRecord(raw) || !Array.isArray(raw.entitlements)) return null;
  let user: Account | null = null;
  if (raw.user !== null) {
    if (!isRecord(raw.user)) return null;
    user = { email: isText(raw.user.email, 3, 320) ? raw.user.email : null };
  }
  const owned = new Set<ProductId>();
  for (const id of raw.entitlements.slice(0, 50)) {
    const product = productOf(id);
    if (product) owned.add(product);
  }
  return { user, owned: user ? [...owned] : [] };
}

/** What the address says on the way back from Google or Stripe, and the query without it. */
export function readNotice(search: string): { notice: ShopNotice | null; search: string } {
  const params = new URLSearchParams(search);
  let notice: ShopNotice | null = null;
  if (params.get('signin') === 'failed') {
    notice = 'signin-failed';
    params.delete('signin');
  }
  const purchase = params.get('purchase');
  if (purchase === 'success' || purchase === 'cancelled') {
    notice ??= purchase === 'success' ? 'purchase-success' : 'purchase-cancelled';
    params.delete('purchase');
  }
  const rest = params.toString();
  return { notice, search: rest ? `?${rest}` : '' };
}

/**
 * Whether `url` is a Stripe Checkout page, the one place Buy may send the visitor: the origin
 * and the `/` that ends it, so the host cannot run on (`checkout.stripe.com.example`).
 */
export function isCheckoutUrl(url: unknown): url is string {
  return typeof url === 'string' && url.startsWith(`${CHECKOUT_ORIGIN}/`);
}

/** What the client needs from the page, so a test can stand in for each. */
export interface ShopEnv {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  /** The page's address now. */
  href(): string;
  /** Leaves the page for `url`. */
  go(url: string): void;
  /** Replaces the page's address without loading it. */
  replace(url: string): void;
  /** The product this tab sent to Checkout (the backend's id), or null. */
  pending: { read(): string | null; write(value: string | null): void };
  sleep(ms: number): Promise<void>;
  locale?: string;
}

/** One call to the site's API: its response, or null when none arrived. */
async function call(env: ShopEnv, path: string, init: RequestInit): Promise<Response | null> {
  try {
    const timeout = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(TIMEOUT_MS) : undefined;
    return await env.fetch(new URL(`api/${path}`, env.href()).href, { credentials: 'same-origin', ...init, ...(timeout ? { signal: timeout } : {}) });
  } catch {
    return null;
  }
}

/** The JSON body of a 200 response, or undefined for anything else. */
async function body(response: Response | null): Promise<unknown> {
  if (response?.status !== 200) return undefined;
  try {
    return JSON.parse(await response.text());
  } catch {
    return undefined;
  }
}

/** The shop client over `env`, or null when the site has no sign-in to offer. */
export async function connectShop(env: ShopEnv): Promise<ShopClient | null> {
  const config = parseConfig(await body(await call(env, 'config', { headers: { accept: 'application/json' } })), env.locale);
  if (!config) return null;

  // The address is read once, and what it said taken out of it, so a reload says nothing again.
  const here = new URL(env.href());
  const { notice, search } = readNotice(here.search);
  if (notice) env.replace(`${here.pathname}${search}${here.hash}`);
  const pending = notice === 'purchase-success' ? productOf(env.pending.read()) : null;
  if (notice) env.pending.write(null);

  const me = async () => parseMe(await body(await call(env, 'me', { headers: { accept: 'application/json' }, cache: 'no-store' })));

  return {
    signIn: config.signIn,
    products: config.products,
    notice,
    me,
    async awaitPurchase() {
      const product = config.products.find((p) => p.id === pending) ?? null;
      let latest: Me | null = null;
      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
        if (attempt > 0) await env.sleep(POLL_INTERVAL_MS);
        latest = (await me()) ?? latest;
        if (product && latest?.owned.includes(product.id)) return { me: latest, unlocked: product };
      }
      return { me: latest, unlocked: null };
    },
    startSignIn() {
      const page = new URL(env.href());
      env.go(`${new URL('api/auth/google/start', page).href}?return=${encodeURIComponent(page.pathname + page.search)}`);
    },
    async signOut() {
      return (await call(env, 'auth/logout', { method: 'POST' }))?.status === 204;
    },
    async deleteAccount() {
      return (await call(env, 'me', { method: 'DELETE' }))?.status === 204;
    },
    async checkout(id): Promise<CheckoutOutcome> {
      const response = await call(env, 'checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ product: SERVER_ID[id] }) });
      if (response?.status === 401) return 'signed-out';
      if (response?.status === 409) return 'owned';
      const answer = await body(response);
      const url = isRecord(answer) ? answer.url : undefined;
      if (!isCheckoutUrl(url)) return 'failed';
      env.pending.write(SERVER_ID[id]);
      env.go(url);
      return 'leaving';
    },
  };
}

/** The page itself, for the client. */
function browserEnv(): ShopEnv {
  const storage = () => {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  };
  return {
    fetch: (input, init) => globalThis.fetch(input, init),
    href: () => window.location.href,
    go: (url) => window.location.assign(url),
    replace: (url) => window.history.replaceState(window.history.state, '', url),
    pending: {
      // A tab that keeps no storage just loses the name in the thank-you.
      read() {
        try {
          return storage()?.getItem(PENDING_KEY) ?? null;
        } catch {
          return null;
        }
      },
      write(value) {
        try {
          if (value === null) storage()?.removeItem(PENDING_KEY);
          else storage()?.setItem(PENDING_KEY, value);
        } catch {
          // nothing to keep it in
        }
      },
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

export const loadShop: LoadShop = () => (typeof window === 'undefined' ? Promise.resolve(null) : connectShop(browserEnv()));
