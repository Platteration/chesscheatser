// Google and Stripe as the kit (server/kit) reaches them: through the `fetch` createApp is given,
// never the network. Test tooling only, free of Playwright, shared by the unit test of the
// catalogue and the API (src/__tests__/shop.test.ts) and the browser suite's sign-in and purchase
// (e2e/run.mjs). The kit's own self-test has fakes of its own; these are the app's, so the app's
// tests do not depend on the inside of a file it copies verbatim.
//
// Google: an RSA key made with Web Crypto signs the ID tokens, and its public half is the JWKS.
// `authorize(url)` is what Google's sign-in page does with the address the kit sends the browser
// to: it remembers the request and answers with the callback address and a code, which the token
// endpoint then exchanges (checking the PKCE verifier against the challenge). Stripe: prices, and
// Checkout sessions it records; `completed()` is the signed `checkout.session.completed` Stripe
// would post for one of them, and `refunded()` its `charge.refunded` for the whole payment, each
// signed with node:crypto, apart from the kit's own HMAC. Every address the fakes do not serve
// is recorded in `unexpected` and refused.
import { Buffer } from 'node:buffer';
import { createHash, createHmac, webcrypto } from 'node:crypto';

// Assembled at run time, so no scanner takes them for real ones.
export const CLIENT_ID = '1234567890-twokings.apps.googleusercontent.com';
export const CLIENT_SECRET = ['GOCSPX', 'fake', 'not', 'a', 'secret'].join('-');
export const SESSION_SECRET = Buffer.alloc(32, 7).toString('base64url');
export const STRIPE_KEY = ['sk', 'test', 'twokingsfake0000000000'].join('_');
export const WEBHOOK_SECRET = ['whsec', 'twokingsfaketwokingsfake'].join('_');

/** The Stripe price of each catalogue product, in cents of a US dollar. */
export const PRICES = {
  supporter: { id: 'price_supporter', unit_amount: 499 },
  'pack-auras': { id: 'price_auras', unit_amount: 199 },
  'pack-boards': { id: 'price_boards', unit_amount: 199 },
  'pack-pieces': { id: 'price_pieces', unit_amount: 199 },
};

/** Every variable the kit reads, set, for a site at `appUrl`. */
export function kitEnv(appUrl) {
  return {
    APP_URL: appUrl,
    SESSION_SECRET,
    GOOGLE_CLIENT_ID: CLIENT_ID,
    GOOGLE_CLIENT_SECRET: CLIENT_SECRET,
    STRIPE_SECRET_KEY: STRIPE_KEY,
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    STRIPE_PRICE_SUPPORTER: PRICES.supporter.id,
    STRIPE_PRICE_PACK_AURAS: PRICES['pack-auras'].id,
    STRIPE_PRICE_PACK_BOARDS: PRICES['pack-boards'].id,
    STRIPE_PRICE_PACK_PIECES: PRICES['pack-pieces'].id,
  };
}

const b64 = (data) => Buffer.from(data).toString('base64url');
const json = (value, init = {}) => new Response(JSON.stringify(value), { ...init, headers: { 'content-type': 'application/json', ...init.headers } });

