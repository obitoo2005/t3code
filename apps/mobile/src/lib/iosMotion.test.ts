import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("react-native-reanimated", () => ({
  Easing: { out: () => () => 0, cubic: () => 0 },
  ReduceMotion: { System: "system" },
}));

import {
  computeRubberBandOffset,
  IOS_EXIT_UNMOUNT_MS,
  IOS_SPRING_DIALOG,
  IOS_SPRING_LIQUID_LENS,
  IOS_SPRING_MENU,
  IOS_SPRING_SHEET,
  IOS_SPRING_SMOOTH,
  IOS_SPRING_SNAPPY,
} from "./iosMotion";

describe("iosMotion", () => {
  it("applies monotonic symmetric rubber-band damping toward the configured limit", () => {
    expect(computeRubberBandOffset(0, 40)).toBe(0);
    const small = computeRubberBandOffset(-20, 40);
    const large = computeRubberBandOffset(-200, 40);
    expect(small).toBeLessThan(0);
    expect(large).toBeLessThan(small);
    expect(Math.abs(large)).toBeLessThan(40);
    expect(computeRubberBandOffset(20, 40)).toBeCloseTo(-small, 6);
  });

  it("exposes valid positive spring parameters across all presets", () => {
    for (const preset of [
      IOS_SPRING_SNAPPY,
      IOS_SPRING_SMOOTH,
      IOS_SPRING_SHEET,
      IOS_SPRING_MENU,
      IOS_SPRING_LIQUID_LENS,
      IOS_SPRING_DIALOG,
    ]) {
      expect(preset.damping).toBeGreaterThan(0);
      expect(preset.stiffness).toBeGreaterThan(0);
      expect(preset.mass).toBeGreaterThan(0);
    }
    expect(IOS_EXIT_UNMOUNT_MS).toBeGreaterThan(100);
  });
});
