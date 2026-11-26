export interface SavedQuickPrompt {
  readonly id: string;
  readonly title: string;
  readonly prompt: string;
}

export interface DailyActivityStats {
  readonly date: string;
  readonly turnsToday: number;
  readonly streakDays: number;
  readonly lastActiveDate: string;
  readonly totalTurns: number;
}

export const DEFAULT_QUICK_PROMPTS: ReadonlyArray<SavedQuickPrompt> = [
  {
    id: "builtin-fix-test",
    title: "Fix & verify",
    prompt: "Find the root cause, fix it cleanly, and run typecheck + tests to verify.",
  },
  {
    id: "builtin-review-diff",
    title: "Review diff",
    prompt: "Review my current git diff for bugs, edge cases, and regressions before committing.",
  },
  {
    id: "builtin-explain-simply",
    title: "Explain simply",
    prompt: "Explain how this works step by step in plain English with key file paths.",
  },
  {
    id: "builtin-commit-push",
    title: "Commit & push",
    prompt: "Check git status and diff, write a clear commit message, commit, and push.",
  },
];

export const DAILY_MILESTONES = [10, 25, 50, 100] as const;

export function localDateKey(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function previousDateKey(dateKey: string): string {
  const parts = dateKey.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return "";
  const date = new Date(parts[0]!, parts[1]! - 1, parts[2]!);
  date.setDate(date.getDate() - 1);
  return localDateKey(date);
}

export function milestoneWhisperForCount(turnsToday: number): string | null {
  switch (turnsToday) {
    case 10:
      return "10 prompts today! Warming up~ ✦";
    case 25:
      return "25 prompts shipped today! On fire~ ♥";
    case 50:
      return "50 prompts today?! Unstoppable ✨";
    case 100:
      return "100 prompts in a day! Legendary 💜";
    default:
      return null;
  }
}

export function recordShippedTurn(
  current: DailyActivityStats | undefined,
  now: Date = new Date(),
): {
  readonly next: DailyActivityStats;
  readonly milestone: number | null;
  readonly milestoneMessage: string | null;
} {
  const today = localDateKey(now);
  const yesterday = previousDateKey(today);

  let turnsToday = 1;
  let streakDays = 1;
  let totalTurns = 1;

  if (current) {
    totalTurns = Math.max(0, Math.floor(current.totalTurns)) + 1;
    if (current.date === today) {
      turnsToday = Math.max(0, Math.floor(current.turnsToday)) + 1;
      streakDays = Math.max(1, Math.floor(current.streakDays));
    } else if (current.lastActiveDate === yesterday || current.date === yesterday) {
      turnsToday = 1;
      streakDays = Math.max(1, Math.floor(current.streakDays)) + 1;
    } else {
      turnsToday = 1;
      streakDays = 1;
    }
  }

  const next: DailyActivityStats = {
    date: today,
    turnsToday,
    streakDays,
    lastActiveDate: today,
    totalTurns,
  };
  const milestoneMessage = milestoneWhisperForCount(turnsToday);
  return {
    next,
    milestone: milestoneMessage ? turnsToday : null,
    milestoneMessage,
  };
}

export function resolveCurrentDailyStats(
  current: DailyActivityStats | undefined,
  now: Date = new Date(),
): {
  readonly turnsToday: number;
  readonly streakDays: number;
  readonly totalTurns: number;
} {
  if (!current) {
    return { turnsToday: 0, streakDays: 0, totalTurns: 0 };
  }
  const today = localDateKey(now);
  const yesterday = previousDateKey(today);
  const totalTurns = Math.max(0, Math.floor(current.totalTurns));

  if (current.date === today) {
    return {
      turnsToday: Math.max(0, Math.floor(current.turnsToday)),
      streakDays: Math.max(1, Math.floor(current.streakDays)),
      totalTurns,
    };
  }
  if (current.lastActiveDate === yesterday || current.date === yesterday) {
    return {
      turnsToday: 0,
      streakDays: Math.max(1, Math.floor(current.streakDays)),
      totalTurns,
    };
  }
  return {
    turnsToday: 0,
    streakDays: 0,
    totalTurns,
  };
}

export interface TimeOfDayGreeting {
  readonly period: "morning" | "afternoon" | "evening" | "night";
  readonly headline: string;
  readonly subline: string;
}

export function getTimeOfDayGreeting(now: Date = new Date()): TimeOfDayGreeting {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) {
    return {
      period: "morning",
      headline: "Morning grind ✦",
      subline: "Fresh start, clean commits",
    };
  }
  if (hour >= 12 && hour < 17) {
    return {
      period: "afternoon",
      headline: "Afternoon shipping ♥",
      subline: "Ready to knock out the next build",
    };
  }
  if (hour >= 17 && hour < 22) {
    return {
      period: "evening",
      headline: "Evening flow ✨",
      subline: "Golden hour coding session",
    };
  }
  return {
    period: "night",
    headline: "Late-night build squad 🌙",
    subline: "Pure OLED vibes — don't forget to rest",
  };
}

