/**
 * The website's sign-in and shop: the catalogue the kit sells from, the two ways the kit is
 * started (Cloudflare Pages' functions/api/[[path]].js and the Node adapter behind
 * server/start.mjs), the web client in src/shop.web.ts against the real kit, and the native twin
 * that keeps all of it out of the phone app. Google and Stripe are fakes handed to the kit as
 * its `fetch` (e2e/fakes.mjs): nothing here reaches the network, and no variable points the kit
 * anywhere. The kit's own guards are its self-test's (server/kit/selftest.mjs, run by `npm test`).
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import catalogue from '../../server/catalogue.js';
import { priceVariable, validateCatalogue } from '../../server/kit/app.js';
import { serve } from '../../server/kit/node.js';
import { createMemoryStore } from '../../server/kit/store.js';
import { fakeWorld, kitEnv, PRICES } from '../../e2e/fakes.mjs';
import type { ProductId } from '../cosmetics';
import * as web from '../shop.web';
import { SHOP_WORDS, type Me, type ShopClient } from '../shopTypes';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (file: string) => readFileSync(join(root, file), 'utf8');
const PRODUCT_IDS: ProductId[] = ['supporter', 'pack.auras', 'pack.boards', 'pack.pieces'];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the catalogue', () => {
  it('is one the kit accepts, selling the four purchases the game already has, once each', () => {
    const checked = validateCatalogue(catalogue);
    expect(checked.app).toBe('chesscheatser');
    expect(checked.products.map((p) => [p.id, p.grants, p.mode])).toEqual([
      ['supporter', 'supporter', 'payment'],
      ['pack-auras', 'pack-auras', 'payment'],
      ['pack-boards', 'pack-boards', 'payment'],
      ['pack-pieces', 'pack-pieces', 'payment'],
    ]);
    // Each grants the app's own entitlement, spelled as the kit allows (no dots).
    expect(checked.products.map((p) => web.productOf(p.grants))).toEqual(PRODUCT_IDS);
    expect(PRODUCT_IDS.map((id) => web.SERVER_ID[id])).toEqual(checked.products.map((p) => p.id));
    expect(checked.products.map((p) => priceVariable(p.id))).toEqual(['STRIPE_PRICE_SUPPORTER', 'STRIPE_PRICE_PACK_AURAS', 'STRIPE_PRICE_PACK_BOARDS', 'STRIPE_PRICE_PACK_PIECES']);
  });

  it("names and describes each product as the app's own catalogue does", () => {
    // entitlements.tsx loads React Native, so its catalogue is read as text, as entitlements.test.ts does.
    const source = read('src/entitlements.tsx');
    const features = [...source.slice(source.indexOf('SUPPORTER_FEATURES = ['), source.indexOf('];', source.indexOf('SUPPORTER_FEATURES = ['))).matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(features).toHaveLength(3);
    const packs = [...source.matchAll(/\{ id: '(pack\.\w+)', title: '([^']+)', description: '([^']+)'/g)].map((m) => ({ id: m[1], title: m[2], description: m[3] }));
    expect(packs).toHaveLength(3);
    const app = [{ id: 'supporter', title: 'Supporter', description: features.join(' · ') }, ...packs];
    expect(catalogue.products.map((p) => ({ id: web.productOf(p.id), title: p.name, description: p.description }))).toEqual(app);
  });
});

/** A port nothing listens on, so APP_URL can name it before the server starts. */
async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const address = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  if (typeof address !== 'object' || address === null) throw new Error('no port');
  return address.port;
}

/**
 * The page as the web client sees it, over real HTTP: a cookie jar, the `Origin` a browser puts
 * on a POST or DELETE, and navigation followed through the kit's redirects and Google's page.
 */
