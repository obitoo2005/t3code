import * as Haptics from "expo-haptics";
import { Image, type ImageSource } from "expo-image";
import { useGT } from "gt-react-native";
import { memo, useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  runOnJS,
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
import { subscribeCompanionWhisper } from "./activeThreadComposerBridge";

export type ComposerAkenoPose = "idle" | "walk" | "working" | "happy" | "sleepy" | "picked";

const AKENO_PET_SOURCES: Readonly<Record<ComposerAkenoPose, ImageSource>> = {
  idle: require("../../../assets/akeno-pet-idle.webp"),
  walk: require("../../../assets/akeno-pet-walk.webp"),
  working: require("../../../assets/akeno-pet-working.webp"),
  happy: require("../../../assets/akeno-pet-happy.webp"),
  sleepy: require("../../../assets/akeno-pet-sleepy.webp"),
  picked: require("../../../assets/akeno-pet-picked.webp"),
};

const EDGE_MARGIN = 18;
const WALK_SPEED_DP_PER_SEC = 74;
const AFK_SLEEP_MS = 90_000;
const DOUBLE_TAP_WINDOW_MS = 340;
const WALK_RIM_LIFT_DP = -13;
const PICK_UP_HOLD_MS = 160;
const PICK_UP_LIFT_DP = -22;
const MANUAL_PLACE_HOLD_MS = 45_000;

const TAP_SPRING = {
  damping: 11,
  stiffness: 340,
  mass: 0.62,
  reduceMotion: ReduceMotion.System,
};

const PICK_UP_SPRING = {
  damping: 14,
  stiffness: 360,
  mass: 0.65,
  reduceMotion: ReduceMotion.System,
};

const DROP_SPRING = {
  damping: 12,
  stiffness: 320,
  mass: 0.7,
  reduceMotion: ReduceMotion.System,
};

const SWING_SPRING = {
  damping: 12,
  stiffness: 220,
  mass: 0.65,
  reduceMotion: ReduceMotion.System,
};

const TAP_WHISPERS: readonly string[] = [
  "Ara ara~ ♥",
  "You've got this! ✦",
  "Double-tap to roam ✨",
  "Hold & drag me~ 💜",
  "Pure OLED magic ♥",
];

const PICK_UP_WHISPERS: readonly string[] = [
  "Kyaa~! Put me down! ✨",
  "H-hey, careful~! 💜",
  "Where are we going? ♥",
  "Whoa, high up~! ✨",
];

const DROP_WHISPERS: readonly string[] = [
  "Hehe, comfy spot~ ♥",
  "Nice view from here! 💜",
  "Right here works~ ✨",
  "Safe landing~ ♥",
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
 * - Single tap: giggle bounce + wink + whisper; Double tap: walk to opposite side.
 * - Press & hold + drag: pick Akeno up with dangling pendulum physics & drop her anywhere on the bar.
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
  const [whisperOnLeft, setWhisperOnLeft] = useState(true);

  const posXRef = useRef<number>(maxX);
  const initializedRef = useRef(false);
  const walkingRef = useRef(false);
  const draggingRef = useRef(false);
  const manualHoldUntilRef = useRef(0);
  const lastTapAtRef = useRef(0);
  const whisperIndexRef = useRef(0);
  const pickupWhisperIndexRef = useRef(0);
  const dropWhisperIndexRef = useRef(0);
  const prevBusyRef = useRef(props.activeThreadBusy);

  const walkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roamTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const happyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const whisperTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const afkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const posX = useSharedValue(maxX);
  const maxXShared = useSharedValue(maxX);
  const reducedMotionShared = useSharedValue(reducedMotion);
  const isPickedUpShared = useSharedValue(0);
  const dragStartX = useSharedValue(maxX);
  const dragLiftY = useSharedValue(0);
  const dragOffsetY = useSharedValue(0);
  const dragSwingDeg = useSharedValue(0);
  const dangleWobbleDeg = useSharedValue(0);
  const squashScaleX = useSharedValue(1);
  const squashScaleY = useSharedValue(1);
  const lastDragFacingShared = useSharedValue<1 | -1>(1);
  const lastOnRightShared = useSharedValue(true);

  const jumpY = useSharedValue(0);
  const walkBobY = useSharedValue(0);
  const seatLiftY = useSharedValue(0);
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

  // Keep worklet-readable bounds and reduced-motion flag synced without recreating gestures.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- mirrors latest bounds and motion preference to UI-thread shared values
  useEffect(() => {
    maxXShared.set(maxX);
    reducedMotionShared.set(reducedMotion);
  }, [maxX, maxXShared, reducedMotion, reducedMotionShared]);

  // Sync horizontal bounds when composer width first measures or changes (e.g. rotation / resize).
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- clamps roaming position to measured composer stage width
  useEffect(() => {
    if (props.stageWidth <= 0) return;
    const midX = (EDGE_MARGIN + maxX) / 2;
    if (!initializedRef.current) {
      initializedRef.current = true;
      posXRef.current = maxX;
      posX.set(maxX);
      setFacing(1);
      lastDragFacingShared.set(1);
      const onRight = maxX > midX;
      lastOnRightShared.set(onRight);
      setWhisperOnLeft(onRight);
      return;
    }
    if (draggingRef.current) return;
    const clamped = Math.min(maxX, Math.max(EDGE_MARGIN, posXRef.current));
    if (clamped !== posXRef.current) {
      posXRef.current = clamped;
      posX.set(clamped);
    }
    const onRight = clamped > midX;
    lastOnRightShared.set(onRight);
    setWhisperOnLeft(onRight);
  }, [lastDragFacingShared, lastOnRightShared, maxX, posX, props.stageWidth]);

  // Trigger a smooth stroll from current X to target X across the composer bar.
  const startWalkTo = useCallback(
    (targetX: number) => {
      if (reducedMotion || !appActive || props.activeThreadBusy || !canRoam || draggingRef.current) return;
      const clampedTarget = Math.min(maxX, Math.max(EDGE_MARGIN, targetX));
      const distance = Math.abs(clampedTarget - posXRef.current);
      if (distance < 18) return;

      clearTimer(walkTimerRef);
      clearTimer(happyTimerRef);
      walkingRef.current = true;

      const movingLeft = clampedTarget < posXRef.current;
      // Native walk sprite walks to the left (scaleX: 1); mirror (-1) to walk right.
      const nextFacing: 1 | -1 = movingLeft ? 1 : -1;
      setFacing(nextFacing);
      lastDragFacingShared.set(nextFacing);
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
        const settledFacing: 1 | -1 = settledOnLeft ? -1 : 1;
        setFacing(settledFacing);
        lastDragFacingShared.set(settledFacing);
        lastOnRightShared.set(!settledOnLeft);
        setWhisperOnLeft(!settledOnLeft);
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
    [
      appActive,
      canRoam,
      jumpY,
      lastDragFacingShared,
      lastOnRightShared,
      maxX,
      posX,
      props.activeThreadBusy,
      reducedMotion,
      walkBobY,
    ],
  );

  // React to chat busy / turn completion transitions.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- switches Akeno into working laptop pose while chat runs and happy celebration when done
  useEffect(() => {
    const wasBusy = prevBusyRef.current;
    prevBusyRef.current = props.activeThreadBusy;

    if (draggingRef.current) return;

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
        if (!draggingRef.current) setPose("idle");
      }, 3600);
    }
  }, [jumpY, popScale, props.activeThreadBusy, reducedMotion, showWhisper, stopWalking]);

  // Subtle curious tilt when the user is typing in the composer; gently wake if sleepy.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- tilts Akeno curiously while typing and wakes from sleepy pose
  useEffect(() => {
    if (draggingRef.current) return;
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
    if (
      !appActive ||
      reducedMotion ||
      !canRoam ||
      props.activeThreadBusy ||
      props.isTyping ||
      pose !== "idle" ||
      draggingRef.current
    ) {
      return;
    }
    const holdRemainingMs = Math.max(0, manualHoldUntilRef.current - Date.now());
    const baseDelayMs = 15_000 + Math.floor(Math.random() * 14_000);
    const delayMs = Math.max(holdRemainingMs, baseDelayMs);
    roamTimerRef.current = setTimeout(() => {
      roamTimerRef.current = null;
      if (draggingRef.current) return;
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
    if (!appActive || props.activeThreadBusy || props.isTyping || pose !== "idle" || draggingRef.current) {
      return;
    }
    afkTimerRef.current = setTimeout(() => {
      afkTimerRef.current = null;
      if (!draggingRef.current) setPose("sleepy");
    }, AFK_SLEEP_MS);

    return () => clearTimer(afkTimerRef);
  }, [appActive, pose, props.activeThreadBusy, props.isTyping]);

  // Lift Akeno up onto the top glass rim while walking, and lower her so her uncropped loafers
  // dangle naturally over the front glass edge when seated.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- smoothly adjusts vertical ledge alignment between walking and sitting poses
  useEffect(() => {
    const targetLift = pose === "walk" ? WALK_RIM_LIFT_DP : 0;
    if (reducedMotion) {
      seatLiftY.set(targetLift);
      return;
    }
    seatLiftY.set(withSpring(targetLift, TAP_SPRING));
  }, [pose, reducedMotion, seatLiftY]);

  // Celebrate daily prompt milestones & quick-save toasts emitted from the composer or feed!
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- subscribes to celebratory companion whispers and plays happy bounce reaction
  useEffect(() => {
    return subscribeCompanionWhisper((message) => {
      showWhisper(message, 3400);
      if (draggingRef.current) return;
      if (!props.activeThreadBusy) {
        stopWalking("happy");
        clearTimer(happyTimerRef);
        happyTimerRef.current = setTimeout(() => {
          happyTimerRef.current = null;
          if (!draggingRef.current) setPose("idle");
        }, 3600);
      }
      if (!reducedMotion) {
        jumpY.set(
          withSequence(
            withTiming(-10, { duration: 105, easing: Easing.out(Easing.cubic) }),
            withSpring(0, TAP_SPRING),
          ),
        );
        popScale.set(
          withSequence(
            withTiming(1.14, { duration: 95, easing: Easing.out(Easing.cubic) }),
            withSpring(1, TAP_SPRING),
          ),
        );
      }
    });
  }, [jumpY, popScale, props.activeThreadBusy, reducedMotion, showWhisper, stopWalking]);

  // Clean up all timers on unmount.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- clears roaming and reaction timers on unmount
  useEffect(() => {
    return () => {
      clearTimer(walkTimerRef);
      clearTimer(roamTimerRef);
      clearTimer(happyTimerRef);
      clearTimer(whisperTimerRef);
      clearTimer(afkTimerRef);
      clearTimer(settleTimerRef);
    };
  }, []);

  const handleTap = useEffectEvent(() => {
    if (draggingRef.current) return;
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
      if (!draggingRef.current) setPose("idle");
    }, 3200);
  });

  const handlePickUpStart = useEffectEvent((currentX: number) => {
    draggingRef.current = true;
    walkingRef.current = false;
    posXRef.current = currentX;

    clearTimer(walkTimerRef);
    clearTimer(roamTimerRef);
    clearTimer(happyTimerRef);
    clearTimer(afkTimerRef);
    clearTimer(settleTimerRef);

    cancelAnimation(walkBobY);
    walkBobY.set(0);
    setPose("picked");

    const onRight = currentX > (EDGE_MARGIN + maxX) / 2;
    setWhisperOnLeft(onRight);

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    playUiSound("shuffle");

    const nextWhisper = PICK_UP_WHISPERS[pickupWhisperIndexRef.current % PICK_UP_WHISPERS.length]!;
    pickupWhisperIndexRef.current += 1;
    showWhisper(nextWhisper, 3200);
  });

  const handleDragFacingChange = useEffectEvent((nextFacing: 1 | -1) => {
    setFacing(nextFacing);
  });

  const handleDragSideChange = useEffectEvent((onRight: boolean) => {
    setWhisperOnLeft(onRight);
  });

  const handlePickUpEnd = useEffectEvent((finalX: number) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;

    const clampedFinalX = Math.min(maxX, Math.max(EDGE_MARGIN, finalX));
    posXRef.current = clampedFinalX;
    manualHoldUntilRef.current = Date.now() + MANUAL_PLACE_HOLD_MS;

    const settledOnLeft = clampedFinalX < (EDGE_MARGIN + maxX) / 2;
    const settledFacing: 1 | -1 = settledOnLeft ? -1 : 1;
    setFacing(settledFacing);
    lastDragFacingShared.set(settledFacing);
    lastOnRightShared.set(!settledOnLeft);
    setWhisperOnLeft(!settledOnLeft);

    clearTimer(settleTimerRef);
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, 80);

    if (props.activeThreadBusy) {
      setPose("working");
      showWhisper(gt("Back to work~ 💜"), 1800);
      return;
    }

    setPose("happy");
    const nextDropWhisper = DROP_WHISPERS[dropWhisperIndexRef.current % DROP_WHISPERS.length]!;
    dropWhisperIndexRef.current += 1;
    showWhisper(nextDropWhisper, 2100);

    clearTimer(happyTimerRef);
    happyTimerRef.current = setTimeout(() => {
      happyTimerRef.current = null;
      if (!draggingRef.current) setPose("idle");
    }, 2200);
  });

  const [petGesture] = useState(() => {
    // oxlint-disable-next-line react/capitalized-calls -- Gesture.Pan is a gesture factory, not a React component.
    const panGesture = Gesture.Pan()
      .activateAfterLongPress(PICK_UP_HOLD_MS)
      .hitSlop(10)
      .onStart(() => {
        const currentX = posX.value;
        cancelAnimation(posX);
        posX.value = currentX;
        dragStartX.value = currentX;
        isPickedUpShared.value = 1;
        lastOnRightShared.value = currentX > (EDGE_MARGIN + maxXShared.value) / 2;

        if (reducedMotionShared.value) {
          dragLiftY.value = PICK_UP_LIFT_DP * 0.7;
        } else {
          dragLiftY.value = withSpring(PICK_UP_LIFT_DP, PICK_UP_SPRING);
          // Cute upward "yoink!" collar-stretch when lifted!
          squashScaleX.value = withSequence(
            withTiming(0.9, { duration: 85, easing: Easing.out(Easing.cubic) }),
            withSpring(1, PICK_UP_SPRING),
          );
          squashScaleY.value = withSequence(
            withTiming(1.12, { duration: 85, easing: Easing.out(Easing.cubic) }),
            withSpring(1, PICK_UP_SPRING),
          );
          // Gentle looping pendulum dangle while held in midair
          dangleWobbleDeg.value = withSequence(
            withTiming(-5.5, { duration: 190, easing: Easing.inOut(Easing.sin) }),
            withRepeat(
              withSequence(
                withTiming(5.5, { duration: 380, easing: Easing.inOut(Easing.sin) }),
                withTiming(-5.5, { duration: 380, easing: Easing.inOut(Easing.sin) }),
              ),
              -1,
              false,
            ),
          );
        }

        runOnJS(handlePickUpStart)(currentX);
      })
      .onUpdate((event) => {
        if (isPickedUpShared.value !== 1) return;
        const limitMaxX = maxXShared.value;
        const nextX = Math.min(limitMaxX, Math.max(EDGE_MARGIN, dragStartX.value + event.translationX));
        posX.value = nextX;

        const nextOnRight = nextX > (EDGE_MARGIN + limitMaxX) / 2;
        if (nextOnRight !== lastOnRightShared.value) {
          lastOnRightShared.value = nextOnRight;
          runOnJS(handleDragSideChange)(nextOnRight);
        }

        const clampedY = Math.min(6, Math.max(-32, event.translationY * 0.42));
        dragOffsetY.value = clampedY;

        if (!reducedMotionShared.value) {
          // Pendulum trail: dragging right (+velocityX) swings feet smoothly left (+deg).
          const targetSwing = Math.min(22, Math.max(-22, event.velocityX * 0.022));
          dragSwingDeg.value = withSpring(targetSwing, SWING_SPRING);
        }

        if (event.velocityX < -220 && lastDragFacingShared.value !== 1) {
          lastDragFacingShared.value = 1;
          runOnJS(handleDragFacingChange)(1);
        } else if (event.velocityX > 220 && lastDragFacingShared.value !== -1) {
          lastDragFacingShared.value = -1;
          runOnJS(handleDragFacingChange)(-1);
        }
      })
      .onFinalize(() => {
        if (isPickedUpShared.value !== 1) return;
        isPickedUpShared.value = 0;

        const finalX = Math.min(maxXShared.value, Math.max(EDGE_MARGIN, posX.value));
        posX.value = finalX;

        cancelAnimation(dangleWobbleDeg);

        if (reducedMotionShared.value) {
          dragLiftY.value = 0;
          dragOffsetY.value = 0;
          dragSwingDeg.value = 0;
          dangleWobbleDeg.value = 0;
          squashScaleX.value = 1;
          squashScaleY.value = 1;
        } else {
          dragLiftY.value = withSpring(0, DROP_SPRING);
          dragOffsetY.value = withSpring(0, DROP_SPRING);
          dragSwingDeg.value = withSpring(0, {
            damping: 10,
            stiffness: 240,
            mass: 0.65,
            reduceMotion: ReduceMotion.System,
          });
          dangleWobbleDeg.value = withSpring(0, TAP_SPRING);
          // Juicy squash-and-stretch cushion bounce as she lands back on the rim!
          squashScaleX.value = withSequence(
            withTiming(0.95, { duration: 60, easing: Easing.in(Easing.quad) }),
            withTiming(1.16, { duration: 85, easing: Easing.out(Easing.cubic) }),
            withSpring(1, TAP_SPRING),
          );
          squashScaleY.value = withSequence(
            withTiming(1.06, { duration: 60, easing: Easing.in(Easing.quad) }),
            withTiming(0.84, { duration: 85, easing: Easing.out(Easing.cubic) }),
            withSpring(1, TAP_SPRING),
          );
        }

        runOnJS(handlePickUpEnd)(finalX);
      });

    // oxlint-disable-next-line react/capitalized-calls -- Gesture.Tap is a gesture factory, not a React component.
    const tapGesture = Gesture.Tap()
      .maxDuration(260)
      .hitSlop(8)
      .onEnd(() => {
        runOnJS(handleTap)();
      });

    // oxlint-disable-next-line react/capitalized-calls -- Gesture.Exclusive is a gesture composer, not a React component.
    return Gesture.Exclusive(panGesture, tapGesture);
  });

  const carrierStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: posX.value }],
  }));

  const whisperFloatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragLiftY.value + dragOffsetY.value }],
  }));

  const shadowStyle = useAnimatedStyle(() => {
    const lift = Math.max(0, -(dragLiftY.value + dragOffsetY.value));
    const progress = Math.min(1, lift / 22);
    const depthRatio = 1 - Math.min(1, lift / 64);
    return {
      opacity: progress * 0.58,
      transform: [
        { scaleX: 0.68 + depthRatio * 0.4 },
        { scaleY: 0.72 + depthRatio * 0.28 },
      ],
    };
  });

  const pivotY = size * 0.34;
  const spriteStyle = useAnimatedStyle(() => {
    const totalTilt = tiltDeg.value + dragSwingDeg.value + dangleWobbleDeg.value;
    return {
      transform: [
        { translateY: jumpY.value + walkBobY.value + seatLiftY.value + dragLiftY.value + dragOffsetY.value },
        { translateY: -pivotY },
        { rotate: `${totalTilt}deg` },
        { translateY: pivotY },
        { scaleX: popScale.value * squashScaleX.value },
        { scaleY: popScale.value * squashScaleY.value },
      ],
    };
  });

  const shouldAnimateWebp = appActive && !reducedMotion;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: -(size - 16),
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
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                top: 10,
                width: 176,
                ...(whisperOnLeft
                  ? { right: size - 2, alignItems: "flex-end" }
                  : { left: size - 2, alignItems: "flex-start" }),
                zIndex: 20,
              },
              whisperFloatStyle,
            ]}
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
          </Animated.View>
        ) : null}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              bottom: 12,
              left: (size - 38) / 2,
              width: 38,
              height: 8,
              borderRadius: 999,
              backgroundColor: "rgba(18, 10, 28, 0.85)",
              borderWidth: 1,
              borderColor: "rgba(192, 132, 252, 0.22)",
            },
            shadowStyle,
          ]}
        />
        <GestureDetector gesture={petGesture}>
          <View
            accessible
            accessibilityRole="button"
            accessibilityLabel={gt(
              "Akeno chat bar pet. Tap to interact, double-tap to walk across, press and hold to pick up and drag.",
            )}
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
          </View>
        </GestureDetector>
      </Animated.View>
    </View>
  );
});
