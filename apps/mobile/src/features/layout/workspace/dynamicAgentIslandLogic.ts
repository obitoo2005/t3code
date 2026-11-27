export const DYNAMIC_ISLAND_COMPLETION_HOLD_MS = 6_000;

const ACTIVE_RUNTIME_STATUSES: ReadonlySet<string> = new Set([
  "preparing",
  "queued",
  "starting",
  "running",
  "waiting",
]);

export interface DynamicIslandThreadInput {
  readonly key: string;
  readonly environmentId: string;
  readonly threadId: string;
  readonly title: string;
  readonly runtimeStatus: string | null | undefined;
  readonly activeRunId: string | null | undefined;
  readonly latestRunId: string | null | undefined;
  readonly startedAt: string | null | undefined;
  readonly updatedAt: string | null | undefined;
  readonly archivedAt: string | null | undefined;
  readonly deletedAt: string | null | undefined;
}

export interface RunningThreadSnapshot {
  readonly key: string;
  readonly environmentId: string;
  readonly threadId: string;
  readonly title: string;
  readonly runToken: string;
  readonly startedAtMs: number;
}

export interface CompletedThreadEntry {
  readonly key: string;
  readonly environmentId: string;
  readonly threadId: string;
  readonly title: string;
  readonly runToken: string;
  readonly startedAtMs: number;
  readonly completedAtMs: number;
  readonly expiresAtMs: number;
}

export interface DynamicIslandTrackerState {
  readonly previouslyRunning: ReadonlyMap<string, RunningThreadSnapshot>;
  readonly recentlyCompleted: ReadonlyMap<string, CompletedThreadEntry>;
  readonly dismissedRuns: ReadonlyMap<string, string>;
}

export interface DynamicIslandPresentation {
  readonly mode: "working" | "completed";
  readonly key: string;
  readonly environmentId: string;
  readonly threadId: string;
  readonly title: string;
  readonly runToken: string;
  readonly extraWorkingCount: number;
  readonly elapsedMs: number;
  readonly elapsedLabel: string;
  readonly nextExpiryMs: number | null;
}

export function createDynamicIslandTrackerState(): DynamicIslandTrackerState {
  return {
    previouslyRunning: new Map(),
    recentlyCompleted: new Map(),
    dismissedRuns: new Map(),
  };
}

export function isDynamicIslandThreadRunning(
  thread: Pick<DynamicIslandThreadInput, "runtimeStatus" | "archivedAt" | "deletedAt">,
): boolean {
  if (thread.archivedAt != null || thread.deletedAt != null) return false;
  return thread.runtimeStatus != null && ACTIVE_RUNTIME_STATUSES.has(thread.runtimeStatus);
}

export function runTokenForThread(
  thread: Pick<DynamicIslandThreadInput, "activeRunId" | "latestRunId" | "startedAt">,
): string {
  return thread.activeRunId ?? thread.latestRunId ?? thread.startedAt ?? "active";
}

export function formatIslandElapsed(elapsedMs: number): string {
  const totalSeconds = Number.isFinite(elapsedMs) ? Math.max(0, Math.floor(elapsedMs / 1000)) : 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
}

