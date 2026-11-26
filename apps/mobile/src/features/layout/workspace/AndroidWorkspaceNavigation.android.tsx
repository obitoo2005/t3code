import { CommonActions, useNavigation } from "@react-navigation/native";
import { requireNativeView } from "expo";
import * as Haptics from "expo-haptics";
import { msg, useGT, useMessages } from "gt-react-native";
import { memo, useEffect, useRef } from "react";
import {
  Keyboard,
  processColor,
  useWindowDimensions,
  View,
  type NativeSyntheticEvent,
  type ViewProps,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AndroidGlassPressable,
  AndroidGlassSurface,
} from "../../../components/ui/AndroidGlassSurface.android";
import { SymbolView, type AppSymbolName } from "../../../components/ui/AppSymbol";
import { useAndroidControlSizing } from "../../../components/ui/useAndroidControlSizing";
import { useToolbarLayout } from "../../../components/ui/useToolbarLayout";
import { IOS_SPRING_LIQUID_LENS, IOS_SPRING_SNAPPY } from "../../../lib/iosMotion";
import { rootNavigationRef } from "../../../lib/rootNavigation";
import { useWorkspaceConnectionState } from "../../../state/workspace";
import { useSoftKeyboardShowing } from "../../keyboard/useSoftKeyboardShowing";
import { useAppearancePreferences } from "../../settings/appearance/AppearancePreferencesProvider";
import { useAdaptiveWorkspaceLayout } from "../adaptive-workspace-context";
import { useAndroidWorkspaceRoot } from "./AndroidWorkspaceTabsProvider";
import { useWorkspaceTabs } from "./WorkspaceTabsContext";
import { androidWorkspaceNavigationColors } from "./android-workspace-navigation-colors";
import {
  androidWorkspaceTabNavigationState,
  type AndroidWorkspaceNavigationTab,
} from "./android-workspace-tabs";
import { FLOATING_TABS, floatingTabsMetrics } from "./floating-workspace-tabs";
import {
  NAVIGATION_TAB_LABELS,
  selectedNavigationTab,
  visibleNavigationTabs,
} from "./navigation-tab-order";
import {
  NAVIGATION_TAB_ICONS,
  useHiddenNavigationTabs,
  useNavigationTabOrder,
} from "./navigation-tabs";

// Matches RAIL_WIDTH in the native rail.
export const ANDROID_WORKSPACE_RAIL_WIDTH = 72;

interface NativeNavigationProps extends ViewProps {
  readonly rail: boolean;
  readonly floating: boolean;
  readonly tabs: readonly string[];
  readonly tabTitles: Readonly<Record<string, string>>;
  readonly expandedTabTitles: Readonly<Record<string, string>>;
  readonly newThreadTitle: string;
  readonly selectedTab: AndroidWorkspaceNavigationTab;
  readonly dark: boolean;
  readonly textScale: number;
  readonly newEnabled: boolean;
  readonly safeAreaTop: number;
  readonly safeAreaBottom: number;
  readonly headerHeight: number;
  readonly containerColor: number;
  readonly selectedColor: number;
  readonly indicatorColor: number;
  readonly unselectedColor: number;
  readonly actionColor: number;
  readonly actionContentColor: number;
  readonly onTabSelected: (
    event: NativeSyntheticEvent<{ readonly tab: AndroidWorkspaceNavigationTab }>,
  ) => void;
  readonly onNewThread: () => void;
  readonly onOverlayChange: (event: NativeSyntheticEvent<{ readonly overlay: boolean }>) => void;
}

const TAB_TITLES = {
  ...NAVIGATION_TAB_LABELS,
  threads: msg("Chats", { $context: "navigation tab, list of chat threads" }),
  settings: msg("Settings"),
};

const NativeNavigation = requireNativeView<NativeNavigationProps>("T3WorkspaceNavigation");

function nativeColor(value: string) {
  const color = processColor(value);
  return typeof color === "number" ? color : 0;
}

function tabIconName(tab: AndroidWorkspaceNavigationTab): AppSymbolName {
  if (tab === "settings") return "gearshape";
  return NAVIGATION_TAB_ICONS[tab];
}

