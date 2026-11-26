import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useGT } from "gt-react-native";
import { memo, useEffect, useRef, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { useReduceMotionEnabled } from "../lib/appState";
import { IPAD_HOME_TITLE_OFFSET } from "../lib/layoutMetrics";
import { playUiSound } from "../lib/uiSoundFx";
import { NATIVE_WORKSPACE_COLUMNS_SUPPORTED } from "../native/NativeWorkspaceColumns";
import { T3_CODE_BRAND_MARK_SOURCE } from "./brandAssets";
import { reshuffleSessionAvatars } from "./SessionAvatarIcon";
import { AppText as Text } from "./ui/AppText";
import { useAndroidControlSizing } from "./ui/useAndroidControlSizing";

const BRAND_MAX_FONT_SCALE = 1.4;

const BURST_PARTICLES = [
  { glyph: "♥", color: "#FF2D55", dx: -24, dy: -22, delay: 0, size: 11 },
  { glyph: "✦", color: "#FFFFFF", dx: 0, dy: -28, delay: 18, size: 11 },
  { glyph: "♥", color: "#FF6B8B", dx: 24, dy: -20, delay: 10, size: 10 },
  { glyph: "✦", color: "#FF99B4", dx: 30, dy: 2, delay: 24, size: 10 },
  { glyph: "♥", color: "#E11D48", dx: 22, dy: 24, delay: 12, size: 11 },
  { glyph: "✦", color: "#FFFFFF", dx: -4, dy: 28, delay: 28, size: 10 },
  { glyph: "♥", color: "#FF6B8B", dx: -24, dy: 20, delay: 16, size: 10 },
  { glyph: "✦", color: "#FF2D55", dx: -30, dy: -2, delay: 6, size: 11 },
] as const;

const ICON_SPRING = {
  damping: 10,
  stiffness: 360,
  mass: 0.62,
  reduceMotion: ReduceMotion.System,
};

const SparkleBurstParticle = memo(function SparkleBurstParticle(props: {
  readonly glyph: string;
  readonly color: string;
  readonly dx: number;
  readonly dy: number;
  readonly delay: number;
  readonly size: number;
}) {
  const progress = useSharedValue(0);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- fires one-shot radial burst particle animation on mount
  useEffect(() => {
    progress.set(
      withDelay(
        props.delay,
        withTiming(1, {
          duration: 540,
          easing: Easing.out(Easing.cubic),
          reduceMotion: ReduceMotion.System,
        }),
      ),
    );
  }, [progress, props.delay]);

  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const opacity = p < 0.2 ? p / 0.2 : Math.max(0, 1 - (p - 0.2) / 0.8);
    const scale = p < 0.25 ? 0.4 + p * 3.2 : 1.2 - (p - 0.25) * 0.8;
    return {
      opacity,
      transform: [
        { translateX: props.dx * p },
        { translateY: props.dy * p },
        { scale },
      ],
    };
  });

  return (
    <Animated.Text
      accessible={false}
      importantForAccessibility="no"
      style={[
        {
          position: "absolute",
          color: props.color,
          fontSize: props.size,
          fontWeight: "700",
          textShadowColor: "rgba(225, 29, 72, 0.55)",
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 6,
        },
        style,
      ]}
    >
      {props.glyph}
    </Animated.Text>
  );
});

export function brandTitleOffset(): number {
  if (Platform.OS !== "ios") return 0;
  return Platform.isPad && !NATIVE_WORKSPACE_COLUMNS_SUPPORTED ? IPAD_HOME_TITLE_OFFSET : 0;
}

