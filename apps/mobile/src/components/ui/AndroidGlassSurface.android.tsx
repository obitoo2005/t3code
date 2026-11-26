import { BlurView } from "expo-blur";
import { use, type ComponentRef, type ReactNode, type RefObject } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type Insets,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { useAppearancePreferences } from "../../features/settings/appearance/AppearancePreferencesProvider";
import { IOS_SPRING_SNAPPY, IOS_TIMING_EXIT } from "../../lib/iosMotion";
import { themeColorWithAlpha } from "../../lib/mobileTheme";
import { AndroidBlurTargetContext } from "./AndroidBlurTargetContext";

export type AndroidGlassTone = "chrome" | "elevated" | "composer" | "menu";

export interface AndroidGlassSurfaceProps extends ViewProps {
  readonly children?: ReactNode;
  readonly radius?: number;
  readonly intensity?: number;
  readonly tone?: AndroidGlassTone;
  readonly blurTarget?: RefObject<ComponentRef<typeof View> | null> | null;
  readonly contentStyle?: StyleProp<ViewStyle>;
}

function glassPalette(
  isDark: boolean,
  tone: AndroidGlassTone,
  hasLiveBlur: boolean,
  accentStyle: "default" | "crimson" | "violet",
) {
  if (isDark) {
    if (accentStyle === "crimson") {
      const tint =
        tone === "menu"
          ? hasLiveBlur
            ? "rgba(30, 15, 21, 0.76)"
            : "rgba(28, 14, 20, 0.95)"
          : tone === "composer"
            ? hasLiveBlur
              ? "rgba(32, 16, 22, 0.68)"
              : "rgba(29, 15, 21, 0.92)"
            : tone === "elevated"
              ? hasLiveBlur
                ? "rgba(38, 19, 27, 0.60)"
                : "rgba(34, 17, 24, 0.90)"
              : hasLiveBlur
                ? "rgba(34, 17, 24, 0.58)"
                : "rgba(30, 15, 21, 0.90)";
      return {
        tint,
        border: "rgba(244, 63, 94, 0.24)",
        borderTop: "rgba(255, 136, 162, 0.42)",
        borderBottom: tone === "menu" ? "rgba(225, 29, 72, 0.14)" : "rgba(225, 29, 72, 0.12)",
        sheenColor: "255, 206, 220",
        sheenTop: tone === "menu" ? 0.14 : 0.16,
        sheenMid: tone === "menu" ? 0.025 : 0.022,
        sheenBottom: 0.06,
      };
    }
    if (accentStyle === "violet") {
      const tint =
        tone === "menu"
          ? hasLiveBlur
            ? "rgba(24, 16, 34, 0.76)"
            : "rgba(22, 15, 31, 0.95)"
          : tone === "composer"
            ? hasLiveBlur
              ? "rgba(26, 18, 36, 0.68)"
              : "rgba(24, 16, 33, 0.92)"
            : tone === "elevated"
              ? hasLiveBlur
                ? "rgba(32, 22, 44, 0.60)"
                : "rgba(29, 20, 40, 0.90)"
              : hasLiveBlur
                ? "rgba(28, 19, 39, 0.58)"
                : "rgba(25, 17, 35, 0.90)";
      return {
        tint,
        border: "rgba(168, 85, 247, 0.25)",
        borderTop: "rgba(208, 166, 255, 0.42)",
        borderBottom: tone === "menu" ? "rgba(147, 51, 234, 0.15)" : "rgba(147, 51, 234, 0.13)",
        sheenColor: "234, 212, 255",
        sheenTop: tone === "menu" ? 0.14 : 0.16,
        sheenMid: tone === "menu" ? 0.025 : 0.022,
        sheenBottom: 0.06,
      };
    }
    const tint =
      tone === "menu"
        ? hasLiveBlur
          ? "rgba(22, 22, 28, 0.74)"
          : "rgba(23, 23, 29, 0.94)"
        : tone === "composer"
          ? hasLiveBlur
            ? "rgba(24, 24, 28, 0.64)"
            : "rgba(24, 24, 28, 0.90)"
          : tone === "elevated"
            ? hasLiveBlur
              ? "rgba(30, 30, 36, 0.56)"
              : "rgba(28, 28, 33, 0.88)"
            : hasLiveBlur
              ? "rgba(26, 26, 31, 0.54)"
              : "rgba(25, 25, 30, 0.88)";
    return {
      tint,
      border: "rgba(255, 255, 255, 0.14)",
      borderTop: "rgba(255, 255, 255, 0.28)",
      borderBottom: tone === "menu" ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.07)",
      sheenColor: "255, 255, 255",
      sheenTop: tone === "menu" ? 0.12 : 0.14,
      sheenMid: tone === "menu" ? 0.018 : 0.015,
      sheenBottom: 0.045,
    };
  }
  const tint =
    accentStyle === "crimson"
      ? tone === "menu"
        ? hasLiveBlur
          ? "rgba(255, 248, 250, 0.84)"
          : "rgba(255, 246, 249, 0.97)"
        : tone === "composer"
          ? hasLiveBlur
            ? "rgba(255, 249, 251, 0.80)"
            : "rgba(253, 243, 246, 0.95)"
          : hasLiveBlur
            ? "rgba(255, 248, 250, 0.74)"
            : "rgba(254, 245, 248, 0.94)"
      : accentStyle === "violet"
        ? tone === "menu"
          ? hasLiveBlur
            ? "rgba(250, 246, 255, 0.84)"
            : "rgba(248, 243, 255, 0.97)"
          : tone === "composer"
            ? hasLiveBlur
              ? "rgba(251, 248, 255, 0.80)"
              : "rgba(246, 240, 254, 0.95)"
            : hasLiveBlur
              ? "rgba(250, 246, 255, 0.74)"
              : "rgba(248, 243, 255, 0.94)"
        : tone === "menu"
          ? hasLiveBlur
            ? "rgba(252, 252, 255, 0.80)"
            : "rgba(250, 250, 253, 0.96)"
          : tone === "composer"
            ? hasLiveBlur
              ? "rgba(255, 255, 255, 0.76)"
              : "rgba(248, 248, 250, 0.94)"
            : hasLiveBlur
              ? "rgba(255, 255, 255, 0.68)"
              : "rgba(252, 252, 254, 0.92)";
  return {
    tint,
    border:
      accentStyle === "crimson"
        ? "rgba(190, 18, 60, 0.16)"
        : accentStyle === "violet"
          ? "rgba(124, 58, 237, 0.16)"
          : "rgba(0, 0, 0, 0.09)",
    borderTop: "rgba(255, 255, 255, 0.95)",
    borderBottom:
      accentStyle === "crimson"
        ? "rgba(190, 18, 60, 0.18)"
        : accentStyle === "violet"
          ? "rgba(124, 58, 237, 0.18)"
          : "rgba(0, 0, 0, 0.11)",
    sheenColor: "255, 255, 255",
    sheenTop: tone === "menu" ? 0.42 : 0.52,
    sheenMid: 0.08,
    sheenBottom: 0.2,
  };
}

