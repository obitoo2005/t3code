import { BlurTargetView } from "expo-blur";
import { useGT } from "gt-react-native";
import { useAndroidFloatingTabs } from "../../settings/appearance/AppearancePreferencesProvider";
import { WorkspaceNoTabs } from "./WorkspaceNoTabs";
import { useEnabledNavigationTabs } from "./navigation-tabs";
import { NAVIGATION_TAB_ORDER } from "./navigation-tab-order";
import { WorkspaceExtraTab } from "./WorkspaceExtraTab";
import { useRef, type ComponentRef, type ReactNode } from "react";
import { View } from "react-native";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { AndroidBlurTargetContext } from "../../../components/ui/AndroidBlurTargetContext";
import { NativeStackScreenOptions } from "../../../native/StackHeader";
import { AppBar } from "../../../components/ui/AppBar";
import { WorkspaceEmptyDetail } from "../WorkspaceEmptyDetail";
import { ScreenContent } from "../../../components/ui/ScreenContent";
import { useAndroidControlSizing } from "../../../components/ui/useAndroidControlSizing";
import { HomeRouteScreen } from "../../home/HomeRouteScreen";
import { PullRequestsScreen } from "../../pull-requests/PullRequestsScreen";
import { ListSearchToolbar } from "./ListSearchToolbar.android";
import { IssuesScreen } from "../../issues/IssuesScreen";
import { useAdaptiveWorkspaceLayout } from "../AdaptiveWorkspaceLayout";
import { WorkspaceSettledContentWidthContext } from "../workspace-content-width";
import { AndroidWorkspaceNavigation, FloatingWorkspaceTabs } from "./AndroidWorkspaceNavigation";
import { FLOATING_TABS } from "./floating-workspace-tabs";
import { WorkspaceTabsContext, useWorkspaceTabs } from "./WorkspaceTabsContext";
import { WorkspaceTabPanes } from "./WorkspaceTabPanes";
import { WorkspaceAppBarScope } from "../../../components/ui/WorkspaceAppBar.android";
import { usePaneRole } from "../../../components/ui/Pane";
import { AndroidWorkspaceSidebar } from "./AndroidWorkspaceSidebar.android";
import { useAndroidWorkspaceRoot } from "./AndroidWorkspaceTabsProvider";
import { SettingsListScreen } from "../../settings/SettingsRouteScreen";
import { workspaceUsesColumns, type WorkspaceTab } from "./workspace-tabs-state";
import { useSelectWorkspaceTab } from "./useSelectWorkspaceTab";
import { useHardwareBack } from "../../../lib/backHandler";
import { DynamicAgentIsland } from "./DynamicAgentIsland";

type CompactPaneTab = WorkspaceTab | "settings";
const COMPACT_PANE_TABS: readonly CompactPaneTab[] = [...NAVIGATION_TAB_ORDER, "settings"];

export function WorkspaceRootScreen() {
  return usePaneRole() === "sidebar" ? <AndroidWorkspaceSidebar /> : <WorkspaceRoot />;
}

