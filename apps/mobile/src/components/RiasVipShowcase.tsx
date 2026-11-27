import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useGT } from "gt-react-native";
import { memo, useEffect, useState } from "react";
import { Modal, Pressable, View } from "react-native";
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

import { useAkenoPosePack } from "../lib/akenoPosePack";
import { useAppActive, useReduceMotionEnabled } from "../lib/appState";
import { playUiSound } from "../lib/uiSoundFx";
import { AppText as Text } from "./ui/AppText";

const CARD_SPRING = {
  damping: 13,
  stiffness: 300,
  mass: 0.7,
  reduceMotion: ReduceMotion.System,
};

/**
 * Full-body crimson OLED glass spotlight card showcasing all synced VIP Rias portraits
 * (defaults to the full-body standing Grand Hall portrait; tap to cycle through all 4).
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

/**
 * Full-screen OLED modal viewer for the 4 VIP Rias portraits (triggered by long-pressing
 * the Home Rias icon or tapping the VIP pill on the New Thread mascot).
 */
export const RiasVipGalleryModal = memo(function RiasVipGalleryModal(props: {
  readonly visible: boolean;
  readonly onClose: () => void;
}) {
  const gt = useGT();
  const pack = useAkenoPosePack({ autoSync: false });
  const [index, setIndex] = useState(0);

  const items = pack.riasVip;
  const active = items.length > 0 ? items[index % items.length]! : null;

  if (!props.visible || !active) return null;

  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={props.onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(5, 2, 5, 0.94)",
          justifyContent: "center",
          paddingHorizontal: 18,
          paddingVertical: 44,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={gt("Close VIP Rias gallery")}
          onPress={props.onClose}
          style={{
            position: "absolute",
            top: 48,
            right: 20,
            zIndex: 20,
            paddingHorizontal: 14,
            paddingVertical: 7,
            borderRadius: 999,
            backgroundColor: "rgba(24, 12, 18, 0.88)",
            borderWidth: 1,
            borderColor: "rgba(251, 113, 133, 0.4)",
          }}
        >
          <Text allowFontScaling={false} style={{ color: "#FFE4E6", fontSize: 12, fontWeight: "700" }}>
            {gt("Close")}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={gt("Next VIP Rias portrait")}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            playUiSound("shuffle");
            setIndex((prev) => (prev + 1) % items.length);
          }}
          style={{
            flex: 1,
            maxHeight: 680,
            borderRadius: 28,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: "rgba(225, 29, 72, 0.42)",
            backgroundColor: "#0A0408",
          }}
        >
          <Image
            source={active.source}
            contentFit="cover"
            contentPosition="top"
            transition={220}
            accessibilityIgnoresInvertColors
            style={{ width: "100%", height: "100%" }}
          />
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              paddingHorizontal: 18,
              paddingVertical: 16,
              backgroundColor: "rgba(8, 3, 7, 0.78)",
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
                style={{ color: "#FFF1F2", fontSize: 15, fontWeight: "700" }}
              >
                {active.title ?? "Rias Gremory"}
              </Text>
              <Text
                allowFontScaling={false}
                style={{ color: "rgba(254, 205, 211, 0.78)", fontSize: 11.5 }}
              >
                {gt("Tap photo for next VIP portrait ({current}/{total})", {
                  current: (index % items.length) + 1,
                  total: items.length,
                })}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {items.map((item, i) => {
                const selected = i === index % items.length;
                return (
                  <View
                    key={item.id}
                    style={{
                      width: selected ? 18 : 6,
                      height: 6,
                      borderRadius: 999,
                      backgroundColor: selected ? "#FB7185" : "rgba(255, 255, 255, 0.3)",
                    }}
                  />
                );
              })}
            </View>
          </View>
        </Pressable>
      </View>
    </Modal>
  );
});
