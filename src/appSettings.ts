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

/**
 * The scheme the theme is built from. React Native types the device's answer
 * `'light' | 'dark' | 'unspecified' | null | undefined` (its `ColorSchemeName`,
 * spelled out here so this module stays free of React Native): anything but
 * `light` means the operating system stated no preference, and then the app's
 * own pre-provider default applies, which is dark (`theme.ts`'s static theme).
 * Only a device with no stated preference ever takes that branch;
 * react-native-web never answers null.
 */
export function resolveScheme(setting: ColorSchemeSetting, system: 'light' | 'dark' | 'unspecified' | null | undefined): 'light' | 'dark' {
  return setting === 'system' ? (system === 'light' ? 'light' : 'dark') : setting;
}

/**
 * Reset to defaults keeps what the player has already *seen*: `seenIntro`
 * records that the first-game explanation was dismissed, not a preference,
 * and nobody resetting their colours is asking for the tutorial back. It
 * touches this record alone — games, stats, the ladder, the daily record,
 * puzzle progress and the Pro unlock each live under their own key.
 */
export function resetSettings(prev: AppSettings): AppSettings {
  return { ...DEFAULT_SETTINGS, seenIntro: prev.seenIntro };
}
