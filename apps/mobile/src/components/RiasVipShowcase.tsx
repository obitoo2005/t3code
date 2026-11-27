import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useGT } from "gt-react-native";
import { memo, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
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

import { useAkenoPosePack, type SyncedRiasVipPortrait } from "../lib/akenoPosePack";
import { useAppActive, useReduceMotionEnabled } from "../lib/appState";
import { playUiSound } from "../lib/uiSoundFx";
import {
  appendPinDigit,
  clampSlideIndex,
  clearVipVaultPin,
  computeActiveSlideIndex,
  computeVisibleDotWindow,
  evaluatePinAttempt,
  isWideOrSquareMedia,
  loadVipVaultPin,
  removeLastPinDigit,
  resolveVaultInitialGateState,
  saveVipVaultPin,
  shouldPlayVipVideo,
  VIP_MAX_VISIBLE_DOTS,
  VIP_PIN_LENGTH,
  VIP_ZOOM_DOUBLE_TAP,
  VIP_ZOOM_MAX,
  VIP_ZOOM_MIN,
  VIP_ZOOM_SNAP_RESET_THRESHOLD,
  type VipVaultGateState,
} from "./riasVipVaultLogic";
import { AppText as Text } from "./ui/AppText";

const CARD_SPRING = {
  damping: 13,
  stiffness: 300,
  mass: 0.7,
  reduceMotion: ReduceMotion.System,
};

const ZOOM_SPRING = {
  damping: 18,
  stiffness: 260,
  mass: 0.8,
  reduceMotion: ReduceMotion.System,
};

const PIN_KEYPAD_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["clear", "0", "backspace"],
] as const;

type PinKeypadKey = (typeof PIN_KEYPAD_ROWS)[number][number];

/**
 * Full-body crimson OLED glass spotlight card showcasing all synced VIP Rias portraits
 * (defaults to the full-body standing Grand Hall portrait; tap to cycle through all items).
 */
export const RiasVipHeroCard = memo(function RiasVipHeroCard(props: {
  readonly compact?: boolean;
}) {
  const gt = useGT();
  const pack = useAkenoPosePack({ autoSync: false });
  const appActive = useAppActive();
  const reducedMotion = useReduceMotionEnabled();
  const [index, setIndex] = useState(0);
  const breathScale = useSharedValue(1);
  const tapScale = useSharedValue(1);

  const items = pack.riasVip;
  const active = items.length > 0 ? items[index % items.length]! : null;

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- runs subtle 165Hz slow breathing zoom on the VIP Rias portrait
  useEffect(() => {
    if (!active || !appActive || reducedMotion) {
      cancelAnimation(breathScale);
      breathScale.set(1);
      return;
    }
    breathScale.set(
      withRepeat(
        withSequence(
          withTiming(1.028, { duration: 3200, easing: Easing.inOut(Easing.sin) }),
          withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(breathScale);
  }, [active, appActive, breathScale, reducedMotion]);

  const imageAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breathScale.value * tapScale.value }],
  }));

  if (!active) return null;

  const handleCycle = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playUiSound("shuffle");
    setIndex((prev) => (prev + 1) % items.length);
    if (!reducedMotion) {
      tapScale.set(
        withSequence(
          withTiming(1.035, { duration: 90, easing: Easing.out(Easing.cubic) }),
          withSpring(1, CARD_SPRING),
        ),
      );
    }
  };

  const aspectRatio = props.compact
    ? 0.78
    : active.layout === "fullbody"
      ? 0.67
      : 0.72;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={gt("Cycle Rias VIP showcase portrait")}
      onPress={handleCycle}
      style={{
        borderRadius: 24,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(225, 29, 72, 0.34)",
        backgroundColor: "#0B0509",
        boxShadow: [
          {
            offsetX: 0,
            offsetY: 10,
            blurRadius: 28,
            spreadDistance: 0,
            color: "rgba(197, 1, 46, 0.24)",
          },
        ],
      }}
    >
      <View style={{ width: "100%", aspectRatio, overflow: "hidden", backgroundColor: "#0B0509" }}>
        <Animated.View style={[{ width: "100%", height: "100%" }, imageAnimStyle]}>
          <Image
            source={active.source}
            contentFit="cover"
            contentPosition="top"
            transition={220}
            accessibilityIgnoresInvertColors
            style={{ width: "100%", height: "100%" }}
          />
        </Animated.View>

        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: 16,
            paddingTop: 28,
            paddingBottom: 14,
            backgroundColor: "rgba(10, 4, 8, 0.74)",
            borderTopWidth: 1,
            borderTopColor: "rgba(255, 255, 255, 0.08)",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              allowFontScaling={false}
              numberOfLines={1}
              style={{ color: "#FFF1F2", fontSize: 14, fontWeight: "700" }}
            >
              {active.title ?? "Rias Gremory"}
            </Text>
            <Text
              allowFontScaling={false}
              numberOfLines={1}
              style={{ color: "rgba(254, 205, 211, 0.78)", fontSize: 11 }}
            >
              {gt("Tap portrait to switch ({current}/{total})", {
                current: (index % items.length) + 1,
                total: items.length,
              })}
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 5, alignItems: "center" }}>
            {items.map((item, i) => {
              const selected = i === index % items.length;
              return (
                <View
                  key={item.id}
                  style={{
                    width: selected ? 16 : 6,
                    height: 6,
                    borderRadius: 999,
                    backgroundColor: selected ? "#FB7185" : "rgba(255, 255, 255, 0.3)",
                  }}
                />
              );
            })}
          </View>
        </View>
      </View>
    </Pressable>
  );
});

