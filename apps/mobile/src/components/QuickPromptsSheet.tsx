import * as Haptics from "expo-haptics";
import { useGT } from "gt-react-native";
import { memo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { deriveQuickPromptTitle, type SavedQuickPrompt } from "../lib/riasEnhancements";
import { playUiSound } from "../lib/uiSoundFx";
import { uuidv4 } from "../lib/uuid";
import { useSavedQuickPrompts } from "../state/use-rias-enhancements";
import { AndroidGlassPressable, AndroidGlassSurface } from "./ui/AndroidGlassSurface";
import { AppleSheetModal } from "./ui/AppleSheetModal";
import { SymbolView } from "./ui/AppSymbol";
import { AppText as Text } from "./ui/AppText";

export const QuickPromptsSheet = memo(function QuickPromptsSheet(props: {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onSelectPrompt: (prompt: string) => void;
}) {
  const gt = useGT();
  const insets = useSafeAreaInsets();
  const { themeId, themeAppearance } = useAppearancePreferences();
  const { prompts, addPrompt, removePrompt } = useSavedQuickPrompts();
  const [creating, setCreating] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [promptInput, setPromptInput] = useState("");

  const isDark = themeAppearance === "dark";
  const accent =
    themeId === "akeno-violet"
      ? "#A855F7"
      : themeId === "rias-crimson"
        ? "#F43F5E"
        : isDark
          ? "#93C5FD"
          : "#2563EB";
  const cardBg = isDark ? "rgba(255, 255, 255, 0.055)" : "rgba(255, 255, 255, 0.62)";
  const cardBorder = isDark ? "rgba(255, 255, 255, 0.11)" : "rgba(0, 0, 0, 0.07)";
  const cardTopBorder = isDark ? "rgba(255, 255, 255, 0.22)" : "rgba(255, 255, 255, 0.95)";
  const inputBg = isDark ? "rgba(0, 0, 0, 0.34)" : "rgba(255, 255, 255, 0.72)";
  const inputTextColor = isDark ? "#FFFFFF" : "#111827";
  const placeholderColor = isDark ? "rgba(255,255,255,0.40)" : "rgba(0,0,0,0.42)";
  const mutedIconColor = isDark ? "rgba(255,255,255,0.56)" : "rgba(0,0,0,0.48)";

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
    <AppleSheetModal
      visible={props.visible}
      onClose={props.onClose}
      variant="sheet"
      sheetStyle={styles.sheetWrap}
      containerStyle={[
        styles.backdrop,
        { paddingBottom: Math.max(insets.bottom, 12) + 6 },
      ]}
    >
      <AndroidGlassSurface
        tone="menu"
        radius={30}
        style={[
          styles.sheet,
          {
            boxShadow: [
              {
                offsetX: 0,
                offsetY: 12,
                blurRadius: 34,
                color: isDark ? "rgba(0, 0, 0, 0.56)" : "rgba(0, 0, 0, 0.16)",
              },
            ],
          },
        ]}
      >
          <View
            style={[
              styles.handle,
              {
                backgroundColor: isDark
                  ? "rgba(255, 255, 255, 0.24)"
                  : "rgba(0, 0, 0, 0.18)",
              },
            ]}
          />
          <View style={styles.header}>
            <View style={styles.headerTitleGroup}>
              <View
                style={[
                  styles.titleBadge,
                  {
                    backgroundColor: isDark
                      ? "rgba(255, 255, 255, 0.08)"
                      : "rgba(0, 0, 0, 0.05)",
                    borderColor: cardBorder,
                  },
                ]}
              >
                <SymbolView name="bolt.circle" size={16} tintColor={accent} type="monochrome" />
              </View>
              <Text className="font-t3-bold text-lg text-foreground">{gt("Quick prompts")}</Text>
            </View>
            <View style={styles.headerActions}>
              <AndroidGlassPressable
                accessibilityLabel={creating ? gt("Cancel new prompt") : gt("New quick prompt")}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setCreating((value) => !value);
                }}
                scaleTo={0.94}
              >
                <AndroidGlassSurface
                  tone="elevated"
                  radius={999}
                  style={styles.pillBtn}
                >
                  <SymbolView
                    name={creating ? "xmark" : "plus"}
                    size={13}
                    tintColor={creating ? mutedIconColor : accent}
                    type="monochrome"
                  />
                  <Text
                    className="font-t3-semibold text-xs text-foreground"
                    style={creating ? undefined : { color: accent }}
                  >
                    {creating ? gt("Cancel") : gt("New")}
                  </Text>
                </AndroidGlassSurface>
              </AndroidGlassPressable>
              <AndroidGlassPressable
                accessibilityLabel={gt("Close quick prompts")}
                onPress={props.onClose}
                scaleTo={0.92}
              >
                <AndroidGlassSurface
                  tone="elevated"
                  radius={999}
                  style={styles.closeBtn}
                >
                  <SymbolView
                    name="xmark"
                    size={15}
                    tintColorClassName="accent-foreground"
                    type="monochrome"
                  />
                </AndroidGlassSurface>
              </AndroidGlassPressable>
            </View>
          </View>

          {creating ? (
            <View
              style={[
                styles.formBox,
                {
                  backgroundColor: cardBg,
                  borderColor: cardBorder,
                  borderTopColor: cardTopBorder,
                },
              ]}
            >
              <TextInput
                value={titleInput}
                onChangeText={setTitleInput}
                placeholder={gt("Short label (optional)")}
                placeholderTextColor={placeholderColor}
                style={[
                  styles.input,
                  {
                    backgroundColor: inputBg,
                    color: inputTextColor,
                    borderColor: cardBorder,
                  },
                ]}
                maxLength={40}
              />
              <TextInput
                value={promptInput}
                onChangeText={setPromptInput}
                placeholder={gt("Write a reusable prompt…")}
                placeholderTextColor={placeholderColor}
                style={[
                  styles.input,
                  styles.multilineInput,
                  {
                    backgroundColor: inputBg,
                    color: inputTextColor,
                    borderColor: cardBorder,
                  },
                ]}
                multiline
                textAlignVertical="top"
              />
              <AndroidGlassPressable
                disabled={promptInput.trim().length === 0}
                onPress={handleSaveNew}
                scaleTo={0.97}
              >
                <AndroidGlassSurface
                  tone="elevated"
                  radius={999}
                  style={[
                    styles.saveBtn,
                    promptInput.trim().length === 0 && { opacity: 0.4 },
                  ]}
                >
                  <SymbolView name="checkmark" size={14} tintColor={accent} type="monochrome" />
                  <Text className="font-t3-semibold text-sm" style={{ color: accent }}>
                    {gt("Save quick prompt")}
                  </Text>
                </AndroidGlassSurface>
              </AndroidGlassPressable>
            </View>
          ) : null}

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {prompts.length === 0 ? (
              <Text textRole="footnote" className="py-5 text-center text-foreground-muted">
                {gt("No saved prompts yet. Tap New or long-press a message to save one.")}
              </Text>
            ) : (
              prompts.map((item) => (
                <View
                  key={item.id}
                  style={[
                    styles.promptCard,
                    {
                      backgroundColor: cardBg,
                      borderColor: cardBorder,
                      borderTopColor: cardTopBorder,
                    },
                  ]}
                >
                  <AndroidGlassPressable
                    onPress={() => handleSelect(item)}
                    scaleTo={0.98}
                    style={styles.promptPressable}
                  >
                    <View style={styles.promptBody}>
                      <Text className="font-t3-semibold text-sm text-foreground" numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text
                        textRole="footnote"
                        className="mt-0.5 text-foreground-muted"
                        numberOfLines={2}
                      >
                        {item.prompt}
                      </Text>
                    </View>
                  </AndroidGlassPressable>
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
                    <SymbolView
                      name="trash"
                      size={14}
                      tintColor={mutedIconColor}
                      type="monochrome"
                    />
                  </Pressable>
                </View>
              ))
            )}
          </ScrollView>
        </AndroidGlassSurface>
    </AppleSheetModal>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    paddingHorizontal: 12,
  },
  sheetWrap: {
    maxHeight: "78%",
  },
  sheet: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  headerTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  titleBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pillBtn: {
    height: 34,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  closeBtn: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  formBox: {
    gap: 8,
    marginBottom: 12,
    padding: 12,
    borderRadius: 20,
    borderWidth: 1,
  },
  input: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  multilineInput: {
    minHeight: 72,
  },
  saveBtn: {
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  list: {
    maxHeight: 380,
  },
  listContent: {
    gap: 9,
    paddingBottom: 4,
  },
  promptCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  promptPressable: {
    flex: 1,
  },
  promptBody: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  deleteBtn: {
    width: 40,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
