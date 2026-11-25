import { GlassView } from "expo-glass-effect";
import { Platform, Pressable, View } from "react-native";
import { withUniwind } from "uniwind";

import { useAppearancePreferences } from "../../features/settings/appearance/AppearancePreferencesProvider";
import { cn } from "../../lib/cn";
import { NATIVE_LIQUID_GLASS_SUPPORTED } from "../../native/native-glass";
import { AppText } from "./AppText";
import { SymbolView, type AppSymbolName } from "./AppSymbol";

const ChipGlass = withUniwind(GlassView, {
  style: { fromClassName: "className" },
  tintColor: { fromClassName: "tintColorClassName", styleProperty: "accentColor" },
});

export function Chip(props: {
  readonly label: string;
  readonly selected?: boolean;
  readonly icon?: AppSymbolName;
  readonly trailingIcon?: AppSymbolName;
  readonly size?: "small" | "default";
  readonly glass?: boolean;
  readonly colorScheme?: "light" | "dark";
  readonly onPress?: () => void;
  readonly accessibilityLabel?: string;
  readonly disabled?: boolean;
}) {
  const { themeAppearance, themeId } = useAppearancePreferences();
  const isDark = (props.colorScheme ?? themeAppearance) === "dark";
  const isCrimson = themeId === "rias-crimson";
  const isAndroidGlass = Platform.OS === "android";
  const small = props.size === "small";
  const layout = cn(
    "flex-row items-center gap-1.5 rounded-full px-3",
    small ? "py-1" : "min-h-8 py-1.5",
  );
  const iconColor = props.selected ? "accent-primary-foreground" : "accent-icon-muted";
  const content = (
    <>
      {props.icon ? (
        <SymbolView name={props.icon} size={15} tintColorClassName={iconColor} />
      ) : null}
      <AppText
        textRole={small ? "caption" : "footnote"}
        numberOfLines={small ? undefined : 1}
        className={cn(
          "shrink",
          !small && "max-w-[180px]",
          !small && "font-t3-medium",
          props.selected ? "text-primary-foreground" : "text-foreground-muted",
        )}
      >
        {props.label}
      </AppText>
      {props.trailingIcon ? (
        <SymbolView name={props.trailingIcon} size={11} tintColorClassName={iconColor} />
      ) : null}
    </>
  );
  const body =
    props.glass && NATIVE_LIQUID_GLASS_SUPPORTED ? (
      <ChipGlass
        isInteractive
        colorScheme={props.colorScheme}
        tintColorClassName={props.selected ? "accent-primary" : undefined}
        className={layout}
      >
        {content}
      </ChipGlass>
    ) : (
      <View
        className={cn(
          layout,
          props.selected
            ? "bg-primary"
            : isAndroidGlass
              ? undefined
              : small
                ? "bg-grouped-card"
                : "bg-subtle",
        )}
        style={
          isAndroidGlass
            ? props.selected
              ? {
                  borderWidth: 1,
                  borderColor: isCrimson
                    ? "rgba(255, 120, 148, 0.36)"
                    : isDark
                      ? "rgba(255, 255, 255, 0.20)"
                      : "rgba(0, 0, 0, 0.08)",
                  borderTopColor: isCrimson
                    ? "rgba(255, 175, 195, 0.55)"
                    : isDark
                      ? "rgba(255, 255, 255, 0.34)"
                      : "rgba(255, 255, 255, 0.7)",
                }
              : {
                  backgroundColor: isCrimson
                    ? isDark
                      ? "rgba(34, 17, 24, 0.86)"
                      : "rgba(254, 243, 247, 0.92)"
                    : isDark
                      ? "rgba(26, 26, 32, 0.84)"
                      : "rgba(248, 248, 252, 0.90)",
                  borderWidth: 1,
                  borderColor: isCrimson
                    ? isDark
                      ? "rgba(244, 63, 94, 0.22)"
                      : "rgba(190, 18, 60, 0.15)"
                    : isDark
                      ? "rgba(255, 255, 255, 0.13)"
                      : "rgba(0, 0, 0, 0.09)",
                  borderTopColor: isCrimson
                    ? isDark
                      ? "rgba(255, 136, 162, 0.36)"
                      : "rgba(255, 255, 255, 0.95)"
                    : isDark
                      ? "rgba(255, 255, 255, 0.24)"
                      : "rgba(255, 255, 255, 0.95)",
                  borderBottomColor: isCrimson
                    ? isDark
                      ? "rgba(225, 29, 72, 0.12)"
                      : "rgba(190, 18, 60, 0.16)"
                    : isDark
                      ? "rgba(255, 255, 255, 0.06)"
                      : "rgba(0, 0, 0, 0.11)",
                }
            : undefined
        }
      >
        {content}
      </View>
    );
  return props.onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      accessibilityState={{ selected: props.selected, disabled: Boolean(props.disabled) }}
      disabled={props.disabled}
      onPress={props.onPress}
      hitSlop={6}
      className={props.disabled ? "opacity-45" : "active:opacity-70"}
    >
      {body}
    </Pressable>
  ) : (
    body
  );
}