function page(appUrl: string, world: Awaited<ReturnType<typeof fakeWorld>>, start = appUrl) {
  const jar = new Map<string, string>();
  const origin = new URL(appUrl).origin;
  const went: string[] = [];
  const pending = { value: null as string | null };
  let href = start;
  const request = async (input: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (jar.size > 0) headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
    if (init.method && init.method !== 'GET') headers.set('origin', origin);
    const response = await fetch(input, { ...init, headers, redirect: 'manual' });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0]!; // split always yields a first element
      const at = pair.indexOf('=');
      const [name, value] = [pair.slice(0, at), pair.slice(at + 1)];
      if (/;\s*Max-Age=0/i.test(cookie) || value === '') jar.delete(name);
      else jar.set(name, value);
    }
    return response;
  };
  const env: web.ShopEnv = {
    fetch: request,
    href: () => href,
    go: (url) => went.push(url),
    replace: (url) => {
      href = new URL(url, href).href;
    },
    pending: { read: () => pending.value, write: (v) => (pending.value = v) },
    sleep: async () => {},
    locale: 'en-US',
  };
  /**
   * Follows a navigation through the kit's redirects and Google's sign-in page (answered as
   * Google would) to the page it lands on, which the static host serves, not the API.
   */
  const navigate = async (url: string) => {
    for (let hops = 0; hops < 5; hops++) {
      if (url.startsWith('https://accounts.google.com/')) {
        url = world.authorize(url);
        continue;
      }
      if (!url.startsWith(`${appUrl}api/`)) {
        href = url;
        return;
      }
      const response = await request(url);
      const next = response.headers.get('location');
      if (response.status !== 302 || !next) throw new Error(`${url} answered ${response.status}, not a redirect`);
      url = new URL(next, url).href;
    }
    throw new Error('too many redirects');
  };
  return { env, jar, went, pending, navigate, href: () => href };
}

