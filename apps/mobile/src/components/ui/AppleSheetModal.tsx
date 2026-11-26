import * as Haptics from "expo-haptics";
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  Easing,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import {
  computeRubberBandOffset,
  IOS_SPRING_SHEET,
  IOS_TIMING_BACKDROP_IN,
  IOS_TIMING_BACKDROP_OUT,
} from "../../lib/iosMotion";

const SHEET_EXIT_MS = 185;
const FULLSCREEN_EXIT_MS = 180;
const DISMISS_DRAG_DISTANCE = 92;
const DISMISS_DRAG_VELOCITY = 650;

/**
 * Apple iOS 26-inspired Reanimated modal container for Android & iOS:
 * - "sheet": spring rise-up with 165Hz finger-tracking swipe-down-to-dismiss,
 *   hyperbolic upward rubber-band resistance, backdrop dim interpolation, and smooth glide-out.
 * - "fullscreen": velvety spring-lift & subtle scale-in with smooth slide-out exit.
 */
export function AppleSheetModal(props: {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly variant?: "sheet" | "fullscreen";
  readonly backdropColor?: string;
  readonly containerStyle?: StyleProp<ViewStyle>;
  readonly sheetStyle?: StyleProp<ViewStyle>;
  readonly swipeToDismiss?: boolean;
  readonly children: ReactNode;
}) {
  const variant = props.variant ?? "sheet";
  const isSheet = variant === "sheet";
  const allowSwipeDismiss = isSheet && (props.swipeToDismiss ?? true);

  const [mounted, setMounted] = useState(props.visible);
  const unmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeDismissedRef = useRef(false);

  const progress = useSharedValue(0);
  const backdrop = useSharedValue(0);
  const dragY = useSharedValue(0);
  const allowSwipeShared = useSharedValue(allowSwipeDismiss);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- keeps swipe-to-dismiss toggle synced on UI worklet thread
  useEffect(() => {
    allowSwipeShared.set(allowSwipeDismiss);
  }, [allowSwipeDismiss, allowSwipeShared]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- drives Apple spring entrance and holds modal mounted through exit animation
  useEffect(() => {
    if (unmountTimerRef.current !== null) {
      clearTimeout(unmountTimerRef.current);
      unmountTimerRef.current = null;
    }

    if (props.visible) {
      swipeDismissedRef.current = false;
      setMounted(true);
      dragY.set(0);
      progress.set(0);
      backdrop.set(0);
      progress.set(withSpring(1, IOS_SPRING_SHEET));
      backdrop.set(withTiming(1, IOS_TIMING_BACKDROP_IN));
      return;
    }

    if (!mounted) return;

    const exitDuration = isSheet ? SHEET_EXIT_MS : FULLSCREEN_EXIT_MS;
    if (!swipeDismissedRef.current) {
      progress.set(
        withTiming(0, {
          duration: exitDuration,
          easing: Easing.out(Easing.cubic),
          reduceMotion: ReduceMotion.System,
        }),
      );
      backdrop.set(withTiming(0, IOS_TIMING_BACKDROP_OUT));
    }

    unmountTimerRef.current = setTimeout(() => {
      unmountTimerRef.current = null;
      swipeDismissedRef.current = false;
      setMounted(false);
    }, exitDuration + 10);
  }, [backdrop, dragY, isSheet, mounted, progress, props.visible]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- clears pending exit unmount timer on unmount
  useEffect(() => {
    return () => {
      if (unmountTimerRef.current !== null) {
        clearTimeout(unmountTimerRef.current);
        unmountTimerRef.current = null;
      }
    };
  }, []);

  const handleSwipeClose = useEffectEvent(() => {
    swipeDismissedRef.current = true;
    void Haptics.selectionAsync();
    props.onClose();
  });

  const [panGesture] = useState(() => {
    // oxlint-disable-next-line react/capitalized-calls -- Gesture.Pan is a gesture factory, not a React component.
    return Gesture.Pan()
      .activeOffsetY([10, 999])
      .failOffsetX([-26, 26])
      .onUpdate((event) => {
        if (!allowSwipeShared.value) return;
        if (event.translationY < 0) {
          dragY.value = computeRubberBandOffset(event.translationY, 34);
        } else {
          dragY.value = event.translationY;
        }
      })
      .onEnd((event) => {
        if (!allowSwipeShared.value) return;
        const shouldClose =
          event.translationY > DISMISS_DRAG_DISTANCE || event.velocityY > DISMISS_DRAG_VELOCITY;
        if (shouldClose) {
          dragY.value = withTiming(440, {
            duration: SHEET_EXIT_MS,
            easing: Easing.out(Easing.cubic),
            reduceMotion: ReduceMotion.System,
          });
          backdrop.value = withTiming(0, IOS_TIMING_BACKDROP_OUT);
          runOnJS(handleSwipeClose)();
          return;
        }
        dragY.value = withSpring(0, IOS_SPRING_SHEET);
      });
  });

  const backdropStyle = useAnimatedStyle(() => {
    const dragFade = Math.max(0.15, 1 - Math.max(0, dragY.value) / 340);
    return {
      opacity: backdrop.value * dragFade,
    };
  });

  const contentAnimatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (isSheet) {
      return {
        opacity: Math.min(1, p * 1.45),
        transform: [
          { translateY: (1 - p) * 76 + dragY.value },
          { scale: 0.965 + 0.035 * p },
        ],
      };
    }
    return {
      opacity: Math.min(1, p * 1.35),
      transform: [
        { translateY: (1 - p) * 44 },
        { scale: 0.97 + 0.03 * p },
      ],
    };
  });

  if (!mounted) return null;

  const backdropColor =
    props.backdropColor ?? (isSheet ? "rgba(0, 0, 0, 0.56)" : "rgba(4, 4, 8, 0.94)");

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={props.onClose}
    >
      <GestureHandlerRootView style={styles.root}>
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: backdropColor }, backdropStyle]}
        />
        {isSheet ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            pointerEvents={props.visible ? "box-none" : "none"}
            style={[styles.sheetBackdrop, props.containerStyle]}
          >
            <Pressable
              accessible={false}
              style={StyleSheet.absoluteFill}
              onPress={props.onClose}
            />
            <GestureDetector gesture={panGesture}>
              <Animated.View style={[props.sheetStyle, contentAnimatedStyle]}>
                {props.children}
              </Animated.View>
            </GestureDetector>
          </KeyboardAvoidingView>
        ) : (
          <Animated.View
            pointerEvents={props.visible ? "auto" : "none"}
            style={[styles.fullscreenContent, props.containerStyle, contentAnimatedStyle]}
          >
            {props.children}
          </Animated.View>
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
  },
  fullscreenContent: {
    flex: 1,
  },
});