function WorkspaceRoot() {
  const gt = useGT();
  const floatingTabsEnabled = useAndroidFloatingTabs();
  const { layout, startNewTask, workspacePageWidth } = useAdaptiveWorkspaceLayout();
  const workspace = useWorkspaceTabs()!;
  const enabled = useEnabledNavigationTabs();
  const insets = useSafeAreaInsets();
  const blurTargetRef = useRef<ComponentRef<typeof View> | null>(null);
  const { fabClearance, fabSize } = useAndroidControlSizing();
  const context = {
    ...workspace,
    bottomClearance: layout.usesSplitView
      ? workspace.bottomClearance
      : floatingTabsEnabled
        ? insets.bottom + FLOATING_TABS.bottom + FLOATING_TABS.edge + fabSize
        : workspace.state.selectedTab === "threads"
          ? fabClearance + 16
          : 16,
  };
  const root = useAndroidWorkspaceRoot();
  const inlineSettings = !layout.usesSplitView && Boolean(root?.inlineSettingsOpen);
  const tab = workspace.state.selectedTab;
  const activePane: CompactPaneTab = inlineSettings ? "settings" : tab;
  const selectTab = useSelectWorkspaceTab();
  // Tabs are panes of Home, not routes, so Back has nothing to pop and would leave the app.
  // An open search keeps Back for itself.
  const activeSearchMode = inlineSettings
    ? workspace.state.tabs.settings.searchMode
    : workspace.state.tabs[tab].searchMode;
  useHardwareBack(
    (inlineSettings || tab !== "threads") &&
      enabled.includes("threads") &&
      activeSearchMode === "resting",
    () => {
      root?.setInlineSettingsOpen(false);
      selectTab("threads");
      return true;
    },
  );

  return (
    <WorkspaceTabsContext value={context}>
      <View className="flex-1 bg-screen">
        {!layout.usesSplitView ? (
          <NativeStackScreenOptions options={{ headerShown: false }} />
        ) : null}
        <BlurTargetView ref={blurTargetRef} style={{ flex: 1 }}>
          <SafeAreaInsetsContext
            value={
              layout.usesSplitView
                ? insets
                : floatingTabsEnabled
                  ? inlineSettings || !workspaceUsesColumns(tab)
                    ? { ...insets, bottom: context.bottomClearance }
                    : insets
                  : { ...insets, bottom: 0 }
            }
          >
            {enabled.length === 0 && !inlineSettings ? (
              layout.usesSplitView ? (
                <View className="flex-1 bg-screen" />
              ) : (
                <WorkspaceNoTabs />
              )
            ) : (
              <WorkspaceAppBarScope enabled={!layout.usesSplitView}>
                <WorkspaceTabPanes
                  tabs={COMPACT_PANE_TABS}
                  selected={activePane}
                  renderTab={(paneTab) =>
                    paneTab === "settings" ? (
                      <SettingsListScreen sidebar={false} selected={null} workspaceRoot />
                    ) : paneTab === "threads" ? (
                      <HomeRouteScreen />
                    ) : paneTab === "usage" || paneTab === "workflows" ? (
                      <WorkspacePageFrame width={workspacePageWidth ?? null}>
                        <WorkspaceExtraTab tab={paneTab} />
                      </WorkspacePageFrame>
                    ) : layout.usesSplitView ? (
                      <>
                        <NativeStackScreenOptions options={{ headerShown: false }} />
                        <AppBar
                          embedded
                          title={
                            paneTab === "issues"
                              ? gt("Issues", { $context: "screen title, list of issues" })
                              : gt("Pull requests")
                          }
                        />
                        <WorkspaceEmptyDetail tab={paneTab} />
                      </>
                    ) : paneTab === "issues" ? (
                      <IssuesScreen
                        renderFrame={(filters, list) => (
                          <>
                            <ListSearchToolbar tab="issues" filters={filters} />
                            <ScreenContent>{list}</ScreenContent>
                          </>
                        )}
                      />
                    ) : (
                      <PullRequestsScreen
                        renderFrame={(filters, list) => (
                          <>
                            <ListSearchToolbar tab="pullRequests" filters={filters} />
                            <ScreenContent>{list}</ScreenContent>
                          </>
                        )}
                      />
                    )
                  }
                />
              </WorkspaceAppBarScope>
            )}
          </SafeAreaInsetsContext>
        </BlurTargetView>
        {layout.usesSplitView ? null : floatingTabsEnabled ? (
          <AndroidBlurTargetContext value={blurTargetRef}>
            <FloatingWorkspaceTabs fillWidth onNewThread={startNewTask} />
          </AndroidBlurTargetContext>
        ) : (
          <AndroidWorkspaceNavigation onNewThread={startNewTask} />
        )}
        <DynamicAgentIsland />
      </View>
    </WorkspaceTabsContext>
  );
}

// Hidden, the page sits in the narrower pane beside the list; laying it out at the width it opens
// at keeps measured bars and breakpoints from catching up a frame after it appears.
function WorkspacePageFrame(props: {
  readonly width: number | null;
  readonly children: ReactNode;
}) {
  if (props.width === null) return props.children;
  return (
    <WorkspaceSettledContentWidthContext value={props.width}>
      <View style={{ flex: 1, width: props.width }}>{props.children}</View>
    </WorkspaceSettledContentWidthContext>
  );
}
