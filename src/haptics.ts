import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

let enabled = true;
/** Called by the settings layer; haptics are skipped entirely when off. */
export function setHapticsEnabled(on: boolean) {
  enabled = on;
}

/** Best-effort haptic feedback; silently does nothing on web, when disabled, or when unsupported. */
const safe = (fn: () => Promise<void>) => {
  if (Platform.OS === 'web' || !enabled) return;
  fn().catch(() => {});
};

export const haptics = {
  move: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  capture: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  check: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  caught: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  wrong: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  win: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  loss: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
