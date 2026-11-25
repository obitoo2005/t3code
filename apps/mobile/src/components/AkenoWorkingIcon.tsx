import { Image } from "expo-image";
import { memo, useEffect } from "react";
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

const AKENO_WORKING_SOURCE = require("../../assets/akeno-working.png");

const TAP_SPRING = {
  damping: 12,
  stiffness: 340,
  mass: 0.65,
  reduceMotion: ReduceMotion.System,
};

/**
 * Small transparent Akeno mascot sprite for chat turn timing rows.
 * Gently bobs and tilts while the assistant is actively working (Claude Code style),
 * and plays a playful spring bounce/wiggle whenever tapped.
 */
export const AkenoWorkingIcon = memo(function AkenoWorkingIcon(props: {
  readonly active: boolean;
  readonly tapCount?: number;
  readonly size?: number;
}) {
  const size = props.size ?? 34;
  const appActive = useAppActive();
  const reducedMotion = useReduceMotionEnabled();
  const shouldAnimate = props.active && appActive && !reducedMotion;

  const bobY = useSharedValue(0);
  const idleTilt = useSharedValue(0);
  const idleScale = useSharedValue(1);
  const tapScale = useSharedValue(1);
  const tapTilt = useSharedValue(0);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- starts and stops continuous Reanimated working mascot loop
  useEffect(() => {
    if (!shouldAnimate) {
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
          withTiming(-2.8, {
            duration: 520,
            easing: Easing.inOut(Easing.sin),
            reduceMotion: ReduceMotion.System,
          }),
          withTiming(1.2, {
            duration: 520,
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
          withTiming(-5, {
            duration: 640,
            easing: Easing.inOut(Easing.sin),
            reduceMotion: ReduceMotion.System,
          }),
          withTiming(5, {
            duration: 640,
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
          withTiming(1.07, {
            duration: 520,
            easing: Easing.inOut(Easing.sin),
            reduceMotion: ReduceMotion.System,
          }),
          withTiming(0.97, {
            duration: 520,
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
  }, [shouldAnimate, bobY, idleTilt, idleScale]);

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
          source={AKENO_WORKING_SOURCE}
          accessibilityIgnoresInvertColors
          contentFit="contain"
          style={{ width: "100%", height: "100%" }}
        />
      </View>
    </Animated.View>
  );
});
