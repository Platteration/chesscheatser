/**
 * The shape of the `appsettings` record: its types and its defaults. They live
 * apart from `settings.tsx`, the provider, because that file pulls in React
 * Native (through the haptics and sound gates) and the test runner cannot load
 * it — and both the validator's round-trip test and the settings-contract test
 * need the defaults themselves, not a copy that can drift. `validate.ts` reads
 * the types from here for the same reason. Nothing in this file may import
 * React or React Native.
 */

export type ColorSchemeSetting = 'system' | 'dark' | 'light';
export type BoardTheme = 'wood' | 'marble' | 'slate' | 'neon' | 'tournament';
export type PieceStyle = 'solid' | 'classic';
/** `system` follows the operating system's reduce-motion switch; `on` and `off` override it. */
export type ReduceMotionSetting = 'system' | 'on' | 'off';

export interface AppSettings {
  colorScheme: ColorSchemeSetting;
  boardTheme: BoardTheme;
  pieceStyle: PieceStyle;
  sounds: boolean;
  haptics: boolean;
  reduceMotion: ReduceMotionSetting;
  /** The first-game explanation has been dismissed. */
  seenIntro: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  colorScheme: 'system',
  boardTheme: 'wood',
  pieceStyle: 'solid',
  sounds: true,
  haptics: true,
  reduceMotion: 'system',
  seenIntro: false,
};
