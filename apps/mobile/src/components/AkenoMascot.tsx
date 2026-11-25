import * as Haptics from "expo-haptics";
import { Image, type ImageSource } from "expo-image";
import { memo, useState } from "react";
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

import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { useAppActive, useReduceMotionEnabled } from "../lib/appState";

export type AkenoMood = "cute" | "happy" | "surprised" | "sad" | "sleepy";
export type CompanionMood = AkenoMood;
export type CompanionCharacter = "rias" | "akeno";

export const AKENO_MOOD_SOURCES: Readonly<Record<CompanionMood, ImageSource>> = {
  cute: require("../../assets/akeno-cute.webp"),
  happy: require("../../assets/akeno-happy.webp"),
  surprised: require("../../assets/akeno-surprised.webp"),
  sad: require("../../assets/akeno-sad.webp"),
  sleepy: require("../../assets/akeno-sleepy.webp"),
};

export const RIAS_MOOD_SOURCES: Readonly<Record<CompanionMood, ImageSource>> = {
  cute: require("../../assets/rias-idle.webp"),
  happy: require("../../assets/rias-happy.webp"),
  surprised: require("../../assets/rias-surprised.webp"),
  sad: require("../../assets/rias-sad.webp"),
  sleepy: require("../../assets/rias-sleepy.webp"),
};

export const COMPANION_MOOD_SOURCES: Readonly<
  Record<CompanionCharacter, Readonly<Record<CompanionMood, ImageSource>>>
> = {
  rias: RIAS_MOOD_SOURCES,
  akeno: AKENO_MOOD_SOURCES,
};

const MOOD_GLOWS: Readonly<
  Record<CompanionCharacter, Readonly<Record<CompanionMood, { readonly bg: string; readonly shadow: string }>>>
> = {
  akeno: {
    cute: { bg: "rgba(168, 85, 247, 0.14)", shadow: "rgba(168, 85, 247, 0.28)" },
    happy: { bg: "rgba(244, 114, 182, 0.15)", shadow: "rgba(244, 114, 182, 0.28)" },
    surprised: { bg: "rgba(245, 158, 11, 0.14)", shadow: "rgba(239, 68, 68, 0.24)" },
    sad: { bg: "rgba(96, 165, 250, 0.14)", shadow: "rgba(96, 165, 250, 0.24)" },
    sleepy: { bg: "rgba(139, 92, 246, 0.14)", shadow: "rgba(139, 92, 246, 0.24)" },
  },
  rias: {
    cute: { bg: "rgba(225, 29, 72, 0.14)", shadow: "rgba(225, 29, 72, 0.26)" },
    happy: { bg: "rgba(244, 63, 94, 0.16)", shadow: "rgba(251, 191, 36, 0.26)" },
    surprised: { bg: "rgba(239, 68, 68, 0.14)", shadow: "rgba(245, 158, 11, 0.24)" },
    sad: { bg: "rgba(96, 165, 250, 0.14)", shadow: "rgba(96, 165, 250, 0.24)" },
    sleepy: { bg: "rgba(244, 114, 182, 0.14)", shadow: "rgba(225, 29, 72, 0.22)" },
  },
};

const BOUNCE_SPRING = {
  damping: 11,
  stiffness: 320,
  mass: 0.64,
  reduceMotion: ReduceMotion.System,
};

let nextCompanionToggle = 0;

export function pickAlternatingCompanion(seed?: string): CompanionCharacter {
  if (seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash * 31 + seed.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % 2 === 0 ? "rias" : "akeno";
  }
  nextCompanionToggle += 1;
  return nextCompanionToggle % 2 === 0 ? "rias" : "akeno";
}

export function isLateNightHour(date: Date = new Date()): boolean {
  const hour = date.getHours();
  return hour >= 23 || hour < 6;
}

/**
 * Unified animated transparent Rias / Akeno companion sprite supporting all 5 expressive moods:
 * `cute`, `happy`, `surprised`, `sad`, and `sleepy`.
 * Follows Settings → Appearance → Companion mascot (`rias` / `akeno` / `random`) when `character` is omitted.
 */
export const CompanionMascotSprite = memo(function CompanionMascotSprite(props: {
  readonly mood: CompanionMood;
  readonly character?: CompanionCharacter;
  readonly seed?: string;
  readonly size?: number;
  readonly glow?: boolean;
  readonly onPress?: () => void;
  readonly accessibilityLabel?: string;
}) {
  const size = props.size ?? 116;
  const appActive = useAppActive();
  const reducedMotion = useReduceMotionEnabled();
  const { mascotPreference } = useAppearancePreferences();
  const [fallbackCharacter] = useState<CompanionCharacter>(() =>
    pickAlternatingCompanion(props.seed),
  );
  const character: CompanionCharacter =
    props.character ?? (mascotPreference === "random" ? fallbackCharacter : mascotPreference);

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

  const glowColors = MOOD_GLOWS[character][props.mood];
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
        source={COMPANION_MOOD_SOURCES[character][props.mood]}
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
      accessibilityLabel={
        props.accessibilityLabel ?? (character === "rias" ? "Rias mascot" : "Akeno mascot")
      }
      hitSlop={8}
      onPress={handlePress}
      className="items-center justify-center"
    >
      {body}
    </Pressable>
  );
});

export const AkenoMascotSprite = memo(function AkenoMascotSprite(props: {
  readonly mood: AkenoMood;
  readonly size?: number;
  readonly glow?: boolean;
  readonly onPress?: () => void;
  readonly accessibilityLabel?: string;
}) {
  return <CompanionMascotSprite {...props} character="akeno" />;
});
