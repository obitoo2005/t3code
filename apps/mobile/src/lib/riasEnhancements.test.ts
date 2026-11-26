import { describe, expect, it } from "vite-plus/test";

import {
  createShakeDetectorState,
  deriveQuickPromptTitle,
  evaluateShakeSample,
  formatQuotedCodeLines,
  getTimeOfDayGreeting,
  localDateKey,
  recordShippedTurn,
  resolveCurrentDailyStats,
  toggleStarredMessage,
  wrapShareCardLines,
} from "./riasEnhancements";

describe("riasEnhancements", () => {
  it("tracks daily turns, streaks, and milestones accurately", () => {
    const day1 = new Date(2026, 4, 10, 14, 0, 0);
    let stats = recordShippedTurn(undefined, day1).next;
    expect(stats).toEqual({
      date: "2026-05-10",
      turnsToday: 1,
      streakDays: 1,
      lastActiveDate: "2026-05-10",
      totalTurns: 1,
    });

    let milestone: number | null = null;
    for (let i = 0; i < 9; i += 1) {
      const result = recordShippedTurn(stats, day1);
      stats = result.next;
      milestone = result.milestone;
    }
    expect(stats.turnsToday).toBe(10);
    expect(stats.totalTurns).toBe(10);
    expect(milestone).toBe(10);

    // Consecutive day increments streak and resets turnsToday
    const day2 = new Date(2026, 4, 11, 9, 30, 0);
    const nextDay = recordShippedTurn(stats, day2);
    expect(nextDay.next.turnsToday).toBe(1);
    expect(nextDay.next.streakDays).toBe(2);
    expect(nextDay.next.totalTurns).toBe(11);

    // Skipped day resets streak back to 1
    const day4 = new Date(2026, 4, 13, 20, 0, 0);
    const afterGap = recordShippedTurn(nextDay.next, day4);
    expect(afterGap.next.streakDays).toBe(1);
    expect(afterGap.next.turnsToday).toBe(1);
    expect(afterGap.next.totalTurns).toBe(12);
  });

  it("resolves display stats across same day, next day, and stale dates", () => {
    const stats = {
      date: localDateKey(new Date(2026, 4, 10)),
      turnsToday: 7,
      streakDays: 4,
      lastActiveDate: localDateKey(new Date(2026, 4, 10)),
      totalTurns: 42,
    };
    expect(resolveCurrentDailyStats(stats, new Date(2026, 4, 10, 22, 0))).toEqual({
      turnsToday: 7,
      streakDays: 4,
      totalTurns: 42,
    });
    expect(resolveCurrentDailyStats(stats, new Date(2026, 4, 11, 8, 0))).toEqual({
      turnsToday: 0,
      streakDays: 4,
      totalTurns: 42,
    });
    expect(resolveCurrentDailyStats(stats, new Date(2026, 4, 15, 8, 0))).toEqual({
      turnsToday: 0,
      streakDays: 0,
      totalTurns: 42,
    });
  });

  it("returns distinct time-of-day greetings", () => {
    expect(getTimeOfDayGreeting(new Date(2026, 4, 10, 8, 0)).period).toBe("morning");
    expect(getTimeOfDayGreeting(new Date(2026, 4, 10, 14, 0)).period).toBe("afternoon");
    expect(getTimeOfDayGreeting(new Date(2026, 4, 10, 19, 0)).period).toBe("evening");
    expect(getTimeOfDayGreeting(new Date(2026, 4, 10, 2, 0)).period).toBe("night");
  });

  it("quotes selected line ranges cleanly with balanced backticks", () => {
    const code = ["const a = 1;", "const b = ```fence```;", "return a + b;"].join("\n");
    expect(formatQuotedCodeLines({ code, language: "ts", startLine: 2, endLine: 3 })).toBe(
      "Lines 2–3:\n````ts\nconst b = ```fence```;\nreturn a + b;\n````",
    );
    expect(formatQuotedCodeLines({ code, language: "ts", startLine: 1, endLine: 1 })).toBe(
      "Line 1:\n```ts\nconst a = 1;\n```",
    );
  });

  it("toggles starred messages per thread and cleans up empty threads", () => {
    const first = toggleStarredMessage(undefined, "env:t1", "m1");
    expect(first.starred).toBe(true);
    expect(first.next["env:t1"]).toEqual(["m1"]);

    const second = toggleStarredMessage(first.next, "env:t1", "m2");
    expect(second.next["env:t1"]).toEqual(["m1", "m2"]);

    const removed = toggleStarredMessage(second.next, "env:t1", "m1");
    expect(removed.starred).toBe(false);
    expect(removed.next["env:t1"]).toEqual(["m2"]);

    const emptied = toggleStarredMessage(removed.next, "env:t1", "m2");
    expect(emptied.next["env:t1"]).toBeUndefined();
  });

  it("derives clean quick prompt titles", () => {
    expect(deriveQuickPromptTitle("  Run vitest & fix failures  \nsecond line")).toBe(
      "Run vitest & fix failures",
    );
    expect(deriveQuickPromptTitle("a".repeat(40))).toHaveLength(28);
  });

  it("detects deliberate double-peak shakes and enforces cooldown", () => {
    let state = createShakeDetectorState();
    // Normal gravity resting sample does nothing
    const rest = evaluateShakeSample(state, { x: 0, y: 0, z: 1 }, 1000);
    expect(rest.triggered).toBe(false);
    state = rest.next;

    // First sharp peak arms detector
    const peak1 = evaluateShakeSample(state, { x: 2.6, y: 0, z: 0 }, 2000);
    expect(peak1.triggered).toBe(false);
    state = peak1.next;

    // Second sharp peak 200ms later triggers shuffle!
    const peak2 = evaluateShakeSample(state, { x: -2.7, y: 0.2, z: 0 }, 2200);
    expect(peak2.triggered).toBe(true);
    state = peak2.next;

    // Immediate follow-up peaks during 1800ms cooldown are ignored
    const cooled1 = evaluateShakeSample(state, { x: 3.0, y: 0, z: 0 }, 2500);
    const cooled2 = evaluateShakeSample(cooled1.next, { x: -3.0, y: 0, z: 0 }, 2700);
    expect(cooled2.triggered).toBe(false);
  });

  it("wraps long text cleanly for OLED share cards", () => {
    const lines = wrapShareCardLines("hello world this is a long line that wraps nicely", 16, 3);
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(lines[lines.length - 1]?.endsWith("…")).toBe(true);
  });
});
