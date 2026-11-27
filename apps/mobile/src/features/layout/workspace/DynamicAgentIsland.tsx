import { useAtomValue } from "@effect/atom-react";
import { useIsFocused, useNavigationState } from "@react-navigation/native";
import { resolveThreadWorkingStartedAt } from "@t3tools/client-runtime/state/models";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp, LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AkenoWorkingIcon } from "../../../components/AkenoWorkingIcon";
import { AppText as Text } from "../../../components/ui/AppText";
import { useAppActive } from "../../../lib/appState";
import { scopedThreadKey } from "../../../lib/scopedEntities";
import { steadyNavigationThreadShellsAtom } from "../../../state/threads";
import { useAdaptiveWorkspaceLayout } from "../adaptive-workspace-context";
import {
  createDynamicIslandTrackerState,
  dismissDynamicIslandEntry,
  reconcileDynamicIslandState,
  selectDynamicIslandPresentation,
  type DynamicIslandThreadInput,
  type DynamicIslandTrackerState,
} from "./dynamicAgentIslandLogic";
import { useSelectWorkspaceDetail } from "./useSelectWorkspaceDetail";
import { currentWorkspaceSelections } from "./workspace-selection-store";

type NavRoute = { readonly name: string; readonly params?: object };

function extractForegroundThreadKey(
  state: { readonly index: number; readonly routes: readonly NavRoute[] } | undefined,
): string | null {
  if (!state) return null;
  const activeRoutes = state.routes.slice(0, state.index + 1);
  const top = activeRoutes[activeRoutes.length - 1];
  const candidate = top?.name.startsWith("Thread")
    ? top
    : activeRoutes.findLast((route) => route.name.startsWith("Thread"));
  const params = candidate?.params;
  if (
    !params ||
    !("environmentId" in params) ||
    !("threadId" in params) ||
    typeof params.environmentId !== "string" ||
    typeof params.threadId !== "string"
  ) {
    return null;
  }
  return `${params.environmentId}:${params.threadId}`;
}

const ISLAND_LAYOUT_TRANSITION = LinearTransition.springify().damping(20).stiffness(260);

/**
 * Floating OLED "Dynamic Island" live agent pill shown at the top-center of WorkspaceRoot
 * whenever one or more background threads are actively running or just finished.
 */