const VaultPinDot = memo(function VaultPinDot(props: {
  readonly filled: boolean;
  readonly isError: boolean;
}) {
  const popScale = useSharedValue(props.filled ? 1.12 : 1);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- animates PIN indicator dot pop on digit entry
  useEffect(() => {
    popScale.set(
      props.filled
        ? withSequence(
            withTiming(1.24, { duration: 75, easing: Easing.out(Easing.cubic) }),
            withSpring(1, CARD_SPRING),
          )
        : withTiming(1, { duration: 100 }),
    );
  }, [popScale, props.filled]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: popScale.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          width: 14,
          height: 14,
          borderRadius: 999,
          borderWidth: 1.5,
          borderColor: props.isError
            ? "#FF4D6D"
            : props.filled
              ? "#FB7185"
              : "rgba(254, 205, 211, 0.35)",
          backgroundColor: props.isError
            ? "rgba(255, 77, 109, 0.85)"
            : props.filled
              ? "#FB7185"
              : "rgba(255, 255, 255, 0.06)",
        },
        animStyle,
      ]}
    />
  );
});

const VaultPageDot = memo(function VaultPageDot(props: {
  readonly selected: boolean;
  readonly edgeDim?: boolean;
}) {
  const width = useSharedValue(props.selected ? 18 : props.edgeDim ? 4 : 6);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- smoothly transitions active indicator pill width
  useEffect(() => {
    width.set(
      withTiming(props.selected ? 18 : props.edgeDim ? 4 : 6, {
        duration: 180,
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.System,
      }),
    );
  }, [props.edgeDim, props.selected, width]);

  const animStyle = useAnimatedStyle(() => ({
    width: width.value,
  }));

  return (
    <Animated.View
      style={[
        {
          height: props.edgeDim && !props.selected ? 4 : 6,
          borderRadius: 999,
          backgroundColor: props.selected
            ? "#FB7185"
            : props.edgeDim
              ? "rgba(255, 255, 255, 0.18)"
              : "rgba(255, 255, 255, 0.3)",
        },
        animStyle,
      ]}
    />
  );
});

