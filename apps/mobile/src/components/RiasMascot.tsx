import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
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
import {
  COMPANION_MOOD_SOURCES,
  isLateNightHour,
  pickAlternatingCompanion,
  RIAS_MOOD_SOURCES,
  type CompanionCharacter,
  type CompanionMood,
} from "./AkenoMascot";
import { AppText as Text } from "./ui/AppText";

export const RIAS_IDLE_MASCOT_SOURCE = RIAS_MOOD_SOURCES.cute;

const RIAS_DAY_MOODS: readonly { readonly mood: CompanionMood; readonly caption: string }[] = [
  { mood: "cute", caption: "Ready to ship something wild? ✦" },
  { mood: "happy", caption: "Crimson power, pure OLED ♥" },
  { mood: "surprised", caption: "Whoa—tap me for extra luck! ✨" },
  { mood: "cute", caption: "Zero bugs... probably ✨" },
];

const RIAS_NIGHT_MOODS: readonly { readonly mood: CompanionMood; readonly caption: string }[] = [
  { mood: "sleepy", caption: "Late-night grind… don't forget to rest 😴" },
  { mood: "surprised", caption: "H-hey, I'm awake! Let's build! ✨" },
  { mood: "happy", caption: "Midnight shipping queen ♥" },
  { mood: "cute", caption: "Tap me whenever you need a spark ✦" },
];

const AKENO_DAY_MOODS: readonly { readonly mood: CompanionMood; readonly caption: string }[] = [
  { mood: "cute", caption: "Ara ara~ what are we building? ✦" },
  { mood: "happy", caption: "Yay! Let's ship something awesome ♥" },
  { mood: "surprised", caption: "Oh! You tapped me! ✨" },
  { mood: "cute", caption: "I'll cheer you on the whole way 💜" },
];

const AKENO_NIGHT_MOODS: readonly { readonly mood: CompanionMood; readonly caption: string }[] = [
  { mood: "sleepy", caption: "Late-night coding… don't forget to rest 😴" },
  { mood: "surprised", caption: "Ah—I'm awake! Let's code! ✨" },
  { mood: "happy", caption: "Midnight shipping squad ♥" },
  { mood: "cute", caption: "Tap again if you need a boost ✦" },
];

const BOUNCE_SPRING = {
  damping: 11,
  stiffness: 320,
  mass: 0.65,
  reduceMotion: ReduceMotion.System,
};

/**
 * Animated transparent Rias / Akeno companion mascot for New Thread & empty screens.
 * Both Rias and Akeno support full daytime & late-night sleepy→awake emotion cycles!
 */
export const RiasMascot = memo(function RiasMascot(props: {
  readonly size?: number;
  readonly showCaption?: boolean;
}) {
  const size = props.size ?? 128;
  const appActive = useAppActive();
  const reducedMotion = useReduceMotionEnabled();
  const { mascotPreference } = useAppearancePreferences();
  const [randomPick] = useState<CompanionCharacter>(() => pickAlternatingCompanion());
  const [lateNight] = useState(() => isLateNightHour());
  const [tapStep, setTapStep] = useState(0);
  const scale = useSharedValue(1);
  const tilt = useSharedValue(0);

  const activeCharacter: CompanionCharacter =
    mascotPreference === "random" ? randomPick : mascotPreference;
  const sequence =
    activeCharacter === "rias"
      ? lateNight
        ? RIAS_NIGHT_MOODS
        : RIAS_DAY_MOODS
      : lateNight
        ? AKENO_NIGHT_MOODS
        : AKENO_DAY_MOODS;
  const entry = sequence[tapStep % sequence.length]!;
  const source = COMPANION_MOOD_SOURCES[activeCharacter][entry.mood];

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${tilt.value}deg` }],
  }));

  const handlePress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTapStep((step) => step + 1);
    if (reducedMotion) return;
    scale.set(
      withSequence(
        withTiming(1.13, { duration: 95, easing: Easing.out(Easing.cubic) }),
        withSpring(1, BOUNCE_SPRING),
      ),
    );
    tilt.set(
      withSequence(
        withTiming(-5, { duration: 75, easing: Easing.out(Easing.cubic) }),
        withTiming(5, { duration: 95, easing: Easing.inOut(Easing.cubic) }),
        withSpring(0, BOUNCE_SPRING),
      ),
    );
  };

  return (
    <View className="items-center">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={activeCharacter === "akeno" ? "Akeno mascot" : "Rias mascot"}
        onPress={handlePress}
        hitSlop={8}
        className="items-center justify-center"
      >
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
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              width: Math.round(size * 0.72),
              height: Math.round(size * 0.72),
              borderRadius: 999,
              backgroundColor:
                activeCharacter === "akeno"
                  ? "rgba(168, 85, 247, 0.14)"
                  : "rgba(225, 29, 72, 0.14)",
              boxShadow: [
                {
                  offsetX: 0,
                  offsetY: 4,
                  blurRadius: 28,
                  spreadDistance: 4,
                  color:
                    activeCharacter === "akeno"
                      ? "rgba(168, 85, 247, 0.25)"
                      : "rgba(225, 29, 72, 0.24)",
                },
              ],
            }}
          />
          <Image
            source={source}
            autoplay={appActive && !reducedMotion}
            accessibilityIgnoresInvertColors
            contentFit="contain"
            style={{ width: size, height: size }}
          />
        </Animated.View>
      </Pressable>
      {props.showCaption ? (
        <Text
          textRole="footnote"
          className="mt-1.5 text-center font-t3-medium text-foreground-muted"
        >
          {entry.caption}
        </Text>
      ) : null}
    </View>
  );
});