export function CompactBrandTitle(
  props: {
    readonly allowFontScaling?: boolean;
    readonly accessibilityLabel?: string;
    /** Fills the row and keeps the brand mark cleanly sized when width is constrained. */
    readonly fit?: boolean;
  } = {},
) {
  const gt = useGT();
  const titleOffset = brandTitleOffset();
  const { scale } = useAndroidControlSizing();
  const reducedMotion = useReduceMotionEnabled();
  const clampedScale = Math.min(scale, 1.15);
  const iconSize = Math.round(40 * clampedScale);
  const iconRadius = Math.round(11 * clampedScale);

  const [burstKey, setBurstKey] = useState(0);
  const [burstVisible, setBurstVisible] = useState(false);
  const burstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iconScale = useSharedValue(1);
  const iconTilt = useSharedValue(0);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- cleans up burst hide timer on unmount
  useEffect(() => {
    return () => {
      if (burstTimerRef.current !== null) clearTimeout(burstTimerRef.current);
    };
  }, []);

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }, { rotate: `${iconTilt.value}deg` }],
  }));

  const handleRiasIconPress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    playUiSound("shuffle");
    reshuffleSessionAvatars();

    if (!reducedMotion) {
      iconScale.set(
        withSequence(
          withTiming(1.24, { duration: 85, easing: Easing.out(Easing.cubic) }),
          withSpring(1, ICON_SPRING),
        ),
      );
      iconTilt.set(
        withSequence(
          withTiming(-10, { duration: 70, easing: Easing.out(Easing.cubic) }),
          withTiming(8, { duration: 90, easing: Easing.inOut(Easing.cubic) }),
          withSpring(0, ICON_SPRING),
        ),
      );
      setBurstKey((value) => value + 1);
      setBurstVisible(true);
      if (burstTimerRef.current !== null) clearTimeout(burstTimerRef.current);
      burstTimerRef.current = setTimeout(() => {
        setBurstVisible(false);
        burstTimerRef.current = null;
      }, 620);
    }
  };

  const title = (
    <View
      className="flex-row items-center"
      style={[
        { marginLeft: titleOffset, gap: Math.round(10 * clampedScale), overflow: "visible" },
        props.fit && { flexShrink: 1 },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={gt("Shuffle session avatars")}
        hitSlop={8}
        onPress={handleRiasIconPress}
        style={{
          width: iconSize,
          height: iconSize,
          alignItems: "center",
          justifyContent: "center",
          overflow: "visible",
        }}
      >
        {burstVisible ? (
          <View
            key={burstKey}
            pointerEvents="none"
            style={{
              position: "absolute",
              inset: 0,
              alignItems: "center",
              justifyContent: "center",
              overflow: "visible",
              zIndex: 10,
            }}
          >
            {BURST_PARTICLES.map((particle, index) => (
              <SparkleBurstParticle key={index} {...particle} />
            ))}
          </View>
        ) : null}
        <Animated.View
          style={[
            {
              width: iconSize,
              height: iconSize,
              borderRadius: iconRadius,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: "rgba(255, 255, 255, 0.22)",
              borderTopColor: "rgba(255, 255, 255, 0.34)",
              boxShadow: [
                {
                  offsetX: 0,
                  offsetY: 3,
                  blurRadius: 10,
                  color: "rgba(197, 1, 46, 0.28)",
                },
              ],
            },
            iconAnimatedStyle,
          ]}
        >
          <Image
            source={T3_CODE_BRAND_MARK_SOURCE}
            accessibilityIgnoresInvertColors
            contentFit="cover"
            style={{ width: "100%", height: "100%" }}
          />
        </Animated.View>
      </Pressable>
      <View
        aria-level={1}
        accessibilityLabel={props.accessibilityLabel ?? gt("Rias Code, Threads")}
        accessible
        role="heading"
        className="flex-row items-baseline"
        style={{ gap: Math.round(5 * clampedScale) }}
      >
        <Text
          allowFontScaling={props.allowFontScaling}
          maxFontSizeMultiplier={BRAND_MAX_FONT_SCALE}
          numberOfLines={1}
          className="font-t3-bold text-foreground"
          style={{ fontSize: 20 * clampedScale, letterSpacing: -0.45 * clampedScale }}
        >
          Rias
        </Text>
        <Text
          allowFontScaling={props.allowFontScaling}
          maxFontSizeMultiplier={BRAND_MAX_FONT_SCALE}
          numberOfLines={1}
          className="font-t3-medium text-foreground-muted"
          style={{ fontSize: 20 * clampedScale, letterSpacing: -0.45 * clampedScale }}
        >
          Code
        </Text>
      </View>
    </View>
  );

  return props.fit ? (
    <View className="min-w-0 flex-1 flex-row items-center">{title}</View>
  ) : (
    title
  );
}
