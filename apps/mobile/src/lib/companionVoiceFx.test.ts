import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { SyncedCompanionVoice } from "./akenoPosePack";

interface MockPlayer {
  readonly uri: string;
  volume: number;
  seekTo: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

const mockState = vi.hoisted(() => ({
  platformOs: "android" as "android" | "ios" | "web",
  audioBusy: false,
  voices: [] as SyncedCompanionVoice[],
  createdPlayers: [] as MockPlayer[],
  setAudioModeAsync: vi.fn(async () => {}),
  createAudioPlayer: vi.fn((source: { readonly uri: string }) => {
    const player: MockPlayer = {
      uri: source.uri,
      volume: 1,
      seekTo: vi.fn(async () => {}),
      play: vi.fn(),
      remove: vi.fn(),
    };
    mockState.createdPlayers.push(player);
    return player;
  }),
}));

vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return mockState.platformOs;
    },
  },
}));

vi.mock("expo-audio", () => ({
  createAudioPlayer: mockState.createAudioPlayer,
  setAudioModeAsync: mockState.setAudioModeAsync,
}));

vi.mock("./audioSession", () => ({
  isAudioSessionBusy: () => mockState.audioBusy,
}));

vi.mock("./akenoPosePack", () => ({
  getAkenoPosePackSnapshot: () => ({
    voices: mockState.voices,
  }),
}));

import {
  clearCompanionVoiceCache,
  pickCompanionVoiceClip,
  playCompanionVoice,
} from "./companionVoiceFx";
import { setCompanionVoiceFxEnabled } from "./voiceFxState";

