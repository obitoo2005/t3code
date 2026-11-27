import IconBackspace from "@tabler/icons-react-native/IconBackspace";
import IconEye from "@tabler/icons-react-native/IconEye";
import IconEyeOff from "@tabler/icons-react-native/IconEyeOff";
import IconLock from "@tabler/icons-react-native/IconLock";
import IconLockCheck from "@tabler/icons-react-native/IconLockCheck";
import IconLockOpen from "@tabler/icons-react-native/IconLockOpen";
import IconPlayerPauseFilled from "@tabler/icons-react-native/IconPlayerPauseFilled";
import IconPlayerPlayFilled from "@tabler/icons-react-native/IconPlayerPlayFilled";
import IconRewindBackward10 from "@tabler/icons-react-native/IconRewindBackward10";
import IconRewindForward10 from "@tabler/icons-react-native/IconRewindForward10";
import IconVolume from "@tabler/icons-react-native/IconVolume";
import IconVolumeOff from "@tabler/icons-react-native/IconVolumeOff";
import IconX from "@tabler/icons-react-native/IconX";
import { BlurTargetView, BlurView } from "expo-blur";
import { GlassView, isGlassEffectAPIAvailable } from "expo-glass-effect";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useGT } from "gt-react-native";
import {
  memo,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
  type RefObject,
} from "react";
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAkenoPosePack, type SyncedRiasVipPortrait } from "../lib/akenoPosePack";
import { useAppActive, useReduceMotionEnabled } from "../lib/appState";
import { playUiSound } from "../lib/uiSoundFx";
import {
  appendPinDigit,
  clampSlideIndex,
  clampVideoTime,
  clearVipVaultPin,
  computeActiveSlideIndex,
  computeSeekTimeFromTouch,
  computeVideoProgress,
  computeVisibleDotWindow,
  evaluatePinAttempt,
  formatVideoTimestamp,
  isWideOrSquareMedia,
  loadVipVaultPin,
  removeLastPinDigit,
  resolveVaultInitialGateState,
  saveVipVaultPin,
  shouldPlayVipVideo,
  VIP_MAX_VISIBLE_DOTS,
  VIP_PIN_LENGTH,
  VIP_VIDEO_SKIP_SECONDS,
  VIP_ZOOM_DOUBLE_TAP,
  VIP_ZOOM_MAX,
  VIP_ZOOM_MIN,
  VIP_ZOOM_SNAP_RESET_THRESHOLD,
  type VipVaultGateState,
} from "./riasVipVaultLogic";
import { AndroidGlassPressable } from "./ui/AndroidGlassSurface";
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
 * Pure neutral default Liquid Glass palette matching the app's standard dark Liquid Glass chrome.
 * Intentionally theme-neutral (zero red/crimson tinting) so VIP Gallery always looks clean and glass-native.
 */
const GLASS = {
  backdrop: "#07070A",
  backdropOverlay: "rgba(7, 7, 10, 0.86)",
  stageBg: "#0B0B0F",
  stageBorder: "rgba(255, 255, 255, 0.12)",
  chromeTint: "rgba(26, 26, 32, 0.88)",
  chromeTintLive: "rgba(26, 26, 32, 0.56)",
  elevatedTint: "rgba(30, 30, 38, 0.92)",
  elevatedTintLive: "rgba(30, 30, 38, 0.60)",
  activeTint: "rgba(255, 255, 255, 0.18)",
  activeTintLive: "rgba(255, 255, 255, 0.22)",
  subtleTint: "rgba(255, 255, 255, 0.08)",
  border: "rgba(255, 255, 255, 0.14)",
  borderTop: "rgba(255, 255, 255, 0.28)",
  borderBottom: "rgba(255, 255, 255, 0.08)",
  borderActive: "rgba(255, 255, 255, 0.34)",
  textPrimary: "#F8FAFC",
  textSecondary: "rgba(248, 250, 252, 0.66)",
  textMuted: "rgba(248, 250, 252, 0.46)",
  accent: "#FFFFFF",
  trackBg: "rgba(255, 255, 255, 0.22)",
  dotInactive: "rgba(255, 255, 255, 0.28)",
  dotEdgeDim: "rgba(255, 255, 255, 0.16)",
  warning: "#FBBF24",
  warningFill: "rgba(251, 191, 36, 0.85)",
} as const;

