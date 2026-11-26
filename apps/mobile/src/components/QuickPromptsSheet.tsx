import * as Haptics from "expo-haptics";
import { useGT } from "gt-react-native";
import { memo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { deriveQuickPromptTitle, type SavedQuickPrompt } from "../lib/riasEnhancements";
import { playUiSound } from "../lib/uiSoundFx";
import { uuidv4 } from "../lib/uuid";
import { useSavedQuickPrompts } from "../state/use-rias-enhancements";
import { SymbolView } from "./ui/AppSymbol";

export const QuickPromptsSheet = memo(function QuickPromptsSheet(props: {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onSelectPrompt: (prompt: string) => void;
}) {
  const gt = useGT();
  const insets = useSafeAreaInsets();
  const { themeId } = useAppearancePreferences();
  const { prompts, addPrompt, removePrompt } = useSavedQuickPrompts();
  const [creating, setCreating] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [promptInput, setPromptInput] = useState("");

  if (!props.visible) return null;

  const accent =
    themeId === "akeno-violet"
      ? "#A855F7"
      : themeId === "rias-crimson"
        ? "#F43F5E"
        : "#60A5FA";

  const handleSelect = (item: SavedQuickPrompt) => {
    void Haptics.selectionAsync();
    playUiSound("shuffle");
    props.onSelectPrompt(item.prompt);
    props.onClose();
  };

  const handleSaveNew = () => {
    const trimmedPrompt = promptInput.trim();
    if (!trimmedPrompt) return;
    const trimmedTitle = titleInput.trim() || deriveQuickPromptTitle(trimmedPrompt);
    addPrompt({
      id: `qp-${uuidv4()}`,
      title: trimmedTitle,
      prompt: trimmedPrompt,
    });
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    playUiSound("done");
    setTitleInput("");
    setPromptInput("");
    setCreating(false);
  };

  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={props.onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.backdrop}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={props.onClose} />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) + 8 },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerTitleGroup}>
              <SymbolView name="bolt.circle" size={18} tintColor={accent} type="monochrome" />
              <Text style={styles.title}>{gt("Quick prompts")}</Text>
            </View>
            <View style={styles.headerActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={creating ? gt("Cancel new prompt") : gt("New quick prompt")}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setCreating((value) => !value);
                }}
                style={[styles.pillBtn, { backgroundColor: creating ? "rgba(255,255,255,0.12)" : accent }]}
              >
                <SymbolView
                  name={creating ? "xmark" : "plus"}
                  size={13}
                  tintColor="#FFFFFF"
                  type="monochrome"
                />
                <Text style={styles.pillBtnText}>{creating ? gt("Cancel") : gt("New")}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={gt("Close quick prompts")}
                onPress={props.onClose}
                style={styles.closeBtn}
              >
                <SymbolView name="xmark" size={16} tintColor="#D4D4D8" type="monochrome" />
              </Pressable>
            </View>
          </View>

          {creating ? (
            <View style={styles.formBox}>
              <TextInput
                value={titleInput}
                onChangeText={setTitleInput}
                placeholder={gt("Short label (optional)")}
                placeholderTextColor="rgba(255,255,255,0.38)"
                style={styles.input}
                maxLength={40}
              />
              <TextInput
                value={promptInput}
                onChangeText={setPromptInput}
                placeholder={gt("Write a reusable prompt…")}
                placeholderTextColor="rgba(255,255,255,0.38)"
                style={[styles.input, styles.multilineInput]}
                multiline
                textAlignVertical="top"
              />
              <Pressable
                accessibilityRole="button"
                disabled={promptInput.trim().length === 0}
                onPress={handleSaveNew}
                style={[
                  styles.saveBtn,
                  { backgroundColor: accent },
                  promptInput.trim().length === 0 && { opacity: 0.4 },
                ]}
              >
                <Text style={styles.saveBtnText}>{gt("Save quick prompt")}</Text>
              </Pressable>
            </View>
          ) : null}

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {prompts.length === 0 ? (
              <Text style={styles.emptyText}>
                {gt("No saved prompts yet. Tap New or long-press a message to save one.")}
              </Text>
            ) : (
              prompts.map((item) => (
                <View key={item.id} style={styles.promptCard}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => handleSelect(item)}
                    style={styles.promptBody}
                  >
                    <Text style={styles.promptTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.promptPreview} numberOfLines={2}>
                      {item.prompt}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={gt("Delete quick prompt")}
                    hitSlop={8}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      removePrompt(item.id);
                    }}
                    style={styles.deleteBtn}
                  >
                    <SymbolView name="trash" size={14} tintColor="rgba(255,255,255,0.45)" type="monochrome" />
                  </Pressable>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.65)",
  },
  sheet: {
    maxHeight: "76%",
    backgroundColor: "#0E0E14",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignSelf: "center",
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pillBtn: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  pillBtnText: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "700",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  formBox: {
    gap: 8,
    marginBottom: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
  input: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: "#FFFFFF",
    fontSize: 14,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
  multilineInput: {
    minHeight: 72,
  },
  saveBtn: {
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontWeight: "700",
  },
  list: {
    maxHeight: 380,
  },
  listContent: {
    gap: 8,
    paddingBottom: 6,
  },
  emptyText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 20,
  },
  promptCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.11)",
    overflow: "hidden",
  },
  promptBody: {
    flex: 1,
    paddingHorizontal: 13,
    paddingVertical: 11,
    gap: 3,
  },
  promptTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  promptPreview: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 12.5,
    lineHeight: 17,
  },
  deleteBtn: {
    width: 38,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
