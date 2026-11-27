export const VIP_VAULT_PIN_KEY = "rias.vip_vault.pin";
export const VIP_PIN_LENGTH = 4;
export const VIP_ZOOM_MIN = 1;
export const VIP_ZOOM_MAX = 4;
export const VIP_ZOOM_DOUBLE_TAP = 2.25;
export const VIP_ZOOM_SNAP_RESET_THRESHOLD = 1.05;
export const VIP_WIDE_OR_SQUARE_RATIO = 0.92;
export const VIP_MAX_VISIBLE_DOTS = 10;

export type VipVaultGateState = "locked" | "unlocked";
export type VipPinAttemptResult = "incomplete" | "match" | "mismatch";

export interface VipPinStorage {
  readonly getItemAsync: (key: string) => Promise<string | null>;
  readonly setItemAsync: (key: string, value: string) => Promise<void>;
  readonly deleteItemAsync: (key: string) => Promise<void>;
}

export interface VisibleDotWindow {
  readonly start: number;
  readonly end: number;
  readonly indices: readonly number[];
  readonly hasLeadingMore: boolean;
  readonly hasTrailingMore: boolean;
}

/** Validates that a candidate PIN is strictly 4 ASCII digits. */
export function isValidVipPin(raw: string | null | undefined): raw is string {
  return typeof raw === "string" && /^\d{4}$/.test(raw);
}

/** Normalizes a stored PIN value, returning null for empty or corrupt data. */
export function normalizeStoredVipPin(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return isValidVipPin(trimmed) ? trimmed : null;
}

/** Appends a single numeric digit to an in-progress PIN entry up to 4 digits. */
export function appendPinDigit(current: string, digit: string): string {
  if (!/^\d$/.test(digit)) return current;
  if (current.length >= VIP_PIN_LENGTH) return current;
  return `${current}${digit}`;
}

/** Removes the last digit from an in-progress PIN entry. */
export function removeLastPinDigit(current: string): string {
  if (current.length === 0) return "";
  return current.slice(0, -1);
}

/** Evaluates a 4-digit PIN attempt against the stored PIN. */
export function evaluatePinAttempt(entered: string, storedPin: string): VipPinAttemptResult {
  if (entered.length < VIP_PIN_LENGTH) return "incomplete";
  return entered === storedPin ? "match" : "mismatch";
}

/** Determines whether the vault should start locked when opened. */
export function resolveVaultInitialGateState(storedPin: string | null): VipVaultGateState {
  return isValidVipPin(storedPin) ? "locked" : "unlocked";
}

/** Clamps a slide index to the valid bounds for the given item count. */
export function clampSlideIndex(index: number, itemCount: number): number {
  if (!Number.isFinite(index) || itemCount <= 0) return 0;
  return Math.max(0, Math.min(Math.trunc(index), itemCount - 1));
}

/** Computes the active page index from a horizontal pager's scroll offset and slide width. */
export function computeActiveSlideIndex(
  contentOffsetX: number,
  slideWidth: number,
  itemCount: number,
): number {
  if (!Number.isFinite(contentOffsetX) || !Number.isFinite(slideWidth) || slideWidth <= 0) {
    return 0;
  }
  if (itemCount <= 0) return 0;
  return clampSlideIndex(Math.round(contentOffsetX / slideWidth), itemCount);
}

/**
 * Computes a bounded sliding window of indicator dot indices so large vaults (20+ items)
 * never overflow the modal footer while always keeping the active dot visible.
 */
export function computeVisibleDotWindow(
  activeIndex: number,
  totalCount: number,
  maxDots: number = VIP_MAX_VISIBLE_DOTS,
): VisibleDotWindow {
  if (totalCount <= 0 || maxDots <= 0) {
    return {
      start: 0,
      end: -1,
      indices: [],
      hasLeadingMore: false,
      hasTrailingMore: false,
    };
  }
  const safeMax = Math.max(1, Math.trunc(maxDots));
  const safeActive = clampSlideIndex(activeIndex, totalCount);
  if (totalCount <= safeMax) {
    const indices = Array.from({ length: totalCount }, (_, i) => i);
    return {
      start: 0,
      end: totalCount - 1,
      indices,
      hasLeadingMore: false,
      hasTrailingMore: false,
    };
  }

  const half = Math.floor(safeMax / 2);
  let start = safeActive - half;
  if (start < 0) start = 0;
  let end = start + safeMax - 1;
  if (end >= totalCount) {
    end = totalCount - 1;
    start = Math.max(0, end - safeMax + 1);
  }
  const indices = Array.from({ length: end - start + 1 }, (_, i) => start + i);
  return {
    start,
    end,
    indices,
    hasLeadingMore: start > 0,
    hasTrailingMore: end < totalCount - 1,
  };
}

