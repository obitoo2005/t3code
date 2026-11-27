import * as Haptics from "expo-haptics";
import { memo, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { AppText as Text } from "../../components/ui/AppText";

const SWIPE_TRIGGER_THRESHOLD_DP = 44;
const SWIPE_MAX_DRAG_DP = 64;
const SWIPE_QUOTE_MAX_CHARS = 280;
const SWIPE_PREVIEW_MAX_CHARS = 120;

const SNAP_BACK_SPRING = {
  damping: 18,
  stiffness: 320,
  mass: 0.72,
  reduceMotion: ReduceMotion.System,
};

function dampSwipeDistance(rawAbs: number): number {
  "worklet";
  if (rawAbs <= 0) return 0;
  if (rawAbs <= SWIPE_TRIGGER_THRESHOLD_DP) {
    return rawAbs;
  }
  const overflow = rawAbs - SWIPE_TRIGGER_THRESHOLD_DP;
  const extra = (SWIPE_MAX_DRAG_DP - SWIPE_TRIGGER_THRESHOLD_DP) * (1 - Math.exp(-overflow / 36));
  return SWIPE_TRIGGER_THRESHOLD_DP + extra;
}

/**
 * Normalizes and formats message text into a concise Markdown blockquote (`> ...\n\n`)
 * suitable for inserting directly into the active thread composer.
 */
export function formatSwipeQuoteText(rawText: string): string | null {
  const normalized = rawText
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (normalized.length === 0) return null;
  const capped =
    normalized.length > SWIPE_QUOTE_MAX_CHARS
      ? `${normalized.slice(0, SWIPE_QUOTE_MAX_CHARS).trimEnd()}…`
      : normalized;
  const quotedLines = capped
    .split("\n")
    .map((line) => (line.length > 0 ? `> ${line}` : ">"))
    .join("\n");
  return `${quotedLines}\n\n`;
}

/**
 * Collapses a quoted message into a crisp single-line preview for the Telegram-style reply bar.
 */
export function formatSwipeReplyPreview(rawText: string): string | null {
  const collapsed = rawText.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return null;
  return collapsed.length > SWIPE_PREVIEW_MAX_CHARS
    ? `${collapsed.slice(0, SWIPE_PREVIEW_MAX_CHARS).trimEnd()}…`
    : collapsed;
}

export interface SwipeToQuoteWrapperProps {
  /** Which horizontal drag direction triggers quote: `"left"` for user bubbles, `"right"` or `"both"` for assistant bubbles. */
  readonly direction: "left" | "right" | "both";
  readonly enabled?: boolean;
  readonly onQuote: () => void;
  readonly children: ReactNode;
}

/**
 * Telegram-style swipe-to-reply wrapper for Android message bubbles.
 * Uses strict horizontal activation / vertical fail thresholds so 165Hz vertical feed scrolling
 * is never blocked or delayed.
 */
export const SwipeToQuoteWrapper = memo(function SwipeToQuoteWrapper(
  props: SwipeToQuoteWrapperProps,
) {
  const enabled = Platform.OS === "android" && props.enabled !== false;
  const translateX = useSharedValue(0);
  const thresholdCrossed = useSharedValue(0);

  const latestRef = useRef({ onQuote: props.onQuote, direction: props.direction });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- keeps latest quote callback accessible to stable UI-thread gesture
  useLayoutEffect(() => {
    latestRef.current = { onQuote: props.onQuote, direction: props.direction };
  });

  const fireThresholdHaptic = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const fireQuote = () => {
    latestRef.current.onQuote();
  };

  const allowLeft = props.direction === "left" || props.direction === "both";
  const allowRight = props.direction === "right" || props.direction === "both";

  const panGesture = useMemo(
    () =>
      // oxlint-disable-next-line react/capitalized-calls -- Gesture.Pan is a gesture factory, not a React component.
      Gesture.Pan()
        .enabled(enabled)
        .activeOffsetX([-18, 18])
        .failOffsetY([-14, 14])
        .onUpdate((event) => {
          const tx = event.translationX;
          let signedDamped = 0;
          if (tx < 0 && allowLeft) {
            signedDamped = -dampSwipeDistance(-tx);
          } else if (tx > 0 && allowRight) {
            signedDamped = dampSwipeDistance(tx);
          }
          translateX.value = signedDamped;

          const reached = Math.abs(signedDamped) >= SWIPE_TRIGGER_THRESHOLD_DP ? 1 : 0;
          if (reached === 1 && thresholdCrossed.value === 0) {
            thresholdCrossed.value = 1;
            runOnJS(fireThresholdHaptic)();
          } else if (reached === 0 && thresholdCrossed.value === 1) {
            thresholdCrossed.value = 0;
          }
        })
        .onEnd(() => {
          const shouldQuote = thresholdCrossed.value === 1;
          thresholdCrossed.value = 0;
          translateX.value = withSpring(0, SNAP_BACK_SPRING);
          if (shouldQuote) {
            runOnJS(fireQuote)();
          }
        })
        .onFinalize((_event, success) => {
          if (!success) {
            thresholdCrossed.value = 0;
            translateX.value = withSpring(0, SNAP_BACK_SPRING);
          }
        }),
    [allowLeft, allowRight, enabled, thresholdCrossed, translateX],
  );

  const rowAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const rightBadgeStyle = useAnimatedStyle(() => {
    const progress = Math.max(0, -translateX.value);
    const scale = interpolate(
      progress,
      [0, SWIPE_TRIGGER_THRESHOLD_DP],
      [0.4, 1.08],
      Extrapolation.CLAMP,
    );
    const opacity = interpolate(
      progress,
      [0, 12, SWIPE_TRIGGER_THRESHOLD_DP],
      [0, 0.72, 1],
      Extrapolation.CLAMP,
    );
    return {
      opacity,
      transform: [{ scale }],
    };
  });

  const leftBadgeStyle = useAnimatedStyle(() => {
    const progress = Math.max(0, translateX.value);
    const scale = interpolate(
      progress,
      [0, SWIPE_TRIGGER_THRESHOLD_DP],
      [0.4, 1.08],
      Extrapolation.CLAMP,
    );
    const opacity = interpolate(
      progress,
      [0, 12, SWIPE_TRIGGER_THRESHOLD_DP],
      [0, 0.72, 1],
      Extrapolation.CLAMP,
    );
    return {
      opacity,
      transform: [{ scale }],
    };
  });

  if (!enabled) {
    return <>{props.children}</>;
  }

  return (
    <View style={styles.container}>
      {allowLeft ? (
        <Animated.View
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={[styles.badge, styles.badgeRight, rightBadgeStyle]}
        >
          <Text style={styles.badgeIcon}>↩</Text>
        </Animated.View>
      ) : null}
      {allowRight ? (
        <Animated.View
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={[styles.badge, styles.badgeLeft, leftBadgeStyle]}
        >
          <Text style={styles.badgeIcon}>↩</Text>
        </Animated.View>
      ) : null}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={rowAnimatedStyle}>{props.children}</Animated.View>
      </GestureDetector>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: "relative",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(244, 63, 94, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(192, 132, 252, 0.55)",
    shadowColor: "#F43F5E",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  badgeRight: {
    right: 10,
  },
  badgeLeft: {
    left: 10,
  },
  badgeIcon: {
    color: "#FDA4AF",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 17,
  },
});
