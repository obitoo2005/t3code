import { BlurView } from "expo-blur";
import { use, useId, type ComponentRef, type ReactNode, type RefObject } from "react";
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
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { useAppearancePreferences } from "../../features/settings/appearance/AppearancePreferencesProvider";
import { AndroidBlurTargetContext } from "./AndroidBlurTargetContext";

export type AndroidGlassTone = "chrome" | "elevated" | "composer";

export interface AndroidGlassSurfaceProps extends ViewProps {
  readonly children?: ReactNode;
  readonly radius?: number;
  readonly intensity?: number;
  readonly tone?: AndroidGlassTone;
  readonly blurTarget?: RefObject<ComponentRef<typeof View> | null> | null;
  readonly contentStyle?: StyleProp<ViewStyle>;
}

const SPRING_CONFIG = {
  damping: 18,
  stiffness: 380,
  mass: 0.7,
  reduceMotion: ReduceMotion.System,
};

function glassPalette(isDark: boolean, tone: AndroidGlassTone, hasLiveBlur: boolean) {
  if (isDark) {
    const tint =
      tone === "composer"
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
      borderBottom: "rgba(255, 255, 255, 0.07)",
      sheenTop: 0.14,
      sheenMid: 0.015,
      sheenBottom: 0.045,
      sheenColor: "#ffffff",
    };
  }
  const tint =
    tone === "composer"
      ? hasLiveBlur
        ? "rgba(255, 255, 255, 0.76)"
        : "rgba(248, 248, 250, 0.94)"
      : hasLiveBlur
        ? "rgba(255, 255, 255, 0.68)"
        : "rgba(252, 252, 254, 0.92)";
  return {
    tint,
    border: "rgba(0, 0, 0, 0.09)",
    borderTop: "rgba(255, 255, 255, 0.95)",
    borderBottom: "rgba(0, 0, 0, 0.11)",
    sheenTop: 0.52,
    sheenMid: 0.08,
    sheenBottom: 0.2,
    sheenColor: "#ffffff",
  };
}

/**
 * iOS-inspired frosted Liquid Glass surface for Android 12+ (API 31+).
 * Uses native RenderEffect live backdrop blur via `expo-blur` when a sibling `BlurTargetView`
 * is present, layered with directional specular rim highlights and a vertical glass sheen.
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
  const { themeAppearance } = useAppearancePreferences();
  const isDark = themeAppearance === "dark";
  const contextTarget = use(AndroidBlurTargetContext);
  const blurTarget = blurTargetProp === undefined ? contextTarget : blurTargetProp;
  const hasLiveBlur = blurTarget !== null;
  const palette = glassPalette(isDark, tone, hasLiveBlur);
  const gradientId = useId();
  const blurIntensity = intensity ?? (isDark ? 48 : 58);

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
          blurReductionFactor={4}
          intensity={blurIntensity}
          tint={isDark ? "systemChromeMaterialDark" : "systemChromeMaterialLight"}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {hasLiveBlur ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: palette.tint }]}
        />
      ) : null}
      <Svg
        pointerEvents="none"
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        style={StyleSheet.absoluteFill}
      >
        <Defs>
          <LinearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor={palette.sheenColor} stopOpacity={palette.sheenTop} />
            <Stop offset="38%" stopColor={palette.sheenColor} stopOpacity={palette.sheenMid} />
            <Stop offset="76%" stopColor={palette.sheenColor} stopOpacity={0} />
            <Stop offset="100%" stopColor={palette.sheenColor} stopOpacity={palette.sheenBottom} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradientId})`} />
      </Svg>
      {children}
    </View>
  );
}

/** Soft top edge fade behind floating Android glass headers so scrolling messages melt under the bar. */
export function AndroidGlassHeaderScrim(props: { readonly color: string; readonly height: number }) {
  const gradientId = useId();
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: props.height + 18,
      }}
    >
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor={props.color} stopOpacity={0.94} />
            <Stop offset="58%" stopColor={props.color} stopOpacity={0.72} />
            <Stop offset="85%" stopColor={props.color} stopOpacity={0.28} />
            <Stop offset="100%" stopColor={props.color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradientId})`} />
      </Svg>
    </View>
  );
}

/** Tactile spring-scale wrapper for floating iOS-style glass buttons and tabs. */
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
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
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
        if (!props.disabled) scale.set(withSpring(pressedScale, SPRING_CONFIG));
      }}
      onPressOut={() => {
        scale.set(withSpring(1, SPRING_CONFIG));
      }}
      style={props.style}
    >
      <Animated.View style={[props.contentStyle, animatedStyle]}>{props.children}</Animated.View>
    </Pressable>
  );
}