const VipPinKeypad = memo(function VipPinKeypad(props: {
  readonly mode: "unlock" | "set";
  readonly storedPin: string | null;
  readonly onUnlock: () => void;
  readonly onPinSaved: (pin: string) => void;
  readonly onClose: () => void;
}) {
  const gt = useGT();
  const reducedMotion = useReduceMotionEnabled();
  const [entry, setEntry] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const shakeX = useSharedValue(0);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- clears pending PIN error reset timer on unmount
  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const triggerShake = useCallback(() => {
    if (reducedMotion) return;
    shakeX.set(
      withSequence(
        withTiming(-12, { duration: 45 }),
        withTiming(12, { duration: 45 }),
        withTiming(-9, { duration: 45 }),
        withTiming(9, { duration: 45 }),
        withTiming(-4, { duration: 40 }),
        withTiming(0, { duration: 40 }),
      ),
    );
  }, [reducedMotion, shakeX]);

  const dotsAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  const handleKeyPress = async (key: PinKeypadKey) => {
    if (saving) return;
    if (resetTimerRef.current !== null) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }

    if (key === "clear") {
      if (entry.length > 0 || errorText) {
        void Haptics.selectionAsync();
        setEntry("");
        setErrorText(null);
      }
      return;
    }

    if (key === "backspace") {
      if (entry.length > 0) {
        void Haptics.selectionAsync();
        setEntry((prev) => removeLastPinDigit(prev));
        setErrorText(null);
      }
      return;
    }

    void Haptics.selectionAsync();
    const baseEntry = errorText ? "" : entry;
    setErrorText(null);
    const next = appendPinDigit(baseEntry, key);
    setEntry(next);

    if (next.length < VIP_PIN_LENGTH) return;

    if (props.mode === "unlock") {
      const result = evaluatePinAttempt(next, props.storedPin ?? "");
      if (result === "match") {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        props.onUnlock();
      } else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setErrorText(gt("Incorrect PIN"));
        triggerShake();
        resetTimerRef.current = setTimeout(() => {
          setEntry("");
          resetTimerRef.current = null;
        }, 260);
      }
      return;
    }

    setSaving(true);
    const saved = await saveVipVaultPin(next);
    setSaving(false);
    if (saved) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      props.onPinSaved(next);
    } else {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorText(gt("Could not save PIN"));
      triggerShake();
      resetTimerRef.current = setTimeout(() => {
        setEntry("");
        resetTimerRef.current = null;
      }, 260);
    }
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "rgba(5, 2, 5, 0.98)",
        paddingHorizontal: 24,
        paddingTop: 52,
        paddingBottom: 36,
        justifyContent: "space-between",
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={props.mode === "unlock" ? gt("Close VIP Vault") : gt("Cancel PIN setup")}
          onPress={props.onClose}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 7,
            borderRadius: 999,
            backgroundColor: "rgba(24, 12, 18, 0.88)",
            borderWidth: 1,
            borderColor: "rgba(251, 113, 133, 0.4)",
          }}
        >
          <Text allowFontScaling={false} style={{ color: "#FFE4E6", fontSize: 12, fontWeight: "700" }}>
            {props.mode === "unlock" ? gt("Close") : gt("Cancel")}
          </Text>
        </Pressable>
      </View>

      <View style={{ alignItems: "center", gap: 22 }}>
        <View style={{ alignItems: "center", gap: 8 }}>
          <View
            style={{
              width: 54,
              height: 54,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(225, 29, 72, 0.16)",
              borderWidth: 1,
              borderColor: "rgba(251, 113, 133, 0.42)",
            }}
          >
            <Text allowFontScaling={false} style={{ fontSize: 22 }}>
              {props.mode === "unlock" ? "🔐" : "🔒"}
            </Text>
          </View>
          <Text
            allowFontScaling={false}
            style={{ color: "#FFF1F2", fontSize: 20, fontWeight: "700", letterSpacing: -0.3 }}
          >
            {props.mode === "unlock" ? gt("VIP Vault") : gt("Set Vault PIN")}
          </Text>
          <Text
            allowFontScaling={false}
            style={{
              color: errorText ? "#FB7185" : "rgba(254, 205, 211, 0.72)",
              fontSize: 13,
              fontWeight: errorText ? "600" : "400",
            }}
          >
            {errorText ??
              (props.mode === "unlock"
                ? gt("Enter 4-digit PIN to unlock")
                : gt("Enter a new 4-digit PIN"))}
          </Text>
        </View>

        <Animated.View
          style={[
            {
              flexDirection: "row",
              gap: 18,
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 6,
            },
            dotsAnimStyle,
          ]}
        >
          {Array.from({ length: VIP_PIN_LENGTH }, (_, idx) => (
            <VaultPinDot key={idx} filled={idx < entry.length} isError={Boolean(errorText)} />
          ))}
        </Animated.View>

        <View style={{ gap: 14, marginTop: 6 }}>
          {PIN_KEYPAD_ROWS.map((row, rowIdx) => (
            <View
              key={rowIdx}
              style={{ flexDirection: "row", gap: 20, justifyContent: "center", alignItems: "center" }}
            >
              {row.map((key) => {
                const isAction = key === "clear" || key === "backspace";
                const label =
                  key === "clear" ? gt("Clear") : key === "backspace" ? "⌫" : key;
                const accessibilityLabel =
                  key === "clear"
                    ? gt("Clear PIN")
                    : key === "backspace"
                      ? gt("Delete digit")
                      : key;
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    accessibilityLabel={accessibilityLabel}
                    onPress={() => {
                      void handleKeyPress(key);
                    }}
                    style={({ pressed }) => ({
                      width: 70,
                      height: 70,
                      borderRadius: 999,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: pressed
                        ? "rgba(225, 29, 72, 0.34)"
                        : isAction
                          ? "rgba(18, 8, 14, 0.74)"
                          : "rgba(28, 12, 20, 0.88)",
                      borderWidth: 1,
                      borderColor: pressed
                        ? "rgba(251, 113, 133, 0.78)"
                        : isAction
                          ? "rgba(255, 255, 255, 0.12)"
                          : "rgba(251, 113, 133, 0.28)",
                    })}
                  >
                    <Text
                      allowFontScaling={false}
                      style={{
                        color: key === "clear" ? "rgba(254, 205, 211, 0.82)" : "#FFF1F2",
                        fontSize: key === "clear" ? 13 : key === "backspace" ? 22 : 26,
                        fontWeight: key === "clear" ? "600" : "700",
                      }}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </View>

      <View style={{ height: 12 }} />
    </View>
  );
});

const VipPinManageOverlay = memo(function VipPinManageOverlay(props: {
  readonly onChangePin: () => void;
  readonly onRemovePin: () => void;
  readonly onDismiss: () => void;
}) {
  const gt = useGT();
  return (
    <View
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 40,
        backgroundColor: "rgba(4, 1, 4, 0.84)",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 28,
      }}
    >
      <View
        style={{
          width: "100%",
          maxWidth: 340,
          borderRadius: 24,
          padding: 20,
          gap: 12,
          backgroundColor: "#13070D",
          borderWidth: 1,
          borderColor: "rgba(251, 113, 133, 0.36)",
        }}
      >
        <View style={{ gap: 4, marginBottom: 4 }}>
          <Text allowFontScaling={false} style={{ color: "#FFF1F2", fontSize: 17, fontWeight: "700" }}>
            {gt("Vault PIN Protection")}
          </Text>
          <Text
            allowFontScaling={false}
            style={{ color: "rgba(254, 205, 211, 0.72)", fontSize: 12.5 }}
          >
            {gt("A 4-digit PIN is required each time the hidden VIP Vault opens.")}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={gt("Change 4-digit PIN")}
          onPress={props.onChangePin}
          style={({ pressed }) => ({
            paddingVertical: 12,
            borderRadius: 14,
            alignItems: "center",
            backgroundColor: pressed ? "rgba(225, 29, 72, 0.3)" : "rgba(251, 113, 133, 0.16)",
            borderWidth: 1,
            borderColor: "rgba(251, 113, 133, 0.42)",
          })}
        >
          <Text allowFontScaling={false} style={{ color: "#FFE4E6", fontSize: 14, fontWeight: "700" }}>
            {gt("Change 4-Digit PIN")}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={gt("Remove PIN")}
          onPress={props.onRemovePin}
          style={({ pressed }) => ({
            paddingVertical: 12,
            borderRadius: 14,
            alignItems: "center",
            backgroundColor: pressed ? "rgba(225, 29, 72, 0.4)" : "rgba(159, 18, 57, 0.24)",
            borderWidth: 1,
            borderColor: "rgba(244, 63, 94, 0.48)",
          })}
        >
          <Text allowFontScaling={false} style={{ color: "#FDA4AF", fontSize: 14, fontWeight: "700" }}>
            {gt("Remove PIN")}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={gt("Cancel")}
          onPress={props.onDismiss}
          style={({ pressed }) => ({
            paddingVertical: 11,
            borderRadius: 14,
            alignItems: "center",
            backgroundColor: pressed ? "rgba(255, 255, 255, 0.1)" : "rgba(255, 255, 255, 0.05)",
            borderWidth: 1,
            borderColor: "rgba(255, 255, 255, 0.1)",
          })}
        >
          <Text
            allowFontScaling={false}
            style={{ color: "rgba(255, 241, 242, 0.8)", fontSize: 13.5, fontWeight: "600" }}
          >
            {gt("Cancel")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
});

const VipVideoSlide = memo(function VipVideoSlide(props: {
  readonly item: SyncedRiasVipPortrait;
  readonly isActive: boolean;
  readonly modalVisible: boolean;
  readonly isUnlocked: boolean;
  readonly appActive: boolean;
  readonly muted: boolean;
  readonly onToggleMuted: () => void;
}) {
  const gt = useGT();
  const [userPaused, setUserPaused] = useState(false);
  const [prevActive, setPrevActive] = useState(props.isActive);
  if (props.isActive !== prevActive) {
    setPrevActive(props.isActive);
    if (!props.isActive && userPaused) {
      setUserPaused(false);
    }
  }

  const initialMutedRef = useRef(props.muted);
  const player = useVideoPlayer(props.item.uri, (instance) => {
    instance.loop = true;
    instance.muted = initialMutedRef.current;
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- keeps native video player mute flag aligned with the audio pill
  useEffect(() => {
    try {
      player.muted = props.muted;
    } catch {
      // Ignore native player state errors during teardown.
    }
  }, [player, props.muted]);

  const shouldPlay = shouldPlayVipVideo({
    mediaType: props.item.mediaType,
    isActive: props.isActive,
    modalVisible: props.modalVisible,
    isUnlocked: props.isUnlocked,
    userPaused,
    appActive: props.appActive,
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- starts or pauses native video playback strictly when slide is active and unlocked
  useEffect(() => {
    try {
      if (shouldPlay) {
        player.play();
      } else {
        player.pause();
      }
    } catch {
      // Ignore native player errors during unmount or slide transition.
    }
    return () => {
      try {
        player.pause();
      } catch {
        // Ignore teardown errors.
      }
    };
  }, [player, shouldPlay]);

  const isWideOrSquare = isWideOrSquareMedia(props.item.width, props.item.height);

  const handleTogglePlayPause = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setUserPaused((paused) => !paused);
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#050205" }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={userPaused ? gt("Play video") : gt("Pause video")}
        onPress={handleTogglePlayPause}
        style={{ flex: 1 }}
      >
        <VideoView
          player={player}
          contentFit={isWideOrSquare ? "contain" : "cover"}
          nativeControls={false}
          surfaceType="textureView"
          allowsPictureInPicture={false}
          style={{ width: "100%", height: "100%" }}
        />

        {userPaused ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              inset: 0,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(18, 6, 12, 0.78)",
                borderWidth: 1.5,
                borderColor: "rgba(251, 113, 133, 0.72)",
              }}
            >
              <Text
                allowFontScaling={false}
                style={{ color: "#FFE4E6", fontSize: 24, marginLeft: 4 }}
              >
                ▶
              </Text>
            </View>
          </View>
        ) : null}
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={props.muted ? gt("Unmute video audio") : gt("Mute video audio")}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          props.onToggleMuted();
        }}
        style={{
          position: "absolute",
          top: 14,
          right: 14,
          zIndex: 10,
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: "rgba(18, 6, 12, 0.84)",
          borderWidth: 1,
          borderColor: props.muted ? "rgba(255, 255, 255, 0.22)" : "rgba(251, 113, 133, 0.55)",
        }}
      >
        <Text allowFontScaling={false} style={{ color: "#FFE4E6", fontSize: 11.5, fontWeight: "700" }}>
          {props.muted ? gt("🔇 Muted") : gt("🔊 Sound")}
        </Text>
      </Pressable>
    </View>
  );
});

const VipImageSlide = memo(function VipImageSlide(props: {
  readonly item: SyncedRiasVipPortrait;
  readonly isActive: boolean;
  readonly onZoomChange: (zoomed: boolean) => void;
}) {
  const [isZoomed, setIsZoomed] = useState(false);
  const zoomedRef = useRef(false);

  const scale = useSharedValue(VIP_ZOOM_MIN);
  const savedScale = useSharedValue(VIP_ZOOM_MIN);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const pinchOriginX = useSharedValue(0);
  const pinchOriginY = useSharedValue(0);
  const isPinching = useSharedValue(false);
  const frameWidth = useSharedValue(0);
  const frameHeight = useSharedValue(0);

  const reportZoomed = useEffectEvent((nextZoomed: boolean) => {
    if (zoomedRef.current === nextZoomed) return;
    zoomedRef.current = nextZoomed;
    setIsZoomed(nextZoomed);
    props.onZoomChange(nextZoomed);
  });

  const triggerLightHaptic = useEffectEvent(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- resets zoom transform when swiping away from an image slide
  useEffect(() => {
    if (props.isActive) return;
    scale.set(VIP_ZOOM_MIN);
    savedScale.set(VIP_ZOOM_MIN);
    translateX.set(0);
    translateY.set(0);
    savedTranslateX.set(0);
    savedTranslateY.set(0);
    isPinching.set(false);
    if (zoomedRef.current) {
      zoomedRef.current = false;
      // oxlint-disable-next-line react/set-state-in-effect -- syncs local gesture gate when slide deactivates
      setIsZoomed(false);
    }
  }, [
    isPinching,
    props.isActive,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    scale,
    translateX,
    translateY,
  ]);

  const gesture = useMemo(() => {
    const pinch = Gesture.Pinch()
      .onStart((event) => {
        isPinching.set(true);
        savedScale.set(scale.get());
        savedTranslateX.set(translateX.get());
        savedTranslateY.set(translateY.get());
        const w = frameWidth.get();
        const h = frameHeight.get();
        pinchOriginX.set(event.focalX - w / 2);
        pinchOriginY.set(event.focalY - h / 2);
      })
      .onUpdate((event) => {
        const startScale = savedScale.get();
        const nextScale = Math.min(Math.max(startScale * event.scale, VIP_ZOOM_MIN), VIP_ZOOM_MAX);
        const w = frameWidth.get();
        const h = frameHeight.get();
        const focalX = event.focalX - w / 2;
        const focalY = event.focalY - h / 2;
        const contentX = (pinchOriginX.get() - savedTranslateX.get()) / startScale;
        const contentY = (pinchOriginY.get() - savedTranslateY.get()) / startScale;
        const maxX = Math.max(0, ((nextScale - 1) * w) / 2);
        const maxY = Math.max(0, ((nextScale - 1) * h) / 2);
        const nextX = Math.min(Math.max(focalX - nextScale * contentX, -maxX), maxX);
        const nextY = Math.min(Math.max(focalY - nextScale * contentY, -maxY), maxY);
        scale.set(nextScale);
        translateX.set(nextX);
        translateY.set(nextY);
      })
      .onEnd(() => {
        isPinching.set(false);
        const currentScale = scale.get();
        if (currentScale <= VIP_ZOOM_SNAP_RESET_THRESHOLD) {
          scale.set(withSpring(VIP_ZOOM_MIN, ZOOM_SPRING));
          translateX.set(withSpring(0, ZOOM_SPRING));
          translateY.set(withSpring(0, ZOOM_SPRING));
          savedScale.set(VIP_ZOOM_MIN);
          savedTranslateX.set(0);
          savedTranslateY.set(0);
          runOnJS(reportZoomed)(false);
        } else {
          const w = frameWidth.get();
          const h = frameHeight.get();
          const maxX = Math.max(0, ((currentScale - 1) * w) / 2);
          const maxY = Math.max(0, ((currentScale - 1) * h) / 2);
          const clampedX = Math.min(Math.max(translateX.get(), -maxX), maxX);
          const clampedY = Math.min(Math.max(translateY.get(), -maxY), maxY);
          translateX.set(withSpring(clampedX, ZOOM_SPRING));
          translateY.set(withSpring(clampedY, ZOOM_SPRING));
          savedScale.set(currentScale);
          savedTranslateX.set(clampedX);
          savedTranslateY.set(clampedY);
          runOnJS(reportZoomed)(true);
        }
      });

    const pan = Gesture.Pan()
      .enabled(isZoomed)
      .minDistance(4)
      .onTouchesDown((_event, manager) => {
        if (scale.get() <= VIP_ZOOM_SNAP_RESET_THRESHOLD) {
          manager.fail();
        }
      })
      .onStart(() => {
        savedTranslateX.set(translateX.get());
        savedTranslateY.set(translateY.get());
      })
      .onUpdate((event) => {
        if (isPinching.get()) {
          savedTranslateX.set(translateX.get() - event.translationX);
          savedTranslateY.set(translateY.get() - event.translationY);
          return;
        }
        const currentScale = scale.get();
        if (currentScale <= VIP_ZOOM_SNAP_RESET_THRESHOLD) return;
        const w = frameWidth.get();
        const h = frameHeight.get();
        const maxX = Math.max(0, ((currentScale - 1) * w) / 2);
        const maxY = Math.max(0, ((currentScale - 1) * h) / 2);
        const nextX = savedTranslateX.get() + event.translationX;
        const nextY = savedTranslateY.get() + event.translationY;
        translateX.set(Math.min(Math.max(nextX, -maxX), maxX));
        translateY.set(Math.min(Math.max(nextY, -maxY), maxY));
      })
      .onEnd(() => {
        savedTranslateX.set(translateX.get());
        savedTranslateY.set(translateY.get());
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(250)
      .onEnd((event, success) => {
        if (!success) return;
        const currentScale = scale.get();
        if (currentScale > VIP_ZOOM_SNAP_RESET_THRESHOLD) {
          scale.set(withSpring(VIP_ZOOM_MIN, ZOOM_SPRING));
          translateX.set(withSpring(0, ZOOM_SPRING));
          translateY.set(withSpring(0, ZOOM_SPRING));
          savedScale.set(VIP_ZOOM_MIN);
          savedTranslateX.set(0);
          savedTranslateY.set(0);
          runOnJS(reportZoomed)(false);
        } else {
          const targetScale = VIP_ZOOM_DOUBLE_TAP;
          const w = frameWidth.get();
          const h = frameHeight.get();
          const maxX = Math.max(0, ((targetScale - 1) * w) / 2);
          const maxY = Math.max(0, ((targetScale - 1) * h) / 2);
          const rawX = (w / 2 - event.x) * (targetScale - 1);
          const rawY = (h / 2 - event.y) * (targetScale - 1);
          const clampedX = Math.min(Math.max(rawX, -maxX), maxX);
          const clampedY = Math.min(Math.max(rawY, -maxY), maxY);
          scale.set(withSpring(targetScale, ZOOM_SPRING));
          translateX.set(withSpring(clampedX, ZOOM_SPRING));
          translateY.set(withSpring(clampedY, ZOOM_SPRING));
          savedScale.set(targetScale);
          savedTranslateX.set(clampedX);
          savedTranslateY.set(clampedY);
          runOnJS(reportZoomed)(true);
        }
        runOnJS(triggerLightHaptic)();
      });

    return Gesture.Simultaneous(pinch, pan, doubleTap);
  }, [
    frameHeight,
    frameWidth,
    isPinching,
    isZoomed,
    pinchOriginX,
    pinchOriginY,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    scale,
    translateX,
    translateY,
  ]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.get() },
      { translateY: translateY.get() },
      { scale: scale.get() },
    ],
  }));

  const isWideOrSquare = isWideOrSquareMedia(props.item.width, props.item.height);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    frameWidth.set(width);
    frameHeight.set(height);
  };

  return (
    <GestureDetector gesture={gesture}>
      <View
        onLayout={handleLayout}
        style={{ flex: 1, overflow: "hidden", backgroundColor: "#050205" }}
      >
        <Animated.View style={[{ width: "100%", height: "100%" }, animatedStyle]}>
          <Image
            source={props.item.source}
            autoplay
            contentFit={isWideOrSquare ? "contain" : "cover"}
            contentPosition={isWideOrSquare ? "center" : "top"}
            transition={200}
            accessibilityIgnoresInvertColors
            style={{ width: "100%", height: "100%" }}
          />
        </Animated.View>
      </View>
    </GestureDetector>
  );
});

