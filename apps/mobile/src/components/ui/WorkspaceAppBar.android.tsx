import { useGT } from "gt-react-native";
import type { MenuAction } from "@react-native-menu/menu";
import {
  createContext,
  use,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { View } from "react-native";

import { AndroidAnchoredMenu } from "./AndroidAnchoredMenu.android";
import { AndroidGlassSurface } from "./AndroidGlassSurface.android";
import { AndroidHeaderIconButton } from "./AndroidScreenHeader.android";
import { AppText } from "./AppText";
import { useAndroidControlSizing } from "./useAndroidControlSizing";
import { useToolbarLayout } from "./useToolbarLayout";

const GLASS_PILL_HEIGHT = 42;

export interface WorkspaceAppBarProps {
  readonly title: string;
  readonly titleContent?: ReactNode;
  readonly search?: {
    readonly accessibilityLabel: string;
    readonly active: boolean;
    readonly field: ReactNode;
    readonly onOpen: () => void;
    readonly onClose: () => void;
  };
  /** Stays trailing while searching, so it never moves and still narrows the results. */
  readonly filter?: {
    readonly accessibilityLabel: string;
    readonly customized: boolean;
    readonly actions: MenuAction[];
    readonly onSelect: (id: string) => void;
  };
}

function createWorkspaceAppBarStore() {
  let owner: object | null = null;
  let content: WorkspaceAppBarProps | null = null;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get: () => content,
    set: (nextOwner: object, next: WorkspaceAppBarProps) => {
      owner = nextOwner;
      content = next;
      emit();
    },
    clear: (previousOwner: object) => {
      if (owner !== previousOwner) return;
      owner = null;
      content = null;
      emit();
    },
  };
}

const WorkspaceAppBarStoreContext = createContext<ReturnType<
  typeof createWorkspaceAppBarStore
> | null>(null);

/**
 * Hosts one app bar above a set of workspace tab panes. Hidden panes lay out at zero size, so the
 * bar lives here and the visible tab projects its contents into it.
 */
export function WorkspaceAppBarScope(props: {
  readonly children: ReactNode;
  /** Off, panes draw their own bars; the children keep their place so toggling keeps their state. */
  readonly enabled?: boolean;
}) {
  const [store] = useState(createWorkspaceAppBarStore);
  const enabled = props.enabled ?? true;
  return (
    <WorkspaceAppBarStoreContext value={enabled ? store : null}>
      {enabled ? <WorkspaceAppBarHost /> : null}
      {props.children}
    </WorkspaceAppBarStoreContext>
  );
}

function WorkspaceAppBarHost() {
  const store = use(WorkspaceAppBarStoreContext)!;
  const content = useSyncExternalStore(store.subscribe, store.get, store.get);
  return <WorkspaceAppBarView {...(content ?? { title: "" })} />;
}

export function useHasWorkspaceAppBar() {
  return use(WorkspaceAppBarStoreContext) !== null;
}

/** Shows a tab's header in the enclosing scope's bar, or inline outside one. */
export function WorkspaceAppBar(props: WorkspaceAppBarProps) {
  const store = use(WorkspaceAppBarStoreContext);
  const [owner] = useState(() => ({}));
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- projects this tab's header into the out-of-tree workspace bar after every commit
  useLayoutEffect(() => {
    store?.set(owner, props);
  });
  // Hidden panes destroy their effects, so the tab leaving the screen releases the bar.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- releases the workspace bar when this tab hides or unmounts
  useLayoutEffect(() => (store ? () => store.clear(owner) : undefined), [store, owner]);
  return store ? null : <WorkspaceAppBarView {...props} />;
}

function WorkspaceAppBarView(props: WorkspaceAppBarProps) {
  const gt = useGT();
  const { search, filter } = props;
  const searching = search?.active === true;
  const { height, paddingTop, paddingBottom } = useToolbarLayout();
  const { scale } = useAndroidControlSizing();
  const pillHeight = Math.round(GLASS_PILL_HEIGHT * Math.min(scale, 1.15));

  const filterMenu = filter ? (
    <AndroidAnchoredMenu
      actions={filter.actions}
      onPressAction={({ nativeEvent }) => filter.onSelect(nativeEvent.event)}
    >
      {(open) => (
        <AndroidHeaderIconButton
          standalone={searching}
          accessibilityLabel={filter.accessibilityLabel}
          icon={
            filter.customized
              ? "line.3.horizontal.decrease.circle.fill"
              : "line.3.horizontal.decrease.circle"
          }
          selected={filter.customized}
          onPress={open}
        />
      )}
    </AndroidAnchoredMenu>
  ) : null;

  const hasActions = Boolean(search || filter);

  return (
    <View className="bg-screen" style={{ paddingTop, paddingBottom, paddingHorizontal: 14 }}>
      {searching ? (
        <View className="flex-row items-center gap-2" style={{ minHeight: height }}>
          <AndroidHeaderIconButton
            standalone
            accessibilityLabel={gt("Close search")}
            icon="chevron.left"
            onPress={search.onClose}
          />
          {search.field}
          {filterMenu}
        </View>
      ) : (
        <View className="flex-row items-center justify-between gap-3" style={{ minHeight: height }}>
          <View className="min-w-0 flex-1 justify-center pl-1">
            {props.titleContent ?? (
              <AppText textRole="title" numberOfLines={1} className="font-t3-bold text-foreground">
                {props.title}
              </AppText>
            )}
          </View>
          {hasActions ? (
            <AndroidGlassSurface
              radius={999}
              style={{
                minWidth: pillHeight,
                height: pillHeight,
                paddingHorizontal: 3,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {search ? (
                <AndroidHeaderIconButton
                  accessibilityLabel={search.accessibilityLabel}
                  icon="magnifyingglass"
                  onPress={search.onOpen}
                />
              ) : null}
              {filterMenu}
            </AndroidGlassSurface>
          ) : null}
        </View>
      )}
    </View>
  );
}
