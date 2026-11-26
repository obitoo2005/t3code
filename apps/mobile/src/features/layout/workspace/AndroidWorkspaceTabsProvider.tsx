import type { NavigationState } from "@react-navigation/native";
import { createContext, use, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import { androidWorkspaceSettingsOpen } from "./android-workspace-tabs";
import { WorkspaceTabsProvider } from "./WorkspaceTabsContext";
import { workspaceTabOf } from "./workspace-tabs-state";

interface AndroidWorkspaceRoot {
  /**
   * The rail's `useNavigation()` dispatches to the focused navigator, which may be nested Settings.
   * Target the root stack's key (and read `rootNavigationRef`'s state) so a tab press resets the root.
   */
  readonly key: string;
  /** True when Settings is active either as an inline Home pane or as a pushed Settings stack route. */
  readonly settingsOpen: boolean;
  /** True only when a `Settings*` route is on the root stack above Home. */
  readonly routeSettingsOpen: boolean;
  /** True when the compact Settings list is shown in-place inside `Home` with zero stack reset. */
  readonly inlineSettingsOpen: boolean;
  readonly setInlineSettingsOpen: (open: boolean) => void;
  readonly settingsRoute: NavigationState["routes"][number] | undefined;
  readonly settingsPage: string | null;
}

const AndroidWorkspaceRootContext = createContext<AndroidWorkspaceRoot | null>(null);

export function useAndroidWorkspaceRoot() {
  return use(AndroidWorkspaceRootContext);
}

/** Android keeps one tab controller above the root navigator and split sidebar. */
export function AndroidWorkspaceTabsProvider(props: {
  readonly state: NavigationState;
  readonly children: ReactNode;
}) {
  const key = props.state.key;
  const [inlineSettingsOpen, setInlineSettingsOpen] = useState(false);
  const routeSettingsOpen = Platform.OS === "android" && androidWorkspaceSettingsOpen(props.state);
  const settingsOpen = routeSettingsOpen || inlineSettingsOpen;
  const settingsIndex = props.state.routes.findIndex((route) => route.name === "Settings");
  const settingsRoute = settingsIndex < 0 ? undefined : props.state.routes[settingsIndex];
  const settingsPage =
    settingsIndex < 0 ? null : (props.state.routes[settingsIndex + 1]?.name ?? null);
  const root: AndroidWorkspaceRoot = {
    key,
    settingsOpen,
    routeSettingsOpen,
    inlineSettingsOpen,
    setInlineSettingsOpen,
    settingsRoute,
    settingsPage,
  };
  return Platform.OS === "android" ? (
    // A cold-start link lands on a page with no list selection; start on that page's list.
    <WorkspaceTabsProvider
      settingsOpen={settingsOpen}
      initialTab={workspaceTabOf(props.state.routes.find((route) => route.name !== "Home")?.name)}
    >
      <AndroidWorkspaceRootContext value={root}>{props.children}</AndroidWorkspaceRootContext>
    </WorkspaceTabsProvider>
  ) : (
    props.children
  );
}
