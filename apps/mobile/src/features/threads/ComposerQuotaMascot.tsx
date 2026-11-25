import { RegistryContext, useAtomMount } from "@effect/atom-react";
import type { EnvironmentId, ModelSelection, ServerConfig } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useGT } from "gt-react-native";
import { memo, useContext, useEffect, useRef } from "react";
import { Platform, Pressable, Text, View } from "react-native";
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

import { useAppActive, useReduceMotionEnabled } from "../../lib/appState";
import { useNowMinuteMs } from "../../lib/clock";
import {
  limitsAutoRefreshSetAtom,
  refreshEnvironmentLimits,
} from "../usage/usageLimitsRefresh";
import { resolveActiveModelFiveHourQuota } from "./activeModelFiveHourQuota";

const QUOTA_MASCOT_SOURCE = require("../../../assets/quota-mascot.webp");

// Exact normalized interior rect of the cream banner inside quota-mascot.webp (256x256).
const SIGN_LEFT_PCT = 0.25;
const SIGN_TOP_PCT = 0.7544;
const SIGN_WIDTH_PCT = 0.4985;
const SIGN_HEIGHT_PCT = 0.1831;

const IDLE_ATOM = Atom.make(undefined);

const TAP_SPRING = {
  damping: 11,
  stiffness: 340,
  mass: 0.62,
  reduceMotion: ReduceMotion.System,
};

function quotaInkColor(percent: number | null): string {
  if (percent === null) return "#6E655B";
  if (percent <= 15) return "#BE123C";
  if (percent <= 35) return "#B45309";
  return "#141416";
}

/**
 * Animated pixel-art mascot perched right on top of the chat composer box.
 * Holds a live-updating banner showing the active model's 5-hour remaining quota %.
 * Auto-refreshes on mount & turn completion; tap to bounce, refresh, and open full usage limits.
 */
export const ComposerQuotaMascot = memo(function ComposerQuotaMascot(props: {
  readonly environmentId: EnvironmentId;
  readonly connected: boolean;
  readonly modelSelection: ModelSelection;
  readonly serverConfig: ServerConfig | null;
  readonly activeThreadBusy: boolean;
  readonly size?: number;
  readonly onPressOpenLimits?: () => void;
}) {
  const gt = useGT();
  const registry = useContext(RegistryContext);
  const now = useNowMinuteMs();
  const appActive = useAppActive();
  const reducedMotion = useReduceMotionEnabled();
  const size = props.size ?? 74;

  // Throttled background auto-refresh whenever connected in a chat.
  useAtomMount(props.connected ? limitsAutoRefreshSetAtom(String(props.environmentId)) : IDLE_ATOM);

  // Quietly refresh limits right after an active turn settles so the 5h banner updates live.
  const prevBusyRef = useRef(props.activeThreadBusy);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- refreshes provider quota right after an active turn finishes
  useEffect(() => {
    const wasBusy = prevBusyRef.current;
    prevBusyRef.current = props.activeThreadBusy;
    if (wasBusy && !props.activeThreadBusy && props.connected) {
      void refreshEnvironmentLimits(registry, props.environmentId);
    }
  }, [props.activeThreadBusy, props.connected, props.environmentId, registry]);

  const quota = resolveActiveModelFiveHourQuota({
    modelSelection: props.modelSelection,
    serverConfig: props.serverConfig,
    now,
  });

  const remaining = quota?.remainingPercent ?? null;
  const bannerLabel = remaining !== null ? `${remaining}%` : "--";
  const inkColor = quotaInkColor(remaining);

  const bobY = useSharedValue(0);
  const idleTilt = useSharedValue(0);
  const popScale = useSharedValue(1);
  const tapJumpY = useSharedValue(0);
  const shouldAnimate = appActive && !reducedMotion;

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- gentle 165Hz Reanimated idle breathing loop (character + banner + live text move locked together)
  useEffect(() => {
    if (!shouldAnimate) {
      cancelAnimation(bobY);
      cancelAnimation(idleTilt);
      bobY.set(withTiming(0, { duration: 160, reduceMotion: ReduceMotion.System }));
      idleTilt.set(withTiming(0, { duration: 160, reduceMotion: ReduceMotion.System }));
      return;
    }

    bobY.set(
      withRepeat(
        withSequence(
          withTiming(-1.8, {
            duration: 1450,
            easing: Easing.inOut(Easing.sin),
            reduceMotion: ReduceMotion.System,
          }),
          withTiming(0.6, {
            duration: 1450,
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
          withTiming(-1.4, {
            duration: 1900,
            easing: Easing.inOut(Easing.sin),
            reduceMotion: ReduceMotion.System,
          }),
          withTiming(1.4, {
            duration: 1900,
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
    };
  }, [shouldAnimate, bobY, idleTilt]);

  // Play a crisp micro-pop whenever the displayed percentage changes (e.g. model switch or fresh quota).
  const prevLabelRef = useRef(bannerLabel);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- pops the mascot gently when the live 5h percentage updates
  useEffect(() => {
    if (prevLabelRef.current === bannerLabel) return;
    prevLabelRef.current = bannerLabel;
    if (reducedMotion) return;
    popScale.set(
      withSequence(
        withTiming(1.1, { duration: 85, easing: Easing.out(Easing.cubic) }),
        withSpring(1, TAP_SPRING),
      ),
    );
  }, [bannerLabel, reducedMotion, popScale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: bobY.value + tapJumpY.value },
      { rotate: `${idleTilt.value}deg` },
      { scale: popScale.value },
    ],
  }));

  const handlePress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!reducedMotion) {
      tapJumpY.set(
        withSequence(
          withTiming(-7, { duration: 95, easing: Easing.out(Easing.cubic) }),
          withSpring(0, TAP_SPRING),
        ),
      );
      popScale.set(
        withSequence(
          withTiming(1.13, { duration: 85, easing: Easing.out(Easing.cubic) }),
          withSpring(1, TAP_SPRING),
        ),
      );
    }
    if (props.connected) {
      void refreshEnvironmentLimits(registry, props.environmentId);
    }
    props.onPressOpenLimits?.();
  };

  const signLeft = Math.round(size * SIGN_LEFT_PCT);
  const signTop = Math.round(size * SIGN_TOP_PCT);
  const signWidth = Math.round(size * SIGN_WIDTH_PCT);
  const signHeight = Math.round(size * SIGN_HEIGHT_PCT);
  const fontSize = bannerLabel.length >= 4 ? Math.max(9.5, size * 0.145) : Math.max(10.5, size * 0.165);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        remaining !== null
          ? gt("5-hour quota remaining: {percent}%. Tap to refresh or view limits.", {
              percent: remaining,
            })
          : gt("Usage limits. Tap to refresh.")
      }
      hitSlop={8}
      onPress={handlePress}
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
          animatedStyle,
        ]}
      >
        <Image
          source={QUOTA_MASCOT_SOURCE}
          autoplay={shouldAnimate}
          accessibilityIgnoresInvertColors
          contentFit="contain"
          style={{ width: size, height: size }}
        />
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: signLeft,
            top: signTop,
            width: signWidth,
            height: signHeight,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            allowFontScaling={false}
            numberOfLines={1}
            style={{
              color: inkColor,
              fontFamily: Platform.select({ android: "monospace", default: "Menlo" }),
              fontWeight: "900",
              fontSize,
              lineHeight: Math.ceil(fontSize * 1.05),
              letterSpacing: -0.5,
              fontVariant: ["tabular-nums"],
              includeFontPadding: false,
              textAlign: "center",
            }}
          >
            {bannerLabel}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
});
