import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import type { MessageId, ScopedThreadRef } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";
import { useGT, useMessages } from "gt-react-native";
import { Platform } from "react-native";

import { AppBar } from "../../components/ui/AppBar";
import type { AppBarAction, AppBarMenu } from "../../components/ui/AppBar.types";
import { scopedThreadKey } from "../../lib/scopedEntities";
import type { ThreadFeedEntry } from "../../lib/threadActivity";
import { environmentThreadShells } from "../../state/threads";
import { useStarredMessages } from "../../state/use-rias-enhancements";
import {
  useAdaptiveWorkspaceLayout,
  useWorkspacePaneState,
} from "../layout/AdaptiveWorkspaceLayout";
import type { ThreadInspectorMode } from "./thread-inspector-navigation";
import { useWorkspaceBackNavigation } from "../layout/workspace/useAndroidWorkspaceNavigation";
import {
  threadTerminalMenu,
  useThreadGitMenuDefinition,
  type ThreadGitControlsProps,
} from "./ThreadGitControls";
import { requestThreadMessageJump } from "./threadMessageJump";
import { useOpenLinkedThread } from "./useOpenLinkedThread";

const EMPTY_SIDE_CHATS_ATOM = Atom.make<ReadonlyArray<EnvironmentThreadShell>>([]).pipe(
  Atom.withLabel("mobile:header-side-chats:empty"),
);

export function ThreadHeader(props: {
  readonly title: string;
  readonly subtitle: string;
  readonly threadRef?: ScopedThreadRef;
  readonly gitControls: ThreadGitControlsProps;
  readonly onReturnToThread?: () => void;
  readonly draft?: boolean;
  readonly hasThreadCwd: boolean;
  readonly inspectorMode: ThreadInspectorMode | null;
  readonly onOpenFilesInspector: () => void;
  readonly feed?: ReadonlyArray<ThreadFeedEntry>;
}) {
  const gt = useGT();
  const m = useMessages();
  const goBack = useWorkspaceBackNavigation();
  const openLinkedThread = useOpenLinkedThread();
  const { toggleAuxiliaryPane, startNewTask } = useAdaptiveWorkspaceLayout();
  const { panes } = useWorkspacePaneState();
  const threadKey =
    props.threadRef && !props.draft
      ? scopedThreadKey(props.threadRef.environmentId, props.threadRef.threadId)
      : null;
  const { starredIds } = useStarredMessages(threadKey);
  const sideChats = useAtomValue(
    Platform.OS === "android" && !props.draft && props.threadRef
      ? environmentThreadShells.sideChatsAtom(props.threadRef)
      : EMPTY_SIDE_CHATS_ATOM,
  );
  const gitMenu = useThreadGitMenuDefinition(props.gitControls);
  const terminalMenu = threadTerminalMenu(props.gitControls, m);
  const starredMenu: AppBarMenu | null =
    Platform.OS === "android" && threadKey && starredIds.length > 0
      ? {
          title: gt("Starred messages"),
          status:
            starredIds.length === 1
              ? gt("1 starred message")
              : gt("{count} starred messages", { count: starredIds.length }),
          icon: "star.fill",
          badgeCount: starredIds.length,
          badgeTone: "accent",
          separateBackground: false,
          items: starredIds.map((messageId, index) => {
            const match = props.feed?.find(
              (entry) => entry.type === "message" && entry.message.id === messageId,
            );
            const message = match?.type === "message" ? match.message : null;
            const rolePrefix = message?.role === "user" ? gt("You") : gt("AI");
            const snippet = message?.text
              ? message.text.replace(/\s+/g, " ").trim().slice(0, 56)
              : gt("Saved message #{index}", { index: index + 1 });
            return {
              id: `starred:${messageId}`,
              title: snippet || gt("Saved message #{index}", { index: index + 1 }),
              subtitle: rolePrefix,
              icon: "star.fill",
              iconColor: "#F43F5E",
              onPress: () => requestThreadMessageJump(threadKey, messageId as MessageId),
            };
          }),
        }
      : null;
  const sideChatsMenu: AppBarMenu | null =
    Platform.OS === "android" && !props.draft && props.threadRef && sideChats.length > 0
      ? (() => {
          const environmentId = props.threadRef.environmentId;
          const hasApproval = sideChats.some(
            (sideChat) =>
              sideChat.hasPendingApprovals || sideChat.pendingSubagentRequest === "approval",
          );
          const hasInput = sideChats.some(
            (sideChat) =>
              sideChat.hasPendingUserInput || Boolean(sideChat.pendingSubagentRequest),
          );
          return {
            title: gt("Side chats"),
            status:
              sideChats.length === 1
                ? gt("1 side chat")
                : gt("{count} side chats", { count: sideChats.length }),
            icon: "bubble.left.and.bubble.right",
            badgeCount: sideChats.length,
            badgeTone: hasApproval ? "warning" : hasInput ? "accent" : "default",
            separateBackground: false,
            items: sideChats.map((sideChat) => {
              const needs =
                sideChat.hasPendingApprovals || sideChat.pendingSubagentRequest === "approval"
                  ? "approval"
                  : sideChat.hasPendingUserInput || sideChat.pendingSubagentRequest
                    ? "input"
                    : null;
              return {
                id: `side-chat:${sideChat.id}`,
                title: sideChat.title,
                subtitle:
                  needs === "approval"
                    ? gt("Needs approval")
                    : needs === "input"
                      ? gt("Needs input")
                      : undefined,
                icon:
                  needs === "approval"
                    ? "exclamationmark.circle"
                    : "bubble.left.and.bubble.right",
                iconColor:
                  needs === "approval" ? "#F59E0B" : needs === "input" ? "#818CF8" : undefined,
                onPress: () => openLinkedThread({ environmentId, threadId: sideChat.id }),
              };
            }),
          };
        })()
      : null;

  const filesVisible = props.inspectorMode === "files" && panes.auxiliaryPaneVisible;
  const actions: AppBarAction[] = props.hasThreadCwd
    ? [
        {
          accessibilityLabel: filesVisible ? gt("Close files") : gt("Open files"),
          icon: "folder",
          selected: filesVisible,
          disabled: !props.gitControls.canOpenFiles,
          separateBackground: false,
          onPress: filesVisible ? toggleAuxiliaryPane : props.onOpenFilesInspector,
        },
      ]
    : [];
  const menus = [starredMenu, sideChatsMenu, gitMenu, terminalMenu].filter(
    (menu): menu is AppBarMenu => menu !== null,
  );

  return (
    <AppBar
      title={props.title}
      subtitle={props.subtitle}
      onBackToList={goBack}
      onCompose={props.draft ? undefined : startNewTask}
      backInSplitView={
        props.onReturnToThread
          ? {
              accessibilityLabel: gt("Return to chat"),
              icon: "chevron.left",
              onPress: props.onReturnToThread,
            }
          : undefined
      }
      actions={actions}
      menus={menus}
      hideBottomBorder
    />
  );
}