/**
 * iOS-inspired frosted Liquid Glass surface for Android 12+ (API 31+).
 * Uses native RenderEffect live backdrop blur via `expo-blur` when a sibling `BlurTargetView`
 * is present, layered with directional specular rim highlights and a native RN linear-gradient sheen
 * (zero SVG views for 120Hz/165Hz smoothness).
 */
export function AndroidGlassSurface({
  children,
  radius = 999,
  intensity,
  tone = "chrome",
  blurTarget: blurTargetProp,
  style,
  contentStyle,
  ...props
}: AndroidGlassSurfaceProps) {
  const { themeAppearance, themeId } = useAppearancePreferences();
  const isDark = themeAppearance === "dark";
  const accentStyle =
    themeId === "rias-crimson" ? "crimson" : themeId === "akeno-violet" ? "violet" : "default";
  const contextTarget = use(AndroidBlurTargetContext);
  const blurTarget = blurTargetProp === undefined ? contextTarget : blurTargetProp;
  const hasLiveBlur = blurTarget !== null;
  const palette = glassPalette(isDark, tone, hasLiveBlur, accentStyle);
  const blurIntensity = intensity ?? (isDark ? 48 : 58);

  const sheenGradient: NonNullable<ViewStyle["backgroundImage"]> = [
    {
      type: "linear-gradient",
      direction: "to bottom",
      colorStops: [
        { color: `rgba(${palette.sheenColor}, ${palette.sheenTop})`, positions: ["0%"] },
        { color: `rgba(${palette.sheenColor}, ${palette.sheenMid})`, positions: ["38%"] },
        { color: `rgba(${palette.sheenColor}, 0)`, positions: ["76%"] },
        { color: `rgba(${palette.sheenColor}, ${palette.sheenBottom})`, positions: ["100%"] },
      ],
    },
  ];

  return (
    <View
      {...props}
      style={[
        {
          borderRadius: radius,
          overflow: "hidden",
          backgroundColor: hasLiveBlur ? "transparent" : palette.tint,
          borderWidth: 1,
          borderColor: palette.border,
          borderTopColor: palette.borderTop,
          borderBottomColor: palette.borderBottom,
        },
        style,
        contentStyle,
      ]}
    >
      {hasLiveBlur ? (
        <BlurView
          pointerEvents="none"
          blurTarget={blurTarget}
          blurMethod="dimezisBlurViewSdk31Plus"
          blurReductionFactor={8}
          intensity={blurIntensity}
          tint={isDark ? "systemChromeMaterialDark" : "systemChromeMaterialLight"}
          style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        />
      ) : null}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: hasLiveBlur ? palette.tint : "transparent",
            backgroundImage: sheenGradient,
          },
        ]}
      />
      {children}
    </View>
  );
}