/** A Google account and a Stripe account for one test. */
export async function fakeWorld({ sub = '1001', email = 'ada@example.com' } = {}) {
  const pair = await webcrypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const { n, e } = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
  const jwk = { kty: 'RSA', n, e, alg: 'RS256', use: 'sig', kid: 'fake-key' };
  const codes = new Map();
  let serial = 0;

  const world = {
    /** The Checkout sessions created, as the form Stripe received. */
    sessions: [],
    /** Every request the fakes refused, as `METHOD address`. */
    unexpected: [],
    /** Google's sign-in page: the callback address it sends the browser back to. */
    authorize(address) {
      const url = new URL(address);
      const p = url.searchParams;
      if (url.origin + url.pathname !== 'https://accounts.google.com/o/oauth2/v2/auth') throw new Error(`not Google's sign-in page: ${address}`);
      if (p.get('response_type') !== 'code' || p.get('client_id') !== CLIENT_ID || p.get('scope') !== 'openid email' || p.get('code_challenge_method') !== 'S256') {
        throw new Error(`a sign-in request Google would refuse: ${address}`);
      }
      const code = `code-${++serial}`;
      codes.set(code, { nonce: p.get('nonce'), challenge: p.get('code_challenge'), redirectUri: p.get('redirect_uri') });
      return `${p.get('redirect_uri')}?${new URLSearchParams({ code, state: p.get('state') })}`;
    },
    /** What the kit is given as `fetch`. */
    async fetch(input, init = {}) {
      const address = String(input);
      const method = init.method ?? 'GET';
      const headers = new Headers(init.headers);
      const body = typeof init.body === 'string' ? init.body : '';
      if (address === 'https://www.googleapis.com/oauth2/v3/certs' && method === 'GET') {
        return json({ keys: [jwk] }, { headers: { 'cache-control': 'public, max-age=3600' } });
      }
      if (address === 'https://oauth2.googleapis.com/token' && method === 'POST') return token(new URLSearchParams(body));
      if (address.startsWith('https://api.stripe.com/v1/') && headers.get('authorization') === `Bearer ${STRIPE_KEY}`) {
        const path = address.slice('https://api.stripe.com/v1'.length);
        if (method === 'GET' && path.startsWith('/prices/')) {
          const price = Object.values(PRICES).find((p) => p.id === decodeURIComponent(path.slice('/prices/'.length)));
          if (price) return json({ id: price.id, object: 'price', active: true, currency: 'usd', unit_amount: price.unit_amount, recurring: null, type: 'one_time' });
        }
        if (method === 'POST' && path === '/checkout/sessions') {
          world.sessions.push(new URLSearchParams(body));
          const id = `cs_test_${world.sessions.length}`;
          return json({ id, object: 'checkout.session', url: `https://checkout.stripe.com/c/pay/${id}` });
        }
      }
      world.unexpected.push(`${method} ${address}`);
      throw new TypeError(`an address the fakes do not serve: ${address}`);
    },
    /**
     * Stripe's `checkout.session.completed` for a session the kit created (the last one by
     * default), paid, with the `Stripe-Signature` Stripe would send: `{ body, signature }`.
     */
    completed(session = world.sessions.at(-1)) {
      const at = Math.floor(Date.now() / 1000);
      const id = `${++serial}`;
      const event = {
        id: `evt_fake${id}`,
        object: 'event',
        type: 'checkout.session.completed',
        livemode: false,
        created: at,
        data: {
          object: {
            id: `cs_test_paid${id}`,
            object: 'checkout.session',
            mode: session.get('mode'),
            payment_status: 'paid',
            client_reference_id: session.get('client_reference_id'),
            metadata: { app: session.get('metadata[app]'), user: session.get('metadata[user]'), product: session.get('metadata[product]') },
            payment_intent: `pi_fake${id}`,
            customer: 'cus_fake1',
          },
        },
      };
      return signed(event, at);
    },
    /**
     * Stripe's `charge.refunded` for the whole of a payment `completed()` reported (its `body`),
     * with the `Stripe-Signature` Stripe would send: `{ body, signature }`.
     */
    refunded(completedBody) {
      const paid = JSON.parse(completedBody).data.object;
      const at = Math.floor(Date.now() / 1000);
      const id = `${++serial}`;
      const charge = { id: `ch_fake${id}`, object: 'charge', payment_intent: paid.payment_intent, amount: 199, amount_refunded: 199, refunded: true };
      return signed({ id: `evt_fake${id}`, object: 'event', type: 'charge.refunded', livemode: false, created: at, data: { object: charge } }, at);
    },
  };

  /** An event's body and the `Stripe-Signature` Stripe sends with it, made at `at`. */
  function signed(event, at) {
    const body = JSON.stringify(event);
    const v1 = createHmac('sha256', WEBHOOK_SECRET).update(`${at}.${body}`).digest('hex');
    return { body, signature: `t=${at},v1=${v1}` };
  }

  async function token(form) {
    const grant = codes.get(form.get('code') ?? '');
    codes.delete(form.get('code') ?? '');
    const challenge = createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url');
    if (
      !grant ||
      form.get('grant_type') !== 'authorization_code' ||
      form.get('client_id') !== CLIENT_ID ||
      form.get('client_secret') !== CLIENT_SECRET ||
      form.get('redirect_uri') !== grant.redirectUri ||
      challenge !== grant.challenge
    ) {
      return json({ error: 'invalid_grant' }, { status: 400 });
    }
    const now = Math.floor(Date.now() / 1000);
    const claims = { iss: 'https://accounts.google.com', aud: CLIENT_ID, azp: CLIENT_ID, sub, email, email_verified: true, iat: now, exp: now + 3600, nonce: grant.nonce };
    const head = b64(JSON.stringify({ alg: 'RS256', kid: jwk.kid, typ: 'JWT' }));
    const payload = b64(JSON.stringify(claims));
    const signature = await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${head}.${payload}`));
    return json({ id_token: `${head}.${payload}.${b64(new Uint8Array(signature))}`, access_token: 'unused', token_type: 'Bearer', expires_in: 3599 });
  }

  return world;
}
