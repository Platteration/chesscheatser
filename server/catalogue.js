// @ts-check
// What the website's shop sells, for the kit in server/kit (its README is the owner's guide).
// These are the four purchases the game already has (src/cosmetics.ts, src/entitlements.tsx),
// one Stripe product each, and every one is cosmetic and can also be earned by playing: nothing
// here touches the rules, the armies or how the computer plays.
//
// The kit spells ids without dots (^[a-z][a-z0-9-]{0,31}$), so `pack-auras` here is the app's
// `pack.auras`: src/shop.web.ts maps one to the other, and src/__tests__/shop.test.ts holds the
// names and descriptions equal to the app's own catalogue. Each product's Stripe Price is the
// variable named for its id: STRIPE_PRICE_SUPPORTER, STRIPE_PRICE_PACK_AURAS,
// STRIPE_PRICE_PACK_BOARDS and STRIPE_PRICE_PACK_PIECES. A product with no price is not sold.

export default {
  app: 'chesscheatser',
  name: 'Two Kings Chess',
  products: [
    {
      id: 'supporter',
      name: 'Supporter',
      description:
        'Every comeback aura, board and piece set, now · A crown on your stats and shared results · Nothing withheld from anyone else: the whole game is free',
      mode: 'payment',
      grants: 'supporter',
    },
    {
      id: 'pack-auras',
      name: 'Aura pack',
      description: 'Embers, Frost, Static and Gold leaf comeback auras.',
      mode: 'payment',
      grants: 'pack-auras',
    },
    {
      id: 'pack-boards',
      name: 'Board pack',
      description: 'The Slate and Neon boards.',
      mode: 'payment',
      grants: 'pack-boards',
    },
    {
      id: 'pack-pieces',
      name: 'Piece pack',
      description: 'The classic print piece set.',
      mode: 'payment',
      grants: 'pack-pieces',
    },
  ],
};