export function AndroidWorkspaceNavigation(props: {
  readonly onNewThread: () => void;
  readonly rail?: boolean;
  readonly floating?: boolean;
  readonly fillWidth?: boolean;
  readonly paneWidth?: number;
  readonly onSelect?: () => void;
  /** The rail needs the whole workspace while it widens over the list. */
  readonly onOverlayChange?: (overlay: boolean) => void;
}) {
  const workspace = useWorkspaceTabs()!;
  const gt = useGT();
  const m = useMessages();
  const order = useNavigationTabOrder();
  const hidden = useHiddenNavigationTabs();
  const root = useAndroidWorkspaceRoot();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const toolbar = useToolbarLayout();
  const connectionState = useWorkspaceConnectionState();
  const keyboardVisible = useSoftKeyboardShowing();
  const { layout } = useAdaptiveWorkspaceLayout();
  const { themeAppearance, themeVariables: colors } = useAppearancePreferences();
  const { scale, fabSize } = useAndroidControlSizing();
  const window = useWindowDimensions();
  const rail = Boolean(props.rail);
  const floating = !rail && Boolean(props.floating);
  const tabs: readonly AndroidWorkspaceNavigationTab[] = [
    ...visibleNavigationTabs(order, hidden, rail ? 5 : 4),
    "settings" as const,
  ];
  const { containerColor, indicatorColor, selectedColor, unselectedColor } =
    androidWorkspaceNavigationColors(colors, rail, floating);
  const selectedTab = selectedNavigationTab(
    order,
    workspace.state.selectedTab,
    root?.settingsOpen ?? false,
    hidden,
    rail ? 5 : 4,
  );
  const selectWorkspaceTab = (tab: AndroidWorkspaceNavigationTab) => {
    Keyboard.dismiss();
    const rootState = rootNavigationRef.getRootState();
    const alreadyAtBareHome =
      rootState !== undefined &&
      rootState.routes.length === 1 &&
      rootState.routes[0]?.name === "Home";

    if (!layout.usesSplitView) {
      if (tab === "settings") {
        root?.setInlineSettingsOpen(true);
      } else {
        root?.setInlineSettingsOpen(false);
        workspace.dispatch({ type: "select", tab });
      }
      // When already on Home, switch panes in-place in 0ms without resetting the navigation stack!
      if (root && rootState && !alreadyAtBareHome) {
        navigation.dispatch({
          ...CommonActions.reset(androidWorkspaceTabNavigationState(rootState, "threads", false)),
          target: root.key,
        });
      }
      props.onSelect?.();
      return;
    }

    root?.setInlineSettingsOpen(false);
    if (tab !== "settings") workspace.dispatch({ type: "select", tab });
    if (root && rootState && !(tab !== "settings" && alreadyAtBareHome)) {
      navigation.dispatch({
        ...CommonActions.reset(
          androidWorkspaceTabNavigationState(rootState, tab, layout.usesSplitView),
        ),
        target: root.key,
      });
    }
    props.onSelect?.();
  };

  if (!rail && keyboardVisible) return null;

  if (floating) {
    const isDark = themeAppearance === "dark";
    const leftInset = Math.max(insets.left, FLOATING_TABS.edge);
    const rightInset = Math.max(insets.right, FLOATING_TABS.edge);
    const availableWidth =
      props.paneWidth !== undefined
        ? Math.max(0, props.paneWidth - 2 * FLOATING_TABS.edge)
        : Math.max(0, window.width - leftInset - rightInset);
    const showsCompose =
      selectedTab === "threads" && !root?.settingsOpen && connectionState.hasConnections;
    const barWidth = props.paneWidth ?? window.width;
    const metrics = floatingTabsMetrics(tabs.length, scale, fabSize, barWidth, props.fillWidth);
    const dockHeight = Math.max(54, Math.min(60, Math.round(metrics.height)));
    const iconSize = Math.round(22 * Math.min(scale, 1.15));
    const centeredPillWidth = Math.min(
      availableWidth,
      Math.max(Math.round(tabs.length * 68 * Math.min(scale, 1.15)), 248),
    );
    const pillWidth = showsCompose
      ? Math.max(0, availableWidth - dockHeight - FLOATING_TABS.gap)
      : centeredPillWidth;

    return (
      <FloatingGlassDock
        tabs={tabs}
        selectedTab={selectedTab}
        tabTitles={Object.fromEntries(tabs.map((tab) => [tab, m(TAB_TITLES[tab])]))}
        newThreadTitle={gt("New thread")}
        isDark={isDark}
        dockHeight={dockHeight}
        pillWidth={pillWidth}
        iconSize={iconSize}
        showsCompose={showsCompose}
        onSelectTab={(tab) => {
          void Haptics.selectionAsync();
          selectWorkspaceTab(tab);
        }}
        onNewThread={() => {
          void Haptics.selectionAsync();
          Keyboard.dismiss();
          props.onNewThread();
        }}
      />
    );
  }

  return (
    <View
      style={
        // The rail draws its own surface and pads the system bars; while open it spans the
        // workspace, so the rest of it must stay transparent.
        rail ? { flex: 1 } : { backgroundColor: containerColor, paddingBottom: insets.bottom }
      }
    >
      <NativeNavigation
        rail={rail}
        floating={false}
        tabs={tabs}
        tabTitles={Object.fromEntries(tabs.map((tab) => [tab, m(TAB_TITLES[tab])]))}
        expandedTabTitles={{ pullRequests: gt("Pull requests") }}
        newThreadTitle={gt("New thread")}
        selectedTab={selectedTab}
        dark={themeAppearance === "dark"}
        textScale={scale}
        newEnabled={connectionState.hasConnections}
        safeAreaTop={toolbar.paddingTop}
        safeAreaBottom={insets.bottom}
        headerHeight={toolbar.height}
        containerColor={nativeColor(containerColor)}
        selectedColor={nativeColor(selectedColor)}
        indicatorColor={nativeColor(indicatorColor)}
        unselectedColor={nativeColor(unselectedColor)}
        actionColor={nativeColor(colors["--color-primary"])}
        actionContentColor={nativeColor(colors["--color-primary-foreground"])}
        onTabSelected={(event) => selectWorkspaceTab(event.nativeEvent.tab)}
        onNewThread={() => {
          Keyboard.dismiss();
          props.onNewThread();
        }}
        onOverlayChange={(event) => props.onOverlayChange?.(event.nativeEvent.overlay)}
        style={rail ? { flex: 1 } : { height: 80 * Math.max(1, scale) }}
      />
    </View>
  );
}

