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
import { AKENO_MOOD_SOURCES, isLateNightHour, type AkenoMood } from "./AkenoMascot";
import { AppText as Text } from "./ui/AppText";

export const RIAS_IDLE_MASCOT_SOURCE = require("../../assets/rias-idle.webp");

const RIAS_CAPTIONS: readonly string[] = [
  "Ready to ship something wild?",
  "Tap me for extra luck ✦",
  "Zero bugs... probably ✨",
  "What are we cooking today?",
  "Crimson power, pure OLED ♥",
];

const AKENO_DAY_MOODS: readonly { readonly mood: AkenoMood; readonly caption: string }[] = [
  { mood: "cute", caption: "Ara ara~ what are we building? ✦" },
  { mood: "happy", caption: "Yay! Let's ship something awesome ♥" },
  { mood: "surprised", caption: "Oh! You tapped me! ✨" },
  { mood: "cute", caption: "I'll cheer you on the whole way 💜" },
];

const AKENO_NIGHT_MOODS: readonly { readonly mood: AkenoMood; readonly caption: string }[] = [
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

let randomMascotToggle = 0;

/**
 * Animated transparent Rias / Akeno companion mascot for New Thread & empty screens.
 * Respects Settings → Appearance → Companion mascot (`Rias` / `Akeno` / `Both`),
 * automatically shows sleepy Akeno late at night (11 PM–6 AM) until tapped awake!
 */
export const RiasMascot = memo(function RiasMascot(props: {
  readonly size?: number;
  readonly showCaption?: boolean;
}) {
  const size = props.size ?? 128;
  const appActive = useAppActive();
  const reducedMotion = useReduceMotionEnabled();
  const { mascotPreference } = useAppearancePreferences();
  const [randomPick] = useState<"rias" | "akeno">(() => {
    randomMascotToggle += 1;
    return randomMascotToggle % 2 === 1 ? "akeno" : "rias";
  });
  const [lateNight] = useState(() => isLateNightHour());
  const [tapStep, setTapStep] = useState(0);
  const scale = useSharedValue(1);
  const tilt = useSharedValue(0);

  const activeCharacter: "rias" | "akeno" =
    mascotPreference === "random" ? randomPick : mascotPreference;
  const akenoSequence = lateNight ? AKENO_NIGHT_MOODS : AKENO_DAY_MOODS;
  const akenoEntry = akenoSequence[tapStep % akenoSequence.length]!;
  const source =
    activeCharacter === "akeno" ? AKENO_MOOD_SOURCES[akenoEntry.mood] : RIAS_IDLE_MASCOT_SOURCE;
  const caption =
    activeCharacter === "akeno"
      ? akenoEntry.caption
      : RIAS_CAPTIONS[tapStep % RIAS_CAPTIONS.length]!;

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
          {caption}
        </Text>
      ) : null}
    </View>
  );
});
