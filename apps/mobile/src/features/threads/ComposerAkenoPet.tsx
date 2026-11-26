import * as Haptics from "expo-haptics";
import { Image, type ImageSource } from "expo-image";
import { useGT } from "gt-react-native";
import { memo, useCallback, useEffect, useRef, useState } from "react";
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

import { isLateNightHour } from "../../components/AkenoMascot";
import { AppText as Text } from "../../components/ui/AppText";
import { useAppActive, useReduceMotionEnabled } from "../../lib/appState";
import { playUiSound } from "../../lib/uiSoundFx";

export type ComposerAkenoPose = "idle" | "walk" | "working" | "happy" | "sleepy";

const AKENO_PET_SOURCES: Readonly<Record<ComposerAkenoPose, ImageSource>> = {
  idle: require("../../../assets/akeno-pet-idle.webp"),
  walk: require("../../../assets/akeno-pet-walk.webp"),
  working: require("../../../assets/akeno-pet-working.webp"),
  happy: require("../../../assets/akeno-pet-happy.webp"),
  sleepy: require("../../../assets/akeno-pet-sleepy.webp"),
};

const EDGE_MARGIN = 10;
const WALK_SPEED_DP_PER_SEC = 74;
const AFK_SLEEP_MS = 90_000;
const DOUBLE_TAP_WINDOW_MS = 340;

const TAP_SPRING = {
  damping: 11,
  stiffness: 340,
  mass: 0.62,
  reduceMotion: ReduceMotion.System,
};

const TAP_WHISPERS: readonly string[] = [
  "Ara ara~ ♥",
  "You've got this! ✦",
  "Double-tap to roam ✨",
  "Hold for limits 💜",
  "Pure OLED magic ♥",
];

const DONE_WHISPERS: readonly string[] = [
  "All done~ ♥",
  "Shipped! ✨",
  "Nice work~ 💜",
];

/**
 * Interactive 165Hz roaming pixel-art Akeno pet perched on the top rim of the chat composer.
 * - Default pose: user's sitting Akeno with pixel blink & gentle sway.
 * - Roams autonomously right <-> left along the composer edge (auto-mirrored walk cycle).
 * - Switches to Working pose (mini glowing lavender laptop) whenever the chat is busy.
 * - Celebrates with Happy wink & hearts when a reply finishes or when tapped.
 * - Dozes into Sleepy Zzz pose late at night (11 PM–6 AM) or after 90s AFK.
 * - Single tap: giggle bounce + wink + whisper; Double tap: walk to opposite side; Long press: open limits.
 */