export function formatQuotedCodeLines(input: {
  readonly code: string;
  readonly language: string;
  readonly startLine: number;
  readonly endLine: number;
}): string {
  const lines = input.code.replace(/\r\n/g, "\n").split("\n");
  const maxLine = Math.max(1, lines.length);
  const start = Math.max(1, Math.min(maxLine, Math.min(input.startLine, input.endLine)));
  const end = Math.max(start, Math.min(maxLine, Math.max(input.startLine, input.endLine)));
  const excerpt = lines.slice(start - 1, end).join("\n");
  const lang = input.language.trim().toLowerCase();
  const label = start === end ? `Line ${start}:` : `Lines ${start}–${end}:`;
  let longestRun = 0;
  for (const [run] of excerpt.matchAll(/`+/g)) {
    longestRun = Math.max(longestRun, run.length);
  }
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return `${label}\n${fence}${lang}\n${excerpt}\n${fence}`;
}

const MAX_STARRED_PER_THREAD = 50;
const MAX_STARRED_THREADS = 200;

export function toggleStarredMessage(
  current: Readonly<Record<string, ReadonlyArray<string>>> | undefined,
  threadKey: string,
  messageId: string,
): {
  readonly next: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly starred: boolean;
} {
  const map: Record<string, ReadonlyArray<string>> = { ...(current ?? {}) };
  const existing = map[threadKey] ?? [];
  const hasMessage = existing.includes(messageId);

  if (hasMessage) {
    const filtered = existing.filter((id) => id !== messageId);
    if (filtered.length === 0) {
      delete map[threadKey];
    } else {
      map[threadKey] = filtered;
    }
    return { next: map, starred: false };
  }

  const updated = [...existing, messageId].slice(-MAX_STARRED_PER_THREAD);
  map[threadKey] = updated;

  const keys = Object.keys(map);
  if (keys.length > MAX_STARRED_THREADS) {
    for (const staleKey of keys.slice(0, keys.length - MAX_STARRED_THREADS)) {
      if (staleKey !== threadKey) delete map[staleKey];
    }
  }
  return { next: map, starred: true };
}

export function deriveQuickPromptTitle(prompt: string): string {
  const firstLine = prompt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return "Quick prompt";
  const compact = firstLine.replace(/\s+/g, " ");
  return compact.length <= 28 ? compact : `${compact.slice(0, 27).trimEnd()}…`;
}

export interface ShakeDetectorState {
  readonly peakTimes: ReadonlyArray<number>;
  readonly lastTriggerAt: number;
}

export function createShakeDetectorState(): ShakeDetectorState {
  return { peakTimes: [], lastTriggerAt: 0 };
}

/**
 * Requires two sharp acceleration spikes (> 1.35g delta from 1g gravity) within 650ms
 * and enforces an 1800ms cooldown so everyday walking or pocket movement never misfires.
 */
export function evaluateShakeSample(
  state: ShakeDetectorState,
  sample: { readonly x: number; readonly y: number; readonly z: number },
  nowMs: number,
): { readonly next: ShakeDetectorState; readonly triggered: boolean } {
  const magnitude = Math.sqrt(sample.x * sample.x + sample.y * sample.y + sample.z * sample.z);
  const deltaFromGravity = Math.abs(magnitude - 1);
  if (deltaFromGravity < 1.35) {
    return { next: state, triggered: false };
  }
  if (nowMs - state.lastTriggerAt < 1800) {
    return { next: state, triggered: false };
  }
  const recentPeaks = state.peakTimes.filter((time) => nowMs - time <= 650);
  const lastPeak = recentPeaks[recentPeaks.length - 1] ?? 0;
  if (nowMs - lastPeak < 90) {
    return { next: { ...state, peakTimes: recentPeaks }, triggered: false };
  }
  const nextPeaks = [...recentPeaks, nowMs];
  if (nextPeaks.length >= 2) {
    return {
      next: { peakTimes: [], lastTriggerAt: nowMs },
      triggered: true,
    };
  }
  return {
    next: { ...state, peakTimes: nextPeaks },
    triggered: false,
  };
}

export function wrapShareCardLines(
  text: string,
  maxCharsPerLine: number,
  maxLines: number,
): ReadonlyArray<string> {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [""];
  const rawLines = normalized.split("\n");
  const out: string[] = [];

  for (const rawLine of rawLines) {
    if (out.length >= maxLines) break;
    if (rawLine.length === 0) {
      out.push("");
      continue;
    }
    let remaining = rawLine;
    while (remaining.length > maxCharsPerLine && out.length < maxLines) {
      let splitAt = remaining.lastIndexOf(" ", maxCharsPerLine);
      if (splitAt < Math.floor(maxCharsPerLine * 0.4)) {
        splitAt = maxCharsPerLine;
      }
      out.push(remaining.slice(0, splitAt).trimEnd());
      remaining = remaining.slice(splitAt).trimStart();
    }
    if (out.length < maxLines) {
      out.push(remaining);
    }
  }

  if (out.length === maxLines && rawLines.join("\n").length > out.join("\n").length) {
    const last = out[maxLines - 1] ?? "";
    out[maxLines - 1] =
      last.length >= maxCharsPerLine - 1
        ? `${last.slice(0, Math.max(1, maxCharsPerLine - 1))}…`
        : `${last}…`;
  }
  return out;
}
