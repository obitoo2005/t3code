import {
  Column,
  DropdownMenuItem,
  RNHostView,
  Text,
} from "@expo/ui/jetpack-compose";
import { defaultMinSize, padding, size, width } from "@expo/ui/jetpack-compose/modifiers";
import type { MenuAction } from "@react-native-menu/menu";
import * as Haptics from "expo-haptics";
import { Fragment, useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { useAppearancePreferences } from "../../features/settings/appearance/AppearancePreferencesProvider";
import { resolveScaledTextRole } from "../../lib/appearancePreferences";
import {
  IOS_SPRING_MENU,
  IOS_TIMING_BACKDROP_IN,
  IOS_TIMING_BACKDROP_OUT,
  IOS_TIMING_EXIT,
} from "../../lib/iosMotion";
import { AndroidGlassSurface } from "./AndroidGlassSurface.android";
import { isAppSymbolName, SymbolView, type AppSymbolName } from "./AppSymbol.android";
import { AppText } from "./AppText";
import type { MenuPopupProps } from "./MenuPopup";
import { useAndroidControlSizing } from "./useAndroidControlSizing";

// The Compose glyph host consumes touches; run the action here and keep accessibility on the row.
function MenuIcon(props: {
  readonly name: AppSymbolName;
  readonly color?: MenuAction["imageColor"];
  readonly onPress: () => void;
  readonly destructive?: boolean;
  readonly disabled?: boolean;
}) {
  const { iconSize } = useAndroidControlSizing();
  return (
    <RNHostView matchContents modifiers={[size(iconSize, iconSize)]}>
      <Pressable
        accessible={false}
        focusable={false}
        disabled={props.disabled}
        onPress={props.onPress}
        style={{ width: iconSize, height: iconSize }}
        importantForAccessibility="no-hide-descendants"
      >
        <SymbolView
          name={props.name}
          size={iconSize}
          type="monochrome"
          {...(typeof props.color === "string" && !props.disabled
            ? { tintColor: props.color }
            : {
                tintColorClassName: props.disabled
                  ? "accent-icon-subtle"
                  : props.destructive
                    ? "accent-danger-foreground"
                    : "accent-foreground",
              })}
        />
      </Pressable>
    </RNHostView>
  );
}

/** Retained for Jetpack Compose SplitButton menus that still embed native DropdownMenu items. */
export function MenuPopupItems(
  props: Pick<MenuPopupProps, "menuWidth" | "actions" | "title" | "parent" | "onPress" | "onBack">,
) {
  const { appearance, themeVariables: colors } = useAppearancePreferences();
  const { scale, menuItemHeight } = useAndroidControlSizing();
  const body = resolveScaledTextRole("body", appearance.baseFontSize);
  const caption = resolveScaledTextRole("caption", appearance.baseFontSize);
  const foreground = colors["--color-foreground"];
  const muted = colors["--color-foreground-muted"];
  // A fixed native item height clips wrapped labels; a minimum lets each row grow.
  const itemModifiers = [width(props.menuWidth), defaultMinSize({ minHeight: menuItemHeight })];
  return (
    <>
      {props.parent ? (
        <DropdownMenuItem onClick={props.onBack} modifiers={itemModifiers}>
          <DropdownMenuItem.LeadingIcon>
            <MenuIcon name="arrow.left" onPress={props.onBack} />
          </DropdownMenuItem.LeadingIcon>
          <DropdownMenuItem.Text>
            <Text color={foreground} style={{ typography: "bodyLarge", ...body }}>
              {props.parent.title}
            </Text>
          </DropdownMenuItem.Text>
        </DropdownMenuItem>
      ) : props.title ? (
        <Text
          color={muted}
          style={{ typography: "bodySmall", ...caption }}
          modifiers={[padding(16 * scale, 8 * scale, 16 * scale, 8 * scale)]}
        >
          {props.title}
        </Text>
      ) : null}
      {props.actions.map((action, index) => (
        <DropdownMenuItem
          key={action.id ?? `${index}-${action.title}`}
          enabled={!action.attributes?.disabled}
          modifiers={itemModifiers}
          onClick={() => props.onPress(action)}
        >
          {action.image && isAppSymbolName(action.image) ? (
            <DropdownMenuItem.LeadingIcon>
              <MenuIcon
                name={action.image}
                color={action.imageColor}
                onPress={() => props.onPress(action)}
                destructive={action.attributes?.destructive}
                disabled={action.attributes?.disabled}
              />
            </DropdownMenuItem.LeadingIcon>
          ) : null}
          <DropdownMenuItem.Text>
            <Column>
              <Text
                style={{ typography: "bodyLarge", ...body }}
                color={
                  action.attributes?.disabled
                    ? muted
                    : action.attributes?.destructive
                      ? colors["--color-danger-foreground"]
                      : foreground
                }
              >
                {action.title}
              </Text>
              {action.subtitle ? (
                <Text color={muted} style={{ typography: "bodySmall", ...caption }}>
                  {action.subtitle}
                </Text>
              ) : null}
            </Column>
          </DropdownMenuItem.Text>
          {(action.subactions?.length ?? 0) > 0 ? (
            <DropdownMenuItem.TrailingIcon>
              <MenuIcon
                name="chevron.right"
                onPress={() => props.onPress(action)}
                disabled={action.attributes?.disabled}
              />
            </DropdownMenuItem.TrailingIcon>
          ) : action.state === "on" ? (
            <DropdownMenuItem.TrailingIcon>
              <MenuIcon
                name="checkmark"
                onPress={() => props.onPress(action)}
                disabled={action.attributes?.disabled}
              />
            </DropdownMenuItem.TrailingIcon>
          ) : null}
        </DropdownMenuItem>
      ))}
    </>
  );
}

function visibleActionsOf(actions: readonly MenuAction[]): readonly MenuAction[] {
  return actions.filter((action) => !(action.attributes?.hidden ?? false));
}

function hasAnyLeadingIcon(actions: readonly MenuAction[]): boolean {
  return actions.some((action) => {
    if (action.displayInline && action.subactions?.length) {
      return hasAnyLeadingIcon(visibleActionsOf(action.subactions));
    }
    return Boolean(action.image && isAppSymbolName(action.image));
  });
}

function GlassMenuDivider(props: { readonly isDark: boolean; readonly verticalMargin?: number }) {
  return (
    <View
      pointerEvents="none"
      style={{
        height: StyleSheet.hairlineWidth,
        marginHorizontal: 10,
        marginVertical: props.verticalMargin ?? 4,
        backgroundColor: props.isDark ? "rgba(255, 255, 255, 0.10)" : "rgba(0, 0, 0, 0.08)",
      }}
    />
  );
}

function GlassMenuRow(props: {
  readonly action: MenuAction;
  readonly isDark: boolean;
  readonly scale: number;
  readonly reserveIconSlot: boolean;
  readonly onPress: (action: MenuAction) => void;
}) {
  const { appearance, themeVariables: colors } = useAppearancePreferences();
  const body = resolveScaledTextRole("body", appearance.baseFontSize);
  const caption = resolveScaledTextRole("caption", appearance.baseFontSize);
  const clampedScale = Math.min(props.scale, 1.15);
  const iconSize = Math.round(19 * clampedScale);
  const disabled = Boolean(props.action.attributes?.disabled);
  const destructive = Boolean(props.action.attributes?.destructive);
  const selected = props.action.state === "on";
  const hasSubmenu = (props.action.subactions?.length ?? 0) > 0 && !props.action.displayInline;
  const leadingIcon =
    props.action.image && isAppSymbolName(props.action.image) ? props.action.image : null;

  const pressedBg = props.isDark ? "rgba(255, 255, 255, 0.11)" : "rgba(0, 0, 0, 0.06)";
  const selectedBg = props.isDark ? "rgba(255, 255, 255, 0.065)" : "rgba(0, 0, 0, 0.04)";
  const titleColor = disabled
    ? colors["--color-foreground-muted"]
    : destructive
      ? colors["--color-danger-foreground"]
      : colors["--color-foreground"];
  const subtitleColor = props.isDark ? "rgba(255, 255, 255, 0.54)" : "rgba(17, 17, 20, 0.56)";
  const iconTint =
    typeof props.action.imageColor === "string" && !disabled
      ? props.action.imageColor
      : disabled
        ? colors["--color-foreground-muted"]
        : destructive
          ? colors["--color-danger-foreground"]
          : props.isDark
            ? "rgba(255, 255, 255, 0.90)"
            : colors["--color-foreground"];

  return (
    <Pressable
      disabled={disabled}
      accessibilityRole="menuitem"
      accessibilityLabel={
        props.action.subtitle
          ? `${props.action.title}, ${props.action.subtitle}`
          : props.action.title
      }
      accessibilityState={{ disabled, selected }}
      onPress={() => {
        void Haptics.selectionAsync();
        props.onPress(props.action);
      }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 11,
        minHeight: Math.max(44, Math.round(44 * clampedScale)),
        paddingHorizontal: 11,
        paddingVertical: 9,
        borderRadius: 14,
        backgroundColor: pressed && !disabled ? pressedBg : selected ? selectedBg : "transparent",
        opacity: disabled ? 0.45 : 1,
      })}
    >
      {props.reserveIconSlot ? (
        <View
          style={{
            width: Math.round(22 * clampedScale),
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {leadingIcon ? (
            <SymbolView name={leadingIcon} size={iconSize} tintColor={iconTint} type="monochrome" />
          ) : null}
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText
          numberOfLines={2}
          className="font-t3-medium"
          style={{
            fontSize: Math.min(body.fontSize, 15.5 * clampedScale),
            lineHeight: Math.min(body.lineHeight, 20 * clampedScale),
            color: titleColor,
          }}
        >
          {props.action.title}
        </AppText>
        {props.action.subtitle ? (
          <AppText
            numberOfLines={2}
            style={{
              fontSize: Math.min(caption.fontSize, 12.5 * clampedScale),
              lineHeight: Math.min(caption.lineHeight, 16.5 * clampedScale),
              color: subtitleColor,
              marginTop: 1.5,
            }}
          >
            {props.action.subtitle}
          </AppText>
        ) : null}
      </View>
      {hasSubmenu ? (
        <SymbolView
          name="chevron.right"
          size={Math.round(16 * clampedScale)}
          tintColor={subtitleColor}
          type="monochrome"
        />
      ) : selected ? (
        <SymbolView
          name="checkmark"
          size={Math.round(17 * clampedScale)}
          tintColor={colors["--color-foreground"]}
          type="monochrome"
        />
      ) : null}
    </Pressable>
  );
}

function GlassMenuContents(
  props: Pick<MenuPopupProps, "actions" | "title" | "parent" | "onPress" | "onBack"> & {
    readonly isDark: boolean;
    readonly scale: number;
  },
) {
  const { appearance, themeVariables: colors } = useAppearancePreferences();
  const body = resolveScaledTextRole("body", appearance.baseFontSize);
  const caption = resolveScaledTextRole("caption", appearance.baseFontSize);
  const clampedScale = Math.min(props.scale, 1.15);
  const headerLabelColor = props.isDark ? "rgba(255, 255, 255, 0.50)" : "rgba(17, 17, 20, 0.52)";
  const pressedBg = props.isDark ? "rgba(255, 255, 255, 0.11)" : "rgba(0, 0, 0, 0.06)";
  const reserveIconSlot = hasAnyLeadingIcon(props.actions);

  return (
    <View style={{ padding: 6 }}>
      {props.parent ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={props.parent.title}
            onPress={() => {
              void Haptics.selectionAsync();
              props.onBack();
            }}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              minHeight: Math.max(40, Math.round(40 * clampedScale)),
              paddingHorizontal: 10,
              paddingVertical: 8,
              borderRadius: 14,
              backgroundColor: pressed ? pressedBg : "transparent",
            })}
          >
            <SymbolView
              name="chevron.left"
              size={Math.round(17 * clampedScale)}
              tintColor={headerLabelColor}
              type="monochrome"
            />
            <AppText
              numberOfLines={1}
              className="font-t3-bold"
              style={{
                flex: 1,
                fontSize: Math.min(body.fontSize, 14.5 * clampedScale),
                lineHeight: Math.min(body.lineHeight, 19 * clampedScale),
                color: colors["--color-foreground"],
              }}
            >
              {props.parent.title}
            </AppText>
          </Pressable>
          <GlassMenuDivider isDark={props.isDark} />
        </>
      ) : props.title ? (
        <>
          <View style={{ paddingHorizontal: 12, paddingTop: 7, paddingBottom: 6 }}>
            <AppText
              numberOfLines={1}
              className="font-t3-medium"
              style={{
                fontSize: Math.min(caption.fontSize, 12.5 * clampedScale),
                lineHeight: Math.min(caption.lineHeight, 16 * clampedScale),
                color: headerLabelColor,
                letterSpacing: 0.15,
              }}
            >
              {props.title}
            </AppText>
          </View>
          <GlassMenuDivider isDark={props.isDark} verticalMargin={3} />
        </>
      ) : null}

      {props.actions.map((action, index) => {
        const key = action.id ?? `${index}-${action.title}`;
        const prev = index > 0 ? (props.actions[index - 1] ?? null) : null;
        const startsDestructiveGroup =
          Boolean(action.attributes?.destructive) &&
          prev !== null &&
          !prev.attributes?.destructive;

        if (action.displayInline && action.subactions?.length) {
          const inlineChildren = visibleActionsOf(action.subactions);
          if (inlineChildren.length === 0) return null;
          return (
            <Fragment key={key}>
              {index > 0 ? <GlassMenuDivider isDark={props.isDark} /> : null}
              {action.title ? (
                <View style={{ paddingHorizontal: 12, paddingTop: 5, paddingBottom: 4 }}>
                  <AppText
                    numberOfLines={1}
                    className="font-t3-medium"
                    style={{
                      fontSize: Math.min(caption.fontSize, 12 * clampedScale),
                      lineHeight: Math.min(caption.lineHeight, 15 * clampedScale),
                      color: headerLabelColor,
                    }}
                  >
                    {action.title}
                  </AppText>
                </View>
              ) : null}
              {inlineChildren.map((child, childIndex) => (
                <GlassMenuRow
                  key={child.id ?? `${key}-${childIndex}-${child.title}`}
                  action={child}
                  isDark={props.isDark}
                  scale={props.scale}
                  reserveIconSlot={reserveIconSlot}
                  onPress={props.onPress}
                />
              ))}
            </Fragment>
          );
        }

        return (
          <Fragment key={key}>
            {startsDestructiveGroup ? <GlassMenuDivider isDark={props.isDark} /> : null}
            <GlassMenuRow
              action={action}
              isDark={props.isDark}
              scale={props.scale}
              reserveIconSlot={reserveIconSlot}
              onPress={props.onPress}
            />
          </Fragment>
        );
      })}
    </View>
  );
}