describe('the API through the Node adapter (server/start.mjs)', () => {
  const started: { close: () => Promise<void>; dir: string }[] = [];
  afterEach(async () => {
    for (const s of started.splice(0)) {
      await s.close();
      rmSync(s.dir, { recursive: true, force: true });
    }
  });

  async function start(env: Record<string, string>, world: Awaited<ReturnType<typeof fakeWorld>>, port = 0) {
    const dir = mkdtempSync(join(tmpdir(), 'twokings-api-'));
    const server = await serve({ catalogue, env, dataDir: join(dir, 'data'), port, fetch: world.fetch, log: () => {} });
    started.push({ close: server.close, dir });
    return server;
  }

  it('reports nothing switched on with no variables, which is what the static public/api/config says', async () => {
    const world = await fakeWorld();
    const { url } = await start({}, world);
    const response = await fetch(`${url}chesscheatser/api/config`);
    expect(response.status).toBe(200);
    const config = await response.json();
    expect(config).toEqual({ auth: { google: false }, shop: { products: [] } });
    // A host with no backend answers the same, from a file, so the page draws nothing there either.
    expect(JSON.parse(read('public/api/config'))).toEqual(config);
    expect((await fetch(`${url}chesscheatser/api/me`)).status).toBe(404);
    // ...and the client takes either for "the feature does not exist".
    const visitor = page(`${url}chesscheatser/`, world);
    expect(await web.connectShop(visitor.env)).toBeNull();
    expect(world.unexpected).toEqual([]);
  });

  it('signs in, sells, grants on the signed webhook alone, signs out and deletes, with the web client', async () => {
    const world = await fakeWorld();
    const port = await freePort();
    const appUrl = `http://127.0.0.1:${port}/chesscheatser/`;
    const server = await start(kitEnv(appUrl), world, port);
    expect(server.features).toEqual({ signIn: true, shop: true });

    const visitor = page(appUrl, world);
    const client = (await web.connectShop(visitor.env)) as ShopClient;
    expect(client).not.toBeNull();
    expect(client.signIn).toBe(true);
    expect(client.notice).toBeNull();
    expect(client.products).toEqual([
      { id: 'supporter', name: 'Supporter', description: catalogue.products[0]!.description, price: '$4.99' },
      { id: 'pack.auras', name: 'Aura pack', description: 'Embers, Frost, Static and Gold leaf comeback auras.', price: '$1.99' },
      { id: 'pack.boards', name: 'Board pack', description: 'The Slate and Neon boards.', price: '$1.99' },
      { id: 'pack.pieces', name: 'Piece pack', description: 'The classic print piece set.', price: '$1.99' },
    ]);
    expect(await client.me()).toEqual({ user: null, owned: [] });
    expect(await client.checkout('pack.auras')).toBe('signed-out');

    // Sign in: the page leaves for the kit's start, which sends it to Google, which sends it back.
    client.startSignIn();
    expect(visitor.went).toEqual([`${appUrl}api/auth/google/start?return=%2Fchesscheatser%2F`]);
    await visitor.navigate(visitor.went[0]!);
    expect(visitor.href()).toBe(appUrl);
    expect([...visitor.jar.keys()]).toEqual(['__Host-chesscheatser-session']);
    expect(await client.me()).toEqual({ user: { email: 'ada@example.com' }, owned: [] });

    // Buy: the kit makes a Checkout session for this app's product and this user, and the page leaves for it.
    expect(await client.checkout('pack.auras')).toBe('leaving');
    expect(visitor.went.at(-1)).toBe('https://checkout.stripe.com/c/pay/cs_test_1');
    expect(visitor.pending.value).toBe('pack-auras');
    const session = world.sessions[0]!;
    expect([session.get('mode'), session.get('metadata[app]'), session.get('metadata[product]'), session.get('line_items[0][price]')]).toEqual(['payment', 'chesscheatser', 'pack-auras', PRICES['pack-auras'].id]);
    expect(session.get('success_url')).toBe(`${appUrl}?purchase=success`);
    // Nothing is owned until Stripe's signed webhook says it was paid.
    expect((await client.me())?.owned).toEqual([]);
    const forged = world.completed();
    const refused = await fetch(`${appUrl}api/webhooks/stripe`, { method: 'POST', headers: { 'stripe-signature': forged.signature.replace(/v1=\w/, 'v1=0') }, body: forged.body });
    expect(refused.status).toBe(400);
    expect((await client.me())?.owned).toEqual([]);
    const paid = world.completed();
    const hook = await fetch(`${appUrl}api/webhooks/stripe`, { method: 'POST', headers: { 'stripe-signature': paid.signature, 'content-type': 'application/json' }, body: paid.body });
    expect(hook.status).toBe(200);

    // Back from Checkout: the notice is read and taken out of the address, and the purchase is named.
    const back = page(appUrl, world, `${appUrl}?purchase=success`);
    back.jar.clear();
    for (const [k, v] of visitor.jar) back.jar.set(k, v);
    back.pending.value = visitor.pending.value;
    const returned = (await web.connectShop(back.env)) as ShopClient;
    expect(returned.notice).toBe('purchase-success');
    expect(back.href()).toBe(appUrl);
    expect(back.pending.value).toBeNull();
    const bought = await returned.awaitPurchase();
    expect(bought.unlocked?.name).toBe('Aura pack');
    expect(bought.me?.owned).toEqual(['pack.auras']);
    expect(await returned.checkout('pack.auras')).toBe('owned');

    // Sign out: nothing is owned; sign in again and the purchase is the account's.
    expect(await client.signOut()).toBe(true);
    expect(await client.me()).toEqual({ user: null, owned: [] });
    client.startSignIn();
    await visitor.navigate(visitor.went.at(-1)!);
    expect((await client.me())?.owned).toEqual(['pack.auras']);

    // Delete account: signed out, and the purchase gone with the account.
    expect(await client.deleteAccount()).toBe(true);
    expect(await client.me()).toEqual({ user: null, owned: [] });
    client.startSignIn();
    await visitor.navigate(visitor.went.at(-1)!);
    expect(await client.me()).toEqual({ user: { email: 'ada@example.com' }, owned: [] });
    expect(world.unexpected).toEqual([]);
  });
});

