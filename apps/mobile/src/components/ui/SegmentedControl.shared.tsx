import { useState } from "react";
import { I18nManager, Platform, Pressable, View } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { segmentedControlColors } from "./segmentedControlColors";
import { AppText } from "./AppText";
import { useControlTheme } from "./useControlTheme";
import type { SegmentedControlProps } from "./SegmentedControl.types";

export type { SegmentedControlProps } from "./SegmentedControl.types";

export function SegmentedControl<Value extends string | number>(
  props: SegmentedControlProps<Value>,
) {
  const { colorScheme, colors, themeId } = useControlTheme();
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const { width } = layout;
  const reduceMotion = useReducedMotion();
  const selectedIndex = props.options.findIndex((option) => option.value === props.selected);
  const segmentWidth = props.options.length ? Math.max(0, width - 6) / props.options.length : 0;
  const direction = I18nManager.isRTL ? -1 : 1;
  // The index animates, not the offset, so a resize moves the selection without sliding it.
  const selectedPosition = useDerivedValue(() =>
    reduceMotion
      ? selectedIndex
      : Platform.OS === "android"
        ? withSpring(selectedIndex, {
            damping: 24,
            stiffness: 380,
            mass: 0.72,
            reduceMotion: ReduceMotion.System,
          })
        : withTiming(selectedIndex, { duration: 160 }),
  );
  const selectionStyle = useAnimatedStyle(() => ({
    width: segmentWidth,
    transform: [{ translateX: selectedPosition.value * segmentWidth * direction }],
  }));
  const { trackColor, selectedColor, selectedTextColor, mutedColor } = segmentedControlColors(
    colors,
    colorScheme,
    props.variant,
    Platform.OS,
    themeId,
  );
  const isAndroidGlass = Platform.OS === "android";
  const isDark = colorScheme === "dark";
  const isCrimson = themeId === "rias-crimson";
  const isViolet = themeId === "akeno-violet";
  const minHeight = props.size === "compact" ? 32 : isAndroidGlass ? 40 : 36;

  return (
    <View collapsable={false} className={props.className}>
      <View
        onLayout={(event) => setLayout(event.nativeEvent.layout)}
        className="flex-row rounded-full p-[3px]"
        style={{
          minHeight,
          backgroundColor: isAndroidGlass
            ? isDark
              ? isCrimson
                ? "rgba(32, 16, 22, 0.82)"
                : isViolet
                  ? "rgba(26, 18, 36, 0.82)"
                  : "rgba(24, 24, 30, 0.78)"
              : isCrimson
                ? "rgba(252, 238, 243, 0.90)"
                : isViolet
                  ? "rgba(245, 238, 253, 0.90)"
                  : "rgba(244, 244, 248, 0.88)"
            : trackColor,
          ...(isAndroidGlass
            ? {
                borderWidth: 1,
                borderColor: isCrimson
                  ? isDark
                    ? "rgba(244, 63, 94, 0.24)"
                    : "rgba(190, 18, 60, 0.16)"
                  : isViolet
                    ? isDark
                      ? "rgba(168, 85, 247, 0.25)"
                      : "rgba(124, 58, 237, 0.16)"
                    : isDark
                      ? "rgba(255, 255, 255, 0.11)"
                      : "rgba(0, 0, 0, 0.08)",
                borderTopColor: isCrimson
                  ? isDark
                    ? "rgba(255, 136, 162, 0.36)"
                    : "rgba(255, 255, 255, 0.92)"
                  : isViolet
                    ? isDark
                      ? "rgba(208, 166, 255, 0.36)"
                      : "rgba(255, 255, 255, 0.92)"
                    : isDark
                      ? "rgba(255, 255, 255, 0.18)"
                      : "rgba(255, 255, 255, 0.90)",
              }
            : null),
        }}
      >
        {selectedIndex >= 0 && width > 0 ? (
          <Animated.View
            pointerEvents="none"
            className="absolute bottom-[3px] start-[3px] top-[3px] rounded-full"
            style={[
              {
                backgroundColor: isAndroidGlass
                  ? isDark
                    ? isCrimson
                      ? "rgba(225, 29, 72, 0.28)"
                      : isViolet
                        ? "rgba(147, 51, 234, 0.30)"
                        : "rgba(255, 255, 255, 0.14)"
                    : "rgba(255, 255, 255, 0.96)"
                  : selectedColor,
                ...(isAndroidGlass
                  ? {
                      borderWidth: 1,
                      borderColor: isCrimson
                        ? isDark
                          ? "rgba(244, 63, 94, 0.36)"
                          : "rgba(190, 18, 60, 0.16)"
                        : isViolet
                          ? isDark
                            ? "rgba(168, 85, 247, 0.38)"
                            : "rgba(124, 58, 237, 0.16)"
                          : isDark
                            ? "rgba(255, 255, 255, 0.16)"
                            : "rgba(0, 0, 0, 0.06)",
                      borderTopColor: isCrimson
                        ? isDark
                          ? "rgba(255, 150, 174, 0.48)"
                          : "rgba(255, 255, 255, 1)"
                        : isViolet
                          ? isDark
                            ? "rgba(216, 180, 254, 0.50)"
                            : "rgba(255, 255, 255, 1)"
                          : isDark
                            ? "rgba(255, 255, 255, 0.28)"
                            : "rgba(255, 255, 255, 1)",
                    }
                  : null),
              },
              selectionStyle,
            ]}
          />
        ) : null}
        {props.options.map((option) => {
          const selected = option.value === props.selected;
          return (
            <Pressable
              key={`${typeof option.value}:${option.value}`}
              accessibilityRole={props.role ?? "button"}
              accessibilityLabel={option.accessibilityLabel ?? option.label}
              accessibilityState={{ selected }}
              onPress={() => props.onSelect(option.value)}
              className="flex-1 items-center justify-center rounded-full px-2 py-1 active:opacity-70"
              style={{ minHeight: minHeight - 6 }}
            >
              <AppText
                textRole="footnote"
                className={selected ? "font-t3-bold" : "font-t3-medium"}
                style={{
                  color: selected ? selectedTextColor : mutedColor,
                }}
              >
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