export function DynamicAgentIsland() {
  const isFocused = useIsFocused();
  const appActive = useAppActive();
  const insets = useSafeAreaInsets();
  const { layout } = useAdaptiveWorkspaceLayout();
  const selectDetail = useSelectWorkspaceDetail();
  const threads = useAtomValue(steadyNavigationThreadShellsAtom);
  const foregroundThreadKey = useNavigationState(extractForegroundThreadKey);

  const excludedThreadKeys = useMemo(() => {
    const keys = new Set<string>();
    if (foregroundThreadKey !== null) {
      keys.add(foregroundThreadKey);
    }
    if (layout.usesSplitView) {
      const remembered = currentWorkspaceSelections().threads;
      if (remembered) {
        keys.add(`${remembered.environmentId}:${remembered.threadId}`);
      }
    }
    return keys;
  }, [foregroundThreadKey, layout.usesSplitView]);

  const threadInputs = useMemo<ReadonlyArray<DynamicIslandThreadInput>>(
    () =>
      threads.map((thread) => ({
        key: scopedThreadKey(thread.environmentId, thread.id),
        environmentId: String(thread.environmentId),
        threadId: String(thread.id),
        title: thread.title,
        runtimeStatus: thread.runtime?.status ?? null,
        activeRunId: thread.runtime?.activeRunId ?? null,
        latestRunId: thread.latestRun?.runId ?? null,
        startedAt:
          resolveThreadWorkingStartedAt(thread) ??
          thread.latestRun?.startedAt ??
          thread.latestRun?.requestedAt ??
          null,
        updatedAt: thread.updatedAt,
        archivedAt: thread.archivedAt,
        deletedAt: thread.deletedAt,
      })),
    [threads],
  );

  const [trackerState, setTrackerState] = useState<DynamicIslandTrackerState>(() =>
    createDynamicIslandTrackerState(),
  );
  const [nowMs, setNowMs] = useState(() => Date.now());

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- tracks running -> settled transitions for background threads across shell snapshots
  useEffect(() => {
    const currentNow = Date.now();
    setNowMs(currentNow);
    setTrackerState((prev) =>
      reconcileDynamicIslandState(prev, {
        threads: threadInputs,
        excludedThreadKeys,
        nowMs: currentNow,
      }),
    );
  }, [excludedThreadKeys, threadInputs]);

  const presentation = useMemo(
    () =>
      selectDynamicIslandPresentation(trackerState, {
        excludedThreadKeys,
        nowMs,
      }),
    [excludedThreadKeys, nowMs, trackerState],
  );

  const shouldTickClock = isFocused && appActive && presentation?.mode === "working";
  const completedExpiryMs =
    isFocused && appActive && presentation?.mode === "completed"
      ? presentation.nextExpiryMs
      : null;

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- syncs displayed elapsed/expiry timestamp on refocus
  useEffect(() => {
    if (isFocused && appActive) {
      setNowMs(Date.now());
    }
  }, [appActive, isFocused]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- runs 1Hz live elapsed clock only while WorkspaceRoot is focused with an active background run
  useEffect(() => {
    if (!shouldTickClock) return;
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [shouldTickClock]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- auto-clears the just-finished capsule once its 6s completion hold expires
  useEffect(() => {
    if (completedExpiryMs === null) return;
    const remaining = Math.max(16, completedExpiryMs - Date.now());
    const timer = setTimeout(() => {
      setNowMs(Date.now());
    }, remaining);
    return () => clearTimeout(timer);
  }, [completedExpiryMs]);

  if (!isFocused || presentation === null) {
    return null;
  }

  const isCompleted = presentation.mode === "completed";

  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + 6 }]}>
      <Animated.View
        entering={FadeInUp.duration(220)}
        exiting={FadeOutUp.duration(180)}
        layout={ISLAND_LAYOUT_TRANSITION}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            isCompleted
              ? `${presentation.title} finished in ${presentation.elapsedLabel}. Tap to open.`
              : `${presentation.title} working for ${presentation.elapsedLabel}. Tap to open, long press to dismiss.`
          }
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            selectDetail({
              name: "Thread",
              params: {
                environmentId: presentation.environmentId,
                threadId: presentation.threadId,
              },
            });
          }}
          onLongPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setTrackerState((prev) =>
              dismissDynamicIslandEntry(prev, presentation.key, presentation.runToken),
            );
          }}
          delayLongPress={380}
          style={({ pressed }) => [
            styles.capsule,
            isCompleted ? styles.capsuleCompleted : styles.capsuleWorking,
            pressed && styles.capsulePressed,
          ]}
        >
          {isCompleted ? (
            <View style={styles.doneBadge}>
              <Text style={styles.doneCheck}>✓</Text>
            </View>
          ) : (
            <AkenoWorkingIcon state="working" size={20} seed={presentation.key} />
          )}
          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.title}>
            {presentation.title}
          </Text>
          {presentation.extraWorkingCount > 0 ? (
            <View style={styles.extraPill}>
              <Text style={styles.extraPillText}>+{presentation.extraWorkingCount}</Text>
            </View>
          ) : null}
          <Text style={[styles.elapsed, isCompleted ? styles.elapsedDone : styles.elapsedWorking]}>
            {presentation.elapsedLabel}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 45,
  },
  capsule: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#09050D",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 5,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.42,
    shadowRadius: 12,
    elevation: 8,
  },
  capsuleWorking: {
    borderColor: "rgba(244, 63, 94, 0.48)",
    shadowColor: "#F43F5E",
  },
  capsuleCompleted: {
    borderColor: "rgba(52, 211, 153, 0.55)",
    shadowColor: "#34D399",
  },
  capsulePressed: {
    opacity: 0.88,
    transform: [{ scale: 0.97 }],
  },
  doneBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(52, 211, 153, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(52, 211, 153, 0.55)",
  },
  doneCheck: {
    color: "#34D399",
    fontSize: 11.5,
    fontWeight: "700",
    lineHeight: 13,
  },
  title: {
    maxWidth: 168,
    color: "#F8F5FA",
    fontSize: 12.5,
    fontWeight: "600",
    letterSpacing: -0.1,
  },
  extraPill: {
    borderRadius: 999,
    paddingHorizontal: 5.5,
    paddingVertical: 1,
    backgroundColor: "rgba(244, 63, 94, 0.22)",
    borderWidth: 1,
    borderColor: "rgba(244, 63, 94, 0.42)",
  },
  extraPillText: {
    color: "#FDA4AF",
    fontSize: 10.5,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  elapsed: {
    fontSize: 11.5,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  elapsedWorking: {
    color: "#FB7185",
  },
  elapsedDone: {
    color: "#34D399",
  },
});
