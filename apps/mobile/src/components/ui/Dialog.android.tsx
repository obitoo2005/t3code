import * as Haptics from "expo-haptics";
import { msg, useGT } from "gt-react-native";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type Alert,
  type AlertButton,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { useAppearancePreferences } from "../../features/settings/appearance/AppearancePreferencesProvider";
import { useScaledTextRole } from "../../features/settings/appearance/useScaledTextRole";
import { m } from "../../i18n/messages";
import {
  IOS_EXIT_UNMOUNT_MS,
  IOS_SPRING_DIALOG,
  IOS_TIMING_BACKDROP_IN,
  IOS_TIMING_BACKDROP_OUT,
  IOS_TIMING_EXIT,
} from "../../lib/iosMotion";
import { themeColorWithContrast } from "../../lib/mobileTheme";
import { AndroidGlassSurface } from "./AndroidGlassSurface.android";
import { SymbolView } from "./AppSymbol";
import { AppText } from "./AppText";
import type { ConfirmDialogRequest, TextInputDialogRequest } from "./Dialog.types";

export type { ConfirmDialogRequest, TextInputDialogRequest } from "./Dialog.types";

type AlertRequest = {
  readonly title: Parameters<typeof Alert.alert>[0];
  readonly message: Parameters<typeof Alert.alert>[1];
  readonly buttons: Parameters<typeof Alert.alert>[2];
  readonly options: Parameters<typeof Alert.alert>[3];
};

type DialogRequest =
  | { readonly kind: "alert"; readonly request: AlertRequest }
  | { readonly kind: "confirm"; readonly request: ConfirmDialogRequest }
  | { readonly kind: "text-input"; readonly request: TextInputDialogRequest };

type PresentedDialog = DialogRequest & { readonly id: number };

// App services raise dialogs before the root mounts, so the request lives in
// the module and the Host renders whatever is current. One dialog shows at a
// time: a new request replaces the presented one.
let presented: PresentedDialog | null = null;
let nextPresentationId = 0;
const listeners = new Set<() => void>();

function setPresented(next: PresentedDialog | null) {
  presented = next;
  for (const listener of listeners) listener();
}

function submitRequest(dialog: DialogRequest) {
  const replaced = presented;
  setPresented({ ...dialog, id: ++nextPresentationId });
  // A replaced dialog closed without an answer, which its owner hears as a dismissal.
  if (replaced) closeUnanswered(replaced);
}

function closeUnanswered(dialog: DialogRequest) {
  if (dialog.kind === "alert") dialog.request.options?.onDismiss?.();
  else dialog.request.onCancel?.();
}

