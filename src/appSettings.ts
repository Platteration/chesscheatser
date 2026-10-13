/**
 * The shape of the `appsettings` record: its types and its defaults. They live
 * apart from `settings.tsx`, the provider, because that file pulls in React
 * Native (through the haptics and sound gates) and the test runner cannot load
 * it — and both the validator's round-trip test and the settings-contract test
 * need the defaults themselves, not a copy that can drift. `validate.ts` reads
 * the types from here for the same reason. Nothing in this file may import
 * React or React Native.
 */

import { DEFAULT_AURA } from './cosmetics';

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
  /** Which comeback aura recolours the powered board frame and meter. */
  aura: string;
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
  aura: DEFAULT_AURA,
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

/** The three cosmetic choices of the record: the board, the piece set and the comeback aura. */
export type CosmeticChoice = Pick<AppSettings, 'boardTheme' | 'pieceStyle' | 'aura'>;

/**
 * The board, pieces and aura the game draws for the player's choices. `unlocked` is null where
 * the device keeps the record of what was bought (the local store: every phone, a website with
 * no backend), and every choice is drawn as it stands. Where it does not (the website's shop,
 * whose record is the server's, and the moment before the website has said whether it has one),
 * `unlocked` is what is earned or reported bought (`unlockedCosmetics`), and a choice it does not
 * hold is drawn as its default: a purchase refunded, signed out of or deleted with the account,
 * and a preview chosen on the device before the shop was switched on, stop being drawn. The
 * record itself is left as it is, so the choice comes back with the purchase, and a slow or
 * failed answer from the site never rewrites what the player picked. Every default is free.
 */
export function drawnCosmetics(choice: CosmeticChoice, unlocked: ReadonlySet<string> | null): CosmeticChoice {
  const keep = <K extends keyof CosmeticChoice>(key: K): CosmeticChoice[K] => (!unlocked || unlocked.has(choice[key]) ? choice[key] : DEFAULT_SETTINGS[key]);
  return { boardTheme: keep('boardTheme'), pieceStyle: keep('pieceStyle'), aura: keep('aura') };
}

/**
 * Reset to defaults keeps what the player has already *seen*: `seenIntro`
 * records that the first-game explanation was dismissed, not a preference,
 * and nobody resetting their colours is asking for the tutorial back. It
 * touches this record alone — games, stats, the ladder, the daily record,
 * puzzle progress and purchases each live under their own key.
 */
export function resetSettings(prev: AppSettings): AppSettings {
  return { ...DEFAULT_SETTINGS, seenIntro: prev.seenIntro };
}