/**
 * Crisp top edge fade behind floating Android glass headers: keeps the status bar band 100% solid
 * and title legible while letting scrolling messages melt softly under the floating glass pills.
 */
export function AndroidGlassHeaderScrim(props: { readonly color: string; readonly height: number }) {
  const scrimGradient: NonNullable<ViewStyle["backgroundImage"]> = [
    {
      type: "linear-gradient",
      direction: "to bottom",
      colorStops: [
        { color: themeColorWithAlpha(props.color, 1), positions: ["0%"] },
        { color: themeColorWithAlpha(props.color, 1), positions: ["42%"] },
        { color: themeColorWithAlpha(props.color, 0.88), positions: ["72%"] },
        { color: themeColorWithAlpha(props.color, 0.36), positions: ["90%"] },
        { color: themeColorWithAlpha(props.color, 0), positions: ["100%"] },
      ],
    },
  ];

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: props.height + 24,
        backgroundImage: scrimGradient,
      }}
    />
  );
}

/** Tactile iOS 26 spring-scale & luminous press-bloom wrapper for floating glass buttons and tabs. */
export function AndroidGlassPressable(props: {
  readonly children: ReactNode;
  readonly onPress?: () => void;
  readonly disabled?: boolean;
  readonly accessibilityLabel?: string;
  readonly accessibilityRole?: "button" | "tab";
  readonly accessibilitySelected?: boolean;
  readonly hitSlop?: Insets | number;
  readonly style?: StyleProp<ViewStyle>;
  readonly contentStyle?: StyleProp<ViewStyle>;
  readonly scaleTo?: number;
  readonly bloomRadius?: number;
}) {
  const { themeAppearance } = useAppearancePreferences();
  const isDark = themeAppearance === "dark";
  const scale = useSharedValue(1);
  const bloomOpacity = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const bloomStyle = useAnimatedStyle(() => ({
    opacity: bloomOpacity.value,
  }));
  const pressedScale = props.scaleTo ?? 0.92;

  return (
    <Pressable
      disabled={props.disabled}
      onPress={props.onPress}
      hitSlop={props.hitSlop}
      accessibilityRole={props.accessibilityRole ?? "button"}
      accessibilityLabel={props.accessibilityLabel}
      accessibilityState={{
        disabled: Boolean(props.disabled),
        ...(props.accessibilitySelected !== undefined
          ? { selected: props.accessibilitySelected }
          : {}),
      }}
      onPressIn={() => {
        if (!props.disabled) {
          scale.set(withSpring(pressedScale, IOS_SPRING_SNAPPY));
          if (props.bloomRadius !== undefined) {
            bloomOpacity.set(withTiming(1, { duration: 90 }));
          }
        }
      }}
      onPressOut={() => {
        scale.set(withSpring(1, IOS_SPRING_SNAPPY));
        if (props.bloomRadius !== undefined) {
          bloomOpacity.set(withTiming(0, IOS_TIMING_EXIT));
        }
      }}
      style={props.style}
    >
      {props.bloomRadius !== undefined ? (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: props.bloomRadius,
              backgroundColor: isDark
                ? "rgba(255, 255, 255, 0.13)"
                : "rgba(255, 255, 255, 0.42)",
            },
            bloomStyle,
          ]}
        />
      ) : null}
      <Animated.View style={[props.contentStyle, animatedStyle]}>{props.children}</Animated.View>
    </Pressable>
  );
}
