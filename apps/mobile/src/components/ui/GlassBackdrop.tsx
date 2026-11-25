import { BlurView } from "expo-blur";
import { use } from "react";
import { Platform, StyleSheet, View, type ColorValue } from "react-native";

import { useAppearancePreferences } from "../../features/settings/appearance/AppearancePreferencesProvider";
import { themeColorWithAlpha } from "../../lib/mobileTheme";
import { AndroidBlurTargetContext } from "./AndroidBlurTargetContext";

export function GlassBackdrop(props: { readonly fallbackColor?: ColorValue }) {
  const { themeAppearance, themeVariables } = useAppearancePreferences();
  const isDark = themeAppearance === "dark";
  const androidBlurTarget = use(AndroidBlurTargetContext);
  const supportsIosBlur = Platform.OS === "ios";
  const supportsAndroidBlur = Platform.OS === "android" && androidBlurTarget !== null;
  const color = props.fallbackColor ?? themeVariables["--color-glass-fallback"];

  if (supportsAndroidBlur) {
    const tintOverlay = isDark ? "rgba(24, 24, 28, 0.62)" : "rgba(255, 255, 255, 0.72)";
    return (
      <>
        <BlurView
          pointerEvents="none"
          blurTarget={androidBlurTarget}
          blurMethod="dimezisBlurViewSdk31Plus"
          blurReductionFactor={4}
          intensity={isDark ? 44 : 56}
          tint={isDark ? "systemChromeMaterialDark" : "systemChromeMaterialLight"}
          style={StyleSheet.absoluteFill}
        />
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: tintOverlay }]}
        />
      </>
    );
  }

  const colorStyle = {
    backgroundColor:
      supportsIosBlur || typeof color !== "string" ? color : themeColorWithAlpha(color, 1),
  };

  return (
    <>
      {supportsIosBlur ? (
        <BlurView
          pointerEvents="none"
          intensity={80}
          tint={isDark ? "dark" : "default"}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View
        pointerEvents="none"
        className="absolute inset-0 bg-glass-fallback"
        style={colorStyle}
      />
    </>
  );
}
