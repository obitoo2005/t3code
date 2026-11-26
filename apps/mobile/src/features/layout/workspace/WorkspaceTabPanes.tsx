import { Activity, useState, type ReactNode } from "react";
import { View } from "react-native";

/**
 * Top-level tabs swap in a single frame (matching iOS UITabBarController). Each tab mounts on its
 * first visit and stays mounted while hidden, so returning to it restores its exact scroll & state
 * in 0ms without allocating fullscreen offscreen alpha/scale hardware layers on Android.
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
  return props.tabs.map((tab) =>
    visited.includes(tab) ? (
      <Activity key={tab} mode={tab === props.selected ? "visible" : "hidden"}>
        <View className="flex-1">{props.renderTab(tab)}</View>
      </Activity>
    ) : null,
  );
}
