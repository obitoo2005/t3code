import { describe, expect, it } from "vite-plus/test";

import {
  createDynamicIslandTrackerState,
  dismissDynamicIslandEntry,
  DYNAMIC_ISLAND_COMPLETION_HOLD_MS,
  formatIslandElapsed,
  isDynamicIslandThreadRunning,
  reconcileDynamicIslandState,
  selectDynamicIslandPresentation,
  type DynamicIslandThreadInput,
} from "./dynamicAgentIslandLogic";

function makeThread(
  overrides: Partial<DynamicIslandThreadInput> & { readonly threadId: string },
): DynamicIslandThreadInput {
  const environmentId = overrides.environmentId ?? "env-1";
  return {
    key: `${environmentId}:${overrides.threadId}`,
    environmentId,
    threadId: overrides.threadId,
    title: overrides.title ?? `Thread ${overrides.threadId}`,
    runtimeStatus: overrides.runtimeStatus ?? "completed",
    activeRunId: overrides.activeRunId ?? null,
    latestRunId: overrides.latestRunId ?? "run-1",
    startedAt: overrides.startedAt ?? null,
    updatedAt: overrides.updatedAt ?? "2026-11-28T00:00:00.000Z",
    archivedAt: overrides.archivedAt ?? null,
    deletedAt: overrides.deletedAt ?? null,
  };
}

