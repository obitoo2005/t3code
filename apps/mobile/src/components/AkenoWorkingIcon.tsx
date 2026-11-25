import { Image, type ImageSource } from "expo-image";
import { memo, useEffect, useRef } from "react";
import { View } from "react-native";
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

import { useAppActive, useReduceMotionEnabled } from "../lib/appState";
import { AKENO_MOOD_SOURCES } from "./AkenoMascot";

export type AkenoIconState = "working" | "done" | "stopped" | "failed";

const AKENO_SOURCES: Readonly<Record<AkenoIconState, ImageSource>> = {
  working: AKENO_MOOD_SOURCES.cute,
  done: AKENO_MOOD_SOURCES.happy,
  stopped: AKENO_MOOD_SOURCES.surprised,
  failed: AKENO_MOOD_SOURCES.sad,
};

const TAP_SPRING = {
  damping: 12,
  stiffness: 340,
  mass: 0.65,
  reduceMotion: ReduceMotion.System,
};

/**
 * 4-state animated expressive Akeno mascot for chat turn timing rows:
 * - `working`: cute sparkling winking Akeno + gentle float
 * - `done`: happy cheering Akeno with floating hearts & stars
 * - `stopped`: surprised flustered Akeno with bobbing sweat drop & `!`
 * - `failed`: sad teary-eyed pouting Akeno
 * Plays a playful spring bounce & wiggle whenever tapped.
 */
export const AkenoWorkingIcon = memo(function AkenoWorkingIcon(props: {
  readonly state?: AkenoIconState;
  readonly active?: boolean;
  readonly tapCount?: number;
  readonly size?: number;
}) {
  const state: AkenoIconState = props.state ?? (props.active ? "working" : "done");
  const size = props.size ?? 38;
  const appActive = useAppActive();
  const reducedMotion = useReduceMotionEnabled();
  const shouldFloat = state === "working" && appActive && !reducedMotion;
  const shouldPlayWebp = appActive && !reducedMotion;

  const bobY = useSharedValue(0);
  const idleTilt = useSharedValue(0);
  const idleScale = useSharedValue(1);
  const tapScale = useSharedValue(1);
  const tapTilt = useSharedValue(0);
  const prevStateRef = useRef<AkenoIconState>(state);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- starts and stops continuous Reanimated working mascot loop
  useEffect(() => {
    if (!shouldFloat) {
      cancelAnimation(bobY);
      cancelAnimation(idleTilt);
      cancelAnimation(idleScale);
      bobY.set(withTiming(0, { duration: 160, reduceMotion: ReduceMotion.System }));
      idleTilt.set(withTiming(0, { duration: 160, reduceMotion: ReduceMotion.System }));
      idleScale.set(withTiming(1, { duration: 160, reduceMotion: ReduceMotion.System }));
      return;
    }

    bobY.set(
      withRepeat(
        withSequence(
          withTiming(-2.2, {
            duration: 540,
            easing: Easing.inOut(Easing.sin),
            reduceMotion: ReduceMotion.System,
          }),
          withTiming(1.0, {
            duration: 540,
            easing: Easing.inOut(Easing.sin),
            reduceMotion: ReduceMotion.System,
          }),
        ),
        -1,
        true,
      ),
    );
    idleTilt.set(
      withRepeat(
        withSequence(
          withTiming(-3.5, {
            duration: 680,
            easing: Easing.inOut(Easing.sin),
            reduceMotion: ReduceMotion.System,
          }),
          withTiming(3.5, {
            duration: 680,
            easing: Easing.inOut(Easing.sin),
            reduceMotion: ReduceMotion.System,
          }),
        ),
        -1,
        true,
      ),
    );
    idleScale.set(
      withRepeat(
        withSequence(
          withTiming(1.05, {
            duration: 540,
            easing: Easing.inOut(Easing.sin),
            reduceMotion: ReduceMotion.System,
          }),
          withTiming(0.98, {
            duration: 540,
            easing: Easing.inOut(Easing.sin),
            reduceMotion: ReduceMotion.System,
          }),
        ),
        -1,
        true,
      ),
    );

    return () => {
      cancelAnimation(bobY);
      cancelAnimation(idleTilt);
      cancelAnimation(idleScale);
    };
  }, [shouldFloat, bobY, idleTilt, idleScale]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- plays an expressive reaction pop when transitioning out of working
  useEffect(() => {
    const previous = prevStateRef.current;
    prevStateRef.current = state;
    if (previous === "working" && state !== "working" && !reducedMotion) {
      tapScale.set(
        withSequence(
          withTiming(1.22, { duration: 85, easing: Easing.out(Easing.cubic) }),
          withSpring(1, TAP_SPRING),
        ),
      );
      tapTilt.set(
        withSequence(
          withTiming(state === "done" ? 8 : -10, {
            duration: 65,
            easing: Easing.out(Easing.cubic),
          }),
          withTiming(state === "done" ? -6 : 8, {
            duration: 85,
            easing: Easing.inOut(Easing.cubic),
          }),
          withSpring(0, TAP_SPRING),
        ),
      );
    }
  }, [state, reducedMotion, tapScale, tapTilt]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- plays a short Reanimated wiggle & bounce whenever tapped
  useEffect(() => {
    if (!props.tapCount || reducedMotion) return;
    tapScale.set(
      withSequence(
        withTiming(1.22, { duration: 90, easing: Easing.out(Easing.cubic) }),
        withSpring(1, TAP_SPRING),
      ),
    );
    tapTilt.set(
      withSequence(
        withTiming(-11, { duration: 75, easing: Easing.out(Easing.cubic) }),
        withTiming(9, { duration: 95, easing: Easing.inOut(Easing.cubic) }),
        withSpring(0, TAP_SPRING),
      ),
    );
  }, [props.tapCount, reducedMotion, tapScale, tapTilt]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: bobY.value },
      { rotate: `${idleTilt.value + tapTilt.value}deg` },
      { scale: idleScale.value * tapScale.value },
    ],
  }));

  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
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
      <View style={{ width: size, height: size }}>
        <Image
          source={AKENO_SOURCES[state]}
          autoplay={shouldPlayWebp}
          accessibilityIgnoresInvertColors
          contentFit="contain"
          style={{ width: "100%", height: "100%" }}
        />
      </View>
    </Animated.View>
  );
});