function parseTimestampMs(value: string | null | undefined): number | null {
  if (value == null || value.length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedTitle(title: string | null | undefined, fallback?: string): string {
  const trimmed = title?.trim();
  if (trimmed && trimmed.length > 0) return trimmed;
  const trimmedFallback = fallback?.trim();
  if (trimmedFallback && trimmedFallback.length > 0) return trimmedFallback;
  return "Session";
}

function sameRunningMaps(
  left: ReadonlyMap<string, RunningThreadSnapshot>,
  right: ReadonlyMap<string, RunningThreadSnapshot>,
): boolean {
  if (left.size !== right.size) return false;
  for (const [key, lVal] of left) {
    const rVal = right.get(key);
    if (
      rVal === undefined ||
      lVal.environmentId !== rVal.environmentId ||
      lVal.threadId !== rVal.threadId ||
      lVal.title !== rVal.title ||
      lVal.runToken !== rVal.runToken ||
      lVal.startedAtMs !== rVal.startedAtMs
    ) {
      return false;
    }
  }
  return true;
}

function sameCompletedMaps(
  left: ReadonlyMap<string, CompletedThreadEntry>,
  right: ReadonlyMap<string, CompletedThreadEntry>,
): boolean {
  if (left.size !== right.size) return false;
  for (const [key, lVal] of left) {
    const rVal = right.get(key);
    if (
      rVal === undefined ||
      lVal.title !== rVal.title ||
      lVal.runToken !== rVal.runToken ||
      lVal.completedAtMs !== rVal.completedAtMs ||
      lVal.expiresAtMs !== rVal.expiresAtMs
    ) {
      return false;
    }
  }
  return true;
}

function sameStringMaps(
  left: ReadonlyMap<string, string>,
  right: ReadonlyMap<string, string>,
): boolean {
  if (left.size !== right.size) return false;
  for (const [key, val] of left) {
    if (right.get(key) !== val) return false;
  }
  return true;
}

export function reconcileDynamicIslandState(
  prev: DynamicIslandTrackerState,
  input: {
    readonly threads: ReadonlyArray<DynamicIslandThreadInput>;
    readonly excludedThreadKeys?: ReadonlySet<string>;
    readonly nowMs: number;
    readonly completionHoldMs?: number;
  },
): DynamicIslandTrackerState {
  const holdMs = input.completionHoldMs ?? DYNAMIC_ISLAND_COMPLETION_HOLD_MS;
  const currentByKey = new Map<string, DynamicIslandThreadInput>();
  const nextRunning = new Map<string, RunningThreadSnapshot>();
  const nextCompleted = new Map<string, CompletedThreadEntry>();
  const nextDismissed = new Map<string, string>(prev.dismissedRuns);

  for (const [key, entry] of prev.recentlyCompleted) {
    if (entry.expiresAtMs > input.nowMs) {
      nextCompleted.set(key, entry);
    }
  }

  for (const thread of input.threads) {
    currentByKey.set(thread.key, thread);
    if (!isDynamicIslandThreadRunning(thread)) continue;

    const prevRunning = prev.previouslyRunning.get(thread.key);
    const runToken = runTokenForThread(thread);
    const parsedStart = parseTimestampMs(thread.startedAt);
    const startedAtMs =
      parsedStart ??
      (prevRunning && prevRunning.runToken === runToken
        ? prevRunning.startedAtMs
        : (parseTimestampMs(thread.updatedAt) ?? input.nowMs));

    nextRunning.set(thread.key, {
      key: thread.key,
      environmentId: thread.environmentId,
      threadId: thread.threadId,
      title: normalizedTitle(thread.title, prevRunning?.title),
      runToken,
      startedAtMs,
    });

    // A resumed or newly running thread clears any prior completion pill and stale dismissal.
    nextCompleted.delete(thread.key);
    const dismissedToken = nextDismissed.get(thread.key);
    if (dismissedToken !== undefined && dismissedToken !== runToken) {
      nextDismissed.delete(thread.key);
    }
  }

  // Detect running -> settled transitions for non-foreground background threads.
  for (const [key, prevSnap] of prev.previouslyRunning) {
    if (nextRunning.has(key)) continue;
    const current = currentByKey.get(key);
    if (!current || current.archivedAt != null || current.deletedAt != null) {
      nextCompleted.delete(key);
      continue;
    }
    if (input.excludedThreadKeys?.has(key)) {
      nextCompleted.delete(key);
      continue;
    }
    if (nextDismissed.get(key) === prevSnap.runToken) {
      continue;
    }
    nextCompleted.set(key, {
      key,
      environmentId: current.environmentId,
      threadId: current.threadId,
      title: normalizedTitle(current.title, prevSnap.title),
      runToken: prevSnap.runToken,
      startedAtMs: prevSnap.startedAtMs,
      completedAtMs: input.nowMs,
      expiresAtMs: input.nowMs + holdMs,
    });
  }

  // Drop completion hold if a thread disappeared or got archived/deleted.
  for (const key of [...nextCompleted.keys()]) {
    const current = currentByKey.get(key);
    if (!current || current.archivedAt != null || current.deletedAt != null) {
      nextCompleted.delete(key);
    }
  }

  if (
    sameRunningMaps(prev.previouslyRunning, nextRunning) &&
    sameCompletedMaps(prev.recentlyCompleted, nextCompleted) &&
    sameStringMaps(prev.dismissedRuns, nextDismissed)
  ) {
    return prev;
  }

  return {
    previouslyRunning: nextRunning,
    recentlyCompleted: nextCompleted,
    dismissedRuns: nextDismissed,
  };
}

export function dismissDynamicIslandEntry(
  state: DynamicIslandTrackerState,
  key: string,
  runToken: string,
): DynamicIslandTrackerState {
  const nextDismissed = new Map(state.dismissedRuns);
  nextDismissed.set(key, runToken);
  const nextCompleted = new Map(state.recentlyCompleted);
  nextCompleted.delete(key);
  return {
    previouslyRunning: state.previouslyRunning,
    recentlyCompleted: nextCompleted,
    dismissedRuns: nextDismissed,
  };
}

export function selectDynamicIslandPresentation(
  state: DynamicIslandTrackerState,
  input: {
    readonly excludedThreadKeys?: ReadonlySet<string>;
    readonly nowMs: number;
  },
): DynamicIslandPresentation | null {
  const visibleWorking: RunningThreadSnapshot[] = [];
  for (const snap of state.previouslyRunning.values()) {
    if (input.excludedThreadKeys?.has(snap.key)) continue;
    if (state.dismissedRuns.get(snap.key) === snap.runToken) continue;
    visibleWorking.push(snap);
  }

  if (visibleWorking.length > 0) {
    visibleWorking.sort((a, b) => b.startedAtMs - a.startedAtMs || a.key.localeCompare(b.key));
    const primary = visibleWorking[0]!;
    const elapsedMs = Math.max(0, input.nowMs - primary.startedAtMs);
    return {
      mode: "working",
      key: primary.key,
      environmentId: primary.environmentId,
      threadId: primary.threadId,
      title: primary.title,
      runToken: primary.runToken,
      extraWorkingCount: visibleWorking.length - 1,
      elapsedMs,
      elapsedLabel: formatIslandElapsed(elapsedMs),
      nextExpiryMs: null,
    };
  }

  const visibleCompleted: CompletedThreadEntry[] = [];
  for (const entry of state.recentlyCompleted.values()) {
    if (entry.expiresAtMs <= input.nowMs) continue;
    if (input.excludedThreadKeys?.has(entry.key)) continue;
    if (state.dismissedRuns.get(entry.key) === entry.runToken) continue;
    visibleCompleted.push(entry);
  }

  if (visibleCompleted.length > 0) {
    visibleCompleted.sort(
      (a, b) => b.completedAtMs - a.completedAtMs || a.key.localeCompare(b.key),
    );
    const primary = visibleCompleted[0]!;
    const elapsedMs = Math.max(0, primary.completedAtMs - primary.startedAtMs);
    return {
      mode: "completed",
      key: primary.key,
      environmentId: primary.environmentId,
      threadId: primary.threadId,
      title: primary.title,
      runToken: primary.runToken,
      extraWorkingCount: 0,
      elapsedMs,
      elapsedLabel: formatIslandElapsed(elapsedMs),
      nextExpiryMs: primary.expiresAtMs,
    };
  }

  return null;
}
