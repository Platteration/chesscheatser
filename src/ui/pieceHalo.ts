/** Text shadow around a piece glyph. */
export interface PieceHalo {
  textShadowColor: string;
  textShadowRadius: number;
  textShadowOffset: { width: number; height: number };
}

/** Neon has two dark squares, so both armies need light ink. */
export function pieceInk(classic: boolean, white: boolean, neon = false): string {
  if (neon) return classic || white ? '#fff5df' : '#b6a4dc';
  return classic ? '#141414' : white ? '#fff5df' : '#24333e';
}

/**
 * The edge that supplements the piece ink on each board square.
 *
 * Every variant keeps a positive radius. Android implements the text shadow
 * with `Paint.setShadowLayer`, and a radius of 0 clears the layer, so a
 * zero-radius shadow with an offset draws on iOS and web but vanishes on
 * Android. Pure (no React Native import) so the invariant can be unit tested.
 */
export function pieceHalo(classic: boolean, white: boolean, neon = false): PieceHalo {
  if (neon) {
    return {
      textShadowColor: 'rgba(0,0,0,0.9)',
      textShadowRadius: classic ? 1 : 3,
      textShadowOffset: { width: 0, height: classic ? 0 : 2 },
    };
  }
  if (classic) {
    return { textShadowColor: 'rgba(255,255,255,0.6)', textShadowRadius: 1, textShadowOffset: { width: 0, height: 0 } };
  }
  return {
    textShadowColor: white ? 'rgba(0,0,0,0.9)' : 'rgba(255,255,255,0.45)',
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 2 },
  };
}