function makeVoice(
  overrides: Partial<SyncedCompanionVoice> & Pick<SyncedCompanionVoice, "id" | "character" | "role">,
): SyncedCompanionVoice {
  return {
    uri: `file:///voices/${overrides.character}-${overrides.id}.mp3`,
    label: undefined,
    ...overrides,
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("pickCompanionVoiceClip", () => {
  it("returns null when the voices list is empty or has no clips for the character", () => {
    expect(pickCompanionVoiceClip([], "akeno", "tap")).toBeNull();
    const onlyAkeno = [makeVoice({ id: "ara", character: "akeno", role: "tap" })];
    expect(pickCompanionVoiceClip(onlyAkeno, "rias", "tap")).toBeNull();
  });

  it("isolates characters and prefers exact role matches", () => {
    const voices: SyncedCompanionVoice[] = [
      makeVoice({ id: "a-tap", character: "akeno", role: "tap", label: "Ara ara~" }),
      makeVoice({ id: "a-done", character: "akeno", role: "done", label: "Ufufu~" }),
      makeVoice({ id: "r-done", character: "rias", role: "done", label: "Good work~" }),
      makeVoice({ id: "r-pickup", character: "rias", role: "pickup", label: "Kyaa~!" }),
    ];

    expect(pickCompanionVoiceClip(voices, "akeno", "done")?.id).toBe("a-done");
    expect(pickCompanionVoiceClip(voices, "rias", "done")?.id).toBe("r-done");
    expect(pickCompanionVoiceClip(voices, "rias", "pickup")?.id).toBe("r-pickup");
  });

  it("falls back to tap clips when the requested role is missing, then to any clip for that character", () => {
    const withTap: SyncedCompanionVoice[] = [
      makeVoice({ id: "a-tap", character: "akeno", role: "tap" }),
      makeVoice({ id: "a-done", character: "akeno", role: "done" }),
    ];
    expect(pickCompanionVoiceClip(withTap, "akeno", "pickup")?.id).toBe("a-tap");

    const withoutTap: SyncedCompanionVoice[] = [
      makeVoice({ id: "r-greet", character: "rias", role: "greet" }),
      makeVoice({ id: "a-tap", character: "akeno", role: "tap" }),
    ];
    expect(pickCompanionVoiceClip(withoutTap, "rias", "pickup")?.id).toBe("r-greet");
  });

  it("avoids repeating lastPlayedId when multiple candidates exist, but repeats when only one exists", () => {
    const twoClips: SyncedCompanionVoice[] = [
      makeVoice({ id: "c1", character: "akeno", role: "tap" }),
      makeVoice({ id: "c2", character: "akeno", role: "tap" }),
    ];

    for (let i = 0; i < 15; i += 1) {
      expect(pickCompanionVoiceClip(twoClips, "akeno", "tap", "c1")?.id).toBe("c2");
      expect(pickCompanionVoiceClip(twoClips, "akeno", "tap", "c2")?.id).toBe("c1");
    }

    const singleClip = [makeVoice({ id: "only", character: "rias", role: "done" })];
    expect(pickCompanionVoiceClip(singleClip, "rias", "done", "only")?.id).toBe("only");
  });
});

describe("playCompanionVoice", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-28T12:00:00.000Z"));
    clearCompanionVoiceCache();
    setCompanionVoiceFxEnabled(true);
    mockState.platformOs = "android";
    mockState.audioBusy = false;
    mockState.voices = [];
    mockState.createdPlayers = [];
    mockState.createAudioPlayer.mockClear();
    mockState.setAudioModeAsync.mockClear();
  });

  afterEach(() => {
    clearCompanionVoiceCache();
    vi.useRealTimers();
  });

  it("respects web platform, voice FX enabled flag, force option, and busy audio session", async () => {
    mockState.voices = [makeVoice({ id: "a1", character: "akeno", role: "tap", label: "Ara ara~" })];

    mockState.platformOs = "web";
    expect(playCompanionVoice("akeno", "tap")).toBeNull();
    mockState.platformOs = "android";

    setCompanionVoiceFxEnabled(false);
    expect(playCompanionVoice("akeno", "tap")).toBeNull();

    const forced = playCompanionVoice("akeno", "tap", { force: true });
    expect(forced?.id).toBe("a1");
    await flushMicrotasks();
    expect(mockState.setAudioModeAsync).toHaveBeenCalledWith({
      allowsRecording: false,
      interruptionMode: "mixWithOthers",
      playsInSilentMode: false,
      shouldPlayInBackground: false,
    });
    expect(mockState.createdPlayers).toHaveLength(1);
    expect(mockState.createdPlayers[0]?.volume).toBe(0.85);
    expect(mockState.createdPlayers[0]?.seekTo).toHaveBeenCalledWith(0);
    expect(mockState.createdPlayers[0]?.play).toHaveBeenCalledTimes(1);

    setCompanionVoiceFxEnabled(true);
    mockState.audioBusy = true;
    vi.advanceTimersByTime(1000);
    expect(playCompanionVoice("akeno", "tap")).toBeNull();
  });

  it("enforces cooldowns without consuming cooldown when a character has no synced clips", () => {
    mockState.voices = [
      makeVoice({ id: "a-done", character: "akeno", role: "done" }),
      makeVoice({ id: "a-tap", character: "akeno", role: "tap" }),
    ];

    // Rias has no voices yet: must return null and NOT block Akeno immediately after.
    expect(playCompanionVoice("rias", "done")).toBeNull();
    expect(playCompanionVoice("akeno", "done")?.id).toBe("a-done");

    // Within 450ms, even "done" is blocked (prevents dual-pet simultaneous speech).
    vi.advanceTimersByTime(200);
    expect(playCompanionVoice("akeno", "done")).toBeNull();
    expect(playCompanionVoice("akeno", "tap")).toBeNull();

    // At 500ms (>= 450ms but < 850ms), "tap" is still blocked while "done" is allowed.
    vi.advanceTimersByTime(300);
    expect(playCompanionVoice("akeno", "tap")).toBeNull();
    expect(playCompanionVoice("akeno", "done")?.id).toBe("a-done");

    // After 850ms, normal "tap" is allowed again.
    vi.advanceTimersByTime(850);
    expect(playCompanionVoice("akeno", "tap")?.id).toBe("a-tap");
  });

  it("caps cached AudioPlayer instances at 12 and calls remove() on eviction", async () => {
    for (let i = 1; i <= 14; i += 1) {
      mockState.voices = [makeVoice({ id: `v${i}`, character: "akeno", role: "tap" })];
      const clip = playCompanionVoice("akeno", "tap");
      expect(clip?.id).toBe(`v${i}`);
      await flushMicrotasks();
      vi.advanceTimersByTime(1000);
    }

    expect(mockState.createdPlayers).toHaveLength(14);
    expect(mockState.createdPlayers[0]?.remove).toHaveBeenCalledTimes(1);
    expect(mockState.createdPlayers[1]?.remove).toHaveBeenCalledTimes(1);
    expect(mockState.createdPlayers[2]?.remove).not.toHaveBeenCalled();
  });
});