/** Returns true for landscape / 16:9 / near-square media that should render uncropped (`contain`). */
export function isWideOrSquareMedia(
  width: number | undefined,
  height: number | undefined,
): boolean {
  return Boolean(
    width !== undefined &&
      height !== undefined &&
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      width > 0 &&
      height > 0 &&
      width >= height * VIP_WIDE_OR_SQUARE_RATIO,
  );
}

/** Computes a bounded aspect ratio for wide or square media frames. */
export function computeMediaAspectRatio(
  width: number | undefined,
  height: number | undefined,
): number | null {
  if (
    width === undefined ||
    height === undefined ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  return Math.max(VIP_WIDE_OR_SQUARE_RATIO, Math.min(16 / 9, width / height));
}

/** Determines whether a VIP video slide should actively play right now. */
export function shouldPlayVipVideo(params: {
  readonly mediaType: "image" | "video";
  readonly isActive: boolean;
  readonly modalVisible: boolean;
  readonly isUnlocked: boolean;
  readonly userPaused: boolean;
  readonly appActive: boolean;
}): boolean {
  return (
    params.mediaType === "video" &&
    params.isActive &&
    params.modalVisible &&
    params.isUnlocked &&
    !params.userPaused &&
    params.appActive
  );
}

/** Clamps a pinch zoom scale to the supported [1x, 4x] range. */
export function clampVipZoomScale(scale: number): number {
  if (!Number.isFinite(scale)) return VIP_ZOOM_MIN;
  return Math.min(Math.max(scale, VIP_ZOOM_MIN), VIP_ZOOM_MAX);
}

/** Returns true when a released pinch gesture should smoothly spring back to 1x. */
export function shouldResetZoomOnRelease(scale: number): boolean {
  return !Number.isFinite(scale) || scale <= VIP_ZOOM_SNAP_RESET_THRESHOLD;
}

/** Computes the target zoom scale for a double-tap gesture (toggles 1x <-> 2.25x). */
export function nextDoubleTapZoomScale(currentScale: number): number {
  return shouldResetZoomOnRelease(currentScale) ? VIP_ZOOM_DOUBLE_TAP : VIP_ZOOM_MIN;
}

/** Clamps pan translation so zoomed media never detaches past its viewport edges. */
export function clampZoomTranslation(
  offsetX: number,
  offsetY: number,
  scale: number,
  viewportWidth: number,
  viewportHeight: number,
): { readonly x: number; readonly y: number } {
  const safeScale = clampVipZoomScale(scale);
  const safeW = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 0;
  const safeH = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 0;
  const maxX = Math.max(0, ((safeScale - 1) * safeW) / 2);
  const maxY = Math.max(0, ((safeScale - 1) * safeH) / 2);
  const rawX = Number.isFinite(offsetX) ? offsetX : 0;
  const rawY = Number.isFinite(offsetY) ? offsetY : 0;
  const clampedX = Math.min(Math.max(rawX, -maxX), maxX);
  const clampedY = Math.min(Math.max(rawY, -maxY), maxY);
  return {
    x: clampedX === 0 ? 0 : clampedX,
    y: clampedY === 0 ? 0 : clampedY,
  };
}

async function resolveSecureStore(storage?: VipPinStorage): Promise<VipPinStorage | null> {
  if (storage) return storage;
  try {
    return await import("expo-secure-store");
  } catch {
    return null;
  }
}

/** Loads and validates the optional 4-digit VIP vault PIN from SecureStore (lazy-imported). */
export async function loadVipVaultPin(storage?: VipPinStorage): Promise<string | null> {
  try {
    const store = await resolveSecureStore(storage);
    if (!store) return null;
    const raw = await store.getItemAsync(VIP_VAULT_PIN_KEY);
    return normalizeStoredVipPin(raw);
  } catch {
    return null;
  }
}

/** Persists a validated 4-digit VIP vault PIN in SecureStore. */
export async function saveVipVaultPin(pin: string, storage?: VipPinStorage): Promise<boolean> {
  if (!isValidVipPin(pin)) return false;
  try {
    const store = await resolveSecureStore(storage);
    if (!store) return false;
    await store.setItemAsync(VIP_VAULT_PIN_KEY, pin);
    return true;
  } catch {
    return false;
  }
}

/** Removes any stored VIP vault PIN from SecureStore. */
export async function clearVipVaultPin(storage?: VipPinStorage): Promise<boolean> {
  try {
    const store = await resolveSecureStore(storage);
    if (!store) return false;
    await store.deleteItemAsync(VIP_VAULT_PIN_KEY);
    return true;
  } catch {
    return false;
  }
}
