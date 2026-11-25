import * as Haptics from "expo-haptics";
import { Image, type ImageSource } from "expo-image";
import { memo } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { useAppActive, useReduceMotionEnabled } from "../lib/appState";

export type AkenoMood = "cute" | "happy" | "surprised" | "sad" | "sleepy";

export const AKENO_MOOD_SOURCES: Readonly<Record<AkenoMood, ImageSource>> = {
  cute: require("../../assets/akeno-cute.webp"),
  happy: require("../../assets/akeno-happy.webp"),
  surprised: require("../../assets/akeno-surprised.webp"),
  sad: require("../../assets/akeno-sad.webp"),
  sleepy: require("../../assets/akeno-sleepy.webp"),
};

const MOOD_GLOWS: Readonly<Record<AkenoMood, { readonly bg: string; readonly shadow: string }>> = {
  cute: { bg: "rgba(168, 85, 247, 0.14)", shadow: "rgba(168, 85, 247, 0.28)" },
  happy: { bg: "rgba(244, 114, 182, 0.15)", shadow: "rgba(244, 114, 182, 0.28)" },
  surprised: { bg: "rgba(245, 158, 11, 0.14)", shadow: "rgba(239, 68, 68, 0.24)" },
  sad: { bg: "rgba(96, 165, 250, 0.14)", shadow: "rgba(96, 165, 250, 0.24)" },
  sleepy: { bg: "rgba(139, 92, 246, 0.14)", shadow: "rgba(139, 92, 246, 0.24)" },
};

const BOUNCE_SPRING = {
  damping: 11,
  stiffness: 320,
  mass: 0.64,
  reduceMotion: ReduceMotion.System,
};

export function isLateNightHour(date: Date = new Date()): boolean {
  const hour = date.getHours();
  return hour >= 23 || hour < 6;
}

/**
 * Animated transparent Akeno pixel-art sprite supporting all 5 expressive moods:
 * `cute`, `happy`, `surprised`, `sad`, and `sleepy`.
 */
export const AkenoMascotSprite = memo(function AkenoMascotSprite(props: {
  readonly mood: AkenoMood;
  readonly size?: number;
  readonly glow?: boolean;
  readonly onPress?: () => void;
  readonly accessibilityLabel?: string;
}) {
  const size = props.size ?? 116;
  const appActive = useAppActive();
  const reducedMotion = useReduceMotionEnabled();
  const scale = useSharedValue(1);
  const tilt = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${tilt.value}deg` }],
  }));

  const handlePress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!reducedMotion) {
      scale.set(
        withSequence(
          withTiming(1.13, { duration: 90, easing: Easing.out(Easing.cubic) }),
          withSpring(1, BOUNCE_SPRING),
        ),
      );
      tilt.set(
        withSequence(
          withTiming(-6, { duration: 70, easing: Easing.out(Easing.cubic) }),
          withTiming(5, { duration: 90, easing: Easing.inOut(Easing.cubic) }),
          withSpring(0, BOUNCE_SPRING),
        ),
      );
    }
    props.onPress?.();
  };

  const glowColors = MOOD_GLOWS[props.mood];
  const body = (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
        },
        animatedStyle,
      ]}
    >
      {props.glow ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            width: Math.round(size * 0.72),
            height: Math.round(size * 0.72),
            borderRadius: 999,
            backgroundColor: glowColors.bg,
            boxShadow: [
              {
                offsetX: 0,
                offsetY: 4,
                blurRadius: 26,
                spreadDistance: 4,
                color: glowColors.shadow,
              },
            ],
          }}
        />
      ) : null}
      <Image
        source={AKENO_MOOD_SOURCES[props.mood]}
        autoplay={appActive && !reducedMotion}
        accessibilityIgnoresInvertColors
        contentFit="contain"
        style={{ width: size, height: size }}
      />
    </Animated.View>
  );

  if (!props.onPress) return body;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? "Akeno mascot"}
      hitSlop={8}
      onPress={handlePress}
      className="items-center justify-center"
    >
      {body}
    </Pressable>
  );
});
