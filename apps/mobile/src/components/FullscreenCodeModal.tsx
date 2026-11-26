import * as Haptics from "expo-haptics";
import { useGT } from "gt-react-native";
import { memo, useMemo, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { insertTextIntoActiveComposer } from "../features/threads/activeThreadComposerBridge";
import { useMarkdownCodeHighlight } from "../features/threads/markdownCodeHighlightState";
import { copyTextWithHaptic } from "../lib/copyTextWithHaptic";
import { withTokenStarts, type HighlightScheme } from "../lib/highlights";
import { formatQuotedCodeLines } from "../lib/riasEnhancements";
import { playUiSound } from "../lib/uiSoundFx";
import { openShareCard } from "./ShareCardModal";
import { SymbolView } from "./ui/AppSymbol";

const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 22;

export const FullscreenCodeModal = memo(function FullscreenCodeModal(props: {
  readonly visible: boolean;
  readonly code: string;
  readonly languageLabel: string;
  readonly fence: string;
  readonly highlightLanguage: string;
  readonly scheme: HighlightScheme;
  readonly onClose: () => void;
}) {
  const gt = useGT();
  const insets = useSafeAreaInsets();
  const { themeId } = useAppearancePreferences();
  const [fontSize, setFontSize] = useState(13);
  const [wrapped, setWrapped] = useState(false);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [quotedToast, setQuotedToast] = useState(false);

  const rawLines = useMemo(() => props.code.replace(/\r\n/g, "\n").split("\n"), [props.code]);
  const highlightedLines = useMarkdownCodeHighlight({
    code: props.code,
    language: props.highlightLanguage,
    theme: props.scheme,
    enabled: props.visible,
  });
  const tokenizedLines = useMemo(
    () => (highlightedLines ? withTokenStarts(highlightedLines) : null),
    [highlightedLines],
  );

  const accentColor =
    themeId === "akeno-violet"
      ? "#A855F7"
      : themeId === "rias-crimson"
        ? "#F43F5E"
        : "#60A5FA";
  const accentSoftBg =
    themeId === "akeno-violet"
      ? "rgba(168, 85, 247, 0.22)"
      : themeId === "rias-crimson"
        ? "rgba(244, 63, 94, 0.22)"
        : "rgba(96, 165, 250, 0.22)";

  const lineNumberWidth = Math.max(28, String(rawLines.length).length * 9 + 12);
  const lineHeight = Math.round(fontSize * 1.48);

  const handleLinePress = (lineNumber: number) => {
    void Haptics.selectionAsync();
    setSelection((current) => {
      if (!current) return { start: lineNumber, end: lineNumber };
      if (current.start === lineNumber && current.end === lineNumber) return null;
      if (current.start === current.end) {
        return {
          start: Math.min(current.start, lineNumber),
          end: Math.max(current.start, lineNumber),
        };
      }
      return { start: lineNumber, end: lineNumber };
    });
  };

  const selectedCode = useMemo(() => {
    if (!selection) return "";
    return rawLines.slice(selection.start - 1, selection.end).join("\n");
  }, [rawLines, selection]);

  const handleQuoteToChat = () => {
    if (!selection) return;
    const snippet = formatQuotedCodeLines({
      code: props.code,
      language: props.fence || props.highlightLanguage,
      startLine: selection.start,
      endLine: selection.end,
    });
    const inserted = insertTextIntoActiveComposer(snippet);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    playUiSound("shuffle");
    if (inserted) {
      setSelection(null);
      props.onClose();
    } else {
      copyTextWithHaptic(snippet);
      setQuotedToast(true);
      setTimeout(() => setQuotedToast(false), 1600);
    }
  };

  const handleShareCodeCard = () => {
    void Haptics.selectionAsync();
    openShareCard({
      title: props.languageLabel,
      subtitle: selection
        ? selection.start === selection.end
          ? `Line ${selection.start}`
          : `Lines ${selection.start}–${selection.end}`
        : `${rawLines.length} lines`,
      body: selection ? selectedCode : props.code,
      isCode: true,
    });
  };

  const renderLines = () => (
    <View style={{ paddingVertical: 12, paddingRight: 16 }}>
      {rawLines.map((rawLine, index) => {
        const lineNumber = index + 1;
        const isSelected =
          selection !== null && lineNumber >= selection.start && lineNumber <= selection.end;
        const tokens = tokenizedLines?.[index];
        return (
          <Pressable
            key={lineNumber}
            onPress={() => handleLinePress(lineNumber)}
            style={[
              styles.lineRow,
              { minHeight: lineHeight },
              isSelected && {
                backgroundColor: accentSoftBg,
                borderLeftWidth: 2,
                borderLeftColor: accentColor,
              },
            ]}
          >
            <Text
              allowFontScaling={false}
              style={[
                styles.lineNumber,
                {
                  width: lineNumberWidth,
                  fontSize: Math.max(10, fontSize - 2),
                  lineHeight,
                  color: isSelected ? accentColor : "rgba(255,255,255,0.34)",
                },
              ]}
            >
              {lineNumber}
            </Text>
            <Text
              allowFontScaling={false}
              style={{
                fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                fontSize,
                lineHeight,
                color: "#E6EDF3",
                flexShrink: wrapped ? 1 : 0,
              }}
            >
              {tokens && tokens.length > 0
                ? tokens.map(({ token, start }) => (
                    <Text
                      key={start}
                      style={token.color ? { color: token.color } : undefined}
                    >
                      {token.content}
                    </Text>
                  ))
                : rawLine || " "}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <Modal
      visible={props.visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={props.onClose}
    >
      <View
        style={[
          styles.root,
          {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.titleCluster}>
            <View style={[styles.langDot, { backgroundColor: accentColor }]} />
            <Text style={styles.langTitle} numberOfLines={1}>
              {props.languageLabel}
            </Text>
            <Text style={styles.lineCount}>{rawLines.length}L</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={gt("Decrease font size")}
              disabled={fontSize <= MIN_FONT_SIZE}
              onPress={() => {
                void Haptics.selectionAsync();
                setFontSize((value) => Math.max(MIN_FONT_SIZE, value - 1));
              }}
              style={[styles.iconButton, fontSize <= MIN_FONT_SIZE && styles.disabledButton]}
            >
              <SymbolView name="minus" size={16} tintColor="#E6EDF3" type="monochrome" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={gt("Increase font size")}
              disabled={fontSize >= MAX_FONT_SIZE}
              onPress={() => {
                void Haptics.selectionAsync();
                setFontSize((value) => Math.min(MAX_FONT_SIZE, value + 1));
              }}
              style={[styles.iconButton, fontSize >= MAX_FONT_SIZE && styles.disabledButton]}
            >
              <SymbolView name="plus" size={16} tintColor="#E6EDF3" type="monochrome" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={wrapped ? gt("Disable line wrap") : gt("Wrap lines")}
              onPress={() => {
                void Haptics.selectionAsync();
                setWrapped((value) => !value);
              }}
              style={[
                styles.iconButton,
                wrapped && { backgroundColor: accentSoftBg, borderColor: accentColor },
              ]}
            >
              <SymbolView
                name="text.alignleft"
                size={15}
                tintColor={wrapped ? accentColor : "#E6EDF3"}
                type="monochrome"
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={gt("Share code card")}
              onPress={handleShareCodeCard}
              style={styles.iconButton}
            >
              <SymbolView name="square.and.arrow.up" size={15} tintColor="#E6EDF3" type="monochrome" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={gt("Copy code")}
              onPress={() => copyTextWithHaptic(props.code)}
              style={styles.iconButton}
            >
              <SymbolView name="doc.on.doc" size={15} tintColor="#E6EDF3" type="monochrome" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={gt("Close code viewer")}
              onPress={props.onClose}
              style={styles.iconButton}
            >
              <SymbolView name="xmark" size={17} tintColor="#FFFFFF" type="monochrome" />
            </Pressable>
          </View>
        </View>

        <View style={styles.hintRow}>
          <Text style={styles.hintText}>
            {selection
              ? selection.start === selection.end
                ? gt("Selected line {line} · tap another line for a range", {
                    line: selection.start,
                  })
                : gt("Selected lines {start}–{end} ({count} lines)", {
                    start: selection.start,
                    end: selection.end,
                    count: selection.end - selection.start + 1,
                  })
              : gt("Tap lines to select and quote directly to chat")}
          </Text>
        </View>

        <ScrollView style={styles.scroller} showsVerticalScrollIndicator>
          {wrapped ? (
            renderLines()
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: "100%" }}>
              {renderLines()}
            </ScrollView>
          )}
        </ScrollView>

        {selection ? (
          <View style={styles.selectionBar}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                copyTextWithHaptic(selectedCode);
              }}
              style={styles.selectionSecondaryBtn}
            >
              <SymbolView name="doc.on.doc" size={14} tintColor="#E6EDF3" type="monochrome" />
              <Text style={styles.selectionBtnText}>{gt("Copy")}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={handleQuoteToChat}
              style={[styles.selectionPrimaryBtn, { backgroundColor: accentColor }]}
            >
              <SymbolView name="text.bubble" size={14} tintColor="#FFFFFF" type="monochrome" />
              <Text style={styles.selectionPrimaryText}>
                {selection.start === selection.end
                  ? gt("Quote line {line}", { line: selection.start })
                  : gt("Quote L{start}–{end}", {
                      start: selection.start,
                      end: selection.end,
                    })}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={gt("Clear selection")}
              onPress={() => setSelection(null)}
              style={styles.selectionCloseBtn}
            >
              <SymbolView name="xmark" size={14} tintColor="#A1A1AA" type="monochrome" />
            </Pressable>
          </View>
        ) : null}

        {quotedToast ? (
          <View pointerEvents="none" style={styles.toast}>
            <Text style={styles.toastText}>{gt("Copied quote to clipboard")}</Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#060609",
  },
  header: {
    minHeight: 54,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(18, 18, 24, 0.94)",
  },
  titleCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
    paddingRight: 8,
  },
  langDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  langTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
    flexShrink: 1,
  },
  lineCount: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    fontWeight: "500",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
  disabledButton: {
    opacity: 0.35,
  },
  hintRow: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  hintText: {
    color: "rgba(255,255,255,0.52)",
    fontSize: 11.5,
  },
  scroller: {
    flex: 1,
  },
  lineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 1.5,
    paddingLeft: 8,
    paddingRight: 10,
  },
  lineNumber: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    textAlign: "right",
    paddingRight: 12,
    userSelect: "none",
  },
  selectionBar: {
    marginHorizontal: 14,
    marginBottom: 12,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    backgroundColor: "rgba(22, 22, 30, 0.96)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  selectionSecondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  selectionPrimaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
  selectionBtnText: {
    color: "#E6EDF3",
    fontSize: 13,
    fontWeight: "600",
  },
  selectionPrimaryText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  selectionCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  toast: {
    position: "absolute",
    bottom: 84,
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(24, 24, 32, 0.94)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  toastText: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "600",
  },
});
