import type { ComponentProps, ReactNode } from "react";
import { Platform, Pressable } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { cn } from "../../lib/cn";
import { IOS_SPRING_SNAPPY } from "../../lib/iosMotion";
import { useHoverGesture } from "../../lib/useHoverGesture";

const ROW_PRESS_IN_TIMING = {
  duration: 70,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
};

const ROW_PRESS_OUT_TIMING = {
  duration: 175,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
};

export function RowPressable({
  children,
  className,
  interactionClassName = "bg-row-hover",
  interactionOpacity = 1,
  onPressIn,
  onPressOut,
  ...props
}: Omit<ComponentProps<typeof Pressable>, "children"> & {
  readonly children: ReactNode;
  readonly interactionClassName?: string;
  readonly interactionOpacity?: number;
}) {
  const { hovered, hoverGesture } = useHoverGesture(props.disabled ?? false);
  const pressHighlight = useSharedValue(0);
  const pressScale = useSharedValue(1);
  const isAndroid = Platform.OS === "android";

  const overlayStyle = useAnimatedStyle(() => {
    const active = Math.max(hovered ? 1 : 0, pressHighlight.value);
    return {
      opacity: props.disabled ? 0 : active * interactionOpacity,
    };
  });

  const contentScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  return (
    <GestureDetector gesture={hoverGesture}>
      <Pressable
        {...props}
        onPressIn={(event) => {
          if (!props.disabled && isAndroid) {
            pressHighlight.set(withTiming(1, ROW_PRESS_IN_TIMING));
            pressScale.set(withSpring(0.992, IOS_SPRING_SNAPPY));
          }
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          if (isAndroid) {
            pressHighlight.set(withTiming(0, ROW_PRESS_OUT_TIMING));
            pressScale.set(withSpring(1, IOS_SPRING_SNAPPY));
          }
          onPressOut?.(event);
        }}
        className={cn("relative overflow-hidden", className)}
      >
        {() => (
          <>
            <Animated.View
              pointerEvents="none"
              className={cn("absolute inset-0", interactionClassName)}
              style={overlayStyle}
            />
            {isAndroid ? (
              <Animated.View style={contentScaleStyle}>{children}</Animated.View>
            ) : (
              children
            )}
          </>
        )}
      </Pressable>
    </GestureDetector>
  );
}
