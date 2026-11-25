import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Platform, View } from "react-native";

import { AndroidOverlayHeaderContext } from "../../components/ui/AndroidBlurTargetContext";
import { ScreenContent } from "../../components/ui/ScreenContent";
import { ThreadDetailScreen, type ThreadDetailScreenProps } from "./ThreadDetailScreen";

type ThreadScreenContent =
  | { readonly props: ThreadDetailScreenProps }
  | { readonly fallback: ReactNode; readonly header?: ReactNode };

function createThreadScreenStore() {
  let current: ThreadScreenContent | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    publish: (content: ThreadScreenContent) => {
      current = content;
      for (const listener of listeners) listener();
    },
  };
}
const ThreadScreenContext = createContext<ReturnType<typeof createThreadScreenStore> | null>(null);

function ThreadScreenOutlet() {
  const store = useContext(ThreadScreenContext)!;
  const content = useSyncExternalStore(store.subscribe, store.getSnapshot);
  if (content === null) return null;
  if ("props" in content) {
    // On Android, ThreadDetailScreen hosts a single non-nested BlurTargetView around the feed
    // and floats both the header and composer over it to avoid double GPU blur passes at 120Hz/165Hz.
    if (Platform.OS === "android" && content.props.header) {
      return (
        <View className="flex-1 bg-thread-canvas">
          <AndroidOverlayHeaderContext value={true}>
            <ScreenContent surface="canvas">
              <ThreadDetailScreen {...content.props} />
            </ScreenContent>
          </AndroidOverlayHeaderContext>
        </View>
      );
    }
    return (
      <>
        {content.props.header}
        <ScreenContent surface="canvas">
          <ThreadDetailScreen {...content.props} />
        </ScreenContent>
      </>
    );
  }
  return (
    <>
      {content.header}
      <ScreenContent surface="canvas">{content.fallback}</ScreenContent>
    </>
  );
}

// Controllers can change from draft to live without replacing the native screen,
// the keyboard host, or the editor. Publish before paint to avoid an intermediate frame.
export function ThreadScreenHost({ children }: { readonly children: ReactNode }) {
  const [store] = useState(createThreadScreenStore);
  return (
    <ThreadScreenContext.Provider value={store}>
      {children}
      <View className="flex-1 bg-screen android:bg-thread-canvas">
        <ThreadScreenOutlet />
      </View>
    </ThreadScreenContext.Provider>
  );
}

export function ThreadScreenBinding(props: ThreadDetailScreenProps) {
  const store = useContext(ThreadScreenContext)!;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- publishes the route's thread screen props to the external store the outlet reads
  useLayoutEffect(() => {
    store.publish({ props });
  });
  return null;
}

export function ThreadScreenFallback({
  children,
  header,
}: {
  readonly children: ReactNode;
  readonly header?: ReactNode;
}) {
  const store = useContext(ThreadScreenContext)!;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- publishes the fallback content and header to the external store the outlet reads
  useLayoutEffect(() => {
    store.publish({ fallback: children, header });
  });
  return null;
}