/**
 * Full-screen OLED Hidden VIP Vault 2.0 modal viewer (triggered exclusively by long-pressing
 * the top-left Rias Code header icon). Supports optional 4-digit SecureStore PIN lock,
 * horizontal swipe paging, looping video+audio playback, and pinch/pan/double-tap zoom.
 */
export const RiasVipGalleryModal = memo(function RiasVipGalleryModal(props: {
  readonly visible: boolean;
  readonly onClose: () => void;
}) {
  const gt = useGT();
  const pack = useAkenoPosePack({ autoSync: false });
  const appActive = useAppActive();

  const [prevVisible, setPrevVisible] = useState(props.visible);
  const [openGeneration, setOpenGeneration] = useState(0);
  const [resolvedGeneration, setResolvedGeneration] = useState(-1);
  const [gateState, setGateState] = useState<VipVaultGateState>("locked");
  const [storedPin, setStoredPin] = useState<string | null>(null);
  const [pinOverlay, setPinOverlay] = useState<"none" | "set" | "manage">("none");

  const [activeIndex, setActiveIndex] = useState(0);
  const [stageWidth, setStageWidth] = useState(0);
  const [muted, setMuted] = useState(false);
  const [isActiveSlideZoomed, setIsActiveSlideZoomed] = useState(false);

  if (props.visible !== prevVisible) {
    setPrevVisible(props.visible);
    if (props.visible) {
      setOpenGeneration((gen) => gen + 1);
      setPinOverlay("none");
      setIsActiveSlideZoomed(false);
      setMuted(false);
      setActiveIndex(0);
    }
  }

  const isPinLoading = props.visible && resolvedGeneration !== openGeneration;

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- loads optional SecureStore PIN whenever the hidden vault opens
  useEffect(() => {
    if (!props.visible) return;
    let cancelled = false;
    const currentGen = openGeneration;
    void loadVipVaultPin().then((pin) => {
      if (cancelled) return;
      setStoredPin(pin);
      setGateState(resolveVaultInitialGateState(pin));
      setResolvedGeneration(currentGen);
    });
    return () => {
      cancelled = true;
    };
  }, [openGeneration, props.visible]);

  const items = pack.riasVip;
  const safeActiveIndex = clampSlideIndex(activeIndex, items.length);
  const activeItem = items.length > 0 ? items[safeActiveIndex]! : null;
  const dotWindow = useMemo(
    () => computeVisibleDotWindow(safeActiveIndex, items.length, VIP_MAX_VISIBLE_DOTS),
    [items.length, safeActiveIndex],
  );

  const handleStageLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    if (nextWidth > 0) {
      setStageWidth((prev) => (prev === nextWidth ? prev : nextWidth));
    }
  }, []);

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (stageWidth <= 0 || items.length === 0) return;
      const nextIndex = computeActiveSlideIndex(
        event.nativeEvent.contentOffset.x,
        stageWidth,
        items.length,
      );
      if (nextIndex !== safeActiveIndex) {
        setActiveIndex(nextIndex);
        setIsActiveSlideZoomed(false);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    },
    [items.length, safeActiveIndex, stageWidth],
  );

  const handleToggleMuted = useCallback(() => {
    setMuted((prev) => !prev);
  }, []);

  const handleRemovePin = useCallback(async () => {
    const ok = await clearVipVaultPin();
    if (ok) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setStoredPin(null);
      setPinOverlay("none");
    }
  }, []);

  const getItemLayout = useCallback(
    (_data: ArrayLike<SyncedRiasVipPortrait> | null | undefined, index: number) => ({
      length: stageWidth,
      offset: stageWidth * index,
      index,
    }),
    [stageWidth],
  );

  const isGalleryLive = !isPinLoading && gateState === "unlocked" && pinOverlay === "none";

  const renderSlide = useCallback(
    ({ item, index }: { readonly item: SyncedRiasVipPortrait; readonly index: number }) => {
      const isSlideActive = index === safeActiveIndex;
      return (
        <View style={{ width: stageWidth, height: "100%", paddingHorizontal: 16 }}>
          <View
            style={{
              flex: 1,
              borderRadius: 28,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: "rgba(225, 29, 72, 0.42)",
              backgroundColor: "#080307",
            }}
          >
            {item.mediaType === "video" ? (
              <VipVideoSlide
                item={item}
                isActive={isSlideActive}
                modalVisible={props.visible}
                isUnlocked={isGalleryLive}
                appActive={appActive}
                muted={muted}
                onToggleMuted={handleToggleMuted}
              />
            ) : (
              <VipImageSlide
                item={item}
                isActive={isSlideActive}
                onZoomChange={(zoomed) => {
                  if (isSlideActive) setIsActiveSlideZoomed(zoomed);
                }}
              />
            )}
          </View>
        </View>
      );
    },
    [
      appActive,
      handleToggleMuted,
      isGalleryLive,
      muted,
      props.visible,
      safeActiveIndex,
      stageWidth,
    ],
  );

  if (!props.visible || !activeItem) return null;

  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={props.onClose}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        {isPinLoading ? (
          <View style={{ flex: 1, backgroundColor: "rgba(5, 2, 5, 0.98)" }} />
        ) : gateState === "locked" ? (
          <VipPinKeypad
            mode="unlock"
            storedPin={storedPin}
            onUnlock={() => setGateState("unlocked")}
            onPinSaved={() => undefined}
            onClose={props.onClose}
          />
        ) : pinOverlay === "set" ? (
          <VipPinKeypad
            mode="set"
            storedPin={storedPin}
            onUnlock={() => undefined}
            onPinSaved={(nextPin) => {
              setStoredPin(nextPin);
              setPinOverlay("none");
            }}
            onClose={() => setPinOverlay("none")}
          />
        ) : (
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(5, 2, 5, 0.96)",
              paddingTop: 48,
              paddingBottom: 28,
            }}
          >
            {/* Top header bar: PIN control (left) + Close pill (right) */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 20,
                paddingBottom: 14,
                zIndex: 20,
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={storedPin ? gt("Manage VIP Vault PIN") : gt("Set VIP Vault PIN")}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setPinOverlay(storedPin ? "manage" : "set");
                }}
                style={{
                  paddingHorizontal: 13,
                  paddingVertical: 7,
                  borderRadius: 999,
                  backgroundColor: storedPin
                    ? "rgba(225, 29, 72, 0.24)"
                    : "rgba(24, 12, 18, 0.88)",
                  borderWidth: 1,
                  borderColor: storedPin
                    ? "rgba(251, 113, 133, 0.56)"
                    : "rgba(251, 113, 133, 0.34)",
                }}
              >
                <Text
                  allowFontScaling={false}
                  style={{ color: "#FFE4E6", fontSize: 12, fontWeight: "700" }}
                >
                  {storedPin ? gt("🔐 PIN On") : gt("🔒 Set PIN")}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={gt("Close VIP Rias gallery")}
                onPress={props.onClose}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: 999,
                  backgroundColor: "rgba(24, 12, 18, 0.88)",
                  borderWidth: 1,
                  borderColor: "rgba(251, 113, 133, 0.4)",
                }}
              >
                <Text
                  allowFontScaling={false}
                  style={{ color: "#FFE4E6", fontSize: 12, fontWeight: "700" }}
                >
                  {gt("Close")}
                </Text>
              </Pressable>
            </View>

            {/* Horizontal swipe paging media stage */}
            <View style={{ flex: 1 }} onLayout={handleStageLayout}>
              {stageWidth > 0 ? (
                <FlatList
                  data={items}
                  horizontal
                  pagingEnabled
                  bounces={false}
                  scrollEnabled={!isActiveSlideZoomed}
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(item) => item.id}
                  renderItem={renderSlide}
                  getItemLayout={getItemLayout}
                  onMomentumScrollEnd={handleMomentumScrollEnd}
                  windowSize={3}
                  initialNumToRender={2}
                  maxToRenderPerBatch={2}
                  extraData={{
                    safeActiveIndex,
                    isGalleryLive,
                    muted,
                    appActive,
                    stageWidth,
                  }}
                />
              ) : null}
            </View>

            {/* Footer bar: Title, count, and capped animated crimson dots */}
            <View
              style={{
                marginHorizontal: 16,
                marginTop: 14,
                paddingHorizontal: 18,
                paddingVertical: 14,
                borderRadius: 22,
                backgroundColor: "rgba(12, 5, 9, 0.9)",
                borderWidth: 1,
                borderColor: "rgba(225, 29, 72, 0.28)",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  allowFontScaling={false}
                  numberOfLines={1}
                  style={{ color: "#FFF1F2", fontSize: 15, fontWeight: "700" }}
                >
                  {activeItem.title ?? "Rias Gremory"}
                </Text>
                <Text
                  allowFontScaling={false}
                  numberOfLines={1}
                  style={{ color: "rgba(254, 205, 211, 0.78)", fontSize: 11.5 }}
                >
                  {activeItem.mediaType === "video"
                    ? gt("{current}/{total} • Swipe • Tap to pause", {
                        current: safeActiveIndex + 1,
                        total: items.length,
                      })
                    : gt("{current}/{total} • Swipe • Pinch to zoom", {
                        current: safeActiveIndex + 1,
                        total: items.length,
                      })}
                </Text>
              </View>

              <View style={{ flexDirection: "row", gap: 5, alignItems: "center", flexShrink: 0 }}>
                {dotWindow.indices.map((dotIndex, pos) => {
                  const isEdgeDim =
                    (pos === 0 && dotWindow.hasLeadingMore) ||
                    (pos === dotWindow.indices.length - 1 && dotWindow.hasTrailingMore);
                  return (
                    <VaultPageDot
                      key={items[dotIndex]?.id ?? dotIndex}
                      selected={dotIndex === safeActiveIndex}
                      edgeDim={isEdgeDim}
                    />
                  );
                })}
              </View>
            </View>

            {pinOverlay === "manage" ? (
              <VipPinManageOverlay
                onChangePin={() => setPinOverlay("set")}
                onRemovePin={() => {
                  void handleRemovePin();
                }}
                onDismiss={() => setPinOverlay("none")}
              />
            ) : null}
          </View>
        )}
      </GestureHandlerRootView>
    </Modal>
  );
});
