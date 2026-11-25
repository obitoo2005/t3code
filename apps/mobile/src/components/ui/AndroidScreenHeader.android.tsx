import { useGT } from "gt-react-native";
import { use, useState, type ReactNode } from "react";
import { View } from "react-native";

import { useAppearancePreferences } from "../../features/settings/appearance/AppearancePreferencesProvider";
import { useScaledTextRole } from "../../features/settings/appearance/useScaledTextRole";
import { AndroidOverlayHeaderContext } from "./AndroidBlurTargetContext";
import {
  AndroidGlassHeaderScrim,
  AndroidGlassPressable,
  AndroidGlassSurface,
} from "./AndroidGlassSurface.android";
import { AndroidAnchoredMenu } from "./AndroidAnchoredMenu.android";
import { AppActivityIndicator } from "./AppActivityIndicator";
import { SymbolView, type AppSymbolName } from "./AppSymbol";
import { AppText } from "./AppText";
import { RoutedFormSheetContext } from "./RoutedFormSheetContext";
import { splitAndroidHeaderActions } from "./headerMenu.android";
import { useAndroidControlSizing } from "./useAndroidControlSizing";
import { useControlTheme } from "./useControlTheme";
import { useToolbarLayout } from "./useToolbarLayout";

export interface AndroidHeaderAction {
  readonly accessibilityLabel: string;
  readonly icon: AppSymbolName;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly selected?: boolean;
  readonly subtitle?: string;
  readonly destructive?: boolean;
  readonly iconScale?: number;
  readonly overflowOnly?: boolean;
}

const GLASS_PILL_HEIGHT = 42;
const GLASS_ICON_SLOT = 40;

