import { Activity, useEffect, useRef, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { IOS_TIMING_TAB_REVEAL } from "../../../lib/iosMotion";

function AnimatedTabPane(props: {
  readonly visible: boolean;
  readonly animateOnMount: boolean;
  readonly children: ReactNode;
}) {
  const mountedRef = useRef(false);
  const reveal = useSharedValue(props.animateOnMount && Platform.OS === "android" ? 0 : 1);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- plays a subtle 165Hz cross-fade settle when switching Android workspace tabs
  useEffect(() => {
    if (Platform.OS !== "android") return;
    if (!mountedRef.current) {
      mountedRef.current = true;
      if (props.visible && props.animateOnMount) {
        reveal.set(withTiming(1, IOS_TIMING_TAB_REVEAL));
      }
      return;
    }
    if (props.visible) {
      reveal.set(0);
      reveal.set(withTiming(1, IOS_TIMING_TAB_REVEAL));
    }
  }, [props.animateOnMount, props.visible, reveal]);

  const animatedStyle = useAnimatedStyle(() => {
    const p = reveal.value;
    return {
      opacity: 0.84 + 0.16 * p,
      transform: [{ scale: 0.992 + 0.008 * p }],
    };
  });

  return (
    <Animated.View className="flex-1" style={Platform.OS === "android" ? animatedStyle : undefined}>
      {props.children}
    </Animated.View>
  );
}

/**
 * Top-level tabs mount on first visit and stay mounted while hidden, so returning to a tab
 * restores its exact scroll & state. On Android, switching tabs runs a crisp 165Hz micro-settle
 * instead of a harsh 1-frame cut.
 */
export function WorkspaceTabPanes<Tab extends string>(props: {
  readonly tabs: readonly Tab[];
  readonly selected: Tab;
  readonly renderTab: (tab: Tab) => ReactNode;
}) {
  const [visited, setVisited] = useState<readonly Tab[]>(() => [props.selected]);
  if (!visited.includes(props.selected)) {
    setVisited([...visited, props.selected]);
  }
  const hasSwitchedTabs = visited.length > 1;
  return props.tabs.map((tab) =>
    visited.includes(tab) ? (
      <Activity key={tab} mode={tab === props.selected ? "visible" : "hidden"}>
        <AnimatedTabPane visible={tab === props.selected} animateOnMount={hasSwitchedTabs}>
          {props.renderTab(tab)}
        </AnimatedTabPane>
      </Activity>
    ) : null,
  );
}
