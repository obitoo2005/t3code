import * as Haptics from "expo-haptics";
import { Image, type ImageSource } from "expo-image";
import { useGT } from "gt-react-native";
import { memo, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
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

import { isLateNightHour, RIAS_MOOD_SOURCES } from "../../components/AkenoMascot";
import { AppText as Text } from "../../components/ui/AppText";
import {
  type SyncedAkenoPose,
  type SyncedRiasSprite,
  useAkenoPosePack,
} from "../../lib/akenoPosePack";
import { useAppActive, useReduceMotionEnabled } from "../../lib/appState";
import { playCompanionVoice } from "../../lib/companionVoiceFx";
import { playUiSound } from "../../lib/uiSoundFx";
import { subscribeCompanionWhisper } from "./activeThreadComposerBridge";

export type ComposerPetCharacter = "akeno" | "rias";
export type ComposerPetSlot = "solo" | "left" | "right";

export type ComposerAkenoCorePose =
  | "idle"
  | "walk"
  | "working"
  | "happy"
  | "sleepy"
  | "picked";

export type ComposerAkenoPose = ComposerAkenoCorePose | (string & {});

const AKENO_CORE_SOURCES: Readonly<Record<ComposerAkenoCorePose, ImageSource>> = {
  idle: require("../../../assets/akeno-pet-idle.webp"),
  walk: require("../../../assets/akeno-pet-walk.webp"),
  working: require("../../../assets/akeno-pet-working.webp"),
  happy: require("../../../assets/akeno-pet-happy.webp"),
  sleepy: require("../../../assets/akeno-pet-sleepy.webp"),
  picked: require("../../../assets/akeno-pet-picked.webp"),
};

const RIAS_CORE_SOURCES: Readonly<Record<ComposerAkenoCorePose, ImageSource>> = {
  idle: RIAS_MOOD_SOURCES.cute,
  walk: RIAS_MOOD_SOURCES.happy,
  working: RIAS_MOOD_SOURCES.cute,
  happy: RIAS_MOOD_SOURCES.happy,
  sleepy: RIAS_MOOD_SOURCES.sleepy,
  picked: RIAS_MOOD_SOURCES.surprised,
};

const CORE_POSE_WHISPERS: Readonly<Partial<Record<ComposerAkenoCorePose, string>>> = {
  idle: "Ara ara~ ♥",
  happy: "Hehe~ ✨",
  sleepy: "So cozy~ 💤",
};

const RIAS_CORE_POSE_WHISPERS: Readonly<Partial<Record<ComposerAkenoCorePose, string>>> = {
  idle: "Crimson Queen here ✦",
  happy: "Good work~ ♥",
  sleepy: "Rest well, my servant~ 💤",
};

interface AkenoPoseCatalog {
  readonly sourceByPose: Readonly<Record<string, ImageSource>>;
  readonly showcasePoses: readonly string[];
  readonly settlePoses: readonly string[];
  readonly celebrationPoses: readonly string[];
  readonly sleepyPoses: readonly string[];
  readonly sleepyPoseSet: ReadonlySet<string>;
  readonly standingPoseSet: ReadonlySet<string>;
  readonly perchedStaticPoseSet: ReadonlySet<string>;
  readonly whisperByPose: Readonly<Record<string, string>>;
}

function buildAkenoPoseCatalog(syncedPoses: readonly SyncedAkenoPose[]): AkenoPoseCatalog {
  const sourceByPose: Record<string, ImageSource> = { ...AKENO_CORE_SOURCES };
  const whisperByPose: Record<string, string> = {};
  for (const [key, value] of Object.entries(CORE_POSE_WHISPERS)) {
    if (value) whisperByPose[key] = value;
  }

  const syncedShowcase: string[] = [];
  const settlePoses: string[] = ["idle"];
  const celebrationPoses: string[] = ["happy"];
  const sleepyPoses: string[] = ["sleepy"];
  const standingPoseSet = new Set<string>();
  const perchedStaticPoseSet = new Set<string>();

  for (const entry of syncedPoses) {
    if (entry.id in AKENO_CORE_SOURCES) continue;
    sourceByPose[entry.id] = entry.source;
    if (entry.whisper) {
      whisperByPose[entry.id] = entry.whisper;
    }
    if (entry.stance === "standing") {
      standingPoseSet.add(entry.id);
    } else {
      perchedStaticPoseSet.add(entry.id);
    }
    if (entry.roles.includes("showcase")) syncedShowcase.push(entry.id);
    if (entry.roles.includes("settle")) settlePoses.push(entry.id);
    if (entry.roles.includes("celebration")) celebrationPoses.push(entry.id);
    if (entry.roles.includes("sleepy")) sleepyPoses.push(entry.id);
  }

  const showcasePoses: string[] = ["idle"];
  const happyInsertIndex = Math.min(14, syncedShowcase.length);
  for (let i = 0; i < syncedShowcase.length; i += 1) {
    if (i === happyInsertIndex) {
      showcasePoses.push("happy");
    }
    showcasePoses.push(syncedShowcase[i]!);
  }
  if (!showcasePoses.includes("happy")) {
    showcasePoses.push("happy");
  }
  showcasePoses.push("sleepy");

  return {
    sourceByPose,
    showcasePoses,
    settlePoses,
    celebrationPoses,
    sleepyPoses,
    sleepyPoseSet: new Set(sleepyPoses),
    standingPoseSet,
    perchedStaticPoseSet,
    whisperByPose,
  };
}

function buildRiasPoseCatalog(
  syncedPetPoses: readonly SyncedAkenoPose[],
  syncedSprites: readonly SyncedRiasSprite[],
): AkenoPoseCatalog {
  const sourceByPose: Record<string, ImageSource> = { ...RIAS_CORE_SOURCES };
  const whisperByPose: Record<string, string> = {};
  for (const [key, value] of Object.entries(RIAS_CORE_POSE_WHISPERS)) {
    if (value) whisperByPose[key] = value;
  }

  const syncedShowcase: string[] = [];
  const settlePoses: string[] = ["idle"];
  const celebrationPoses: string[] = ["happy"];
  const sleepyPoses: string[] = ["sleepy"];
  const standingPoseSet = new Set<string>();
  const perchedStaticPoseSet = new Set<string>();

  if (syncedPetPoses.length > 0) {
    for (const entry of syncedPetPoses) {
      sourceByPose[entry.id] = entry.source;
      if (entry.whisper) {
        whisperByPose[entry.id] = entry.whisper;
      }
      if (entry.id in RIAS_CORE_SOURCES) continue;
      if (entry.stance === "standing") {
        standingPoseSet.add(entry.id);
      } else {
        perchedStaticPoseSet.add(entry.id);
      }
      if (entry.roles.includes("showcase")) syncedShowcase.push(entry.id);
      if (entry.roles.includes("settle")) settlePoses.push(entry.id);
      if (entry.roles.includes("celebration")) celebrationPoses.push(entry.id);
      if (entry.roles.includes("sleepy")) sleepyPoses.push(entry.id);
    }
  } else {
    for (const entry of syncedSprites) {
      if (entry.id in RIAS_CORE_SOURCES) continue;
      sourceByPose[entry.id] = entry.source;
      if (entry.caption) {
        whisperByPose[entry.id] = entry.caption;
      }
      if (entry.style === "uniform") {
        standingPoseSet.add(entry.id);
      } else {
        perchedStaticPoseSet.add(entry.id);
      }
      syncedShowcase.push(entry.id);
      if (entry.moods.includes("happy") || entry.moods.includes("done")) {
        celebrationPoses.push(entry.id);
      }
      if (entry.moods.includes("sleepy")) {
        sleepyPoses.push(entry.id);
      }
      if (
        entry.moods.includes("cute") ||
        entry.moods.includes("working") ||
        entry.moods.includes("happy")
      ) {
        settlePoses.push(entry.id);
      }
    }
  }

  const showcasePoses: string[] = ["idle"];
  const happyInsertIndex = Math.min(14, syncedShowcase.length);
  for (let i = 0; i < syncedShowcase.length; i += 1) {
    if (i === happyInsertIndex) {
      showcasePoses.push("happy");
    }
    showcasePoses.push(syncedShowcase[i]!);
  }
  if (!showcasePoses.includes("happy")) {
    showcasePoses.push("happy");
  }
  showcasePoses.push("sleepy");

  return {
    sourceByPose,
    showcasePoses,
    settlePoses,
    celebrationPoses,
    sleepyPoses,
    sleepyPoseSet: new Set(sleepyPoses),
    standingPoseSet,
    perchedStaticPoseSet,
    whisperByPose,
  };
}

function isRestingPose(pose: string): boolean {
  return pose !== "walk" && pose !== "working" && pose !== "picked";
}

function pickRandomPose(pool: readonly string[], exclude: string): string {
  const candidates = pool.filter((candidate) => candidate !== exclude);
  if (candidates.length === 0) return exclude;
  return candidates[Math.floor(Math.random() * candidates.length)]!;
}

const EDGE_MARGIN = 18;
const WALK_SPEED_DP_PER_SEC = 74;
const AFK_SLEEP_MS = 90_000;
const DOUBLE_TAP_WINDOW_MS = 340;
const WALK_RIM_LIFT_DP = -13;
const STAND_RIM_LIFT_DP = -12;
const PERCH_RIM_LIFT_DP = -7;
const PICK_UP_HOLD_MS = 160;
const PICK_UP_LIFT_DP = -22;
const MANUAL_PLACE_HOLD_MS = 45_000;
const AUTO_POSE_MIN_MS = 14_000;
const AUTO_POSE_VARIANCE_MS = 12_000;

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

const RIAS_TAP_WHISPERS: readonly string[] = [
  "Good work~ ♥",
  "Crimson Queen here ✦",
  "Double-tap to roam ♥",
  "Hold & drag me~ ✦",
  "Peerage power, pure OLED ♥",
];

const PICK_UP_WHISPERS: readonly string[] = [
  "Kyaa~! Put me down! ✨",
  "H-hey, careful~! 💜",
  "Where are we going? ♥",
  "Whoa, high up~! ✨",
];

const RIAS_PICK_UP_WHISPERS: readonly string[] = [
  "Kyaa~! Put me down! ♥",
  "H-hey! Careful with a Gremory~ ✦",
  "Where are you taking me? ♥",
  "Whoa, don't drop me~! ♥",
];

const DROP_WHISPERS: readonly string[] = [
  "Hehe, comfy spot~ ♥",
  "Nice view from here! 💜",
  "Right here works~ ✨",
  "Safe landing~ ♥",
];

const RIAS_DROP_WHISPERS: readonly string[] = [
  "Hmph, cozy spot~ ♥",
  "Nice view from up here ✦",
  "Right here is fine~ ♥",
  "Safe landing, my servant~ ♥",
];

const DONE_WHISPERS: readonly string[] = [
  "All done~ ♥",
  "Shipped! ✨",
  "Nice work~ 💜",
];

const RIAS_DONE_WHISPERS: readonly string[] = [
  "Nicely shipped, my servant~ ♥",
  "Good work~ ♥",
  "Crimson victory! ✦",
];

/**
 * Interactive 165Hz roaming companion pet (Akeno or Rias) perched on the top rim of the chat composer.
 * - Bundled core poses (idle, walk, working, happy, sleepy, picked) work 100% offline.
 * - Extra chibi poses, Rias sprites, and anime voice clips sync dynamically from the configured
 *   `.env` or Settings pose pack into permanent local device storage.
 */
export const ComposerAkenoPet = memo(function ComposerAkenoPet(props: {
  readonly character?: ComposerPetCharacter;
  readonly slot?: ComposerPetSlot;
  readonly stageWidth: number;
  readonly activeThreadBusy: boolean;
  readonly isTyping: boolean;
  readonly size?: number;
  readonly onPressOpenLimits?: () => void;
}) {
  const gt = useGT();
  const character: ComposerPetCharacter = props.character ?? "akeno";
  const slot: ComposerPetSlot = props.slot ?? "solo";
  const isRias = character === "rias";
  const appActive = useAppActive();
  const reducedMotion = useReduceMotionEnabled();
  const posePack = useAkenoPosePack();
  const hasFullBodyRiasChibi = !isRias || posePack.riasPetPoses.length > 0;
  const catalog = useMemo(
    () =>
      isRias
        ? buildRiasPoseCatalog(posePack.riasPetPoses, posePack.riasSprites)
        : buildAkenoPoseCatalog(posePack.poses),
    [isRias, posePack.poses, posePack.riasPetPoses, posePack.riasSprites],
  );
  const size = props.size ?? 74;

  const maxX = Math.max(EDGE_MARGIN, props.stageWidth - size - EDGE_MARGIN);
  const stageMidX = (EDGE_MARGIN + maxX) / 2;
  const roamMinX =
    slot === "right"
      ? Math.max(EDGE_MARGIN, Math.min(maxX - 24, Math.round(stageMidX + 6)))
      : EDGE_MARGIN;
  const roamMaxX =
    slot === "left"
      ? Math.min(maxX, Math.max(EDGE_MARGIN + 24, Math.round(stageMidX - Math.round(size * 0.55))))
      : maxX;
  const roamMidX = (roamMinX + roamMaxX) / 2;
  const initialX = slot === "left" ? Math.min(roamMaxX, EDGE_MARGIN + 6) : maxX;
  const initialFacing: 1 | -1 = slot === "left" ? -1 : 1;
  const canRoam = slot === "solo" ? roamMaxX > roamMinX + 32 : roamMaxX > roamMinX + 20;

  const [pose, setPose] = useState<ComposerAkenoPose>(() =>
    props.activeThreadBusy ? "working" : isLateNightHour() ? "sleepy" : "idle",
  );
  // facing: 1 = facing left (native sprite orientation), -1 = mirrored facing right
  const [facing, setFacing] = useState<1 | -1>(initialFacing);
  const [whisper, setWhisper] = useState<string | null>(null);
  const [whisperOnLeft, setWhisperOnLeft] = useState(slot !== "left");

  const posXRef = useRef<number>(initialX);
  const initializedRef = useRef(false);
  const walkingRef = useRef(false);
  const draggingRef = useRef(false);
  const manualHoldUntilRef = useRef(0);
  const lastTapAtRef = useRef(0);
  const whisperIndexRef = useRef(0);
  const poseIndexRef = useRef(0);
  const pickupWhisperIndexRef = useRef(0);
  const dropWhisperIndexRef = useRef(0);
  const prevBusyRef = useRef(props.activeThreadBusy);

  const walkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roamTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const poseCycleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const happyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const whisperTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const afkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const posX = useSharedValue(initialX);
  const maxXShared = useSharedValue(maxX);
  const reducedMotionShared = useSharedValue(reducedMotion);
  const isPickedUpShared = useSharedValue(0);
  const dragStartX = useSharedValue(initialX);
  const dragLiftY = useSharedValue(0);
  const dragOffsetY = useSharedValue(0);
  const dragSwingDeg = useSharedValue(0);
  const dangleWobbleDeg = useSharedValue(0);
  const squashScaleX = useSharedValue(1);
  const squashScaleY = useSharedValue(1);
  const breathScaleY = useSharedValue(1);
  const lastDragFacingShared = useSharedValue<1 | -1>(initialFacing);
  const lastOnRightShared = useSharedValue(slot !== "left");

  const jumpY = useSharedValue(0);
  const walkBobY = useSharedValue(0);
  const seatLiftY = useSharedValue(0);
  const tiltDeg = useSharedValue(0);
  const popScale = useSharedValue(1);

  const effectivePose = pose in catalog.sourceByPose ? pose : "idle";
  const isCurrentStaticPose =
    catalog.standingPoseSet.has(effectivePose) ||
    catalog.perchedStaticPoseSet.has(effectivePose);

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
    if (!initializedRef.current) {
      initializedRef.current = true;
      posXRef.current = initialX;
      posX.set(initialX);
      setFacing(initialFacing);
      lastDragFacingShared.set(initialFacing);
      const onRight = initialX > stageMidX;
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
    const onRight = clamped > stageMidX;
    lastOnRightShared.set(onRight);
    setWhisperOnLeft(onRight);
  }, [
    initialFacing,
    initialX,
    lastDragFacingShared,
    lastOnRightShared,
    maxX,
    posX,
    props.stageWidth,
    stageMidX,
  ]);

  // Trigger a smooth stroll from current X to target X across the pet's roaming lane.
  const startWalkTo = useCallback(
    (targetX: number) => {
      if (reducedMotion || !appActive || props.activeThreadBusy || !canRoam || draggingRef.current) return;
      const clampedTarget = Math.min(roamMaxX, Math.max(roamMinX, targetX));
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
        const onRight = clampedTarget > stageMidX;
        const settledFacing: 1 | -1 = onRight ? 1 : -1;
        setFacing(settledFacing);
        lastDragFacingShared.set(settledFacing);
        lastOnRightShared.set(onRight);
        setWhisperOnLeft(onRight);
        setPose(pickRandomPose(catalog.settlePoses, "walk"));
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
      catalog.settlePoses,
      jumpY,
      lastDragFacingShared,
      lastOnRightShared,
      posX,
      props.activeThreadBusy,
      reducedMotion,
      roamMaxX,
      roamMinX,
      stageMidX,
      walkBobY,
    ],
  );

  // React to chat busy / turn completion transitions.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- switches companion into working pose while chat runs and happy celebration when done
  useEffect(() => {
    const wasBusy = prevBusyRef.current;
    prevBusyRef.current = props.activeThreadBusy;

    if (draggingRef.current) return;

    if (props.activeThreadBusy) {
      clearTimer(roamTimerRef);
      clearTimer(poseCycleTimerRef);
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
      const donePose = pickRandomPose(catalog.celebrationPoses, "working");
      stopWalking(donePose);
      const voiceClip = playCompanionVoice(character, "done");
      const doneWhispers = isRias ? RIAS_DONE_WHISPERS : DONE_WHISPERS;
      const msg = doneWhispers[whisperIndexRef.current % doneWhispers.length]!;
      whisperIndexRef.current += 1;
      showWhisper(voiceClip?.label ?? msg, 2800);
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
        if (!draggingRef.current) setPose(pickRandomPose(catalog.settlePoses, donePose));
      }, 3600);
    }
  }, [
    catalog.celebrationPoses,
    catalog.settlePoses,
    character,
    isRias,
    jumpY,
    popScale,
    props.activeThreadBusy,
    reducedMotion,
    showWhisper,
    stopWalking,
  ]);

  // Subtle curious tilt when the user is typing in the composer; gently wake if sleepy.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- tilts Akeno curiously while typing and wakes from sleepy pose
  useEffect(() => {
    if (draggingRef.current) return;
    if (props.isTyping && !props.activeThreadBusy) {
      if (catalog.sleepyPoseSet.has(effectivePose)) setPose("idle");
      if (!reducedMotion) {
        tiltDeg.set(withSpring(facing === 1 ? -4 : 4, TAP_SPRING));
      }
    } else if (!reducedMotion) {
      tiltDeg.set(withSpring(0, TAP_SPRING));
    }
  }, [
    catalog.sleepyPoseSet,
    effectivePose,
    facing,
    props.activeThreadBusy,
    props.isTyping,
    reducedMotion,
    tiltDeg,
  ]);

  // Autonomous pose cycler: periodically shifts between all synced poses and core idle/happy/sleepy poses!
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- periodically auto-changes Akeno's pose while hanging out on the chat bar
  useEffect(() => {
    clearTimer(poseCycleTimerRef);
    if (
      !appActive ||
      props.activeThreadBusy ||
      props.isTyping ||
      !isRestingPose(effectivePose) ||
      draggingRef.current
    ) {
      return;
    }
    const delayMs = AUTO_POSE_MIN_MS + Math.floor(Math.random() * AUTO_POSE_VARIANCE_MS);
    poseCycleTimerRef.current = setTimeout(() => {
      poseCycleTimerRef.current = null;
      if (draggingRef.current || walkingRef.current) return;
      const nextPose = pickRandomPose(catalog.showcasePoses, effectivePose);
      setPose(nextPose);
      if (!reducedMotion) {
        jumpY.set(
          withSequence(
            withTiming(-5, { duration: 95, easing: Easing.out(Easing.cubic) }),
            withSpring(0, TAP_SPRING),
          ),
        );
        popScale.set(
          withSequence(
            withTiming(1.07, { duration: 85, easing: Easing.out(Easing.cubic) }),
            withSpring(1, TAP_SPRING),
          ),
        );
      }
    }, delayMs);

    return () => clearTimer(poseCycleTimerRef);
  }, [
    appActive,
    catalog.showcasePoses,
    effectivePose,
    jumpY,
    popScale,
    props.activeThreadBusy,
    props.isTyping,
    reducedMotion,
  ]);

  // Autonomous roaming scheduler while resting (occasionally strolls within her lane on her own!).
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- schedules occasional autonomous right <-> left strolls when resting
  useEffect(() => {
    clearTimer(roamTimerRef);
    if (
      !appActive ||
      reducedMotion ||
      !canRoam ||
      props.activeThreadBusy ||
      props.isTyping ||
      !isRestingPose(effectivePose) ||
      draggingRef.current
    ) {
      return;
    }
    const holdRemainingMs = Math.max(0, manualHoldUntilRef.current - Date.now());
    const baseDelayMs = 22_000 + Math.floor(Math.random() * 16_000);
    const delayMs = Math.max(holdRemainingMs, baseDelayMs);
    roamTimerRef.current = setTimeout(() => {
      roamTimerRef.current = null;
      if (draggingRef.current) return;
      const onRight = posXRef.current > roamMidX;
      const goCenter =
        Math.random() < 0.25 && Math.abs(posXRef.current - roamMidX) > (slot === "solo" ? 48 : 28);
      const targetX = goCenter ? roamMidX : onRight ? roamMinX : roamMaxX;
      startWalkTo(targetX);
    }, delayMs);

    return () => clearTimer(roamTimerRef);
  }, [
    appActive,
    canRoam,
    effectivePose,
    props.activeThreadBusy,
    props.isTyping,
    reducedMotion,
    roamMaxX,
    roamMidX,
    roamMinX,
    slot,
    startWalkTo,
  ]);

  // Gentle AFK sleepy transition after 90s of total inactivity.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- settles companion into cozy sleepy pose after extended inactivity
  useEffect(() => {
    clearTimer(afkTimerRef);
    if (
      !appActive ||
      props.activeThreadBusy ||
      props.isTyping ||
      !isRestingPose(effectivePose) ||
      catalog.sleepyPoseSet.has(effectivePose) ||
      draggingRef.current
    ) {
      return;
    }
    afkTimerRef.current = setTimeout(() => {
      afkTimerRef.current = null;
      if (!draggingRef.current) setPose(pickRandomPose(catalog.sleepyPoses, effectivePose));
    }, AFK_SLEEP_MS);

    return () => clearTimer(afkTimerRef);
  }, [
    appActive,
    catalog.sleepyPoseSet,
    catalog.sleepyPoses,
    effectivePose,
    props.activeThreadBusy,
    props.isTyping,
  ]);

  // Align each pose cleanly onto the top composer glass rim.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- smoothly adjusts vertical ledge alignment per pose
  useEffect(() => {
    const targetLift =
      effectivePose === "walk"
        ? WALK_RIM_LIFT_DP
        : catalog.standingPoseSet.has(effectivePose)
          ? STAND_RIM_LIFT_DP
          : catalog.perchedStaticPoseSet.has(effectivePose)
            ? PERCH_RIM_LIFT_DP
            : 0;
    if (reducedMotion) {
      seatLiftY.set(targetLift);
      return;
    }
    seatLiftY.set(withSpring(targetLift, TAP_SPRING));
  }, [
    catalog.perchedStaticPoseSet,
    catalog.standingPoseSet,
    effectivePose,
    reducedMotion,
    seatLiftY,
  ]);

  // Subtle 165Hz living breath pulse for single-frame poses so every pose feels softly alive.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- runs gentle idle breathing pulse on still poses
  useEffect(() => {
    if (!appActive || reducedMotion || !isCurrentStaticPose) {
      cancelAnimation(breathScaleY);
      breathScaleY.set(1);
      return;
    }
    breathScaleY.set(
      withRepeat(
        withSequence(
          withTiming(1.024, { duration: 1250, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.992, { duration: 1250, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      ),
    );
    return () => {
      cancelAnimation(breathScaleY);
    };
  }, [appActive, breathScaleY, isCurrentStaticPose, reducedMotion]);

  // Celebrate daily prompt milestones & quick-save toasts emitted from the composer or feed!
  // In dual-pet ("both") mode, skip subscribing on the left slot so external whispers don't pop duplicate bubbles.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- subscribes to celebratory companion whispers and plays happy bounce reaction
  useEffect(() => {
    if (slot === "left") return;
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
  }, [jumpY, popScale, props.activeThreadBusy, reducedMotion, showWhisper, slot, stopWalking]);

  // Clean up all timers on unmount.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- clears roaming and reaction timers on unmount
  useEffect(() => {
    return () => {
      clearTimer(walkTimerRef);
      clearTimer(roamTimerRef);
      clearTimer(poseCycleTimerRef);
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

    if (isDoubleTap && !props.activeThreadBusy && canRoam) {
      playUiSound("shuffle");
      const targetX = posXRef.current > roamMidX ? roamMinX : roamMaxX;
      showWhisper(isRias ? gt("On my way~ ♥") : gt("Coming over~ ✨"), 1800);
      startWalkTo(targetX);
      return;
    }

    const voiceClip = playCompanionVoice(character, "tap");
    if (!voiceClip) {
      playUiSound("shuffle");
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
      showWhisper(
        voiceClip?.label ?? (isRias ? gt("Focusing hard~ ♥") : gt("Working hard~ 💜")),
        2000,
      );
      return;
    }

    clearTimer(happyTimerRef);
    clearTimer(poseCycleTimerRef);
    const pool = catalog.showcasePoses;
    poseIndexRef.current = (poseIndexRef.current + 1) % pool.length;
    let nextPose = pool[poseIndexRef.current]!;
    if (nextPose === effectivePose && pool.length > 1) {
      poseIndexRef.current = (poseIndexRef.current + 1) % pool.length;
      nextPose = pool[poseIndexRef.current]!;
    }
    stopWalking(nextPose);

    const tapWhispers = isRias ? RIAS_TAP_WHISPERS : TAP_WHISPERS;
    const fallbackWhisper = tapWhispers[whisperIndexRef.current % tapWhispers.length]!;
    whisperIndexRef.current += 1;
    showWhisper(voiceClip?.label ?? catalog.whisperByPose[nextPose] ?? fallbackWhisper, 2400);
  });

  const handlePickUpStart = useEffectEvent((currentX: number) => {
    draggingRef.current = true;
    walkingRef.current = false;
    posXRef.current = currentX;

    clearTimer(walkTimerRef);
    clearTimer(roamTimerRef);
    clearTimer(poseCycleTimerRef);
    clearTimer(happyTimerRef);
    clearTimer(afkTimerRef);
    clearTimer(settleTimerRef);

    cancelAnimation(walkBobY);
    walkBobY.set(0);
    setPose("picked");

    const onRight = currentX > stageMidX;
    setWhisperOnLeft(onRight);

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const voiceClip = playCompanionVoice(character, "pickup");
    if (!voiceClip) {
      playUiSound("shuffle");
    }

    const pickupWhispers = isRias ? RIAS_PICK_UP_WHISPERS : PICK_UP_WHISPERS;
    const nextWhisper = pickupWhispers[pickupWhisperIndexRef.current % pickupWhispers.length]!;
    pickupWhisperIndexRef.current += 1;
    showWhisper(voiceClip?.label ?? nextWhisper, 3200);
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

    const settledOnLeft = clampedFinalX < stageMidX;
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
      showWhisper(isRias ? gt("Back to work~ ♥") : gt("Back to work~ 💜"), 1800);
      return;
    }

    setPose("happy");
    const dropWhispers = isRias ? RIAS_DROP_WHISPERS : DROP_WHISPERS;
    const nextDropWhisper = dropWhispers[dropWhisperIndexRef.current % dropWhispers.length]!;
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
          squashScaleX.value = withSequence(
            withTiming(0.9, { duration: 85, easing: Easing.out(Easing.cubic) }),
            withSpring(1, PICK_UP_SPRING),
          );
          squashScaleY.value = withSequence(
            withTiming(1.12, { duration: 85, easing: Easing.out(Easing.cubic) }),
            withSpring(1, PICK_UP_SPRING),
          );
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
        { scaleY: popScale.value * squashScaleY.value * breathScaleY.value },
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
                backgroundColor: isRias
                  ? "rgba(32, 12, 20, 0.92)"
                  : "rgba(24, 16, 34, 0.92)",
                borderWidth: 1,
                borderColor: isRias
                  ? "rgba(251, 113, 133, 0.52)"
                  : "rgba(192, 132, 252, 0.38)",
                ...(isRias
                  ? {
                      boxShadow: [
                        {
                          offsetX: 0,
                          offsetY: 2,
                          blurRadius: 12,
                          spreadDistance: 1,
                          color: "rgba(225, 29, 72, 0.25)",
                        },
                      ],
                    }
                  : {}),
              }}
            >
              <Text
                allowFontScaling={false}
                numberOfLines={1}
                style={{
                  fontSize: 10.5,
                  lineHeight: 13,
                  color: isRias ? "#FFE4E6" : "#F3E8FF",
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
              backgroundColor: isRias
                ? "rgba(28, 10, 18, 0.85)"
                : "rgba(18, 10, 28, 0.85)",
              borderWidth: 1,
              borderColor: isRias
                ? "rgba(251, 113, 133, 0.28)"
                : "rgba(192, 132, 252, 0.22)",
            },
            shadowStyle,
          ]}
        />
        <GestureDetector gesture={petGesture}>
          <View
            accessible
            accessibilityRole="button"
            accessibilityLabel={
              isRias
                ? gt(
                    "Rias chat bar pet. Tap to interact, double-tap to walk across, press and hold to pick up and drag.",
                  )
                : gt(
                    "Akeno chat bar pet. Tap to interact, double-tap to walk across, press and hold to pick up and drag.",
                  )
            }
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
                style={
                  hasFullBodyRiasChibi
                    ? {
                        width: size,
                        height: size,
                        transform: [{ scaleX: facing }],
                      }
                    : {
                        width: size - 16,
                        height: size - 16,
                        marginLeft: 8,
                        marginTop: 2,
                        borderRadius: 999,
                        overflow: "hidden",
                        borderWidth: 1.5,
                        borderColor: "rgba(251, 113, 133, 0.58)",
                        backgroundColor: "#14060B",
                        transform: [{ scaleX: facing }],
                      }
                }
              >
                <Image
                  source={
                    catalog.sourceByPose[effectivePose] ??
                    (isRias ? RIAS_CORE_SOURCES.idle : AKENO_CORE_SOURCES.idle)
                  }
                  autoplay={shouldAnimateWebp}
                  transition={110}
                  accessibilityIgnoresInvertColors
                  contentFit={hasFullBodyRiasChibi ? "contain" : "cover"}
                  contentPosition={hasFullBodyRiasChibi ? "bottom" : "top"}
                  style={{ width: "100%", height: "100%" }}
                />
              </View>
            </Animated.View>
          </View>
        </GestureDetector>
      </Animated.View>
    </View>
  );
});