const LIQUID_GLASS_SHEEN: NonNullable<ViewStyle["backgroundImage"]> = [
  {
    type: "linear-gradient",
    direction: "to bottom",
    colorStops: [
      { color: "rgba(255, 255, 255, 0.14)", positions: ["0%"] },
      { color: "rgba(255, 255, 255, 0.02)", positions: ["38%"] },
      { color: "rgba(255, 255, 255, 0)", positions: ["76%"] },
      { color: "rgba(255, 255, 255, 0.05)", positions: ["100%"] },
    ],
  },
];

type VipLiquidGlassTone = "chrome" | "elevated" | "active" | "subtle";

/**
 * Neutral default Liquid Glass container for VIP Gallery controls, cards, and overlays.
 * - iOS 26+: native `GlassView` (untinted dark material)
 * - Android 12+: native `dimezisBlurViewSdk31Plus` live backdrop blur when `blurTarget` is supplied,
 *   paired with directional specular glass rims and linear-gradient sheen
 */
function VipLiquidGlass(props: {
  readonly children: ReactNode;
  readonly radius?: number;
  readonly tone?: VipLiquidGlassTone;
  readonly blurTarget?: RefObject<ComponentRef<typeof View> | null> | null;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const radius = props.radius ?? 999;
  const tone = props.tone ?? "chrome";
  const hasLiveBlur = Platform.OS === "android" && props.blurTarget != null;
  const supportsIosNativeGlass = Platform.OS === "ios" && isGlassEffectAPIAvailable();

  if (supportsIosNativeGlass) {
    return (
      <GlassView
        glassEffectStyle="regular"
        colorScheme="dark"
        style={[
          {
            borderRadius: radius,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: tone === "active" ? GLASS.borderActive : GLASS.border,
          },
          props.style,
        ]}
      >
        {props.children}
      </GlassView>
    );
  }

  const fill =
    tone === "active"
      ? hasLiveBlur
        ? GLASS.activeTintLive
        : GLASS.activeTint
      : tone === "elevated"
        ? hasLiveBlur
          ? GLASS.elevatedTintLive
          : GLASS.elevatedTint
        : tone === "subtle"
          ? GLASS.subtleTint
          : hasLiveBlur
            ? GLASS.chromeTintLive
            : GLASS.chromeTint;

  return (
    <View
      style={[
        {
          borderRadius: radius,
          overflow: "hidden",
          backgroundColor: hasLiveBlur ? "transparent" : fill,
          borderWidth: 1,
          borderColor: tone === "active" ? GLASS.borderActive : GLASS.border,
          borderTopColor: GLASS.borderTop,
          borderBottomColor: GLASS.borderBottom,
        },
        props.style,
      ]}
    >
      {hasLiveBlur ? (
        <BlurView
          pointerEvents="none"
          blurTarget={props.blurTarget!}
          blurMethod="dimezisBlurViewSdk31Plus"
          blurReductionFactor={6}
          intensity={46}
          tint="systemChromeMaterialDark"
          style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        />
      ) : Platform.OS === "ios" ? (
        <BlurView
          pointerEvents="none"
          intensity={56}
          tint="systemChromeMaterialDark"
          style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        />
      ) : null}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: hasLiveBlur ? fill : "transparent",
            backgroundImage: LIQUID_GLASS_SHEEN,
          },
        ]}
      />
      {props.children}
    </View>
  );
}

