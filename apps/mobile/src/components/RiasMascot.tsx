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

import { useAppActive, useReduceMotionEnabled } from "../lib/appState";
import { AppText as Text } from "./ui/AppText";

export const RIAS_IDLE_MASCOT_SOURCE = require("../../assets/rias-idle.webp");

const RIAS_CAPTIONS: readonly string[] = [
  "Ready to ship something wild?",
  "Tap me for extra luck ✦",
  "Zero bugs... probably ✨",
  "What are we cooking today?",
  "Crimson power, pure OLED ♥",
];

const BOUNCE_SPRING = {
  damping: 11,
  stiffness: 320,
  mass: 0.65,
  reduceMotion: ReduceMotion.System,
};

/**
 * Animated transparent Rias pixel-art mascot for New Thread & empty screens.
 * Winks with floating sparkles and bounces playfully with rotating captions on tap.
 */
export const RiasMascot = memo(function RiasMascot(props: {
  readonly size?: number;
  readonly showCaption?: boolean;
}) {
  const size = props.size ?? 128;
  const appActive = useAppActive();
  const reducedMotion = useReduceMotionEnabled();
  const [captionIndex, setCaptionIndex] = useState(0);
  const scale = useSharedValue(1);
  const tilt = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${tilt.value}deg` }],
  }));

  const handlePress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (props.showCaption) {
      setCaptionIndex((index) => (index + 1) % RIAS_CAPTIONS.length);
    }
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
        accessibilityLabel="Rias mascot"
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
              backgroundColor: "rgba(225, 29, 72, 0.14)",
              boxShadow: [
                {
                  offsetX: 0,
                  offsetY: 4,
                  blurRadius: 28,
                  spreadDistance: 4,
                  color: "rgba(225, 29, 72, 0.24)",
                },
              ],
            }}
          />
          <Image
            source={RIAS_IDLE_MASCOT_SOURCE}
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
          {RIAS_CAPTIONS[captionIndex]}
        </Text>
      ) : null}
    </View>
  );
});
