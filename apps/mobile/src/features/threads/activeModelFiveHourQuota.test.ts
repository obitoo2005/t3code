import type { ModelSelection, ServerConfig, ServerProvider } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveActiveModelFiveHourQuota } from "./activeModelFiveHourQuota";

function makeProvider(
  overrides: Omit<Partial<ServerProvider>, "instanceId" | "driver"> & {
    readonly instanceId: string;
    readonly driver: string;
  },
): ServerProvider {
  return {
    enabled: true,
    installed: true,
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-11-25T20:00:00.000Z",
    models: [],
    slashCommands: [],
    skills: [],
    ...overrides,
  } as unknown as ServerProvider;
}

function makeSelection(instanceId: string, model: string): ModelSelection {
  return {
    instanceId: instanceId as ModelSelection["instanceId"],
    model,
  };
}

function makeConfig(providers: ServerProvider[]): ServerConfig {
  return {
    providers,
    usageLimitSources: [],
  } as unknown as ServerConfig;
}

const NOW = Date.parse("2026-11-25T20:30:00.000Z");

describe("resolveActiveModelFiveHourQuota", () => {
  it("picks the 5h session remaining percentage for Claude and Codex", () => {
    const config = makeConfig([
      makeProvider({
        instanceId: "claudeAgent",
        driver: "claudeAgent",
        usageLimits: {
          checkedAt: "2026-11-25T20:25:00.000Z",
          windows: [
            {
              id: "five_hour",
              kind: "session",
              label: "5-hour session",
              usedPercent: 25,
              windowDurationMins: 300,
              resetsAt: "2026-11-25T23:00:00.000Z",
            },
            {
              id: "seven_day",
              kind: "weekly",
              label: "Weekly",
              usedPercent: 60,
              windowDurationMins: 10080,
              resetsAt: "2026-11-30T23:00:00.000Z",
            },
          ],
        },
      }),
    ]);

    const result = resolveActiveModelFiveHourQuota({
      modelSelection: makeSelection("claudeAgent", "claude-opus-4-6"),
      serverConfig: config,
      now: NOW,
    });

    expect(result).toEqual({
      remainingPercent: 75,
      windowLabel: "5-hour session",
      resetsAt: "2026-11-25T23:00:00.000Z",
      isFiveHourWindow: true,
    });
  });

  it("matches Antigravity model-specific 5h pools (Gemini vs Claude/GPT)", () => {
    const config = makeConfig([
      makeProvider({
        instanceId: "antigravity",
        driver: "antigravity",
        usageLimits: {
          checkedAt: "2026-11-25T20:25:00.000Z",
          windows: [
            {
              id: "gemini-5h",
              kind: "session",
              label: "Gemini 5h",
              usedPercent: 18,
              windowDurationMins: 300,
              resetsAt: "2026-11-25T23:00:00.000Z",
            },
            {
              id: "3p-5h",
              kind: "session",
              label: "Claude / GPT 5h",
              usedPercent: 64,
              windowDurationMins: 300,
              resetsAt: "2026-11-25T22:00:00.000Z",
            },
          ],
        },
      }),
    ]);

    const gemini = resolveActiveModelFiveHourQuota({
      modelSelection: makeSelection("antigravity", "gemini-3-pro"),
      serverConfig: config,
      now: NOW,
    });
    const claude = resolveActiveModelFiveHourQuota({
      modelSelection: makeSelection("antigravity", "claude-sonnet-4-6"),
      serverConfig: config,
      now: NOW,
    });

    expect(gemini?.remainingPercent).toBe(82);
    expect(claude?.remainingPercent).toBe(36);
  });

  it("reports 100% when the 5h reset timestamp has already passed", () => {
    const config = makeConfig([
      makeProvider({
        instanceId: "codex",
        driver: "codex",
        usageLimits: {
          checkedAt: "2026-11-25T19:00:00.000Z",
          windows: [
            {
              id: "primary",
              kind: "session",
              label: "5h limit",
              usedPercent: 80,
              windowDurationMins: 300,
              resetsAt: "2026-11-25T20:00:00.000Z",
            },
          ],
        },
      }),
    ]);

    const result = resolveActiveModelFiveHourQuota({
      modelSelection: makeSelection("codex", "gpt-5.4"),
      serverConfig: config,
      now: NOW,
    });

    expect(result?.remainingPercent).toBe(100);
  });

  it("returns null when the provider has no usage limits", () => {
    const config = makeConfig([
      makeProvider({
        instanceId: "claudeAgent",
        driver: "claudeAgent",
      }),
    ]);

    const result = resolveActiveModelFiveHourQuota({
      modelSelection: makeSelection("claudeAgent", "claude-opus-4-6"),
      serverConfig: config,
      now: NOW,
    });

    expect(result).toBeNull();
  });
});
