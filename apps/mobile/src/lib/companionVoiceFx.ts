import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { Platform } from "react-native";

import {
  getAkenoPosePackSnapshot,
  type CompanionVoiceCharacter,
  type CompanionVoiceRole,
  type SyncedCompanionVoice,
} from "./akenoPosePack";
import { isAudioSessionBusy } from "./audioSession";
import { isCompanionVoiceFxEnabled } from "./voiceFxState";

const VOICE_VOLUME = 0.85;
const MAX_CACHED_PLAYERS = 12;
const GLOBAL_VOICE_COOLDOWN_MS = 850;
const DONE_VOICE_COOLDOWN_MS = 450;

let audioModeConfigured = false;
let lastVoicePlayedAt = 0;
const lastPlayedIdByCharacter: Partial<Record<CompanionVoiceCharacter, string>> = {};
const cachedPlayers = new Map<string, AudioPlayer>();

/**
 * Pure clip selector for companion anime voice SFX.
 * - Isolates clips to the requested character (`akeno` or `rias`).
 * - Prefers clips matching `role`; falls back to `"tap"` clips, then any clip for that character.
 * - Avoids repeating `lastPlayedId` whenever more than 1 candidate exists in the matched pool.
 */
export function pickCompanionVoiceClip(
  voices: readonly SyncedCompanionVoice[],
  character: CompanionVoiceCharacter,
  role: CompanionVoiceRole,
  lastPlayedId?: string | null,
): SyncedCompanionVoice | null {
  const characterVoices = voices.filter((entry) => entry.character === character);
  if (characterVoices.length === 0) return null;

  const roleMatches = characterVoices.filter((entry) => entry.role === role);
  const pool =
    roleMatches.length > 0
      ? roleMatches
      : (() => {
          const tapMatches = characterVoices.filter((entry) => entry.role === "tap");
          return tapMatches.length > 0 ? tapMatches : characterVoices;
        })();

  const nonRepeating =
    pool.length > 1 && lastPlayedId
      ? pool.filter((entry) => entry.id !== lastPlayedId)
      : pool;
  const candidates = nonRepeating.length > 0 ? nonRepeating : pool;
  return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
}

function getOrCreateVoicePlayer(uri: string): AudioPlayer | null {
  const existing = cachedPlayers.get(uri);
  if (existing) {
    // Refresh recency for LRU eviction.
    cachedPlayers.delete(uri);
    cachedPlayers.set(uri, existing);
    return existing;
  }

  while (cachedPlayers.size >= MAX_CACHED_PLAYERS) {
    const oldestKey = cachedPlayers.keys().next().value;
    if (oldestKey === undefined) break;
    const evicted = cachedPlayers.get(oldestKey);
    cachedPlayers.delete(oldestKey);
    try {
      evicted?.remove();
    } catch {
      // Ignore native release errors on eviction.
    }
  }

  try {
    const player = createAudioPlayer({ uri });
    player.volume = VOICE_VOLUME;
    cachedPlayers.set(uri, player);
    return player;
  } catch {
    return null;
  }
}

async function ensureAmbientVoiceAudioMode(): Promise<void> {
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
 * Plays a synced anime voice clip for the specified companion character and interaction role.
 * Respects Voice FX toggle, audio session ownership, and anti-spam cooldown without consuming
 * cooldown if the character has no synced voice clips available.
 */
export function playCompanionVoice(
  character: CompanionVoiceCharacter,
  role: CompanionVoiceRole,
  options?: { readonly force?: boolean },
): SyncedCompanionVoice | null {
  if (Platform.OS === "web") return null;
  if (!options?.force && !isCompanionVoiceFxEnabled()) return null;
  if (isAudioSessionBusy()) return null;

  const now = Date.now();
  const cooldownMs = role === "done" ? DONE_VOICE_COOLDOWN_MS : GLOBAL_VOICE_COOLDOWN_MS;
  if (!options?.force && lastVoicePlayedAt > 0 && now - lastVoicePlayedAt < cooldownMs) {
    return null;
  }

  const clip = pickCompanionVoiceClip(
    getAkenoPosePackSnapshot().voices,
    character,
    role,
    lastPlayedIdByCharacter[character],
  );
  if (!clip) return null;

  lastVoicePlayedAt = now;
  lastPlayedIdByCharacter[character] = clip.id;

  void (async () => {
    try {
      await ensureAmbientVoiceAudioMode();
      if (isAudioSessionBusy()) return;
      const player = getOrCreateVoicePlayer(clip.uri);
      if (!player) return;
      player.volume = VOICE_VOLUME;
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

  return clip;
}

/** Releases cached voice players and resets playback cooldown/history state. */
export function clearCompanionVoiceCache(): void {
  for (const player of cachedPlayers.values()) {
    try {
      player.remove();
    } catch {
      // Ignore native release errors.
    }
  }
  cachedPlayers.clear();
  audioModeConfigured = false;
  lastVoicePlayedAt = 0;
  delete lastPlayedIdByCharacter.akeno;
  delete lastPlayedIdByCharacter.rias;
}
