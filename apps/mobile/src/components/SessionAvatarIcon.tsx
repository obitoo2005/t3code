import { Image, type ImageSource } from "expo-image";
import { memo, useEffect, useRef, useSyncExternalStore } from "react";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { useReduceMotionEnabled } from "../lib/appState";

const SESSION_ICONS: readonly ImageSource[] = [
  require("../../assets/session-icons/session-icon-01.png"),
  require("../../assets/session-icons/session-icon-02.png"),
  require("../../assets/session-icons/session-icon-03.png"),
  require("../../assets/session-icons/session-icon-04.png"),
  require("../../assets/session-icons/session-icon-05.png"),
  require("../../assets/session-icons/session-icon-06.png"),
  require("../../assets/session-icons/session-icon-07.png"),
  require("../../assets/session-icons/session-icon-08.png"),
  require("../../assets/session-icons/session-icon-09.png"),
  require("../../assets/session-icons/session-icon-10.png"),
  require("../../assets/session-icons/session-icon-11.png"),
  require("../../assets/session-icons/session-icon-12.png"),
  require("../../assets/session-icons/session-icon-13.png"),
  require("../../assets/session-icons/session-icon-14.png"),
  require("../../assets/session-icons/session-icon-15.png"),
  require("../../assets/session-icons/session-icon-16.png"),
  require("../../assets/session-icons/session-icon-17.png"),
  require("../../assets/session-icons/session-icon-18.png"),
  require("../../assets/session-icons/session-icon-19.png"),
  require("../../assets/session-icons/session-icon-20.png"),
  require("../../assets/session-icons/session-icon-21.png"),
  require("../../assets/session-icons/session-icon-22.png"),
  require("../../assets/session-icons/session-icon-23.png"),
  require("../../assets/session-icons/session-icon-24.png"),
  require("../../assets/session-icons/session-icon-25.png"),
  require("../../assets/session-icons/session-icon-26.png"),
  require("../../assets/session-icons/session-icon-27.png"),
  require("../../assets/session-icons/session-icon-28.png"),
  require("../../assets/session-icons/session-icon-29.png"),
  require("../../assets/session-icons/session-icon-30.png"),
  require("../../assets/session-icons/session-icon-31.png"),
  require("../../assets/session-icons/session-icon-32.png"),
  require("../../assets/session-icons/session-icon-33.png"),
  require("../../assets/session-icons/session-icon-34.png"),
  require("../../assets/session-icons/session-icon-35.png"),
  require("../../assets/session-icons/session-icon-36.png"),
  require("../../assets/session-icons/session-icon-37.png"),
  require("../../assets/session-icons/session-icon-38.png"),
  require("../../assets/session-icons/session-icon-39.png"),
  require("../../assets/session-icons/session-icon-40.png"),
];

const SHUFFLED_DECK: number[] = SESSION_ICONS.map((_, index) => index);

function shuffleDeck(previousFirst?: number): void {
  for (let i = SHUFFLED_DECK.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = SHUFFLED_DECK[i]!;
    SHUFFLED_DECK[i] = SHUFFLED_DECK[j]!;
    SHUFFLED_DECK[j] = tmp;
  }
  // Ensure the top row always visibly swaps even when only one session exists.
  if (previousFirst !== undefined && SHUFFLED_DECK[0] === previousFirst && SHUFFLED_DECK.length > 1) {
    const swapIdx = 1 + Math.floor(Math.random() * (SHUFFLED_DECK.length - 1));
    const tmp = SHUFFLED_DECK[0]!;
    SHUFFLED_DECK[0] = SHUFFLED_DECK[swapIdx]!;
    SHUFFLED_DECK[swapIdx] = tmp;
  }
}

shuffleDeck();

const assignedIndexBySeed = new Map<string, number>();
let deckCursor = 0;
let shuffleEpoch = 0;
const epochListeners = new Set<() => void>();

function subscribeSessionAvatars(listener: () => void): () => void {
  epochListeners.add(listener);
  return () => {
    epochListeners.delete(listener);
  };
}

function getSessionAvatarEpoch(): number {
  return shuffleEpoch;
}

/**
 * Live-shuffles the 40-avatar deck and triggers every visible SessionAvatarIcon to
 * pop into a fresh random anime avatar.
 */
export function reshuffleSessionAvatars(): void {
  const previousFirst = SHUFFLED_DECK[0];
  assignedIndexBySeed.clear();
  deckCursor = 0;
  shuffleDeck(previousFirst);
  shuffleEpoch += 1;
  for (const listener of epochListeners) listener();
}

export function pickSessionIcon(seed: string): ImageSource {
  let index = assignedIndexBySeed.get(seed);
  if (index === undefined) {
    index = SHUFFLED_DECK[deckCursor % SHUFFLED_DECK.length]!;
    deckCursor += 1;
    assignedIndexBySeed.set(seed, index);
  }
  return SESSION_ICONS[index]!;
}

const POP_SPRING = {
  damping: 13,
  stiffness: 340,
  mass: 0.65,
  reduceMotion: ReduceMotion.System,
};

/** Crisp pixel-art anime avatar replacing the GT project monogram beside each session row. */
export const SessionAvatarIcon = memo(function SessionAvatarIcon(props: {
  readonly seed: string;
  readonly size: number;
}) {
  const epoch = useSyncExternalStore(
    subscribeSessionAvatars,
    getSessionAvatarEpoch,
    getSessionAvatarEpoch,
  );
  const reducedMotion = useReduceMotionEnabled();
  const source = pickSessionIcon(props.seed);
  const radius = Math.max(5, Math.round(props.size * 0.24));
  const scale = useSharedValue(1);
  const lastEpochRef = useRef(epoch);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- plays a spring pop when the user taps the Rias icon to reshuffle avatars
  useEffect(() => {
    if (epoch === lastEpochRef.current) return;
    lastEpochRef.current = epoch;
    if (reducedMotion) return;
    scale.set(
      withSequence(
        withTiming(0.72, { duration: 70 }),
        withSpring(1, POP_SPRING),
      ),
    );
  }, [epoch, reducedMotion, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width: props.size,
          height: props.size,
          borderRadius: radius,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: "rgba(255, 255, 255, 0.16)",
        },
        animatedStyle,
      ]}
    >
      <Image
        source={source}
        recyclingKey={`${props.seed}:${epoch}`}
        accessibilityIgnoresInvertColors
        contentFit="cover"
        style={{ width: "100%", height: "100%" }}
      />
    </Animated.View>
  );
});
