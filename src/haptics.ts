import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** Best-effort haptic feedback; silently does nothing on web or when unsupported. */
const safe = (fn: () => Promise<void>) => {
  if (Platform.OS === 'web') return;
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
