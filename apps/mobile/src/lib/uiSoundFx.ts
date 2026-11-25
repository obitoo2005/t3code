import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { Platform } from "react-native";

import { isAudioSessionBusy } from "./audioSession";

export type UiSoundKind = "send" | "done" | "shuffle";

const SOUND_SOURCES: Readonly<Record<UiSoundKind, number>> = {
  send: require("../../assets/sfx/sfx-send.wav"),
  done: require("../../assets/sfx/sfx-done.wav"),
  shuffle: require("../../assets/sfx/sfx-shuffle.wav"),
};

const SOUND_VOLUMES: Readonly<Record<UiSoundKind, number>> = {
  send: 0.55,
  done: 0.62,
  shuffle: 0.58,
};

let soundFxEnabled = true;
let audioModeConfigured = false;
const players = new Map<UiSoundKind, AudioPlayer>();

export function setUiSoundFxEnabled(enabled: boolean): void {
  soundFxEnabled = enabled;
}

export function isUiSoundFxEnabled(): boolean {
  return soundFxEnabled;
}

function getOrCreatePlayer(kind: UiSoundKind): AudioPlayer | null {
  const existing = players.get(kind);
  if (existing) return existing;
  try {
    const player = createAudioPlayer(SOUND_SOURCES[kind]);
    player.volume = SOUND_VOLUMES[kind];
    players.set(kind, player);
    return player;
  } catch {
    return null;
  }
}

async function ensureAmbientAudioMode(): Promise<void> {
  if (audioModeConfigured) return;
  audioModeConfigured = true;
  try {
    await setAudioModeAsync({
      allowsRecording: false,
      interruptionMode: "mixWithOthers",
      playsInSilentMode: false,
      shouldPlayInBackground: false,
    });
  } catch {
    audioModeConfigured = false;
  }
}

/**
 * Plays a short, soft glass/retro UI chime if Sound FX is enabled in Appearance settings.
 * Uses `mixWithOthers` so background music is never interrupted, and skips playback while
 * voice recording or foreground audio playback owns the shared session.
 */
export function playUiSound(kind: UiSoundKind, options?: { readonly force?: boolean }): void {
  if (Platform.OS === "web") return;
  if (!options?.force && !soundFxEnabled) return;
  if (isAudioSessionBusy()) return;

  void (async () => {
    try {
      await ensureAmbientAudioMode();
      if (isAudioSessionBusy()) return;
      const player = getOrCreatePlayer(kind);
      if (!player) return;
      player.volume = SOUND_VOLUMES[kind];
      try {
        await player.seekTo(0);
      } catch {
        // Freshly created players already start at 0s.
      }
      player.play();
    } catch {
      // Never block UI interactions if native audio playback is unavailable.
    }
  })();
}
