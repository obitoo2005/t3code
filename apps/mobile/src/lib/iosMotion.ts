import { Easing, ReduceMotion } from "react-native-reanimated";

/**
 * Apple iOS 26-calibrated motion physics for 120Hz / 165Hz Android displays.
 * Tuned to match UIKit / SwiftUI spring response & damping ratios: instant frame-1
 * responsiveness with velvety, zero-jitter deceleration.
 */

export const IOS_SPRING_SNAPPY = {
  damping: 22,
  stiffness: 460,
  mass: 0.64,
  reduceMotion: ReduceMotion.System,
} as const;

export const IOS_SPRING_SMOOTH = {
  damping: 28,
  stiffness: 330,
  mass: 0.82,
  reduceMotion: ReduceMotion.System,
} as const;

export const IOS_SPRING_SHEET = {
  damping: 31,
  stiffness: 360,
  mass: 0.88,
  reduceMotion: ReduceMotion.System,
} as const;

export const IOS_SPRING_MENU = {
  damping: 25,
  stiffness: 440,
  mass: 0.68,
  reduceMotion: ReduceMotion.System,
} as const;

export const IOS_SPRING_LIQUID_LENS = {
  damping: 22,
  stiffness: 360,
  mass: 0.72,
  reduceMotion: ReduceMotion.System,
} as const;

export const IOS_SPRING_DIALOG = {
  damping: 26,
  stiffness: 420,
  mass: 0.72,
  reduceMotion: ReduceMotion.System,
} as const;

export const IOS_TIMING_EXIT = {
  duration: 155,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
} as const;

export const IOS_TIMING_BACKDROP_IN = {
  duration: 190,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
} as const;

export const IOS_TIMING_BACKDROP_OUT = {
  duration: 145,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
} as const;

export const IOS_TIMING_TAB_REVEAL = {
  duration: 175,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
} as const;

export const IOS_EXIT_UNMOUNT_MS = 160;

/**
 * Apple-style hyperbolic rubber-band resistance for over-dragging a bottom sheet upward.
 * Preserves sign and smoothly saturates toward `±limit`.
 */
export function computeRubberBandOffset(offset: number, limit = 44): number {
  "worklet";
  if (offset === 0 || limit <= 0) return 0;
  const abs = Math.abs(offset);
  const damped = (abs * limit * 0.55) / (abs + limit * 0.55);
  return offset < 0 ? -damped : damped;
}