export const ComposerAkenoPet = memo(function ComposerAkenoPet(props: {
  readonly stageWidth: number;
  readonly activeThreadBusy: boolean;
  readonly isTyping: boolean;
  readonly size?: number;
  readonly onPressOpenLimits?: () => void;
}) {
  const gt = useGT();
  const appActive = useAppActive();
  const reducedMotion = useReduceMotionEnabled();
  const size = props.size ?? 74;

  const maxX = Math.max(EDGE_MARGIN, props.stageWidth - size - EDGE_MARGIN);
  const canRoam = maxX > EDGE_MARGIN + 32;

  const [pose, setPose] = useState<ComposerAkenoPose>(() =>
    props.activeThreadBusy ? "working" : isLateNightHour() ? "sleepy" : "idle",
  );
  // facing: 1 = facing left (native sprite orientation), -1 = mirrored facing right
  const [facing, setFacing] = useState<1 | -1>(1);
  const [whisper, setWhisper] = useState<string | null>(null);

  const posXRef = useRef<number>(maxX);
  const initializedRef = useRef(false);
  const walkingRef = useRef(false);
  const lastTapAtRef = useRef(0);
  const whisperIndexRef = useRef(0);
  const prevBusyRef = useRef(props.activeThreadBusy);

  const walkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roamTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const happyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const whisperTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const afkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const posX = useSharedValue(maxX);
  const jumpY = useSharedValue(0);
  const walkBobY = useSharedValue(0);
  const tiltDeg = useSharedValue(0);
  const popScale = useSharedValue(1);

  const clearTimer = (ref: { current: ReturnType<typeof setTimeout> | null }) => {
    if (ref.current !== null) {
      clearTimeout(ref.current);
      ref.current = null;
    }
  };

  const showWhisper = useCallback((message: string, durationMs = 2400) => {
    clearTimer(whisperTimerRef);
    setWhisper(message);
    whisperTimerRef.current = setTimeout(() => {
      whisperTimerRef.current = null;
      setWhisper(null);
    }, durationMs);
  }, []);

  const stopWalking = useCallback(
    (settlePose?: ComposerAkenoPose) => {
      if (!walkingRef.current) {
        if (settlePose) setPose(settlePose);
        return;
      }
      walkingRef.current = false;
      clearTimer(walkTimerRef);
      cancelAnimation(posX);
      cancelAnimation(walkBobY);
      walkBobY.set(withTiming(0, { duration: 120, reduceMotion: ReduceMotion.System }));
      if (settlePose) setPose(settlePose);
    },
    [posX, walkBobY],
  );

  // Sync horizontal bounds when composer width first measures or changes (e.g. rotation / resize).
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- clamps roaming position to measured composer stage width
  useEffect(() => {
    if (props.stageWidth <= 0) return;
    if (!initializedRef.current) {
      initializedRef.current = true;
      posXRef.current = maxX;
      posX.set(maxX);
      setFacing(1);
      return;
    }
    const clamped = Math.min(maxX, Math.max(EDGE_MARGIN, posXRef.current));
    if (clamped !== posXRef.current) {
      posXRef.current = clamped;
      posX.set(clamped);
    }
  }, [maxX, posX, props.stageWidth]);

  // Trigger a smooth stroll from current X to target X across the composer bar.
  const startWalkTo = useCallback(
    (targetX: number) => {
      if (reducedMotion || !appActive || props.activeThreadBusy || !canRoam) return;
      const clampedTarget = Math.min(maxX, Math.max(EDGE_MARGIN, targetX));
      const distance = Math.abs(clampedTarget - posXRef.current);
      if (distance < 18) return;

      clearTimer(walkTimerRef);
      clearTimer(happyTimerRef);
      walkingRef.current = true;

      const movingLeft = clampedTarget < posXRef.current;
      // Native walk sprite walks to the left (scaleX: 1); mirror (-1) to walk right.
      setFacing(movingLeft ? 1 : -1);
      setPose("walk");

      const durationMs = Math.max(950, Math.min(4800, Math.round((distance / WALK_SPEED_DP_PER_SEC) * 1000)));
      posXRef.current = clampedTarget;
      posX.set(
        withTiming(clampedTarget, {
          duration: durationMs,
          easing: Easing.inOut(Easing.quad),
          reduceMotion: ReduceMotion.System,
        }),
      );
      walkBobY.set(
        withRepeat(
          withSequence(
            withTiming(-3.2, { duration: 165, easing: Easing.out(Easing.quad) }),
            withTiming(0, { duration: 165, easing: Easing.in(Easing.quad) }),
          ),
          -1,
          false,
        ),
      );

      walkTimerRef.current = setTimeout(() => {
        walkTimerRef.current = null;
        walkingRef.current = false;
        cancelAnimation(walkBobY);
        walkBobY.set(withTiming(0, { duration: 110, reduceMotion: ReduceMotion.System }));
        // Turn gently inward toward the middle of the chat bar when sitting down!
        const settledOnLeft = clampedTarget < (EDGE_MARGIN + maxX) / 2;
        setFacing(settledOnLeft ? -1 : 1);
        setPose("idle");
        // Cute little sit-down settle hop
        jumpY.set(
          withSequence(
            withTiming(-4.5, { duration: 90, easing: Easing.out(Easing.cubic) }),
            withSpring(0, TAP_SPRING),
          ),
        );
      }, durationMs);
    },
    [appActive, canRoam, jumpY, maxX, posX, props.activeThreadBusy, reducedMotion, walkBobY],
  );

  // React to chat busy / turn completion transitions.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- switches Akeno into working laptop pose while chat runs and happy celebration when done
  useEffect(() => {
    const wasBusy = prevBusyRef.current;
    prevBusyRef.current = props.activeThreadBusy;

    if (props.activeThreadBusy) {
      clearTimer(roamTimerRef);
      clearTimer(happyTimerRef);
      clearTimer(afkTimerRef);
      stopWalking("working");
      if (!reducedMotion) {
        popScale.set(
          withSequence(
            withTiming(1.09, { duration: 90, easing: Easing.out(Easing.cubic) }),
            withSpring(1, TAP_SPRING),
          ),
        );
      }
      return;
    }

    if (wasBusy && !props.activeThreadBusy) {
      stopWalking("happy");
      const msg = DONE_WHISPERS[whisperIndexRef.current % DONE_WHISPERS.length]!;
      whisperIndexRef.current += 1;
      showWhisper(msg, 2800);
      if (!reducedMotion) {
        jumpY.set(
          withSequence(
            withTiming(-9, { duration: 110, easing: Easing.out(Easing.cubic) }),
            withSpring(0, TAP_SPRING),
          ),
        );
        popScale.set(
          withSequence(
            withTiming(1.12, { duration: 95, easing: Easing.out(Easing.cubic) }),
            withSpring(1, TAP_SPRING),
          ),
        );
      }
      clearTimer(happyTimerRef);
      happyTimerRef.current = setTimeout(() => {
        happyTimerRef.current = null;
        setPose("idle");
      }, 3600);
    }
  }, [jumpY, popScale, props.activeThreadBusy, reducedMotion, showWhisper, stopWalking]);

  // Subtle curious tilt when the user is typing in the composer; gently wake if sleepy.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- tilts Akeno curiously while typing and wakes from sleepy pose
  useEffect(() => {
    if (props.isTyping && !props.activeThreadBusy) {
      if (pose === "sleepy") setPose("idle");
      if (!reducedMotion) {
        tiltDeg.set(withSpring(facing === 1 ? -4 : 4, TAP_SPRING));
      }
    } else if (!reducedMotion) {
      tiltDeg.set(withSpring(0, TAP_SPRING));
    }
  }, [facing, pose, props.activeThreadBusy, props.isTyping, reducedMotion, tiltDeg]);

  // Autonomous roaming scheduler while idle (occasionally strolls right <-> left or center on her own!).
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- schedules occasional autonomous right <-> left strolls when idle
  useEffect(() => {
    clearTimer(roamTimerRef);
    if (!appActive || reducedMotion || !canRoam || props.activeThreadBusy || props.isTyping || pose !== "idle") {
      return;
    }
    const delayMs = 15_000 + Math.floor(Math.random() * 14_000);
    roamTimerRef.current = setTimeout(() => {
      roamTimerRef.current = null;
      const midX = (EDGE_MARGIN + maxX) / 2;
      const onRight = posXRef.current > midX;
      // 75% stroll all the way across (right <-> left), 25% perch near center!
      const goCenter = Math.random() < 0.25 && Math.abs(posXRef.current - midX) > 48;
      const targetX = goCenter ? midX : onRight ? EDGE_MARGIN : maxX;
      startWalkTo(targetX);
    }, delayMs);

    return () => clearTimer(roamTimerRef);
  }, [appActive, canRoam, maxX, pose, props.activeThreadBusy, props.isTyping, reducedMotion, startWalkTo]);

  // Gentle AFK sleepy transition after 90s of total inactivity.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- settles Akeno into cozy sleepy pose after extended inactivity
  useEffect(() => {
    clearTimer(afkTimerRef);
    if (!appActive || props.activeThreadBusy || props.isTyping || pose !== "idle") {
      return;
    }
    afkTimerRef.current = setTimeout(() => {
      afkTimerRef.current = null;
      setPose("sleepy");
    }, AFK_SLEEP_MS);

    return () => clearTimer(afkTimerRef);
  }, [appActive, pose, props.activeThreadBusy, props.isTyping]);

  // Clean up all timers on unmount.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- clears roaming and reaction timers on unmount
  useEffect(() => {
    return () => {
      clearTimer(walkTimerRef);
      clearTimer(roamTimerRef);
      clearTimer(happyTimerRef);
      clearTimer(whisperTimerRef);
      clearTimer(afkTimerRef);
    };
  }, []);

  const handlePress = () => {
    const now = Date.now();
    const isDoubleTap = now - lastTapAtRef.current <= DOUBLE_TAP_WINDOW_MS;
    lastTapAtRef.current = now;

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playUiSound("shuffle");

    if (isDoubleTap && !props.activeThreadBusy && canRoam) {
      const midX = (EDGE_MARGIN + maxX) / 2;
      const targetX = posXRef.current > midX ? EDGE_MARGIN : maxX;
      showWhisper(gt("Coming over~ ✨"), 1800);
      startWalkTo(targetX);
      return;
    }

    if (!reducedMotion) {
      jumpY.set(
        withSequence(
          withTiming(-9, { duration: 95, easing: Easing.out(Easing.cubic) }),
          withSpring(0, TAP_SPRING),
        ),
      );
      popScale.set(
        withSequence(
          withTiming(1.13, { duration: 85, easing: Easing.out(Easing.cubic) }),
          withSpring(1, TAP_SPRING),
        ),
      );
      tiltDeg.set(
        withSequence(
          withTiming(-7, { duration: 70, easing: Easing.out(Easing.cubic) }),
          withTiming(6, { duration: 90, easing: Easing.inOut(Easing.cubic) }),
          withSpring(0, TAP_SPRING),
        ),
      );
    }

    if (props.activeThreadBusy) {
      showWhisper(gt("Working hard~ 💜"), 2000);
      return;
    }

    stopWalking("happy");
    const nextWhisper = TAP_WHISPERS[whisperIndexRef.current % TAP_WHISPERS.length]!;
    whisperIndexRef.current += 1;
    showWhisper(nextWhisper, 2400);

    clearTimer(happyTimerRef);
    happyTimerRef.current = setTimeout(() => {
      happyTimerRef.current = null;
      setPose("idle");
    }, 3200);
  };

  const handleLongPress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    props.onPressOpenLimits?.();
  };

  const carrierStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: posX.value }],
  }));

  const spriteStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: jumpY.value + walkBobY.value },
      { rotate: `${tiltDeg.value}deg` },
      { scale: popScale.value },
    ],
  }));

  const shouldAnimateWebp = appActive && !reducedMotion;
  const whisperOnLeft = posXRef.current > (EDGE_MARGIN + maxX) / 2;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: -(size - 7),
        height: size + 4,
        zIndex: 12,
        overflow: "visible",
      }}
    >
      <Animated.View
        pointerEvents="box-none"
        style={[
          {
            position: "absolute",
            left: 0,
            bottom: 0,
            width: size,
            height: size,
            overflow: "visible",
          },
          carrierStyle,
        ]}
      >
        {whisper ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 10,
              width: 176,
              ...(whisperOnLeft
                ? { right: size - 2, alignItems: "flex-end" }
                : { left: size - 2, alignItems: "flex-start" }),
              zIndex: 20,
            }}
          >
            <View
              style={{
                paddingHorizontal: 9,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: "rgba(24, 16, 34, 0.92)",
                borderWidth: 1,
                borderColor: "rgba(192, 132, 252, 0.38)",
              }}
            >
              <Text
                allowFontScaling={false}
                numberOfLines={1}
                style={{
                  fontSize: 10.5,
                  lineHeight: 13,
                  color: "#F3E8FF",
                  fontWeight: "600",
                }}
              >
                {whisper}
              </Text>
            </View>
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={gt("Akeno chat bar pet. Tap to interact, double-tap to walk across, hold for usage limits.")}
          hitSlop={8}
          delayLongPress={420}
          onPress={handlePress}
          onLongPress={props.onPressOpenLimits ? handleLongPress : undefined}
          style={{
            width: size,
            height: size,
            alignItems: "center",
            justifyContent: "flex-end",
          }}
        >
          <Animated.View
            style={[
              {
                width: size,
                height: size,
              },
              spriteStyle,
            ]}
          >
            <View
              style={{
                width: size,
                height: size,
                transform: [{ scaleX: facing }],
              }}
            >
              <Image
                source={AKENO_PET_SOURCES[pose]}
                autoplay={shouldAnimateWebp}
                transition={110}
                accessibilityIgnoresInvertColors
                contentFit="contain"
                style={{ width: size, height: size }}
              />
            </View>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </View>
  );
});