/** Closes the dialog only if it is still the one the action came from. */
function dismiss(id: number) {
  if (presented?.id !== id) return false;
  setPresented(null);
  return true;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getPresented() {
  return presented;
}

export function alert(...[title, message, buttons, options]: Parameters<typeof Alert.alert>): void {
  const actions = buttons?.length ? buttons.slice(0, 3) : [{ text: m(msg("OK")) }];
  const normalized = actions.map((action, index) =>
    index === actions.length - 1 ? { ...action, text: action.text || m(msg("OK")) } : action,
  );
  submitRequest({
    kind: "alert",
    request: { title, message, buttons: normalized, options },
  });
}

export function confirm(request: ConfirmDialogRequest): void {
  submitRequest({ kind: "confirm", request });
}

export function prompt(request: TextInputDialogRequest): void {
  submitRequest({ kind: "text-input", request });
}

export function Host() {
  const gt = useGT();
  const current = useSyncExternalStore(subscribe, getPresented, getPresented);
  const [exiting, setExiting] = useState<PresentedDialog | null>(null);
  const prevCurrentRef = useRef<PresentedDialog | null>(current);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- keeps dismissed dialog mounted briefly so the iOS zoom-out exit animation finishes smoothly
  useEffect(() => {
    const prev = prevCurrentRef.current;
    prevCurrentRef.current = current;
    if (current !== null) {
      setExiting(null);
      return;
    }
    if (prev !== null) {
      setExiting(prev);
      const timer = setTimeout(() => {
        setExiting((existing) => (existing?.id === prev.id ? null : existing));
      }, IOS_EXIT_UNMOUNT_MS);
      return () => clearTimeout(timer);
    }
  }, [current]);

  const active = current ?? exiting;
  const isClosing = current === null && exiting !== null;

  const handleCancel = () => {
    if (!current || !dismiss(current.id)) return;
    closeUnanswered(current);
  };

  const handleConfirm = (nativeInputValue?: string) => {
    if (!current || !dismiss(current.id)) return;
    if (current.kind === "confirm") {
      current.request.onConfirm();
    } else if (current.kind === "text-input") {
      current.request.onConfirm(nativeInputValue ?? current.request.initialValue);
    }
  };

  if (active?.kind === "alert") {
    return (
      <DialogPresentation
        key={active.id}
        closing={isClosing}
        request={{
          title: active.request.title ?? "",
          message: active.request.message ?? undefined,
          confirmText: "",
        }}
        alertActions={active.request.buttons ?? [{ text: gt("OK") }]}
        dismissable={active.request.options?.cancelable ?? false}
        onAlertAction={(action) => {
          if (!current || !dismiss(current.id)) return;
          action.onPress?.();
        }}
        onCancel={handleCancel}
        onConfirm={handleConfirm}
      />
    );
  }

  return active ? (
    <DialogPresentation
      key={active.id}
      closing={isClosing}
      request={active.request}
      inputInitialValue={active.kind === "text-input" ? active.request.initialValue : undefined}
      inputPlaceholder={active.kind === "text-input" ? active.request.placeholder : undefined}
      onCancel={handleCancel}
      onConfirm={handleConfirm}
    />
  ) : null;
}

function DialogPresentation(props: DialogPresentationProps) {
  const gt = useGT();
  const { themeAppearance, themeVariables: colors } = useAppearancePreferences();
  const isDark = themeAppearance === "dark";
  const titleTypography = useScaledTextRole("title");
  const bodyTypography = useScaledTextRole("footnote");
  const inputTypography = useScaledTextRole("body");
  const [inputValue, setInputValue] = useState(props.inputInitialValue ?? "");
  const progress = useSharedValue(0);
  const backdropOpacity = useSharedValue(0);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- drives Reanimated spring entrance and smooth zoom-out exit on the Liquid Glass dialog
  useEffect(() => {
    if (props.closing) {
      progress.set(withTiming(0, IOS_TIMING_EXIT));
      backdropOpacity.set(withTiming(0, IOS_TIMING_BACKDROP_OUT));
      return;
    }
    progress.set(withSpring(1, IOS_SPRING_DIALOG));
    backdropOpacity.set(withTiming(1, IOS_TIMING_BACKDROP_IN));
  }, [backdropOpacity, progress, props.closing]);

  const cardAnimatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: Math.min(1, p * 1.4),
      transform: [{ scale: 0.90 + 0.10 * p }],
    };
  });

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const handleConfirmPress = () => {
    const value = props.inputInitialValue === undefined ? undefined : inputValue;
    props.onConfirm(value);
  };

  const actions = props.alertActions ?? [
    { text: props.request.cancelText ?? gt("Cancel"), onPress: props.onCancel },
    {
      text: props.request.confirmText,
      style: props.request.destructive ? ("destructive" as const) : ("default" as const),
      onPress: handleConfirmPress,
    },
  ];
  const destructive = actions.some((action) => action.style === "destructive");
  const dismissable = props.dismissable ?? true;
  const destructiveFill = themeColorWithContrast(colors["--color-danger-foreground"], "#ffffff");
  const secondaryBg = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.05)";
  const secondaryPressedBg = isDark ? "rgba(255, 255, 255, 0.14)" : "rgba(0, 0, 0, 0.10)";
  const secondaryBorder = isDark ? "rgba(255, 255, 255, 0.14)" : "rgba(0, 0, 0, 0.10)";

  const renderAction = (action: AlertButton, index: number) => {
    const isDestructive = action.style === "destructive";
    const isPrimary = isDestructive || index === actions.length - 1;
    const containerColor = isDestructive
      ? destructiveFill
      : isPrimary
        ? colors["--color-prominent-action"]
        : secondaryBg;
    const contentColor = isDestructive
      ? "#ffffff"
      : isPrimary
        ? colors["--color-prominent-action-foreground"]
        : colors["--color-foreground"];
    const onPress = () => {
      void Haptics.selectionAsync();
      if (props.alertActions) props.onAlertAction?.(action);
      else action.onPress?.();
    };

    return (
      <Pressable
        key={`${index}-${action.text ?? ""}`}
        accessibilityRole="button"
        accessibilityLabel={action.text ?? ""}
        onPress={onPress}
        style={({ pressed }) => ({
          flexGrow: actions.length <= 2 ? 1 : 0,
          minHeight: 44,
          paddingHorizontal: 18,
          paddingVertical: 10,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pressed && !isPrimary ? secondaryPressedBg : containerColor,
          borderWidth: 1,
          borderColor: isPrimary
            ? isDark
              ? "rgba(255, 255, 255, 0.18)"
              : "rgba(0, 0, 0, 0.08)"
            : secondaryBorder,
          opacity: pressed && isPrimary ? 0.84 : 1,
        })}
      >
        <AppText
          className={isPrimary ? "font-t3-bold" : "font-t3-medium"}
          style={{ ...bodyTypography, color: contentColor }}
        >
          {action.text ?? ""}
        </AppText>
      </Pressable>
    );
  };

  return (
    <Modal
      transparent
      statusBarTranslucent
      animationType="none"
      visible
      onRequestClose={() => {
        if (dismissable) props.onCancel();
      }}
    >
      <KeyboardAvoidingView
        behavior="padding"
        pointerEvents={props.closing ? "none" : "auto"}
        style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: isDark ? "rgba(0, 0, 0, 0.56)" : "rgba(0, 0, 0, 0.28)" },
            backdropAnimatedStyle,
          ]}
        />
        <Pressable
          accessible={false}
          style={StyleSheet.absoluteFill}
          onPress={() => {
            if (dismissable) props.onCancel();
          }}
        />
        <Animated.View
          style={[
            {
              width: "100%",
              maxWidth: 360,
              borderRadius: 28,
              boxShadow: [
                {
                  offsetX: 0,
                  offsetY: 18,
                  blurRadius: 42,
                  spreadDistance: -4,
                  color: isDark ? "rgba(0, 0, 0, 0.68)" : "rgba(0, 0, 0, 0.20)",
                },
              ],
            },
            cardAnimatedStyle,
          ]}
        >
          <AndroidGlassSurface radius={28} tone="menu" blurTarget={null}>
            <View style={{ padding: 22, gap: 14 }}>
              <View style={{ gap: 10 }}>
                {destructive ? (
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 999,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isDark
                        ? "rgba(239, 68, 68, 0.16)"
                        : "rgba(220, 38, 38, 0.12)",
                      borderWidth: 1,
                      borderColor: isDark
                        ? "rgba(239, 68, 68, 0.30)"
                        : "rgba(220, 38, 38, 0.22)",
                    }}
                  >
                    <SymbolView
                      name="trash"
                      size={18}
                      tintColor={colors["--color-danger-foreground"]}
                      type="monochrome"
                    />
                  </View>
                ) : null}
                {props.request.title ? (
                  <AppText
                    className="font-t3-bold"
                    style={{
                      ...titleTypography,
                      fontSize: Math.min(titleTypography.fontSize ?? 19, 19),
                      color: colors["--color-foreground"],
                    }}
                  >
                    {props.request.title}
                  </AppText>
                ) : null}
              </View>

              {props.request.message ? (
                <ScrollView
                  style={{ maxHeight: 240, flexGrow: 0 }}
                  bounces={false}
                  showsVerticalScrollIndicator={false}
                >
                  <AppText
                    style={{
                      ...bodyTypography,
                      color: colors["--color-foreground-secondary"],
                    }}
                  >
                    {props.request.message}
                  </AppText>
                </ScrollView>
              ) : null}

              {props.inputInitialValue !== undefined ? (
                <TextInput
                  autoFocus
                  selectTextOnFocus
                  value={inputValue}
                  onChangeText={setInputValue}
                  placeholder={props.inputPlaceholder}
                  placeholderTextColor={colors["--color-foreground-muted"]}
                  returnKeyType="done"
                  onSubmitEditing={handleConfirmPress}
                  style={{
                    ...inputTypography,
                    minHeight: 46,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 16,
                    color: colors["--color-foreground"],
                    backgroundColor: isDark
                      ? "rgba(255, 255, 255, 0.06)"
                      : "rgba(0, 0, 0, 0.04)",
                    borderWidth: 1,
                    borderColor: isDark
                      ? "rgba(255, 255, 255, 0.16)"
                      : "rgba(0, 0, 0, 0.12)",
                  }}
                />
              ) : null}

              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                  gap: 10,
                  marginTop: 4,
                }}
              >
                {actions.map(renderAction)}
              </View>
            </View>
          </AndroidGlassSurface>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface DialogPresentationProps {
  readonly closing?: boolean;
  readonly alertActions?: readonly AlertButton[];
  readonly onAlertAction?: (action: AlertButton) => void;
  readonly dismissable?: boolean;
  readonly request: Pick<
    ConfirmDialogRequest,
    "title" | "message" | "cancelText" | "confirmText" | "destructive"
  >;
  readonly inputInitialValue?: string;
  readonly inputPlaceholder?: string;
  readonly onCancel: () => void;
  readonly onConfirm: (inputValue?: string) => void;
}
