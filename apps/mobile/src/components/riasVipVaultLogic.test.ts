import { describe, expect, it } from "vite-plus/test";

import {
  appendPinDigit,
  clampSlideIndex,
  clampVipZoomScale,
  clampZoomTranslation,
  clearVipVaultPin,
  computeActiveSlideIndex,
  computeMediaAspectRatio,
  computeVisibleDotWindow,
  evaluatePinAttempt,
  isValidVipPin,
  isWideOrSquareMedia,
  loadVipVaultPin,
  nextDoubleTapZoomScale,
  normalizeStoredVipPin,
  removeLastPinDigit,
  resolveVaultInitialGateState,
  saveVipVaultPin,
  shouldPlayVipVideo,
  shouldResetZoomOnRelease,
  VIP_VAULT_PIN_KEY,
  type VipPinStorage,
} from "./riasVipVaultLogic";

function createMemoryPinStorage(initial?: Record<string, string>): {
  readonly storage: VipPinStorage;
  readonly map: Map<string, string>;
} {
  const map = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    map,
    storage: {
      async getItemAsync(key) {
        return map.get(key) ?? null;
      },
      async setItemAsync(key, value) {
        map.set(key, value);
      },
      async deleteItemAsync(key) {
        map.delete(key);
      },
    },
  };
}

describe("VIP Vault PIN logic", () => {
  it("validates and normalizes 4-digit numeric PINs", () => {
    expect(isValidVipPin("0429")).toBe(true);
    expect(isValidVipPin("123")).toBe(false);
    expect(isValidVipPin("12345")).toBe(false);
    expect(isValidVipPin("12a4")).toBe(false);
    expect(isValidVipPin(null)).toBe(false);
    expect(normalizeStoredVipPin(" 7890 ")).toBe("7890");
    expect(normalizeStoredVipPin("corrupt")).toBeNull();
    expect(normalizeStoredVipPin(null)).toBeNull();
  });

  it("appends, deletes, and evaluates PIN attempts", () => {
    let entry = "";
    entry = appendPinDigit(entry, "1");
    entry = appendPinDigit(entry, "x"); // ignored
    entry = appendPinDigit(entry, "2");
    entry = appendPinDigit(entry, "3");
    expect(entry).toBe("123");
    expect(evaluatePinAttempt(entry, "1234")).toBe("incomplete");

    entry = appendPinDigit(entry, "4");
    entry = appendPinDigit(entry, "9"); // capped at 4
    expect(entry).toBe("1234");
    expect(evaluatePinAttempt(entry, "1234")).toBe("match");
    expect(evaluatePinAttempt(entry, "9999")).toBe("mismatch");

    expect(removeLastPinDigit(entry)).toBe("123");
    expect(removeLastPinDigit("")).toBe("");
  });

  it("resolves initial vault gate state from stored PIN", () => {
    expect(resolveVaultInitialGateState("2468")).toBe("locked");
    expect(resolveVaultInitialGateState(null)).toBe("unlocked");
    expect(resolveVaultInitialGateState("")).toBe("unlocked");
  });

  it("reads, writes, and clears the SecureStore key rias.vip_vault.pin", async () => {
    const { storage, map } = createMemoryPinStorage();
    expect(await loadVipVaultPin(storage)).toBeNull();

    expect(await saveVipVaultPin("abc", storage)).toBe(false);
    expect(map.size).toBe(0);

    expect(await saveVipVaultPin("1357", storage)).toBe(true);
    expect(map.get(VIP_VAULT_PIN_KEY)).toBe("1357");
    expect(await loadVipVaultPin(storage)).toBe("1357");

    expect(await clearVipVaultPin(storage)).toBe(true);
    expect(await loadVipVaultPin(storage)).toBeNull();
  });
});