describe('the Cloudflare Pages entry (functions/api/[[path]].js)', () => {
  /** A KV namespace in memory, as the kit's KV store uses one. */
  function fakeKv() {
    const memory = createMemoryStore();
    return {
      get: (key: string) => memory.get(key),
      put: (key: string, value: string) => memory.put(key, JSON.parse(value)),
      delete: (key: string) => memory.delete(key),
    };
  }

  it("serves this app's catalogue: nothing on without variables, sign-in on with them", async () => {
    // The entry takes Cloudflare's own fetch; nothing here may reach for it.
    const outbound = vi.fn(async () => {
      throw new Error('the entry reached the network');
    });
    vi.stubGlobal('fetch', outbound);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { onRequest } = await import('../../functions/api/[[path]].js');
    const config = async (env: Record<string, unknown>) => (await onRequest({ request: new Request('https://chess.example/api/config'), env })).json();
    expect(await config({})).toEqual({ auth: { google: false }, shop: { products: [] } });

    const { APP_URL, SESSION_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = kitEnv('https://chess.example/');
    const env = { APP_URL, SESSION_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, KIT_STORE: fakeKv() };
    expect(await config(env)).toEqual({ auth: { google: true }, shop: { products: [] } });
    const start = await onRequest({ request: new Request('https://chess.example/api/auth/google/start?return=/'), env });
    expect(start.status).toBe(302);
    const google = new URL(start.headers.get('location') ?? '');
    expect(google.origin + google.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(google.searchParams.get('redirect_uri')).toBe('https://chess.example/api/auth/google/callback');
    expect(start.headers.getSetCookie()[0]).toMatch(/^__Host-chesscheatser-oauth=/);
    expect(outbound).not.toHaveBeenCalled();
  });
});

describe('the web client (src/shop.web.ts)', () => {
  /** An env whose API answers come from `answer`, recording what the page did. */
  function scripted(answer: (path: string, init: RequestInit) => Response | Promise<Response>, href = 'https://chess.example/') {
    const calls: { path: string; init: RequestInit }[] = [];
    const went: string[] = [];
    const replaced: string[] = [];
    const slept: number[] = [];
    const pending = { value: null as string | null };
    const env: web.ShopEnv = {
      fetch: async (input, init = {}) => {
        const path = new URL(input).pathname;
        calls.push({ path, init });
        return answer(path, init);
      },
      href: () => href,
      go: (url) => went.push(url),
      replace: (url) => replaced.push(url),
      pending: { read: () => pending.value, write: (v) => (pending.value = v) },
      sleep: async (ms) => {
        slept.push(ms);
      },
      locale: 'en-US',
    };
    return { env, calls, went, replaced, slept, pending };
  }
  const CONFIG = {
    auth: { google: true },
    shop: { products: [{ id: 'pack-boards', name: 'Board pack', description: 'The Slate and Neon boards.', mode: 'payment', price: { unit_amount: 199, currency: 'usd' } }] },
  };
  const ok = (value: unknown) => Response.json(value);

  it('takes a 404, a network error, a body that is not JSON and sign-in off for "no shop", and asks once', async () => {
    const answers: (() => Response)[] = [
      () => new Response('<!doctype html><title>Page not found</title>', { status: 404, headers: { 'content-type': 'text/html' } }),
      () => {
        throw new TypeError('Failed to fetch');
      },
      () => new Response('not json', { status: 200 }),
      () => ok({ auth: { google: false }, shop: { products: CONFIG.shop.products } }),
      () => ok({ auth: { google: 'yes' }, shop: { products: [] } }),
      () => ok([]),
      () => new Response(JSON.stringify(CONFIG), { status: 500 }),
    ];
    for (const answer of answers) {
      const page = scripted(answer);
      expect(await web.connectShop(page.env)).toBeNull();
      expect(page.calls.map((c) => c.path)).toEqual(['/api/config']);
      expect(page.replaced).toEqual([]);
    }
  });

  it("asks relative to the page, so a site under a sub-path asks its own api/", async () => {
    const page = scripted(() => ok(CONFIG), 'https://example.com/chesscheatser/?x=1#y');
    const client = await web.connectShop(page.env);
    expect(client?.products.map((p) => [p.id, p.price])).toEqual([['pack.boards', '$1.99']]);
    expect(page.calls[0]!.path).toBe('/chesscheatser/api/config');
    expect(page.replaced).toEqual([]); // nothing to take out of the address
  });

  it('keeps only what this app sells, one time each, with names it can show as text', () => {
    const product = (fields: Record<string, unknown>) => ({ id: 'pack-auras', name: 'Aura pack', description: 'Auras.', mode: 'payment', ...fields });
    const parsed = web.parseConfig({
      auth: { google: true },
      shop: {
        products: [
          product({}),
          product({}), // twice
          product({ id: 'pack.auras' }), // the app's spelling is not the backend's
          product({ id: 'pro' }), // nothing here to unlock
          product({ id: 'constructor' }),
          product({ id: 'supporter', name: 'Monthly', mode: 'subscription' }),
          product({ id: 'pack-boards', name: '' }),
          product({ id: 'pack-boards', name: 'Board\npack' }),
          product({ id: 'pack-pieces', description: 'x'.repeat(501) }),
          product({ id: 'supporter', price: { unit_amount: 'free', currency: 'usd' } }),
          null,
        ],
      },
    });
    expect(parsed?.products).toEqual([
      { id: 'pack.auras', name: 'Aura pack', description: 'Auras.', price: null },
      { id: 'supporter', name: 'Aura pack', description: 'Auras.', price: null },
    ]);
    expect(web.productOf('__proto__')).toBeNull();
    expect(web.productOf('toString')).toBeNull();
  });

  it("formats a price in the currency's own unit", () => {
    expect(web.formatPrice({ unit_amount: 499, currency: 'usd' }, 'en-US')).toBe('$4.99');
    expect(web.formatPrice({ unit_amount: 499, currency: 'jpy' }, 'en-US')).toBe('¥499');
    expect(web.formatPrice({ unit_amount: 4990, currency: 'bhd' }, 'en-US')).toMatch(/^BHD\s4\.990$/);
    expect(web.formatPrice({ unit_amount: 199, currency: 'eur' }, 'en-US')).toBe('€1.99');
    for (const bad of [{ unit_amount: -1, currency: 'usd' }, { unit_amount: 1.5, currency: 'usd' }, { unit_amount: 1, currency: 'USD' }, { unit_amount: 1, currency: 'us' }, null, 'usd 1']) {
      expect(web.formatPrice(bad, 'en-US'), JSON.stringify(bad)).toBeNull();
    }
  });

  it('reads api/me: signed out owns nothing, and only what this app sells is owned', () => {
    expect(web.parseMe({ user: null, entitlements: ['pack-auras'] })).toEqual({ user: null, owned: [] });
    expect(web.parseMe({ user: { email: 'ada@example.com' }, entitlements: ['pack-auras', 'pack-auras', 'pro', 'pack.boards', 'supporter'] })).toEqual({
      user: { email: 'ada@example.com' },
      owned: ['pack.auras', 'supporter'],
    });
    expect(web.parseMe({ user: {}, entitlements: [] })).toEqual({ user: { email: null }, owned: [] });
    expect(web.parseMe({ user: { email: 'ada@example.com\n<b>' }, entitlements: [] })).toEqual({ user: { email: null }, owned: [] });
    for (const bad of [null, {}, { user: null }, { user: 'ada', entitlements: [] }, { user: null, entitlements: 'pack-auras' }]) {
      expect(web.parseMe(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it('reads what the address said on the way back, once, and leaves the rest of it', async () => {
    expect(web.readNotice('?signin=failed')).toEqual({ notice: 'signin-failed', search: '' });
    expect(web.readNotice('?purchase=success&a=1')).toEqual({ notice: 'purchase-success', search: '?a=1' });
    expect(web.readNotice('?purchase=cancelled')).toEqual({ notice: 'purchase-cancelled', search: '' });
    expect(web.readNotice('?signin=ok&purchase=later')).toEqual({ notice: null, search: '?signin=ok&purchase=later' });
    const page = scripted(() => ok(CONFIG), 'https://chess.example/?signin=failed#top');
    page.pending.value = 'pack-boards';
    const client = await web.connectShop(page.env);
    expect(client?.notice).toBe('signin-failed');
    expect(page.replaced).toEqual(['/#top']);
    expect(page.pending.value).toBeNull();
  });

  it('leaves for Stripe only at a Checkout address, and remembers what for', async () => {
    for (const url of ['https://checkout.stripe.com/c/pay/cs_1', 'https://checkout.stripe.com/x']) expect(web.isCheckoutUrl(url), url).toBe(true);
    const elsewhere = ['http://checkout.stripe.com/c/pay/cs_1', 'https://checkout.stripe.com.evil.example/c', 'https://evil.example/https://checkout.stripe.com/', 'https://checkout.stripe.com', 'javascript:alert(1)//https://checkout.stripe.com/', 'https://user@checkout.stripe.com@evil.example/', null];
    for (const url of elsewhere) expect(web.isCheckoutUrl(url), String(url)).toBe(false);
    for (const url of elsewhere) {
      const page = scripted((path) => (path === '/api/config' ? ok(CONFIG) : ok({ url })));
      const client = (await web.connectShop(page.env)) as ShopClient;
      expect(await client.checkout('pack.boards'), String(url)).toBe('failed');
      expect(page.went).toEqual([]);
      expect(page.pending.value).toBeNull();
    }
    const page = scripted((path) => (path === '/api/config' ? ok(CONFIG) : ok({ url: 'https://checkout.stripe.com/c/pay/cs_1' })));
    const client = (await web.connectShop(page.env)) as ShopClient;
    expect(await client.checkout('pack.boards')).toBe('leaving');
    expect(page.went).toEqual(['https://checkout.stripe.com/c/pay/cs_1']);
    expect(page.pending.value).toBe('pack-boards');
    const post = page.calls.at(-1)!;
    expect([post.path, post.init.method, new Headers(post.init.headers).get('content-type'), post.init.body]).toEqual(['/api/checkout', 'POST', 'application/json', '{"product":"pack-boards"}']);
    expect(page.calls.filter((c) => c.path === '/api/checkout')).toHaveLength(1);
  });

  it('says why a purchase did not start', async () => {
    for (const [status, outcome] of [[401, 'signed-out'], [409, 'owned'], [404, 'failed'], [429, 'failed'], [502, 'failed']] as const) {
      const page = scripted((path) => (path === '/api/config' ? ok(CONFIG) : Response.json({ error: 'x' }, { status })));
      const client = (await web.connectShop(page.env)) as ShopClient;
      expect(await client.checkout('pack.boards'), String(status)).toBe(outcome);
      expect(page.went).toEqual([]);
    }
  });

  it('after a paid checkout, asks api/me five times over fifteen seconds before giving up', async () => {
    const owned = (ids: string[]): Me | Record<string, unknown> => ({ user: { email: 'ada@example.com' }, entitlements: ids });
    const run = async (appearsAt: number | null, pending: string | null) => {
      let asked = 0;
      const page = scripted((path) => {
        if (path === '/api/config') return ok(CONFIG);
        asked += 1;
        return ok(owned(appearsAt !== null && asked >= appearsAt ? ['pack-boards'] : []));
      }, 'https://chess.example/?purchase=success');
      page.pending.value = pending;
      const client = (await web.connectShop(page.env)) as ShopClient;
      const result = await client.awaitPurchase();
      return { result, asked, slept: page.slept };
    };
    const found = await run(3, 'pack-boards');
    expect(found.result.unlocked?.name).toBe('Board pack');
    expect([found.asked, found.slept]).toEqual([3, [3750, 3750]]);
    const never = await run(null, 'pack-boards');
    expect(never.result.unlocked).toBeNull();
    expect([never.asked, never.slept]).toEqual([5, [3750, 3750, 3750, 3750]]);
    expect(web.POLL_ATTEMPTS * web.POLL_INTERVAL_MS - web.POLL_INTERVAL_MS).toBeLessThanOrEqual(15_000);
    // A tab that kept no note of what it bought cannot name it, and says so after the same wait.
    const unnamed = await run(1, null);
    expect(unnamed.result.unlocked).toBeNull();
    expect(unnamed.result.me?.owned).toEqual(['pack.boards']);
  });

  it('signs in through the site, coming back to the page it left', async () => {
    const page = scripted(() => ok(CONFIG), 'https://example.com/chesscheatser/?board=1');
    const client = (await web.connectShop(page.env)) as ShopClient;
    client.startSignIn();
    expect(page.went).toEqual(['https://example.com/chesscheatser/api/auth/google/start?return=%2Fchesscheatser%2F%3Fboard%3D1']);
  });
});

describe('the phone app has none of it', () => {
  it('gets the twin, which answers "not configured" without asking anything', async () => {
    // By the bare name, as the app imports it: Vite, like Metro on a phone, resolves it to src/shop.ts.
    const native = await import('../shop');
    const outbound = vi.fn();
    vi.stubGlobal('fetch', outbound);
    expect(native.SHOP_POSSIBLE).toBe(false);
    expect(await native.loadShop()).toBeNull();
    expect(outbound).not.toHaveBeenCalled();
    expect(web.SHOP_POSSIBLE).toBe(true);
    // The twin offers what the web module does (tsc holds the types: both are LoadShop).
    expect(Object.keys(native).sort()).toEqual(['SHOP_POSSIBLE', 'loadShop']);
    for (const name of Object.keys(native)) expect(Object.keys(web), name).toContain(name);
    // ...and is code that cannot reach the network.
    const twin = read('src/shop.ts');
    expect(twin).not.toMatch(/fetch|XMLHttpRequest|https?:|window|location|import (?!type)/);
  });

  it('is reached only by the bare name, which Metro resolves to the twin on a phone', () => {
    // Imported as `./shop.web` anywhere, the web module would be in the phone app too.
    const sources: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__') walk(path);
        } else if (/\.tsx?$/.test(entry.name)) sources.push(path);
      }
    };
    walk('src');
    const importers = sources.filter((f) => /from '\.\.?\/(?:[\w./]*\/)?shop'/.test(read(f)));
    expect(importers.sort()).toEqual(['src/account.tsx']);
    for (const file of [...sources, 'App.tsx', 'index.ts']) expect(read(file), file).not.toMatch(/(?:from|import|require)\s*\(?\s*'[^']*shop\.web'/);
  });

  it('says the words every app with a shop says', () => {
    expect({ ...SHOP_WORDS, signedInAs: SHOP_WORDS.signedInAs('ada@example.com'), thanks: SHOP_WORDS.thanks('Aura pack') }).toEqual({
      signIn: 'Sign in with Google',
      signedInAs: 'Signed in as ada@example.com',
      signedIn: 'Signed in with Google',
      signOut: 'Sign out',
      deleteAccount: 'Delete account',
      signInFailed: "Sign-in didn't complete.",
      buy: 'Buy',
      owned: 'Owned',
      signInToBuy: 'Sign in to buy',
      thanks: 'Thank you — Aura pack is unlocked.',
      paymentReceived: 'Payment received. It can take a minute to appear — reload to check.',
    });
  });
});