export function AndroidHeaderIconButton(props: {
  readonly accessibilityLabel: string;
  readonly icon: AppSymbolName;
  readonly onPress?: () => void;
  readonly disabled?: boolean;
  readonly selected?: boolean;
  readonly iconScale?: number;
  readonly badgeCount?: number;
  readonly badgeTone?: "default" | "warning" | "accent";
  /** Render inside its own standalone circular glass pill (e.g., outside a grouped capsule). */
  readonly standalone?: boolean;
}) {
  const { themeAppearance, themeId } = useAppearancePreferences();
  const isDark = themeAppearance === "dark";
  const isCrimson = themeId === "rias-crimson";
  const isViolet = themeId === "akeno-violet";
  const { scale } = useAndroidControlSizing();
  const pillHeight = Math.round(GLASS_PILL_HEIGHT * Math.min(scale, 1.15));
  const slotWidth = Math.round(GLASS_ICON_SLOT * Math.min(scale, 1.15));
  const glyphSize = Math.round(20 * Math.min(scale, 1.15) * (props.iconScale ?? 1));
  const iconName =
    props.icon === "ellipsis" ? ({ ios: "ellipsis", android: "more_vert" } as const) : props.icon;
  const badgeBg =
    props.badgeTone === "warning"
      ? "#F59E0B"
      : props.badgeTone === "accent"
        ? "#6366F1"
        : isCrimson
          ? "#E11D48"
          : isViolet
            ? "#9333EA"
            : isDark
              ? "rgba(255, 255, 255, 0.90)"
              : "#18181B";
  const badgeFg =
    props.badgeTone === "warning"
      ? "#18181B"
      : props.badgeTone === "accent" || isCrimson || isViolet
        ? "#FFFFFF"
        : isDark
          ? "#0A0A0A"
          : "#FFFFFF";

  const glyph = (
    <View
      style={{
        width: props.standalone ? pillHeight : slotWidth,
        height: pillHeight,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {props.selected ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            width: pillHeight - 8,
            height: pillHeight - 8,
            borderRadius: 999,
            backgroundColor: isDark ? "rgba(255, 255, 255, 0.16)" : "rgba(0, 0, 0, 0.08)",
          }}
        />
      ) : null}
      <SymbolView
        name={iconName}
        size={glyphSize}
        tintColorClassName={
          props.disabled
            ? "accent-icon-subtle"
            : props.selected
              ? "accent-primary"
              : "accent-foreground"
        }
        type="monochrome"
      />
      {props.badgeCount !== undefined && props.badgeCount > 0 ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 5,
            right: 3,
            minWidth: 15,
            height: 15,
            paddingHorizontal: 3.5,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: badgeBg,
            borderWidth: 1,
            borderColor: isDark ? "rgba(10, 10, 10, 0.72)" : "rgba(255, 255, 255, 0.92)",
          }}
        >
          <AppText
            allowFontScaling={false}
            style={{
              fontSize: 9,
              lineHeight: 10,
              fontWeight: "800",
              color: badgeFg,
              fontVariant: ["tabular-nums"],
              includeFontPadding: false,
            }}
          >
            {props.badgeCount > 9 ? "9+" : String(props.badgeCount)}
          </AppText>
        </View>
      ) : null}
    </View>
  );

  const pressable = (
    <AndroidGlassPressable
      accessibilityLabel={props.accessibilityLabel}
      accessibilitySelected={props.selected}
      disabled={props.disabled}
      onPress={props.onPress}
      scaleTo={0.9}
      style={{ opacity: props.disabled ? 0.45 : 1 }}
    >
      {glyph}
    </AndroidGlassPressable>
  );

  if (props.standalone) {
    return (
      <AndroidGlassSurface
        radius={999}
        style={{
          width: pillHeight,
          height: pillHeight,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {pressable}
      </AndroidGlassSurface>
    );
  }

  return pressable;
}

export function AndroidScreenHeader(props: {
  readonly title: string;
  readonly titleContent?: ReactNode;
  readonly subtitle?: string | null;
  readonly actions?: ReadonlyArray<AndroidHeaderAction>;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  /** Rendered outside the right glass action capsule (e.g., text confirm buttons like Save/Done). */
  readonly trailingAccessory?: ReactNode;
  readonly onBack?: () => void;
  readonly embedded?: boolean;
  readonly hideBottomBorder?: boolean;
}) {
  const gt = useGT();
  const { colors } = useControlTheme();
  const titleTypography = useScaledTextRole("title");
  const subtitleTypography = useScaledTextRole("label");
  const inFormSheet = use(RoutedFormSheetContext);
  const isOverlayHeader = use(AndroidOverlayHeaderContext);
  const { height, paddingTop, paddingBottom } = useToolbarLayout(props.embedded || inFormSheet);
  const { scale } = useAndroidControlSizing();
  const pillHeight = Math.round(GLASS_PILL_HEIGHT * Math.min(scale, 1.15));
  const [headerWidth, setHeaderWidth] = useState(0);
  const { visibleActions, overflowActions } = splitAndroidHeaderActions(
    props.actions ?? [],
    headerWidth >= 600,
  );

  const hasGroupedTrailing =
    visibleActions.length > 0 || overflowActions.length > 0 || Boolean(props.trailing);
  const totalHeight = paddingTop + height + paddingBottom;
  const scrimColor = inFormSheet ? colors["--color-sheet-solid"] : colors["--color-thread-canvas"];

  return (
    <View
      onLayout={(event) => setHeaderWidth(event.nativeEvent.layout.width)}
      pointerEvents="box-none"
      className={
        isOverlayHeader ? undefined : inFormSheet ? "bg-sheet-solid" : "bg-screen"
      }
      style={{
        paddingTop,
        paddingBottom,
        paddingHorizontal: 14,
      }}
    >
      {isOverlayHeader ? <AndroidGlassHeaderScrim color={scrimColor} height={totalHeight} /> : null}
      {inFormSheet ? (
        <View
          pointerEvents="none"
          className="absolute top-1.5 h-1 w-9 self-center rounded-full bg-foreground/30"
        />
      ) : null}
      <View
        pointerEvents="box-none"
        className="flex-row items-center gap-2.5"
        style={{ minHeight: height }}
      >
        {props.onBack || props.leading ? (
          <View className="flex-row items-center gap-2">
            {props.onBack ? (
              <AndroidGlassSurface
                radius={999}
                style={{
                  width: pillHeight,
                  height: pillHeight,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <AndroidGlassPressable
                  accessibilityLabel={gt("Navigate up")}
                  onPress={props.onBack}
                  scaleTo={0.9}
                  style={{
                    width: pillHeight,
                    height: pillHeight,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  contentStyle={{ alignItems: "center", justifyContent: "center" }}
                >
                  <SymbolView
                    name="chevron.left"
                    size={Math.round(22 * Math.min(scale, 1.15))}
                    tintColorClassName="accent-foreground"
                    type="monochrome"
                    style={{ marginRight: 2 }}
                  />
                </AndroidGlassPressable>
              </AndroidGlassSurface>
            ) : null}
            {props.leading ? (
              <AndroidGlassSurface
                radius={999}
                style={{
                  minWidth: pillHeight,
                  height: pillHeight,
                  paddingHorizontal: 2,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {props.leading}
              </AndroidGlassSurface>
            ) : null}
          </View>
        ) : null}

        <View className="min-w-0 flex-1 justify-center" style={{ paddingHorizontal: 2 }}>
          {props.titleContent ? (
            props.titleContent
          ) : (
            <>
              <AppText
                numberOfLines={1}
                className="font-t3-bold text-foreground"
                style={{
                  fontSize: Math.min(titleTypography.fontSize, 17 * Math.min(scale, 1.15)),
                  lineHeight: Math.min(titleTypography.lineHeight, 22 * Math.min(scale, 1.15)),
                }}
              >
                {props.title}
              </AppText>
              {props.subtitle ? (
                <AppText
                  numberOfLines={1}
                  className="text-foreground-muted"
                  style={{
                    fontSize: Math.min(subtitleTypography.fontSize, 12 * Math.min(scale, 1.15)),
                    lineHeight: Math.min(subtitleTypography.lineHeight, 16 * Math.min(scale, 1.15)),
                    marginTop: 1,
                  }}
                >
                  {props.subtitle}
                </AppText>
              ) : null}
            </>
          )}
        </View>

        {hasGroupedTrailing || props.trailingAccessory ? (
          <View className="flex-row items-center gap-2">
            {hasGroupedTrailing ? (
              <AndroidGlassSurface
                radius={999}
                style={{
                  minWidth: pillHeight,
                  height: pillHeight,
                  paddingHorizontal: 3,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {visibleActions.map((action) =>
                  action.loading ? (
                    <View
                      key={action.accessibilityLabel}
                      accessibilityLabel={action.accessibilityLabel}
                      style={{
                        width: Math.round(GLASS_ICON_SLOT * Math.min(scale, 1.15)),
                        height: pillHeight,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <AppActivityIndicator colorClassName="accent-foreground" />
                    </View>
                  ) : (
                    <AndroidHeaderIconButton
                      key={action.accessibilityLabel}
                      accessibilityLabel={action.accessibilityLabel}
                      disabled={action.disabled}
                      selected={action.selected}
                      icon={action.icon}
                      iconScale={action.iconScale}
                      onPress={action.onPress}
                    />
                  ),
                )}
                {overflowActions.length > 0 ? (
                  <AndroidAnchoredMenu
                    actions={overflowActions.map((action, index) => ({
                      id: String(index),
                      title: action.accessibilityLabel,
                      subtitle: action.subtitle,
                      state: action.selected ? "on" : undefined,
                      attributes: {
                        disabled: Boolean(action.disabled),
                        destructive: action.destructive,
                      },
                    }))}
                    onPressAction={({ nativeEvent }) =>
                      overflowActions[Number(nativeEvent.event)]?.onPress()
                    }
                  >
                    {(open) => (
                      <AndroidHeaderIconButton
                        accessibilityLabel={gt("More actions")}
                        icon="ellipsis"
                        onPress={open}
                      />
                    )}
                  </AndroidAnchoredMenu>
                ) : null}
                {props.trailing}
              </AndroidGlassSurface>
            ) : null}
            {props.trailingAccessory}
          </View>
        ) : null}
      </View>
    </View>
  );
}
