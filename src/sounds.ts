import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

/** Short synthesized effects (see assets/sounds). Played best-effort; failures are ignored. */
const SOURCES = {
  move: require('../assets/sounds/move.wav'),
  capture: require('../assets/sounds/capture.wav'),
  check: require('../assets/sounds/check.wav'),
  busted: require('../assets/sounds/busted.wav'),
  wrong: require('../assets/sounds/wrong.wav'),
  bonus: require('../assets/sounds/bonus.wav'),
  win: require('../assets/sounds/win.wav'),
  lose: require('../assets/sounds/lose.wav'),
} as const;

export type SoundName = keyof typeof SOURCES;

let enabled = true;
let modeSet = false;
const players: Partial<Record<SoundName, AudioPlayer>> = {};

export function setSoundsEnabled(on: boolean) {
  enabled = on;
}

export function playSound(name: SoundName) {
  if (!enabled) return;
  try {
    if (!modeSet) {
      modeSet = true;
      setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(() => {});
    }
    let p = players[name];
    if (!p) {
      p = createAudioPlayer(SOURCES[name]);
      p.volume = 0.8;
      players[name] = p;
    }
    p.seekTo(0).catch(() => {});
    p.play();
  } catch {
    // Audio is optional.
  }
}
