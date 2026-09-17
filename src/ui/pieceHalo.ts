/** Text shadow around a piece glyph. */
export interface PieceHalo {
  textShadowColor: string;
  textShadowRadius: number;
  textShadowOffset: { width: number; height: number };
}

/**
 * The halo that keeps a piece legible on a square of its own darkness: by
 * colour alone a black piece on the Neon dark square is about 1.04:1.
 *
 * Every variant keeps a positive radius. Android implements the text shadow
 * with `Paint.setShadowLayer`, and a radius of 0 clears the layer, so a
 * zero-radius shadow with an offset draws on iOS and web but vanishes on
 * Android. Pure (no React Native import) so the invariant can be unit tested.
 */
export function pieceHalo(classic: boolean, white: boolean): PieceHalo {
  if (classic) {
    return { textShadowColor: 'rgba(255,255,255,0.6)', textShadowRadius: 1, textShadowOffset: { width: 0, height: 0 } };
  }
  return {
    textShadowColor: white ? 'rgba(0,0,0,0.9)' : 'rgba(255,255,255,0.45)',
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 2 },
  };
}
