import { useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { useCallback, useMemo } from "react";

import {
  DEFAULT_QUICK_PROMPTS,
  recordShippedTurn,
  resolveCurrentDailyStats,
  toggleStarredMessage,
  type DailyActivityStats,
  type SavedQuickPrompt,
} from "../lib/riasEnhancements";
import { appAtomRegistry } from "./atom-registry";
import { mobilePreferencesAtom, saveMobilePreferences } from "./preferences";
import { useAtomCommand } from "./use-atom-command";
import { emitCompanionWhisper } from "../features/threads/activeThreadComposerBridge";

const EMPTY_STARRED_IDS: ReadonlyArray<string> = [];

export function useSavedQuickPrompts() {
  const preferencesResult = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomCommand(saveMobilePreferences);
  const stored = AsyncResult.isSuccess(preferencesResult)
    ? preferencesResult.value.savedQuickPrompts
    : undefined;
  const prompts = stored ?? DEFAULT_QUICK_PROMPTS;

  const addPrompt = useCallback(
    (entry: SavedQuickPrompt) => {
      const current = AsyncResult.isSuccess(appAtomRegistry.get(mobilePreferencesAtom))
        ? (appAtomRegistry.get(mobilePreferencesAtom) as AsyncResult.Success<any>).value
            .savedQuickPrompts ?? DEFAULT_QUICK_PROMPTS
        : DEFAULT_QUICK_PROMPTS;
      const deduped = current.filter(
        (item: SavedQuickPrompt) => item.prompt.trim() !== entry.prompt.trim(),
      );
      void savePreferences({ savedQuickPrompts: [entry, ...deduped].slice(0, 30) });
    },
    [savePreferences],
  );

  const removePrompt = useCallback(
    (id: string) => {
      const current = AsyncResult.isSuccess(appAtomRegistry.get(mobilePreferencesAtom))
        ? (appAtomRegistry.get(mobilePreferencesAtom) as AsyncResult.Success<any>).value
            .savedQuickPrompts ?? DEFAULT_QUICK_PROMPTS
        : DEFAULT_QUICK_PROMPTS;
      void savePreferences({
        savedQuickPrompts: current.filter((item: SavedQuickPrompt) => item.id !== id),
      });
    },
    [savePreferences],
  );

  return { prompts, addPrompt, removePrompt };
}

export function useStarredMessages(threadKey: string | null) {
  const preferencesResult = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomCommand(saveMobilePreferences);
  const starredMap = AsyncResult.isSuccess(preferencesResult)
    ? preferencesResult.value.starredMessagesByThread
    : undefined;

  const starredIds = useMemo(
    () => (threadKey ? (starredMap?.[threadKey] ?? EMPTY_STARRED_IDS) : EMPTY_STARRED_IDS),
    [starredMap, threadKey],
  );

  const starredSet = useMemo(() => new Set(starredIds), [starredIds]);

  const toggleStar = useCallback(
    (messageId: string): boolean => {
      if (!threadKey) return false;
      const currentResult = appAtomRegistry.get(mobilePreferencesAtom);
      const currentMap = AsyncResult.isSuccess(currentResult)
        ? currentResult.value.starredMessagesByThread
        : undefined;
      const { next, starred } = toggleStarredMessage(currentMap, threadKey, messageId);
      void savePreferences({ starredMessagesByThread: next });
      return starred;
    },
    [savePreferences, threadKey],
  );

  return { starredIds, starredSet, toggleStar };
}

export function useDailyActivityStats() {
  const preferencesResult = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomCommand(saveMobilePreferences);
  const rawStats: DailyActivityStats | undefined = AsyncResult.isSuccess(preferencesResult)
    ? preferencesResult.value.dailyActivityStats
    : undefined;

  const resolved = useMemo(() => resolveCurrentDailyStats(rawStats), [rawStats]);

  const recordTurn = useCallback(() => {
    const currentResult = appAtomRegistry.get(mobilePreferencesAtom);
    const currentStats = AsyncResult.isSuccess(currentResult)
      ? currentResult.value.dailyActivityStats
      : undefined;
    const { next, milestoneMessage } = recordShippedTurn(currentStats);
    void savePreferences({ dailyActivityStats: next });
    if (milestoneMessage) {
      emitCompanionWhisper(milestoneMessage);
    }
    return milestoneMessage;
  }, [savePreferences]);

  return { ...resolved, recordTurn };
}