/** iOS 26-inspired frosted Liquid Glass anchored popup menu for Android. */
export function MenuPopup(props: MenuPopupProps) {
  const { themeAppearance } = useAppearancePreferences();
  const isDark = themeAppearance === "dark";
  const { scale } = useAndroidControlSizing();
  const clampedScale = Math.min(scale, 1.12);
  const menuRadius = Math.round(22 * clampedScale);
  const opensDown = props.placement?.bottom === undefined;
  const anchorCenterX = props.anchor.x + props.anchor.width / 2;
  const menuCenterX = (props.placement?.left ?? props.anchor.x) + props.menuWidth / 2;
  const originShiftX = Math.max(-32, Math.min(32, (anchorCenterX - menuCenterX) * 0.24));

  const progress = useSharedValue(0);
  const backdropOpacity = useSharedValue(0);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- drives Reanimated anchor-origin bloom spring on open and smooth zoom-out on close
  useEffect(() => {
    if (props.closing) {
      progress.set(withTiming(0, IOS_TIMING_EXIT));
      backdropOpacity.set(withTiming(0, IOS_TIMING_BACKDROP_OUT));
      return;
    }
    progress.set(withSpring(1, IOS_SPRING_MENU));
    backdropOpacity.set(withTiming(1, IOS_TIMING_BACKDROP_IN));
  }, [backdropOpacity, progress, props.closing]);

  const cardAnimatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: Math.min(1, p * 1.38),
      transform: [
        { translateX: (1 - p) * originShiftX },
        { translateY: (1 - p) * (opensDown ? -10 : 10) },
        { scale: 0.88 + 0.12 * p },
      ],
    };
  });

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const contents = (
    <ScrollView
      style={{ flexGrow: 0 }}
      bounces={false}
      keyboardShouldPersistTaps="always"
      showsVerticalScrollIndicator={false}
    >
      <GlassMenuContents
        actions={props.actions}
        title={props.title}
        parent={props.parent}
        onPress={props.onPress}
        onBack={props.onBack}
        isDark={isDark}
        scale={scale}
      />
    </ScrollView>
  );

  if (props.inline || !props.placement) {
    return (
      <AndroidGlassSurface
        radius={menuRadius}
        tone="menu"
        intensity={isDark ? 56 : 62}
        blurTarget={props.blurTarget ?? null}
        style={{ width: props.menuWidth }}
      >
        {contents}
      </AndroidGlassSurface>
    );
  }

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: isDark ? "rgba(0, 0, 0, 0.24)" : "rgba(0, 0, 0, 0.08)",
          },
          backdropAnimatedStyle,
        ]}
      />
      <Animated.View
        style={[
          {
            position: "absolute",
            left: props.placement.left,
            width: props.menuWidth,
            maxHeight: props.placement.maxHeight,
            borderRadius: menuRadius,
            ...(props.placement.top !== undefined
              ? { top: props.placement.top }
              : { bottom: props.placement.bottom }),
            boxShadow: [
              {
                offsetX: 0,
                offsetY: 14,
                blurRadius: 34,
                spreadDistance: -4,
                color: isDark ? "rgba(0, 0, 0, 0.62)" : "rgba(0, 0, 0, 0.18)",
              },
            ],
          },
          cardAnimatedStyle,
        ]}
      >
        <AndroidGlassSurface
          radius={menuRadius}
          tone="menu"
          intensity={isDark ? 56 : 62}
          blurTarget={props.blurTarget ?? null}
          style={{
            width: props.menuWidth,
            maxHeight: props.placement.maxHeight,
          }}
        >
          {contents}
        </AndroidGlassSurface>
      </Animated.View>
    </>
  );
}
