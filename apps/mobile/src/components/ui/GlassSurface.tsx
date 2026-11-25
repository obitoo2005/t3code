import { GlassView, isGlassEffectAPIAvailable } from "expo-glass-effect";
import type { ReactNode, Ref } from "react";
import {
  Platform,
  View,
  type ColorValue,
  type ViewInstance,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import { withUniwind } from "uniwind";

import { MOBILE_SHAPE } from "../../lib/designTokens";
import { cn } from "../../lib/cn";
import { useAppearancePreferences } from "../../features/settings/appearance/AppearancePreferencesProvider";
import { GlassBackdrop } from "./GlassBackdrop";

// Explicit mappings keep the native glassEffectStyle enum out of style-array conversion.
const ThemedGlassView = withUniwind(GlassView, {
  style: { fromClassName: "className" },
  tintColor: { fromClassName: "tintColorClassName", styleProperty: "accentColor" },
});

interface GlassSurfaceProps extends ViewProps {
  readonly ref?: Ref<ViewInstance>;
  readonly children: ReactNode;
  readonly glassEffectStyle?: "clear" | "regular" | "none";
  // null leaves UIKit's material untinted instead of applying the theme tint.
  readonly tintColor?: ColorValue | null;
  readonly tintColorClassName?: string;
  readonly chrome?: "default" | "none";
  readonly fallbackColor?: ColorValue;
  readonly fallbackClassName?: string;
}

export function GlassSurface({
  ref,
  children,
  glassEffectStyle = "regular",
  chrome = "default",
  tintColor,
  tintColorClassName,
  fallbackColor,
  fallbackClassName,
  className,
  style,
  ...props
}: GlassSurfaceProps) {
  const { themeAppearance, themeId } = useAppearancePreferences();
  const isDarkMode = themeAppearance === "dark";
  const isCrimson = themeId === "rias-crimson";
  const supportsGlass = Platform.OS === "ios" && isGlassEffectAPIAvailable();
  const hasShadow = chrome !== "none" && Platform.OS !== "android";
  const surfaceStyle: ViewStyle = {
    borderRadius: MOBILE_SHAPE.glass,
    overflow: "hidden",
    shadowColor: hasShadow ? "#000000" : "transparent",
    shadowOpacity: hasShadow ? (isDarkMode ? 0.22 : 0.08) : 0,
    shadowRadius: hasShadow ? 28 : 0,
    shadowOffset: { width: 0, height: hasShadow ? 14 : 0 },
    elevation: hasShadow ? 12 : 0,
  };

  if (supportsGlass) {
    return (
      <ThemedGlassView
        {...props}
        ref={ref}
        className={cn(
          chrome === "none"
            ? "border-0 border-transparent bg-transparent"
            : "border border-border bg-glass-surface",
          className,
        )}
        glassEffectStyle={glassEffectStyle}
        tintColor={tintColor == null ? undefined : String(tintColor)}
        tintColorClassName={
          tintColorClassName ?? (tintColor === undefined ? "accent-glass-tint" : undefined)
        }
        colorScheme={isDarkMode ? "dark" : "light"}
        style={[surfaceStyle, style]}
      >
        {children}
      </ThemedGlassView>
    );
  }

  const androidGlassRim: ViewStyle | undefined =
    Platform.OS === "android" && chrome !== "none"
      ? {
          borderWidth: 1,
          borderColor: isCrimson
            ? isDarkMode
              ? "rgba(244, 63, 94, 0.24)"
              : "rgba(190, 18, 60, 0.16)"
            : isDarkMode
              ? "rgba(255, 255, 255, 0.14)"
              : "rgba(0, 0, 0, 0.09)",
          borderTopColor: isCrimson
            ? isDarkMode
              ? "rgba(255, 136, 162, 0.40)"
              : "rgba(255, 255, 255, 0.94)"
            : isDarkMode
              ? "rgba(255, 255, 255, 0.28)"
              : "rgba(255, 255, 255, 0.94)",
          borderBottomColor: isCrimson
            ? isDarkMode
              ? "rgba(225, 29, 72, 0.14)"
              : "rgba(190, 18, 60, 0.18)"
            : isDarkMode
              ? "rgba(255, 255, 255, 0.07)"
              : "rgba(0, 0, 0, 0.11)",
          boxShadow: [
            {
              offsetX: 0,
              offsetY: 10,
              blurRadius: 28,
              spreadDistance: -4,
              color: isCrimson
                ? isDarkMode
                  ? "rgba(190, 18, 60, 0.22)"
                  : "rgba(190, 18, 60, 0.12)"
                : isDarkMode
                  ? "rgba(0, 0, 0, 0.50)"
                  : "rgba(0, 0, 0, 0.14)",
            },
          ],
        }
      : undefined;

  return (
    <View
      {...props}
      ref={ref}
      className={cn(
        chrome === "none" || Platform.OS === "android"
          ? "border-0 border-transparent"
          : "border border-border",
        fallbackClassName,
        className,
      )}
      style={[surfaceStyle, androidGlassRim, style]}
    >
      <GlassBackdrop fallbackColor={fallbackColor} />
      {children}
    </View>
  );
}