describe("dynamicAgentIslandLogic", () => {
  describe("formatIslandElapsed", () => {
    it("formats elapsed durations as m:ss with zero-padded seconds", () => {
      expect(formatIslandElapsed(0)).toBe("0:00");
      expect(formatIslandElapsed(999)).toBe("0:00");
      expect(formatIslandElapsed(9_000)).toBe("0:09");
      expect(formatIslandElapsed(65_400)).toBe("1:05");
      expect(formatIslandElapsed(754_000)).toBe("12:34");
    });

    it("clamps negative and non-finite inputs to 0:00", () => {
      expect(formatIslandElapsed(-5_000)).toBe("0:00");
      expect(formatIslandElapsed(Number.NaN)).toBe("0:00");
      expect(formatIslandElapsed(Number.POSITIVE_INFINITY)).toBe("0:00");
    });
  });

  describe("isDynamicIslandThreadRunning", () => {
    it("matches active runtime statuses and excludes settled, archived, or deleted threads", () => {
      for (const status of ["preparing", "queued", "starting", "running", "waiting"]) {
        expect(
          isDynamicIslandThreadRunning({
            runtimeStatus: status,
            archivedAt: null,
            deletedAt: null,
          }),
        ).toBe(true);
      }

      for (const status of ["completed", "failed", "interrupted", "cancelled", "idle", null]) {
        expect(
          isDynamicIslandThreadRunning({
            runtimeStatus: status,
            archivedAt: null,
            deletedAt: null,
          }),
        ).toBe(false);
      }

      expect(
        isDynamicIslandThreadRunning({
          runtimeStatus: "running",
          archivedAt: "2026-11-28T00:00:00.000Z",
          deletedAt: null,
        }),
      ).toBe(false);
      expect(
        isDynamicIslandThreadRunning({
          runtimeStatus: "running",
          archivedAt: null,
          deletedAt: "2026-11-28T00:00:00.000Z",
        }),
      ).toBe(false);
    });
  });

  describe("selection, exclusions, completion hold, and dismissal", () => {
    it("returns null when no threads are running", () => {
      const nowMs = Date.parse("2026-11-28T00:01:00.000Z");
      const state = reconcileDynamicIslandState(createDynamicIslandTrackerState(), {
        threads: [makeThread({ threadId: "t1", runtimeStatus: "completed" })],
        nowMs,
      });
      expect(selectDynamicIslandPresentation(state, { nowMs })).toBeNull();
    });

    it("picks the newest active working thread, reports +N extras, and excludes foreground threads", () => {
      const t1Start = "2026-11-28T00:00:00.000Z";
      const t2Start = "2026-11-28T00:00:35.000Z";
      const nowMs = Date.parse("2026-11-28T00:01:05.000Z");

      const state = reconcileDynamicIslandState(createDynamicIslandTrackerState(), {
        threads: [
          makeThread({
            threadId: "t1",
            title: "Older task",
            runtimeStatus: "running",
            activeRunId: "run-a",
            startedAt: t1Start,
          }),
          makeThread({
            threadId: "t2",
            title: "Newer task",
            runtimeStatus: "starting",
            activeRunId: "run-b",
            startedAt: t2Start,
          }),
        ],
        nowMs,
      });

      const presentation = selectDynamicIslandPresentation(state, { nowMs });
      expect(presentation).toMatchObject({
        mode: "working",
        threadId: "t2",
        title: "Newer task",
        extraWorkingCount: 1,
        elapsedLabel: "0:30",
        nextExpiryMs: null,
      });

      const excludingNewer = selectDynamicIslandPresentation(state, {
        excludedThreadKeys: new Set(["env-1:t2"]),
        nowMs,
      });
      expect(excludingNewer).toMatchObject({
        mode: "working",
        threadId: "t1",
        title: "Older task",
        extraWorkingCount: 0,
        elapsedLabel: "1:05",
      });

      const excludingAll = selectDynamicIslandPresentation(state, {
        excludedThreadKeys: new Set(["env-1:t1", "env-1:t2"]),
        nowMs,
      });
      expect(excludingAll).toBeNull();
    });

    it("holds a running -> settled transition for 6000ms with frozen elapsed time, then expires", () => {
      const startMs = Date.parse("2026-11-28T00:00:00.000Z");
      const finishMs = startMs + 42_000;

      const workingState = reconcileDynamicIslandState(createDynamicIslandTrackerState(), {
        threads: [
          makeThread({
            threadId: "t1",
            title: "Build Android APK",
            runtimeStatus: "running",
            activeRunId: "run-42",
            startedAt: new Date(startMs).toISOString(),
          }),
        ],
        nowMs: startMs + 10_000,
      });

      const settledState = reconcileDynamicIslandState(workingState, {
        threads: [
          makeThread({
            threadId: "t1",
            title: "Build Android APK",
            runtimeStatus: "completed",
            activeRunId: null,
            latestRunId: "run-42",
          }),
        ],
        nowMs: finishMs,
      });

      const duringHold = selectDynamicIslandPresentation(settledState, {
        nowMs: finishMs + 3_000,
      });
      expect(duringHold).toMatchObject({
        mode: "completed",
        threadId: "t1",
        title: "Build Android APK",
        extraWorkingCount: 0,
        elapsedLabel: "0:42",
        nextExpiryMs: finishMs + DYNAMIC_ISLAND_COMPLETION_HOLD_MS,
      });

      const afterExpiry = selectDynamicIslandPresentation(settledState, {
        nowMs: finishMs + DYNAMIC_ISLAND_COMPLETION_HOLD_MS,
      });
      expect(afterExpiry).toBeNull();
    });

    it("does not trigger a completion hold when a thread finishes while excluded in the foreground", () => {
      const startMs = Date.parse("2026-11-28T00:00:00.000Z");
      const workingState = reconcileDynamicIslandState(createDynamicIslandTrackerState(), {
        threads: [
          makeThread({
            threadId: "t1",
            runtimeStatus: "running",
            activeRunId: "run-1",
            startedAt: new Date(startMs).toISOString(),
          }),
        ],
        nowMs: startMs + 5_000,
      });

      const settledWhileVisible = reconcileDynamicIslandState(workingState, {
        threads: [makeThread({ threadId: "t1", runtimeStatus: "completed", activeRunId: null })],
        excludedThreadKeys: new Set(["env-1:t1"]),
        nowMs: startMs + 15_000,
      });

      expect(
        selectDynamicIslandPresentation(settledWhileVisible, { nowMs: startMs + 16_000 }),
      ).toBeNull();
    });

    it("dismisses a thread for its current run only and re-shows it when a new run starts", () => {
      const startMs = Date.parse("2026-11-28T00:00:00.000Z");
      const workingState = reconcileDynamicIslandState(createDynamicIslandTrackerState(), {
        threads: [
          makeThread({
            threadId: "t1",
            runtimeStatus: "running",
            activeRunId: "run-1",
            startedAt: new Date(startMs).toISOString(),
          }),
        ],
        nowMs: startMs + 5_000,
      });

      const shown = selectDynamicIslandPresentation(workingState, { nowMs: startMs + 5_000 });
      expect(shown?.runToken).toBe("run-1");

      const dismissed = dismissDynamicIslandEntry(workingState, shown!.key, shown!.runToken);
      expect(selectDynamicIslandPresentation(dismissed, { nowMs: startMs + 6_000 })).toBeNull();

      // Same run settling should also stay dismissed.
      const settledSameRun = reconcileDynamicIslandState(dismissed, {
        threads: [
          makeThread({
            threadId: "t1",
            runtimeStatus: "completed",
            activeRunId: null,
            latestRunId: "run-1",
          }),
        ],
        nowMs: startMs + 8_000,
      });
      expect(
        selectDynamicIslandPresentation(settledSameRun, { nowMs: startMs + 9_000 }),
      ).toBeNull();

      // A brand-new run on the same thread clears dismissal and shows again.
      const newRunStartMs = startMs + 20_000;
      const newRunState = reconcileDynamicIslandState(settledSameRun, {
        threads: [
          makeThread({
            threadId: "t1",
            runtimeStatus: "running",
            activeRunId: "run-2",
            latestRunId: "run-2",
            startedAt: new Date(newRunStartMs).toISOString(),
          }),
        ],
        nowMs: newRunStartMs + 4_000,
      });
      expect(
        selectDynamicIslandPresentation(newRunState, { nowMs: newRunStartMs + 4_000 }),
      ).toMatchObject({
        mode: "working",
        threadId: "t1",
        runToken: "run-2",
        elapsedLabel: "0:04",
      });
    });
  });
});