const FloatingGlassDock = memo(function FloatingGlassDock(props: {
  readonly tabs: readonly AndroidWorkspaceNavigationTab[];
  readonly selectedTab: AndroidWorkspaceNavigationTab;
  readonly tabTitles: Readonly<Record<string, string>>;
  readonly newThreadTitle: string;
  readonly isDark: boolean;
  readonly dockHeight: number;
  readonly pillWidth: number;
  readonly iconSize: number;
  readonly showsCompose: boolean;
  readonly onSelectTab: (tab: AndroidWorkspaceNavigationTab) => void;
  readonly onNewThread: () => void;
}) {
  const innerPadding = 4;
  const tabCount = Math.max(1, props.tabs.length);
  const innerWidth = Math.max(0, props.pillWidth - innerPadding * 2);
  const slotWidth = innerWidth / tabCount;
  const activeIndex = Math.max(0, props.tabs.indexOf(props.selectedTab));
  const prevIndexRef = useRef(activeIndex);

  // Pure GPU transform-only animations (never animate BlurView layout width per frame!).
  const activeIndexProgress = useSharedValue(activeIndex);
  const lensStretchX = useSharedValue(1);
  const lensStretchY = useSharedValue(1);
  const composePop = useSharedValue(1);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- drives Reanimated 165Hz GPU transform glide on the active glass tab lens
  useEffect(() => {
    const moved = prevIndexRef.current !== activeIndex;
    prevIndexRef.current = activeIndex;
    activeIndexProgress.set(withSpring(activeIndex, IOS_SPRING_LIQUID_LENS));
    if (moved) {
      lensStretchX.set(
        withSequence(
          withTiming(1.1, { duration: 80, easing: Easing.out(Easing.quad) }),
          withSpring(1, IOS_SPRING_LIQUID_LENS),
        ),
      );
      lensStretchY.set(
        withSequence(
          withTiming(0.93, { duration: 80, easing: Easing.out(Easing.quad) }),
          withSpring(1, IOS_SPRING_LIQUID_LENS),
        ),
      );
    }
  }, [activeIndex, activeIndexProgress, lensStretchX, lensStretchY]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- plays crisp GPU spring scale-in when the compose button mounts on Chats
  useEffect(() => {
    if (props.showsCompose) {
      composePop.set(0.82);
      composePop.set(withSpring(1, IOS_SPRING_SNAPPY));
    }
  }, [composePop, props.showsCompose]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: activeIndexProgress.value * slotWidth },
      { scaleX: lensStretchX.value },
      { scaleY: lensStretchY.value },
    ],
  }));

  const composePopStyle = useAnimatedStyle(() => ({
    transform: [{ scale: composePop.value }],
  }));

  const activeLensBg = props.isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.08)";
  const activeLensBorder = props.isDark ? "rgba(255, 255, 255, 0.18)" : "rgba(255, 255, 255, 0.72)";
  const selectedIconColor = props.isDark ? "#ffffff" : "#111114";
  const unselectedIconColor = props.isDark ? "rgba(255, 255, 255, 0.56)" : "rgba(17, 17, 20, 0.52)";

  return (
    <View
      pointerEvents="box-none"
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: props.showsCompose ? "space-between" : "center",
        gap: FLOATING_TABS.gap,
        width: "100%",
      }}
    >
      <AndroidGlassSurface
        radius={999}
        tone="elevated"
        style={{
          width: props.pillWidth,
          height: props.dockHeight,
        }}
      >
        <View
          accessibilityRole="tablist"
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            padding: innerPadding,
          }}
        >
          {slotWidth > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[
                {
                  position: "absolute",
                  left: innerPadding,
                  top: innerPadding,
                  bottom: innerPadding,
                  width: slotWidth,
                  borderRadius: 999,
                  backgroundColor: activeLensBg,
                  borderWidth: 1,
                  borderColor: activeLensBorder,
                },
                indicatorStyle,
              ]}
            />
          ) : null}
          {props.tabs.map((tab) => {
            const selected = tab === props.selectedTab;
            return (
              <AndroidGlassPressable
                key={tab}
                accessibilityRole="tab"
                accessibilitySelected={selected}
                accessibilityLabel={props.tabTitles[tab] ?? tab}
                onPress={() => props.onSelectTab(tab)}
                scaleTo={0.88}
                bloomRadius={999}
                style={{
                  flex: 1,
                  height: "100%",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 999,
                  overflow: "hidden",
                }}
                contentStyle={{
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <SymbolView
                  name={tabIconName(tab)}
                  size={props.iconSize}
                  tintColor={selected ? selectedIconColor : unselectedIconColor}
                  type="monochrome"
                />
              </AndroidGlassPressable>
            );
          })}
        </View>
      </AndroidGlassSurface>

      {props.showsCompose ? (
        <Animated.View style={composePopStyle}>
          <AndroidGlassSurface
            radius={999}
            tone="elevated"
            style={{
              width: props.dockHeight,
              height: props.dockHeight,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AndroidGlassPressable
              accessibilityLabel={props.newThreadTitle}
              onPress={props.onNewThread}
              scaleTo={0.9}
              bloomRadius={999}
              style={{
                width: props.dockHeight,
                height: props.dockHeight,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 999,
                overflow: "hidden",
              }}
              contentStyle={{
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <SymbolView
                name="square.and.pencil"
                size={props.iconSize}
                tintColor={selectedIconColor}
                type="monochrome"
              />
            </AndroidGlassPressable>
          </AndroidGlassSurface>
        </Animated.View>
      ) : null}
    </View>
  );
});

export function FloatingWorkspaceTabs(props: {
  readonly fillWidth?: boolean;
  readonly onNewThread: () => void;
  readonly paneWidth?: number;
  readonly onSelect?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const horizontalInset = Math.max(insets.left, insets.right, FLOATING_TABS.edge);
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: props.paneWidth !== undefined ? FLOATING_TABS.edge : horizontalInset,
        right: props.paneWidth !== undefined ? FLOATING_TABS.edge : horizontalInset,
        bottom: Math.max(insets.bottom, 6) + FLOATING_TABS.bottom,
        alignItems: "center",
      }}
    >
      <AndroidWorkspaceNavigation {...props} floating />
    </View>
  );
}
