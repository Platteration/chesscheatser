import React from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
import type { Piece, PieceType } from '../engine/types';

/** Filled glyphs for both colours; colour comes from the text style. */
export const GLYPH: Record<PieceType, string> = {
  k: '♚',
  q: '♛',
  r: '♜',
  b: '♝',
  n: '♞',
  p: '♟',
};

interface Props {
  piece: Piece;
  size: number;
}

export const PieceGlyph = React.memo(function PieceGlyph({ piece, size }: Props) {
  const white = piece.color === 'w';
  return (
    <Text
      allowFontScaling={false}
      style={[
        styles.glyph,
        {
          fontSize: size * 0.78,
          lineHeight: size,
          color: white ? '#fdfdfd' : '#141414',
          textShadowColor: white ? 'rgba(0,0,0,0.9)' : 'rgba(255,255,255,0.45)',
        },
      ]}
    >
      {GLYPH[piece.type]}
    </Text>
  );
});

const styles = StyleSheet.create({
  glyph: {
    textAlign: 'center',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3,
    includeFontPadding: false,
    textAlignVertical: 'center',
    ...(Platform.OS === 'web' ? { userSelect: 'none' as const } : null),
  },
});
