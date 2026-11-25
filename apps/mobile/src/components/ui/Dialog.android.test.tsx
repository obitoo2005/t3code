import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";

// Every press handler a button was rendered with, so a test can deliver a
// native event that was dispatched against an older render.
const renderedClicks = vi.hoisted(() => [] as Array<() => void>);

vi.mock("react-native", () => ({
  KeyboardAvoidingView: (props: { readonly children?: ReactNode }) => <div>{props.children}</div>,
  Modal: (props: { readonly children?: ReactNode }) => <div>{props.children}</div>,
  Pressable: (props: {
    readonly children?: ReactNode;
    readonly accessibilityRole?: string;
    readonly onPress?: () => void;
  }) => {
    if (props.accessibilityRole === "button" && props.onPress) {
      renderedClicks.push(props.onPress);
    }
    return (
      <button type="button" onClick={props.onPress}>
        {props.children}
      </button>
    );
  },
  ScrollView: (props: { readonly children?: ReactNode }) => <div>{props.children}</div>,
  StyleSheet: { absoluteFill: {} },
  TextInput: (props: { readonly value?: string }) => <input readOnly value={props.value ?? ""} />,
  View: (props: { readonly children?: ReactNode }) => <div>{props.children}</div>,
}));
vi.mock("react-native-reanimated", () => ({
  default: {
    View: (props: { readonly children?: ReactNode }) => <div>{props.children}</div>,
  },
  Easing: { out: () => () => 0, cubic: () => 0 },
  ReduceMotion: { System: "system" },
  useAnimatedStyle: () => ({}),
  useSharedValue: (initial: number) => ({ value: initial, set: () => {} }),
  withSpring: (value: number) => value,
  withTiming: (value: number) => value,
}));
vi.mock("expo-haptics", () => ({
  selectionAsync: () => Promise.resolve(),
}));
vi.mock("./AndroidGlassSurface.android", () => ({
  AndroidGlassSurface: (props: { readonly children?: ReactNode }) => <div>{props.children}</div>,
}));
vi.mock("./AppSymbol", () => ({
  SymbolView: () => null,
}));
vi.mock("./AppText", () => ({
  AppText: (props: { readonly children?: ReactNode }) => <span>{props.children}</span>,
}));
vi.mock("../../features/settings/appearance/AppearancePreferencesProvider", () => ({
  useAppearancePreferences: () => ({ themeAppearance: "dark", themeVariables: {} }),
}));
vi.mock("../../features/settings/appearance/useScaledTextRole", () => ({
  useScaledTextRole: () => ({}),
}));
vi.mock("../../lib/mobileTheme", () => ({ themeColorWithContrast: () => "#ffffff" }));

import * as Dialog from "./Dialog.android";

const roots: Root[] = [];

function mountHost() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<Dialog.Host />));
  return { root, container };
}

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  renderedClicks.length = 0;
  document.body.innerHTML = "";
});

it("keeps presenting dialogs after an older root's Host unmounts", () => {
  // Android activity replacement mounts the new root before the old one stops.
  const previous = mountHost();
  const current = mountHost();
  roots.splice(roots.indexOf(previous.root), 1);
  act(() => previous.root.unmount());

  act(() => Dialog.alert("Saved", undefined, [{ text: "OK" }]));

  expect(current.container.textContent).toContain("Saved");
});

it("presents a dialog requested before any Host mounted", () => {
  Dialog.alert("Could not import shared content", undefined, [{ text: "Dismiss" }]);

  const { container } = mountHost();

  expect(container.textContent).toContain("Could not import shared content");
});

it("keeps a dialog raised while the activity is replaced", () => {
  const previous = mountHost();
  act(() => Dialog.alert("Shared content imported", undefined, [{ text: "OK" }]));
  const current = mountHost();
  roots.splice(roots.indexOf(previous.root), 1);
  act(() => previous.root.unmount());

  expect(current.container.textContent).toContain("Shared content imported");
});

it.each([
  {
    kind: "alert",
    present: (onClose: () => void) =>
      Dialog.alert("Older", undefined, [{ text: "OK" }], { onDismiss: onClose }),
  },
  {
    kind: "confirm",
    present: (onClose: () => void) =>
      Dialog.confirm({
        title: "Remove project",
        confirmText: "Remove",
        onConfirm: () => {},
        onCancel: onClose,
      }),
  },
  {
    kind: "text-input",
    present: (onClose: () => void) =>
      Dialog.prompt({
        title: "Rename",
        initialValue: "",
        confirmText: "Save",
        onConfirm: () => {},
        onCancel: onClose,
      }),
  },
])("tells a replaced $kind it was closed without an answer", ({ present }) => {
  mountHost();
  const onClose = vi.fn();
  act(() => present(onClose));
  act(() => Dialog.alert("Newer", undefined, [{ text: "OK" }]));

  expect(onClose).toHaveBeenCalledOnce();
});

it.each([
  { action: "confirm", clickIndex: -1 },
  { action: "cancel", clickIndex: -2 },
])("ignores a late $action click from a replaced confirmation", ({ clickIndex }) => {
  const { container } = mountHost();
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  act(() =>
    Dialog.confirm({ title: "Remove project", confirmText: "Remove", onConfirm, onCancel }),
  );
  const lateClick = renderedClicks.at(clickIndex)!;
  act(() => Dialog.alert("Newer", undefined, [{ text: "OK" }]));

  act(() => lateClick());

  expect(onConfirm).not.toHaveBeenCalled();
  expect(onCancel).toHaveBeenCalledOnce();
  expect(container.textContent).toContain("Newer");
});

it("ignores a late action from a dialog that a newer one replaced", () => {
  const { container } = mountHost();
  const olderAction = vi.fn();
  act(() => Dialog.alert("Older", undefined, [{ text: "OK", onPress: olderAction }]));
  const olderClick = renderedClicks.at(-1)!;
  act(() => Dialog.alert("Newer", undefined, [{ text: "OK" }]));

  act(() => olderClick());

  expect(olderAction).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Newer");
});
