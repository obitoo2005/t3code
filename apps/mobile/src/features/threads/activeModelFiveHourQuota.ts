import type {
  ModelSelection,
  ServerConfig,
  ServerProvider,
  ServerProviderUsageWindow,
  UsageLimitsReport,
} from "@t3tools/contracts";
import {
  antigravityWindowLimitsModel,
  collectProviderUsageLimits,
  remainingPercent,
} from "@t3tools/shared/usageLimits";

export interface ActiveModelFiveHourQuota {
  readonly remainingPercent: number;
  readonly windowLabel: string;
  readonly resetsAt: string | null;
  readonly isFiveHourWindow: boolean;
}

const FIVE_HOUR_PATTERN = /\b(5\s*h|5hr|five[_\s-]?hour)\b/i;

function normalizeModelSlug(model: string): string {
  return model.replace(/\[1m\]$/i, "").replace(/\([^)]*\)$/, "");
}

function windowMatchesModel(
  driver: ServerProvider["driver"],
  window: ServerProviderUsageWindow,
  model: string,
): boolean {
  const normalized = normalizeModelSlug(model);
  const baseSlug = normalized.slice(normalized.lastIndexOf("/") + 1);
  if (window.modelIds !== undefined) {
    const matches =
      window.modelIds.includes(model) ||
      window.modelIds.includes(normalized) ||
      window.modelIds.includes(baseSlug);
    if (!matches) return false;
  }
  if (window.providerIds !== undefined) {
    const prefix = model.split("/")[0] ?? "";
    if (!window.providerIds.includes(prefix)) return false;
  }
  if (driver === "antigravity") {
    return antigravityWindowLimitsModel(window, model);
  }
  if (driver === "opencode" && window.id.startsWith("go_")) {
    return model.startsWith("opencode-go/");
  }
  return true;
}

function isFiveHourSessionWindow(window: ServerProviderUsageWindow): boolean {
  if (window.kind === "session") {
    return (
      window.windowDurationMins === undefined ||
      (window.windowDurationMins >= 240 && window.windowDurationMins <= 360) ||
      FIVE_HOUR_PATTERN.test(window.id) ||
      FIVE_HOUR_PATTERN.test(window.label)
    );
  }
  return (
    (window.windowDurationMins !== undefined &&
      window.windowDurationMins >= 240 &&
      window.windowDurationMins <= 360) ||
    FIVE_HOUR_PATTERN.test(window.id) ||
    FIVE_HOUR_PATTERN.test(window.label)
  );
}

function pickBestWindowForModel(
  driver: ServerProvider["driver"],
  windows: readonly ServerProviderUsageWindow[],
  model: string,
): ServerProviderUsageWindow | null {
  const matching = windows.filter((window) => windowMatchesModel(driver, window, model));
  const pool = matching.length > 0 ? matching : windows;
  if (pool.length === 0) return null;

  if (driver === "cursor") {
    const preferredId = /^(auto|default|grok|composer)/i.test(model)
      ? "autoPercentUsed"
      : "apiPercentUsed";
    return (
      pool.find((window) => window.id === preferredId) ??
      pool.find((window) => window.id === "totalPercentUsed") ??
      pool[0]!
    );
  }

  return (
    pool.find((window) => window.kind === "session" && isFiveHourSessionWindow(window)) ??
    pool.find((window) => window.kind === "session") ??
    pool.find((window) => isFiveHourSessionWindow(window)) ??
    pool.find(
      (window) => window.windowDurationMins !== undefined && window.windowDurationMins <= 360,
    ) ??
    pool[0]!
  );
}

function effectiveRemainingPercent(
  window: ServerProviderUsageWindow,
  checkedAt: string,
  now: number,
): number {
  const resetsAtMs = window.resetsAt ? Date.parse(window.resetsAt) : NaN;
  const checkedAtMs = Date.parse(checkedAt);
  if (
    Number.isFinite(resetsAtMs) &&
    Number.isFinite(checkedAtMs) &&
    resetsAtMs > checkedAtMs &&
    resetsAtMs <= now
  ) {
    return 100;
  }
  return remainingPercent(window);
}

function resolveFromAccount(
  account: UsageLimitsReport["accounts"][number],
  model: string,
  now: number,
): ActiveModelFiveHourQuota | null {
  if (account.limits.unavailable || account.limits.windows.length === 0) return null;
  const chosen = pickBestWindowForModel(account.driver, account.limits.windows, model);
  if (!chosen) return null;
  return {
    remainingPercent: effectiveRemainingPercent(chosen, account.limits.checkedAt, now),
    windowLabel: chosen.label,
    resetsAt: chosen.resetsAt ?? null,
    isFiveHourWindow: chosen.kind === "session" || isFiveHourSessionWindow(chosen),
  };
}

/**
 * Resolves the live 5-hour (session) remaining quota percentage for the currently selected
 * provider instance and model in the chat composer, supporting Claude, Codex, Antigravity
 * (per-model pools), Cursor, OpenCode, and CLI Proxy hub accounts.
 */
export function resolveActiveModelFiveHourQuota(input: {
  readonly modelSelection: ModelSelection;
  readonly serverConfig: ServerConfig | null;
  readonly now: number;
}): ActiveModelFiveHourQuota | null {
  const { modelSelection, serverConfig, now } = input;
  if (!serverConfig) return null;

  const report = collectProviderUsageLimits(
    modelSelection.instanceId,
    serverConfig.providers,
    serverConfig.usageLimitSources ?? [],
    now,
    modelSelection.model,
  );
  if (!report || report.accounts.length === 0) return null;

  const directMatch = report.accounts.find(
    (account) =>
      account.instanceId === modelSelection.instanceId &&
      !account.limits.unavailable &&
      account.limits.windows.length > 0,
  );
  if (directMatch) {
    const resolved = resolveFromAccount(directMatch, modelSelection.model, now);
    if (resolved) return resolved;
  }

  const resolvedAccounts = report.accounts
    .map((account) => resolveFromAccount(account, modelSelection.model, now))
    .filter((entry): entry is ActiveModelFiveHourQuota => entry !== null);
  if (resolvedAccounts.length === 0) return null;

  const meanRemaining = Math.round(
    resolvedAccounts.reduce((sum, entry) => sum + entry.remainingPercent, 0) /
      resolvedAccounts.length,
  );
  const first = resolvedAccounts[0]!;
  return {
    remainingPercent: meanRemaining,
    windowLabel: first.windowLabel,
    resetsAt: first.resetsAt,
    isFiveHourWindow: resolvedAccounts.some((entry) => entry.isFiveHourWindow),
  };
}
