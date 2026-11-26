import * as Haptics from "expo-haptics";
import { useGT } from "gt-react-native";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";

import type { MobileThemeId } from "../lib/mobileTheme";
import { wrapShareCardLines } from "../lib/riasEnhancements";
import { playUiSound } from "../lib/uiSoundFx";
import { AppleSheetModal } from "./ui/AppleSheetModal";
import { SymbolView } from "./ui/AppSymbol";

export interface ShareCardRequest {
  readonly title: string;
  readonly subtitle?: string;
  readonly body: string;
  readonly isCode?: boolean;
}

type ShareCardAccent = "crimson" | "violet" | "obsidian";

const ACCENT_PALETTES: Readonly<
  Record<
    ShareCardAccent,
    {
      readonly label: string;
      readonly gradStart: string;
      readonly gradEnd: string;
      readonly glow: string;
      readonly badgeBg: string;
      readonly badgeText: string;
    }
  >
> = {
  crimson: {
    label: "Crimson",
    gradStart: "#F43F5E",
    gradEnd: "#9F1239",
    glow: "rgba(244, 63, 94, 0.22)",
    badgeBg: "rgba(244, 63, 94, 0.2)",
    badgeText: "#FDA4AF",
  },
  violet: {
    label: "Violet",
    gradStart: "#A855F7",
    gradEnd: "#5B21B6",
    glow: "rgba(168, 85, 247, 0.22)",
    badgeBg: "rgba(168, 85, 247, 0.2)",
    badgeText: "#E9D5FF",
  },
  obsidian: {
    label: "OLED",
    gradStart: "#94A3B8",
    gradEnd: "#334155",
    glow: "rgba(148, 163, 184, 0.16)",
    badgeBg: "rgba(255, 255, 255, 0.12)",
    badgeText: "#E2E8F0",
  },
};

const listeners = new Set<(request: ShareCardRequest) => void>();

export function openShareCard(request: ShareCardRequest): void {
  for (const listener of listeners) {
    listener(request);
  }
}

type SvgWithToDataUrl = Svg & {
  toDataURL?: (callback: (base64?: string) => void) => void;
};