/**
 * Full-body neutral Liquid Glass spotlight card showcasing all synced VIP portraits
 * (defaults to the full-body standing portrait; tap to cycle through all items).
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
  const heroBlurTargetRef = useRef<ComponentRef<typeof View>>(null);

  const items = pack.riasVip;
  const active = items.length > 0 ? items[index % items.length]! : null;

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- runs subtle 165Hz slow breathing zoom on the VIP portrait
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
        borderColor: GLASS.border,
        borderTopColor: GLASS.borderTop,
        backgroundColor: GLASS.stageBg,
        boxShadow: [
          {
            offsetX: 0,
            offsetY: 10,
            blurRadius: 28,
            spreadDistance: -4,
            color: "rgba(0, 0, 0, 0.45)",
          },
        ],
      }}
    >
      <View style={{ width: "100%", aspectRatio, overflow: "hidden", backgroundColor: GLASS.stageBg }}>
        <BlurTargetView ref={heroBlurTargetRef} style={{ width: "100%", height: "100%" }}>
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
        </BlurTargetView>

        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 10,
            right: 10,
            bottom: 10,
          }}
        >
          <VipLiquidGlass
            radius={18}
            tone="chrome"
            blurTarget={heroBlurTargetRef}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 11,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                allowFontScaling={false}
                numberOfLines={1}
                style={{ color: GLASS.textPrimary, fontSize: 14, fontWeight: "700" }}
              >
                {active.title ?? "Rias Gremory"}
              </Text>
              <Text
                allowFontScaling={false}
                numberOfLines={1}
                style={{ color: GLASS.textSecondary, fontSize: 11 }}
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
                      backgroundColor: selected ? GLASS.accent : GLASS.dotInactive,
                    }}
                  />
                );
              })}
            </View>
          </VipLiquidGlass>
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
          width: 13,
          height: 13,
          borderRadius: 999,
          borderWidth: 1.5,
          borderColor: props.isError
            ? GLASS.warning
            : props.filled
              ? GLASS.accent
              : "rgba(255, 255, 255, 0.34)",
          backgroundColor: props.isError
            ? GLASS.warningFill
            : props.filled
              ? GLASS.accent
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
            ? GLASS.accent
            : props.edgeDim
              ? GLASS.dotEdgeDim
              : GLASS.dotInactive,
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
  const insets = useSafeAreaInsets();
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
        backgroundColor: GLASS.backdrop,
        paddingHorizontal: 24,
        paddingTop: Math.max(insets.top, 20) + 12,
        paddingBottom: Math.max(insets.bottom, 20) + 16,
        justifyContent: "space-between",
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
        <AndroidGlassPressable
          accessibilityLabel={props.mode === "unlock" ? gt("Close VIP Vault") : gt("Cancel PIN setup")}
          onPress={props.onClose}
          bloomRadius={999}
        >
          <VipLiquidGlass
            radius={999}
            tone="chrome"
            style={{
              width: 38,
              height: 38,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <IconX size={18} strokeWidth={2} color={GLASS.textPrimary} />
          </VipLiquidGlass>
        </AndroidGlassPressable>
      </View>

      <View style={{ alignItems: "center", gap: 22 }}>
        <View style={{ alignItems: "center", gap: 10 }}>
          <VipLiquidGlass
            radius={999}
            tone="elevated"
            style={{
              width: 58,
              height: 58,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <IconLock size={24} strokeWidth={1.9} color={GLASS.textPrimary} />
          </VipLiquidGlass>
          <Text
            allowFontScaling={false}
            style={{ color: GLASS.textPrimary, fontSize: 20, fontWeight: "700", letterSpacing: -0.3 }}
          >
            {props.mode === "unlock" ? gt("VIP Vault") : gt("Set Vault PIN")}
          </Text>
          <Text
            allowFontScaling={false}
            style={{
              color: errorText ? GLASS.warning : GLASS.textSecondary,
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
                const accessibilityLabel =
                  key === "clear"
                    ? gt("Clear PIN")
                    : key === "backspace"
                      ? gt("Delete digit")
                      : key;
                return (
                  <AndroidGlassPressable
                    key={key}
                    accessibilityLabel={accessibilityLabel}
                    onPress={() => {
                      void handleKeyPress(key);
                    }}
                    bloomRadius={999}
                    scaleTo={0.91}
                  >
                    <VipLiquidGlass
                      radius={999}
                      tone={isAction ? "subtle" : "elevated"}
                      style={{
                        width: 72,
                        height: 72,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {key === "backspace" ? (
                        <IconBackspace size={23} strokeWidth={1.85} color={GLASS.textPrimary} />
                      ) : (
                        <Text
                          allowFontScaling={false}
                          style={{
                            color: key === "clear" ? GLASS.textSecondary : GLASS.textPrimary,
                            fontSize: key === "clear" ? 13 : 26,
                            fontWeight: key === "clear" ? "600" : "600",
                          }}
                        >
                          {key === "clear" ? gt("Clear") : key}
                        </Text>
                      )}
                    </VipLiquidGlass>
                  </AndroidGlassPressable>
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
        backgroundColor: GLASS.backdropOverlay,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 28,
      }}
    >
      <VipLiquidGlass
        radius={26}
        tone="elevated"
        style={{
          width: "100%",
          maxWidth: 340,
          padding: 20,
          gap: 12,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 2 }}>
          <VipLiquidGlass
            radius={999}
            tone="subtle"
            style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center" }}
          >
            <IconLockCheck size={17} strokeWidth={1.9} color={GLASS.textPrimary} />
          </VipLiquidGlass>
          <View style={{ flex: 1, gap: 2 }}>
            <Text allowFontScaling={false} style={{ color: GLASS.textPrimary, fontSize: 16, fontWeight: "700" }}>
              {gt("Vault PIN Protection")}
            </Text>
            <Text
              allowFontScaling={false}
              style={{ color: GLASS.textSecondary, fontSize: 12 }}
            >
              {gt("Required whenever VIP Vault opens.")}
            </Text>
          </View>
        </View>

        <AndroidGlassPressable
          accessibilityLabel={gt("Change 4-digit PIN")}
          onPress={props.onChangePin}
          bloomRadius={16}
          scaleTo={0.96}
        >
          <VipLiquidGlass
            radius={16}
            tone="active"
            style={{
              paddingVertical: 12,
              paddingHorizontal: 14,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <IconLock size={16} strokeWidth={2} color={GLASS.textPrimary} />
            <Text allowFontScaling={false} style={{ color: GLASS.textPrimary, fontSize: 14, fontWeight: "600" }}>
              {gt("Change 4-Digit PIN")}
            </Text>
          </VipLiquidGlass>
        </AndroidGlassPressable>

        <AndroidGlassPressable
          accessibilityLabel={gt("Remove PIN")}
          onPress={props.onRemovePin}
          bloomRadius={16}
          scaleTo={0.96}
        >
          <VipLiquidGlass
            radius={16}
            tone="chrome"
            style={{
              paddingVertical: 12,
              paddingHorizontal: 14,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <IconLockOpen size={16} strokeWidth={2} color={GLASS.textSecondary} />
            <Text allowFontScaling={false} style={{ color: GLASS.textPrimary, fontSize: 14, fontWeight: "600" }}>
              {gt("Remove PIN")}
            </Text>
          </VipLiquidGlass>
        </AndroidGlassPressable>

        <AndroidGlassPressable
          accessibilityLabel={gt("Cancel")}
          onPress={props.onDismiss}
          bloomRadius={16}
          scaleTo={0.96}
        >
          <VipLiquidGlass
            radius={16}
            tone="subtle"
            style={{
              paddingVertical: 11,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              allowFontScaling={false}
              style={{ color: GLASS.textSecondary, fontSize: 13.5, fontWeight: "600" }}
            >
              {gt("Cancel")}
            </Text>
          </VipLiquidGlass>
        </AndroidGlassPressable>
      </VipLiquidGlass>
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
  readonly onScrubbingChange?: (scrubbing: boolean) => void;
}) {
  const gt = useGT();
  const [userPaused, setUserPaused] = useState(false);
  const [hudHidden, setHudHidden] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const [prevActive, setPrevActive] = useState(props.isActive);
  if (props.isActive !== prevActive) {
    setPrevActive(props.isActive);
    if (!props.isActive) {
      if (userPaused) setUserPaused(false);
      if (scrubTime !== null) setScrubTime(null);
      if (hudHidden) setHudHidden(false);
    }
  }

  const videoBlurTargetRef = useRef<ComponentRef<typeof View>>(null);
  const isScrubbingRef = useRef(false);
  const trackWidthRef = useRef(0);
  const durationRef = useRef(0);
  const currentTimeRef = useRef(0);
  const initialMutedRef = useRef(props.muted);

  const player = useVideoPlayer(props.item.uri, (instance) => {
    instance.loop = true;
    instance.muted = initialMutedRef.current;
    instance.timeUpdateEventInterval = 0.25;
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- releases scroll lock when video slide unmounts
  useEffect(() => {
    return () => {
      props.onScrubbingChange?.(false);
    };
  }, [props.onScrubbingChange]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- keeps native video player mute flag aligned with the audio pill
  useEffect(() => {
    try {
      player.muted = props.muted;
    } catch {
      // Ignore native player state errors during teardown.
    }
  }, [player, props.muted]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- tracks live video timestamp and duration from expo-video player events
  useEffect(() => {
    const syncDuration = (nextDuration: number) => {
      if (Number.isFinite(nextDuration) && nextDuration > 0 && nextDuration !== durationRef.current) {
        durationRef.current = nextDuration;
        setDuration(nextDuration);
      }
    };
    const pollPlayerClock = () => {
      if (isScrubbingRef.current) return;
      try {
        syncDuration(player.duration);
        if (Number.isFinite(player.currentTime) && player.currentTime >= 0) {
          currentTimeRef.current = player.currentTime;
          setCurrentTime(player.currentTime);
        }
      } catch {
        // Ignore transient native player reads before source loads.
      }
    };
    pollPlayerClock();

    const timeSub = player.addListener("timeUpdate", ({ currentTime: nextTime }) => {
      if (isScrubbingRef.current) return;
      if (Number.isFinite(nextTime) && nextTime >= 0) {
        currentTimeRef.current = nextTime;
        setCurrentTime(nextTime);
      }
      try {
        syncDuration(player.duration);
      } catch {
        // Ignore transient duration read errors.
      }
    });
    const loadSub = player.addListener("sourceLoad", ({ duration: loadedDuration }) => {
      syncDuration(loadedDuration);
    });
    const fallbackTimer = setInterval(pollPlayerClock, 500);
    return () => {
      clearInterval(fallbackTimer);
      timeSub.remove();
      loadSub.remove();
    };
  }, [player]);

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

  const seekToTime = useCallback(
    (targetSeconds: number) => {
      const clamped = clampVideoTime(targetSeconds, durationRef.current);
      currentTimeRef.current = clamped;
      setCurrentTime(clamped);
      try {
        player.currentTime = clamped;
      } catch {
        // Ignore seek errors during teardown.
      }
    },
    [player],
  );

  const handleSkipBy = useCallback(
    (deltaSeconds: number) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const base = scrubTime ?? currentTimeRef.current;
      seekToTime(base + deltaSeconds);
    },
    [scrubTime, seekToTime],
  );

  const handleTogglePlayPause = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setUserPaused((paused) => !paused);
  }, []);

  const beginScrub = useEffectEvent((touchX: number) => {
    isScrubbingRef.current = true;
    props.onScrubbingChange?.(true);
    const nextSec = computeSeekTimeFromTouch(touchX, trackWidthRef.current, durationRef.current);
    setScrubTime(nextSec);
    void Haptics.selectionAsync();
  });

  const moveScrub = useEffectEvent((touchX: number) => {
    const nextSec = computeSeekTimeFromTouch(touchX, trackWidthRef.current, durationRef.current);
    setScrubTime(nextSec);
  });

  const finishScrub = useEffectEvent((touchX: number) => {
    const nextSec = computeSeekTimeFromTouch(touchX, trackWidthRef.current, durationRef.current);
    isScrubbingRef.current = false;
    props.onScrubbingChange?.(false);
    setScrubTime(null);
    seekToTime(nextSec);
  });

  const scrubGesture = useMemo(
    () =>
      // oxlint-disable-next-line react/capitalized-calls -- Gesture.Pan is a gesture factory, not a React component.
      Gesture.Pan()
        .minDistance(0)
        .hitSlop({ top: 10, bottom: 10, left: 6, right: 6 })
        .onBegin((event) => {
          runOnJS(beginScrub)(event.x);
        })
        .onUpdate((event) => {
          runOnJS(moveScrub)(event.x);
        })
        .onFinalize((event) => {
          runOnJS(finishScrub)(event.x);
        }),
    [],
  );

  const isWideOrSquare = isWideOrSquareMedia(props.item.width, props.item.height);
  const displayedTime = scrubTime ?? currentTime;
  const progress = computeVideoProgress(displayedTime, duration);
  const showHud = !hudHidden || userPaused || scrubTime !== null;

  return (
    <View style={{ flex: 1, backgroundColor: GLASS.stageBg }}>
      <BlurTargetView ref={videoBlurTargetRef} style={{ flex: 1 }}>
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
        </Pressable>
      </BlurTargetView>

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
          <VipLiquidGlass
            radius={999}
            tone="elevated"
            blurTarget={videoBlurTargetRef}
            style={{
              width: 64,
              height: 64,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View style={{ marginLeft: 3 }}>
              <IconPlayerPlayFilled size={26} color={GLASS.textPrimary} />
            </View>
          </VipLiquidGlass>
        </View>
      ) : null}

      {/* Top-left HUD visibility toggle + top-right audio toggle (native Liquid Glass icon pills) */}
      <View
        style={{
          position: "absolute",
          top: 14,
          left: 14,
          zIndex: 24,
          elevation: 24,
        }}
      >
        <AndroidGlassPressable
          accessibilityLabel={showHud ? gt("Hide video controls") : gt("Show video controls")}
          onPress={() => {
            void Haptics.selectionAsync();
            setHudHidden((hidden) => !hidden);
          }}
          bloomRadius={999}
        >
          <VipLiquidGlass
            radius={999}
            tone="chrome"
            blurTarget={videoBlurTargetRef}
            style={{
              width: 38,
              height: 38,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {showHud ? (
              <IconEyeOff size={18} strokeWidth={1.9} color={GLASS.textPrimary} />
            ) : (
              <IconEye size={18} strokeWidth={1.9} color={GLASS.textPrimary} />
            )}
          </VipLiquidGlass>
        </AndroidGlassPressable>
      </View>

      <View
        style={{
          position: "absolute",
          top: 14,
          right: 14,
          zIndex: 24,
          elevation: 24,
        }}
      >
        <AndroidGlassPressable
          accessibilityLabel={props.muted ? gt("Unmute video audio") : gt("Mute video audio")}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            props.onToggleMuted();
          }}
          bloomRadius={999}
        >
          <VipLiquidGlass
            radius={999}
            tone={props.muted ? "chrome" : "active"}
            blurTarget={videoBlurTargetRef}
            style={{
              width: 38,
              height: 38,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {props.muted ? (
              <IconVolumeOff size={18} strokeWidth={1.9} color={GLASS.textSecondary} />
            ) : (
              <IconVolume size={18} strokeWidth={1.9} color={GLASS.textPrimary} />
            )}
          </VipLiquidGlass>
        </AndroidGlassPressable>
      </View>

      {showHud ? (
        <View
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            bottom: 12,
            zIndex: 24,
            elevation: 24,
          }}
        >
          <VipLiquidGlass
            radius={22}
            tone="elevated"
            blurTarget={videoBlurTargetRef}
            style={{
              paddingHorizontal: 16,
              paddingTop: 10,
              paddingBottom: 12,
              gap: 6,
            }}
          >
            <GestureDetector gesture={scrubGesture}>
              <View
                onLayout={(event) => {
                  const nextW = event.nativeEvent.layout.width;
                  if (nextW > 0) {
                    trackWidthRef.current = nextW;
                    setTrackWidth(nextW);
                  }
                }}
                style={{
                  height: 30,
                  justifyContent: "center",
                }}
              >
                <View
                  style={{
                    height: 4.5,
                    borderRadius: 999,
                    backgroundColor: GLASS.trackBg,
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      width: `${Math.round(progress * 1000) / 10}%`,
                      height: "100%",
                      borderRadius: 999,
                      backgroundColor: GLASS.accent,
                    }}
                  />
                </View>
                {trackWidth > 0 ? (
                  <View
                    pointerEvents="none"
                    style={{
                      position: "absolute",
                      left: Math.max(0, Math.min(trackWidth - 13, progress * trackWidth - 6.5)),
                      width: 13,
                      height: 13,
                      borderRadius: 999,
                      backgroundColor: GLASS.accent,
                      boxShadow: [
                        {
                          offsetX: 0,
                          offsetY: 1,
                          blurRadius: 4,
                          spreadDistance: 0,
                          color: "rgba(0, 0, 0, 0.45)",
                        },
                      ],
                    }}
                  />
                ) : null}
              </View>
            </GestureDetector>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: -4,
              }}
            >
              <Text
                allowFontScaling={false}
                style={{
                  color: GLASS.textPrimary,
                  fontSize: 11,
                  fontWeight: "600",
                  fontVariant: ["tabular-nums"],
                }}
              >
                {formatVideoTimestamp(displayedTime)}
              </Text>
              <Text
                allowFontScaling={false}
                style={{
                  color: GLASS.textSecondary,
                  fontSize: 11,
                  fontWeight: "600",
                  fontVariant: ["tabular-nums"],
                }}
              >
                {formatVideoTimestamp(duration)}
              </Text>
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 20,
                paddingTop: 2,
              }}
            >
              <AndroidGlassPressable
                accessibilityLabel={gt("Rewind 10 seconds")}
                onPress={() => handleSkipBy(-VIP_VIDEO_SKIP_SECONDS)}
                bloomRadius={999}
              >
                <VipLiquidGlass
                  radius={999}
                  tone="subtle"
                  style={{
                    width: 42,
                    height: 42,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <IconRewindBackward10 size={20} strokeWidth={1.9} color={GLASS.textPrimary} />
                </VipLiquidGlass>
              </AndroidGlassPressable>

              <AndroidGlassPressable
                accessibilityLabel={userPaused ? gt("Play video") : gt("Pause video")}
                onPress={handleTogglePlayPause}
                bloomRadius={999}
              >
                <VipLiquidGlass
                  radius={999}
                  tone="active"
                  style={{
                    width: 48,
                    height: 48,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {userPaused ? (
                    <View style={{ marginLeft: 2 }}>
                      <IconPlayerPlayFilled size={21} color={GLASS.textPrimary} />
                    </View>
                  ) : (
                    <IconPlayerPauseFilled size={21} color={GLASS.textPrimary} />
                  )}
                </VipLiquidGlass>
              </AndroidGlassPressable>

              <AndroidGlassPressable
                accessibilityLabel={gt("Forward 10 seconds")}
                onPress={() => handleSkipBy(VIP_VIDEO_SKIP_SECONDS)}
                bloomRadius={999}
              >
                <VipLiquidGlass
                  radius={999}
                  tone="subtle"
                  style={{
                    width: 42,
                    height: 42,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <IconRewindForward10 size={20} strokeWidth={1.9} color={GLASS.textPrimary} />
                </VipLiquidGlass>
              </AndroidGlassPressable>
            </View>
          </VipLiquidGlass>
        </View>
      ) : null}
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
        style={{ flex: 1, overflow: "hidden", backgroundColor: GLASS.stageBg }}
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
 * Full-screen Liquid Glass Hidden VIP Vault modal viewer (triggered exclusively by long-pressing
 * the top-left Rias Code header icon). Uses pure default neutral Liquid Glass surfaces and the
 * app's standard Tabler vector icons, with optional 4-digit SecureStore PIN lock, horizontal swipe
 * paging, looping video+audio playback, and pinch/pan/double-tap zoom.
 */
export const RiasVipGalleryModal = memo(function RiasVipGalleryModal(props: {
  readonly visible: boolean;
  readonly onClose: () => void;
}) {
  const gt = useGT();
  const insets = useSafeAreaInsets();
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
  const [isActiveVideoScrubbing, setIsActiveVideoScrubbing] = useState(false);

  if (props.visible !== prevVisible) {
    setPrevVisible(props.visible);
    if (props.visible) {
      setOpenGeneration((gen) => gen + 1);
      setPinOverlay("none");
      setIsActiveSlideZoomed(false);
      setIsActiveVideoScrubbing(false);
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
        setIsActiveVideoScrubbing(false);
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
        <View style={{ width: stageWidth, height: "100%", paddingHorizontal: 14 }}>
          <View
            style={{
              flex: 1,
              borderRadius: 28,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: GLASS.stageBorder,
              backgroundColor: GLASS.stageBg,
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
                onScrubbingChange={(scrubbing) => {
                  if (isSlideActive) setIsActiveVideoScrubbing(scrubbing);
                }}
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
      navigationBarTranslucent
      onRequestClose={props.onClose}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        {isPinLoading ? (
          <View style={{ flex: 1, backgroundColor: GLASS.backdrop }} />
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
              backgroundColor: GLASS.backdrop,
              paddingTop: Math.max(insets.top, 20) + 10,
              paddingBottom: Math.max(insets.bottom, 14) + 12,
            }}
          >
            {/* Top header bar: Liquid Glass PIN pill (left) + circular Close icon (right) */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 18,
                paddingBottom: 12,
                zIndex: 20,
              }}
            >
              <AndroidGlassPressable
                accessibilityLabel={storedPin ? gt("Manage VIP Vault PIN") : gt("Set VIP Vault PIN")}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setPinOverlay(storedPin ? "manage" : "set");
                }}
                bloomRadius={999}
              >
                <VipLiquidGlass
                  radius={999}
                  tone={storedPin ? "active" : "chrome"}
                  style={{
                    height: 38,
                    paddingHorizontal: 14,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {storedPin ? (
                    <IconLockCheck size={15} strokeWidth={2} color={GLASS.textPrimary} />
                  ) : (
                    <IconLock size={15} strokeWidth={2} color={GLASS.textSecondary} />
                  )}
                  <Text
                    allowFontScaling={false}
                    style={{ color: GLASS.textPrimary, fontSize: 12.5, fontWeight: "600" }}
                  >
                    {storedPin ? gt("PIN On") : gt("Set PIN")}
                  </Text>
                </VipLiquidGlass>
              </AndroidGlassPressable>

              <AndroidGlassPressable
                accessibilityLabel={gt("Close VIP gallery")}
                onPress={props.onClose}
                bloomRadius={999}
              >
                <VipLiquidGlass
                  radius={999}
                  tone="chrome"
                  style={{
                    width: 38,
                    height: 38,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <IconX size={18} strokeWidth={2} color={GLASS.textPrimary} />
                </VipLiquidGlass>
              </AndroidGlassPressable>
            </View>

            {/* Horizontal swipe paging media stage */}
            <View style={{ flex: 1 }} onLayout={handleStageLayout}>
              {stageWidth > 0 ? (
                <FlatList
                  data={items}
                  horizontal
                  pagingEnabled
                  bounces={false}
                  scrollEnabled={!isActiveSlideZoomed && !isActiveVideoScrubbing}
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

            {/* Footer bar: Liquid Glass capsule with title, count, and clean neutral pagination dots */}
            <View style={{ paddingHorizontal: 14, marginTop: 12 }}>
              <VipLiquidGlass
                radius={22}
                tone="chrome"
                style={{
                  paddingHorizontal: 18,
                  paddingVertical: 13,
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
                    style={{ color: GLASS.textPrimary, fontSize: 14.5, fontWeight: "700" }}
                  >
                    {activeItem.title ?? "Rias Gremory"}
                  </Text>
                  <Text
                    allowFontScaling={false}
                    numberOfLines={1}
                    style={{ color: GLASS.textSecondary, fontSize: 11.5 }}
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
              </VipLiquidGlass>
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
