import type { LoadShop } from './shopTypes';

/**
 * The phone app's side of the website's account and shop: there is none. Sign-in and the shop
 * are the website's (src/shop.web.ts, which Metro bundles for the web build in place of this
 * file); the native builds keep their local store and have no network code, so INTERNET stays
 * blocked (src/__tests__/appConfig.test.ts). The App Store and Google Play want their own
 * purchase flow for digital goods, which would be a store provider of its own, not this.
 * src/__tests__/shop.test.ts holds this file to answering "not configured" and nothing else.
 */
export const SHOP_POSSIBLE: boolean = false;

export const loadShop: LoadShop = async () => null;