describe("VIP Vault paging and indicator dots", () => {
  it("computes clamped active slide index from horizontal scroll offsets", () => {
    expect(computeActiveSlideIndex(0, 360, 5)).toBe(0);
    expect(computeActiveSlideIndex(355, 360, 5)).toBe(1);
    expect(computeActiveSlideIndex(720, 360, 5)).toBe(2);
    expect(computeActiveSlideIndex(5000, 360, 5)).toBe(4);
    expect(computeActiveSlideIndex(-100, 360, 5)).toBe(0);
    expect(computeActiveSlideIndex(360, 0, 5)).toBe(0);
    expect(clampSlideIndex(9, 4)).toBe(3);
    expect(clampSlideIndex(-2, 4)).toBe(0);
  });

  it("caps visible indicator dots cleanly for large vaults (20+ items)", () => {
    const small = computeVisibleDotWindow(2, 6);
    expect(small.indices).toEqual([0, 1, 2, 3, 4, 5]);
    expect(small.hasLeadingMore).toBe(false);
    expect(small.hasTrailingMore).toBe(false);

    const startWin = computeVisibleDotWindow(1, 24);
    expect(startWin.indices).toHaveLength(10);
    expect(startWin.start).toBe(0);
    expect(startWin.end).toBe(9);
    expect(startWin.hasLeadingMore).toBe(false);
    expect(startWin.hasTrailingMore).toBe(true);

    const midWin = computeVisibleDotWindow(12, 24);
    expect(midWin.indices).toHaveLength(10);
    expect(midWin.indices).toContain(12);
    expect(midWin.hasLeadingMore).toBe(true);
    expect(midWin.hasTrailingMore).toBe(true);

    const endWin = computeVisibleDotWindow(23, 24);
    expect(endWin.indices).toHaveLength(10);
    expect(endWin.start).toBe(14);
    expect(endWin.end).toBe(23);
    expect(endWin.hasLeadingMore).toBe(true);
    expect(endWin.hasTrailingMore).toBe(false);
  });
});

describe("VIP Vault media framing, video playback, and zoom math", () => {
  it("classifies wide/square vs tall portrait media accurately", () => {
    expect(isWideOrSquareMedia(1920, 1080)).toBe(true);
    expect(isWideOrSquareMedia(1000, 1000)).toBe(true);
    expect(isWideOrSquareMedia(920, 1000)).toBe(true);
    expect(isWideOrSquareMedia(800, 1200)).toBe(false);
    expect(isWideOrSquareMedia(undefined, 1000)).toBe(false);

    expect(computeMediaAspectRatio(1920, 1080)).toBeCloseTo(16 / 9, 4);
    expect(computeMediaAspectRatio(3000, 1000)).toBeCloseTo(16 / 9, 4);
    expect(computeMediaAspectRatio(1000, 1000)).toBe(1);
    expect(computeMediaAspectRatio(undefined, 1000)).toBeNull();
  });

  it("plays videos only when active, visible, unlocked, unpaused, and foregrounded", () => {
    const base = {
      mediaType: "video" as const,
      isActive: true,
      modalVisible: true,
      isUnlocked: true,
      userPaused: false,
      appActive: true,
    };
    expect(shouldPlayVipVideo(base)).toBe(true);
    expect(shouldPlayVipVideo({ ...base, mediaType: "image" })).toBe(false);
    expect(shouldPlayVipVideo({ ...base, isActive: false })).toBe(false);
    expect(shouldPlayVipVideo({ ...base, modalVisible: false })).toBe(false);
    expect(shouldPlayVipVideo({ ...base, isUnlocked: false })).toBe(false);
    expect(shouldPlayVipVideo({ ...base, userPaused: true })).toBe(false);
    expect(shouldPlayVipVideo({ ...base, appActive: false })).toBe(false);
  });

  it("clamps zoom scale, double-tap targets, reset thresholds, and pan bounds", () => {
    expect(clampVipZoomScale(0.5)).toBe(1);
    expect(clampVipZoomScale(2.5)).toBe(2.5);
    expect(clampVipZoomScale(8)).toBe(4);
    expect(clampVipZoomScale(Number.NaN)).toBe(1);

    expect(shouldResetZoomOnRelease(1)).toBe(true);
    expect(shouldResetZoomOnRelease(1.05)).toBe(true);
    expect(shouldResetZoomOnRelease(1.06)).toBe(false);

    expect(nextDoubleTapZoomScale(1)).toBe(2.25);
    expect(nextDoubleTapZoomScale(1.04)).toBe(2.25);
    expect(nextDoubleTapZoomScale(2.25)).toBe(1);

    expect(clampZoomTranslation(500, -500, 1, 300, 500)).toEqual({ x: 0, y: 0 });
    expect(clampZoomTranslation(500, -500, 2, 300, 500)).toEqual({ x: 150, y: -250 });
    expect(clampZoomTranslation(40, -60, 2, 300, 500)).toEqual({ x: 40, y: -60 });
  });
});
