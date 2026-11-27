import * as Haptics from "expo-haptics";
import { Image, type ImageSource } from "expo-image";
import { memo, useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { useAkenoPosePack } from "../lib/akenoPosePack";
import { useAppActive, useReduceMotionEnabled } from "../lib/appState";
import { getTimeOfDayGreeting } from "../lib/riasEnhancements";
import { playUiSound } from "../lib/uiSoundFx";
import {
  COMPANION_MOOD_SOURCES,
  isLateNightHour,
  pickAlternatingCompanion,
  RIAS_MOOD_SOURCES,
  type CompanionCharacter,
  type CompanionMood,
} from "./AkenoMascot";
import { RiasVipGalleryModal } from "./RiasVipShowcase";
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

interface ResolvedMascotSlide {
  readonly source: ImageSource;
  readonly caption: string;
  readonly isStatic: boolean;
}

/**
 * Animated transparent Rias / Akeno companion mascot for New Thread & empty screens.
 * Uses all 47 synced Rias sprites when available + a sleek VIP ✦ button to open
 * the full-body VIP Rias showcase gallery.
 */
export const RiasMascot = memo(function RiasMascot(props: {
  readonly size?: number;
  readonly showCaption?: boolean;
}) {
  const size = props.size ?? 128;
  const appActive = useAppActive();
  const reducedMotion = useReduceMotionEnabled();
  const posePack = useAkenoPosePack({ autoSync: false });
  const { mascotPreference } = useAppearancePreferences();
  const [randomPick] = useState<CompanionCharacter>(() => pickAlternatingCompanion());
  const [lateNight] = useState(() => isLateNightHour());
  const [greeting] = useState(() => getTimeOfDayGreeting());
  const [tapStep, setTapStep] = useState(0);
  const [vipOpen, setVipOpen] = useState(false);

  const scale = useSharedValue(1);
  const breathScale = useSharedValue(1);
  const tilt = useSharedValue(0);

  const activeCharacter: CompanionCharacter =
    mascotPreference === "random" ? randomPick : mascotPreference;

  const slides = useMemo<readonly ResolvedMascotSlide[]>(() => {
    if (activeCharacter === "rias" && posePack.riasSprites.length > 0) {
      const uniform = posePack.riasSprites.filter((s) => s.style === "uniform");
      const bust = posePack.riasSprites.filter((s) => s.style === "bust");
      const sleepyFirst = lateNight
        ? posePack.riasSprites.filter((s) => s.moods.includes("sleepy"))
        : [];
      const seen = new Set<string>();
      const ordered = [...sleepyFirst];
      for (const s of sleepyFirst) seen.add(s.id);
      const maxLen = Math.max(uniform.length, bust.length);
      for (let i = 0; i < maxLen; i += 1) {
        const u = uniform[i];
        if (u && !seen.has(u.id)) {
          seen.add(u.id);
          ordered.push(u);
        }
        const b = bust[i];
        if (b && !seen.has(b.id)) {
          seen.add(b.id);
          ordered.push(b);
        }
      }
      return ordered.map((sprite) => ({
        source: sprite.source,
        caption: sprite.caption ?? "Crimson power, pure OLED ♥",
        isStatic: true,
      }));
    }

    const sequence =
      activeCharacter === "rias"
        ? lateNight
          ? RIAS_NIGHT_MOODS
          : RIAS_DAY_MOODS
        : lateNight
          ? AKENO_NIGHT_MOODS
          : AKENO_DAY_MOODS;
    return sequence.map((item) => ({
      source: COMPANION_MOOD_SOURCES[activeCharacter][item.mood],
      caption: item.caption,
      isStatic: false,
    }));
  }, [activeCharacter, lateNight, posePack.riasSprites]);

  const currentSlide = slides[tapStep % slides.length]!;

  // Gentle 165Hz living breath pulse for single-frame synced Rias sprites.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- runs subtle idle breathing loop on still Rias mascot sprites
  useEffect(() => {
    if (!currentSlide.isStatic || !appActive || reducedMotion) {
      cancelAnimation(breathScale);
      breathScale.set(1);
      return;
    }
    breathScale.set(
      withRepeat(
        withSequence(
          withTiming(1.03, { duration: 1450, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.99, { duration: 1450, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(breathScale);
  }, [appActive, breathScale, currentSlide.isStatic, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value * breathScale.value }, { rotate: `${tilt.value}deg` }],
  }));

  const handlePress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playUiSound("shuffle");
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
        onLongPress={() => {
          if (posePack.riasVip.length > 0) {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setVipOpen(true);
          }
        }}
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
                  : "rgba(225, 29, 72, 0.16)",
              boxShadow: [
                {
                  offsetX: 0,
                  offsetY: 4,
                  blurRadius: 28,
                  spreadDistance: 4,
                  color:
                    activeCharacter === "akeno"
                      ? "rgba(168, 85, 247, 0.25)"
                      : "rgba(225, 29, 72, 0.28)",
                },
              ],
            }}
          />
          <Image
            source={currentSlide.source}
            autoplay={appActive && !reducedMotion}
            transition={130}
            accessibilityIgnoresInvertColors
            contentFit="contain"
            style={{ width: size, height: size }}
          />
        </Animated.View>
      </Pressable>
      {props.showCaption ? (
        <View className="mt-1.5 items-center">
          <Text
            textRole="footnote"
            className="text-center font-t3-semibold text-foreground"
          >
            {tapStep === 0 ? greeting.headline : currentSlide.caption}
          </Text>
          {tapStep === 0 ? (
            <Text
              textRole="caption"
              className="mt-0.5 text-center text-foreground-muted"
            >
              {currentSlide.caption}
            </Text>
          ) : null}
          {posePack.riasVip.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open Rias VIP gallery"
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                playUiSound("shuffle");
                setVipOpen(true);
              }}
              style={{
                marginTop: 8,
                paddingHorizontal: 12,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: "rgba(225, 29, 72, 0.16)",
                borderWidth: 1,
                borderColor: "rgba(251, 113, 133, 0.36)",
              }}
            >
              <Text
                allowFontScaling={false}
                style={{ color: "#FFE4E6", fontSize: 11, fontWeight: "700" }}
              >
                Rias VIP ✦
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <RiasVipGalleryModal visible={vipOpen} onClose={() => setVipOpen(false)} />
    </View>
  );
});