async function writeBase64Png(base64: string, fileName: string): Promise<string> {
  const { File, Paths } = await import("expo-file-system");
  const clean = base64.replace(/^data:image\/\w+;base64,/, "").replace(/\s+/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const file = new File(Paths.cache, fileName);
  file.create({ intermediates: true, overwrite: true });
  await file.write(bytes);
  return file.uri;
}

const CARD_WIDTH = 360;
const LINE_HEIGHT = 19;

export const ShareCardHost = memo(function ShareCardHost(props: {
  readonly defaultThemeId: MobileThemeId;
}) {
  const gt = useGT();
  const insets = useSafeAreaInsets();
  const themeId = props.defaultThemeId;
  const [request, setRequest] = useState<ShareCardRequest | null>(null);
  const [renderedRequest, setRenderedRequest] = useState<ShareCardRequest | null>(null);
  const [accent, setAccent] = useState<ShareCardAccent>("crimson");
  const [exporting, setExporting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const svgRef = useRef<SvgWithToDataUrl | null>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- subscribes to global imperative share-card requests
  useEffect(() => {
    const onOpen = (next: ShareCardRequest) => {
      setErrorText(null);
      setAccent(
        themeId === "akeno-violet"
          ? "violet"
          : themeId === "rias-crimson"
            ? "crimson"
            : "obsidian",
      );
      setRenderedRequest(next);
      setRequest(next);
    };
    listeners.add(onOpen);
    return () => {
      listeners.delete(onOpen);
    };
  }, [themeId]);

  const activeRequest = request ?? renderedRequest;

  const lines = useMemo(() => {
    if (!activeRequest) return [];
    return wrapShareCardLines(activeRequest.body, activeRequest.isCode ? 42 : 44, 24);
  }, [activeRequest]);

  if (!activeRequest) return null;

  const palette = ACCENT_PALETTES[accent];
  const bodyTop = 92;
  const cardHeight = Math.max(220, bodyTop + lines.length * LINE_HEIGHT + 56);
  const dateStamp = new Date().toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  const handleSharePng = async () => {
    const svg = svgRef.current;
    if (!svg?.toDataURL || exporting) return;
    setExporting(true);
    setErrorText(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        svg.toDataURL?.((data?: string) => {
          if (data && data.length > 0) resolve(data);
          else reject(new Error("Empty card image"));
        });
      });
      const uri = await writeBase64Png(base64, `rias-share-card-${Date.now()}.png`);
      const Sharing = await import("expo-sharing");
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        setErrorText(gt("Sharing is not available on this device."));
        setExporting(false);
        return;
      }
      playUiSound("done");
      await Sharing.shareAsync(uri, {
        mimeType: "image/png",
        dialogTitle: gt("Share Rias Code card"),
      });
      setExporting(false);
    } catch {
      setErrorText(gt("Could not export share card. Try again."));
      setExporting(false);
    }
  };

  return (
    <AppleSheetModal
      visible={request !== null}
      variant="fullscreen"
      backdropColor="rgba(4, 4, 8, 0.92)"
      onClose={() => setRequest(null)}
    >
      <View
        style={[
          styles.backdrop,
          { paddingTop: insets.top + 14, paddingBottom: Math.max(insets.bottom, 16) + 12 },
        ]}
      >
        <View style={styles.topBar}>
          <Text style={styles.sheetTitle}>{gt("Share card")}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={gt("Close share card")}
            onPress={() => setRequest(null)}
            style={styles.closeBtn}
          >
            <SymbolView name="xmark" size={18} tintColor="#FFFFFF" type="monochrome" />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.previewScroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.cardShadow}>
            <Svg
              ref={(node) => {
                svgRef.current = node as SvgWithToDataUrl | null;
              }}
              width={CARD_WIDTH}
              height={cardHeight}
              viewBox={`0 0 ${CARD_WIDTH} ${cardHeight}`}
            >
              <Defs>
                <LinearGradient id="cardBorderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <Stop offset="0%" stopColor={palette.gradStart} stopOpacity="0.85" />
                  <Stop offset="55%" stopColor="#FFFFFF" stopOpacity="0.16" />
                  <Stop offset="100%" stopColor={palette.gradEnd} stopOpacity="0.8" />
                </LinearGradient>
                <LinearGradient id="cardBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <Stop offset="0%" stopColor="#12121A" stopOpacity="1" />
                  <Stop offset="100%" stopColor="#07070B" stopOpacity="1" />
                </LinearGradient>
              </Defs>

              <Rect
                x={0}
                y={0}
                width={CARD_WIDTH}
                height={cardHeight}
                rx={24}
                fill="url(#cardBgGrad)"
              />
              <Circle cx={CARD_WIDTH - 36} cy={32} r={76} fill={palette.glow} />
              <Rect
                x={1}
                y={1}
                width={CARD_WIDTH - 2}
                height={cardHeight - 2}
                rx={23}
                fill="none"
                stroke="url(#cardBorderGrad)"
                strokeWidth={1.6}
              />

              {/* Header */}
              <Rect x={20} y={20} width={104} height={24} rx={12} fill={palette.badgeBg} />
              <SvgText
                x={32}
                y={36}
                fill={palette.badgeText}
                fontSize={11}
                fontWeight="700"
                fontFamily="sans-serif"
              >
                ✦ RIAS CODE
              </SvgText>
              <SvgText
                x={CARD_WIDTH - 20}
                y={36}
                fill="rgba(255,255,255,0.45)"
                fontSize={11}
                textAnchor="end"
                fontFamily="sans-serif"
              >
                {activeRequest.subtitle
                  ? `${activeRequest.title} · ${activeRequest.subtitle}`
                  : activeRequest.title}
              </SvgText>

              {/* Subtle divider */}
              <Rect
                x={20}
                y={60}
                width={CARD_WIDTH - 40}
                height={1}
                fill="rgba(255,255,255,0.1)"
              />

              {/* Body */}
              {lines.map((line, index) => (
                <SvgText
                  key={index}
                  x={22}
                  y={bodyTop + index * LINE_HEIGHT}
                  fill={activeRequest.isCode ? "#E6EDF3" : "#F4F4F5"}
                  fontSize={activeRequest.isCode ? 12 : 12.8}
                  fontFamily={
                    activeRequest.isCode ? (Platform.OS === "ios" ? "Menlo" : "monospace") : "sans-serif"
                  }
                >
                  {line}
                </SvgText>
              ))}

              {/* Footer */}
              <Rect
                x={20}
                y={cardHeight - 36}
                width={CARD_WIDTH - 40}
                height={1}
                fill="rgba(255,255,255,0.08)"
              />
              <Circle cx={26} cy={cardHeight - 19} r={3.5} fill={palette.gradStart} />
              <SvgText
                x={36}
                y={cardHeight - 15}
                fill="rgba(255,255,255,0.48)"
                fontSize={10.5}
                fontFamily="sans-serif"
              >
                Pure OLED · Rias Code
              </SvgText>
              <SvgText
                x={CARD_WIDTH - 20}
                y={cardHeight - 15}
                fill="rgba(255,255,255,0.4)"
                fontSize={10.5}
                textAnchor="end"
                fontFamily="sans-serif"
              >
                {dateStamp}
              </SvgText>
            </Svg>
          </View>
        </ScrollView>

        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

        <View style={styles.footerControls}>
          <View style={styles.accentRow}>
            {(["crimson", "violet", "obsidian"] as const).map((key) => {
              const item = ACCENT_PALETTES[key];
              const selected = accent === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setAccent(key);
                  }}
                  style={[
                    styles.accentChip,
                    selected && {
                      borderColor: item.gradStart,
                      backgroundColor: item.badgeBg,
                    },
                  ]}
                >
                  <View style={[styles.accentDot, { backgroundColor: item.gradStart }]} />
                  <Text style={styles.accentLabel}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={exporting}
            onPress={() => void handleSharePng()}
            style={[styles.shareBtn, { backgroundColor: palette.gradStart }]}
          >
            {exporting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <SymbolView name="square.and.arrow.up" size={16} tintColor="#FFFFFF" type="monochrome" />
                <Text style={styles.shareBtnText}>{gt("Share PNG card")}</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </AppleSheetModal>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    paddingHorizontal: 16,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sheetTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  previewScroll: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  cardShadow: {
    borderRadius: 24,
    overflow: "hidden",
  },
  errorText: {
    color: "#FB7185",
    fontSize: 12.5,
    textAlign: "center",
    marginBottom: 8,
  },
  footerControls: {
    gap: 12,
    paddingTop: 10,
  },
  accentRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  accentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  accentDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  accentLabel: {
    color: "#F4F4F5",
    fontSize: 12.5,
    fontWeight: "600",
  },
  shareBtn: {
    height: 48,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  shareBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
