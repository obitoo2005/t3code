import * as Haptics from "expo-haptics";
import { useGT } from "gt-react-native";
import { memo, useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Ellipse, Image as SvgImage, Line, Path, Polygon } from "react-native-svg";

import { playUiSound } from "../lib/uiSoundFx";
import { AppActivityIndicator } from "./ui/AppActivityIndicator";
import { SymbolView } from "./ui/AppSymbol";

type AnnotatorTool = "pen" | "arrow" | "circle";

interface PenStroke {
  readonly kind: "pen";
  readonly color: string;
  readonly width: number;
  readonly points: ReadonlyArray<{ readonly x: number; readonly y: number }>;
}

interface ShapeStroke {
  readonly kind: "arrow" | "circle";
  readonly color: string;
  readonly width: number;
  readonly start: { readonly x: number; readonly y: number };
  readonly end: { readonly x: number; readonly y: number };
}

type AnnotationStroke = PenStroke | ShapeStroke;

const PALETTE_COLORS = [
  "#F43F5E", // Crimson
  "#A855F7", // Violet
  "#FACC15", // Gold
  "#38BDF8", // Cyan
  "#FFFFFF", // White
] as const;

type SvgWithToDataUrl = Svg & {
  toDataURL?: (callback: (base64?: string) => void) => void;
};

interface PreparedImage {
  readonly dataUri: string;
  readonly width: number;
  readonly height: number;
}

async function prepareImageForAnnotator(uri: string): Promise<PreparedImage> {
  const { File, Paths } = await import("expo-file-system");
  const { ImageManipulator, SaveFormat } = await import("expo-image-manipulator");

  let workingUri = uri;
  let downloadedFile: InstanceType<typeof File> | null = null;
  if (/^https?:\/\//i.test(uri)) {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`Could not download image (${response.status})`);
    }
    const buffer = await response.arrayBuffer();
    downloadedFile = new File(Paths.cache, `rias-annot-src-${Date.now()}.bin`);
    downloadedFile.create({ intermediates: true, overwrite: true });
    await downloadedFile.write(new Uint8Array(buffer));
    workingUri = downloadedFile.uri;
  }

  let image = await ImageManipulator.manipulate(workingUri).renderAsync();
  try {
    const maxEdge = 1080;
    if (image.width > maxEdge || image.height > maxEdge) {
      const scale = maxEdge / Math.max(image.width, image.height);
      const resized = await ImageManipulator.manipulate(image)
        .resize({
          width: Math.max(1, Math.round(image.width * scale)),
          height: Math.max(1, Math.round(image.height * scale)),
        })
        .renderAsync();
      image.release();
      image = resized;
    }
    const saved = await image.saveAsync({
      format: SaveFormat.JPEG,
      compress: 0.9,
      base64: true,
    });
    if (!saved.base64) {
      throw new Error("Could not encode image");
    }
    try {
      const tmp = new File(saved.uri);
      if (tmp.exists) tmp.delete();
    } catch {}
    return {
      dataUri: `data:image/jpeg;base64,${saved.base64}`,
      width: image.width,
      height: image.height,
    };
  } finally {
    image.release();
    try {
      if (downloadedFile?.exists) downloadedFile.delete();
    } catch {}
  }
}

async function writeAnnotatedPng(base64: string): Promise<string> {
  const { File, Paths } = await import("expo-file-system");
  const clean = base64.replace(/^data:image\/\w+;base64,/, "").replace(/\s+/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const out = new File(Paths.cache, `rias-annotated-${Date.now()}.png`);
  out.create({ intermediates: true, overwrite: true });
  await out.write(bytes);
  return out.uri;
}

function buildPenPath(points: ReadonlyArray<{ readonly x: number; readonly y: number }>): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const p = points[0]!;
    return `M ${p.x.toFixed(1)} ${p.y.toFixed(1)} L ${(p.x + 0.5).toFixed(1)} ${(p.y + 0.5).toFixed(1)}`;
  }
  let d = `M ${points[0]!.x.toFixed(1)} ${points[0]!.y.toFixed(1)}`;
  for (let i = 1; i < points.length; i += 1) {
    const p = points[i]!;
    d += ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }
  return d;
}

function arrowHeadPoints(
  start: { readonly x: number; readonly y: number },
  end: { readonly x: number; readonly y: number },
  headLength: number,
): string {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const spread = Math.PI / 6;
  const x1 = end.x - headLength * Math.cos(angle - spread);
  const y1 = end.y - headLength * Math.sin(angle - spread);
  const x2 = end.x - headLength * Math.cos(angle + spread);
  const y2 = end.y - headLength * Math.sin(angle + spread);
  return `${end.x.toFixed(1)},${end.y.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
}

function renderStroke(stroke: AnnotationStroke, key: string) {
  if (stroke.kind === "pen") {
    return (
      <Path
        key={key}
        d={buildPenPath(stroke.points)}
        stroke={stroke.color}
        strokeWidth={stroke.width}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    );
  }
  if (stroke.kind === "circle") {
    const cx = (stroke.start.x + stroke.end.x) / 2;
    const cy = (stroke.start.y + stroke.end.y) / 2;
    const rx = Math.max(4, Math.abs(stroke.end.x - stroke.start.x) / 2);
    const ry = Math.max(4, Math.abs(stroke.end.y - stroke.start.y) / 2);
    return (
      <Ellipse
        key={key}
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        stroke={stroke.color}
        strokeWidth={stroke.width}
        fill="none"
      />
    );
  }
  return null;
}

export const ImageAnnotatorModal = memo(function ImageAnnotatorModal(props: {
  readonly visible: boolean;
  readonly imageUri: string | null;
  readonly confirmLabel?: string;
  readonly onClose: () => void;
  readonly onConfirm: (annotatedLocalUri: string) => void | Promise<void>;
}) {
  const gt = useGT();
  const insets = useSafeAreaInsets();
  const [prepared, setPrepared] = useState<PreparedImage | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [tool, setTool] = useState<AnnotatorTool>("pen");
  const [color, setColor] = useState<string>(PALETTE_COLORS[0]);
  const [thick, setThick] = useState(false);
  const [strokes, setStrokes] = useState<ReadonlyArray<AnnotationStroke>>([]);
  const [activeStroke, setActiveStroke] = useState<AnnotationStroke | null>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const svgRef = useRef<SvgWithToDataUrl | null>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- loads and downscales the target image whenever the annotator opens
  useEffect(() => {
    if (!props.visible || !props.imageUri) {
      setPrepared(null);
      setStrokes([]);
      setActiveStroke(null);
      setErrorText(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErrorText(null);
    setStrokes([]);
    setActiveStroke(null);
    void prepareImageForAnnotator(props.imageUri)
      .then((result) => {
        if (!cancelled) {
          setPrepared(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setErrorText(gt("Could not load this image for drawing."));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [props.visible, props.imageUri, gt]);

  if (!props.visible) return null;

  const fitted = (() => {
    if (!prepared || stageSize.width <= 0 || stageSize.height <= 0) {
      return { width: 0, height: 0 };
    }
    const scale = Math.min(stageSize.width / prepared.width, stageSize.height / prepared.height);
    return {
      width: Math.max(1, Math.floor(prepared.width * scale)),
      height: Math.max(1, Math.floor(prepared.height * scale)),
    };
  })();

  const toImageCoords = (event: GestureResponderEvent) => {
    if (!prepared || fitted.width <= 0 || fitted.height <= 0) return null;
    const x = (event.nativeEvent.locationX / fitted.width) * prepared.width;
    const y = (event.nativeEvent.locationY / fitted.height) * prepared.height;
    return {
      x: Math.max(0, Math.min(prepared.width, x)),
      y: Math.max(0, Math.min(prepared.height, y)),
    };
  };

  const strokeWidthPx = prepared
    ? Math.max(3, Math.round((prepared.width / 360) * (thick ? 7.5 : 4.2)))
    : 6;

  const handleTouchStart = (event: GestureResponderEvent) => {
    const pt = toImageCoords(event);
    if (!pt) return;
    if (tool === "pen") {
      setActiveStroke({ kind: "pen", color, width: strokeWidthPx, points: [pt] });
    } else {
      setActiveStroke({ kind: tool, color, width: strokeWidthPx, start: pt, end: pt });
    }
  };

  const handleTouchMove = (event: GestureResponderEvent) => {
    const pt = toImageCoords(event);
    if (!pt) return;
    setActiveStroke((current) => {
      if (!current) return null;
      if (current.kind === "pen") {
        const last = current.points[current.points.length - 1];
        if (last && Math.hypot(pt.x - last.x, pt.y - last.y) < 3) return current;
        return { ...current, points: [...current.points, pt] };
      }
      return { ...current, end: pt };
    });
  };

  const handleTouchEnd = () => {
    setActiveStroke((current) => {
      if (current) {
        setStrokes((prev) => [...prev, current]);
      }
      return null;
    });
  };

  const handleStageLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setStageSize({ width: Math.floor(width), height: Math.floor(height) });
  };

  const handleConfirm = async () => {
    const svg = svgRef.current;
    if (!svg?.toDataURL || !prepared || saving) return;
    setSaving(true);
    setErrorText(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        svg.toDataURL?.((data?: string) => {
          if (data && data.length > 0) resolve(data);
          else reject(new Error("Empty export"));
        });
      });
      const uri = await writeAnnotatedPng(base64);
      playUiSound("done");
      await props.onConfirm(uri);
      setSaving(false);
    } catch {
      setErrorText(gt("Could not save annotated image. Try again."));
      setSaving(false);
    }
  };

  const allStrokes = activeStroke ? [...strokes, activeStroke] : strokes;

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
          { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 12) },
        ]}
      >
        {/* Top bar */}
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={gt("Cancel annotation")}
            onPress={props.onClose}
            style={styles.headerBtn}
          >
            <SymbolView name="xmark" size={18} tintColor="#FFFFFF" type="monochrome" />
          </Pressable>

          <Text style={styles.headerTitle}>{gt("Annotate")}</Text>

          <View style={styles.headerRight}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={gt("Undo stroke")}
              disabled={strokes.length === 0 || saving}
              onPress={() => {
                void Haptics.selectionAsync();
                setStrokes((prev) => prev.slice(0, -1));
              }}
              style={[styles.headerBtn, strokes.length === 0 && styles.disabled]}
            >
              <SymbolView name="arrow.uturn.backward" size={16} tintColor="#FFFFFF" type="monochrome" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={gt("Clear drawings")}
              disabled={strokes.length === 0 || saving}
              onPress={() => {
                void Haptics.selectionAsync();
                setStrokes([]);
              }}
              style={[styles.headerBtn, strokes.length === 0 && styles.disabled]}
            >
              <SymbolView name="trash" size={16} tintColor="#FFFFFF" type="monochrome" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={!prepared || saving}
              onPress={() => void handleConfirm()}
              style={[styles.doneBtn, (!prepared || saving) && styles.disabled]}
            >
              {saving ? (
                <AppActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <SymbolView name="checkmark" size={15} tintColor="#FFFFFF" type="monochrome" />
                  <Text style={styles.doneLabel}>{props.confirmLabel ?? gt("Attach")}</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>

        {/* Drawing stage */}
        <View style={styles.stage} onLayout={handleStageLayout}>
          {loading ? (
            <AppActivityIndicator size="large" color="#F43F5E" />
          ) : errorText ? (
            <Text style={styles.errorText}>{errorText}</Text>
          ) : prepared && fitted.width > 0 ? (
            <View
              style={[styles.canvasFrame, { width: fitted.width, height: fitted.height }]}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={handleTouchStart}
              onResponderMove={handleTouchMove}
              onResponderRelease={handleTouchEnd}
              onResponderTerminate={handleTouchEnd}
            >
              <Svg
                ref={(node) => {
                  svgRef.current = node as SvgWithToDataUrl | null;
                }}
                width={fitted.width}
                height={fitted.height}
                viewBox={`0 0 ${prepared.width} ${prepared.height}`}
              >
                <SvgImage
                  href={prepared.dataUri}
                  x={0}
                  y={0}
                  width={prepared.width}
                  height={prepared.height}
                  preserveAspectRatio="none"
                />
                {allStrokes.map((stroke, idx) => {
                  if (stroke.kind === "arrow") {
                    const headLen = Math.max(18, stroke.width * 3.8);
                    return (
                      <ReactFragmentArrow
                        key={`s-${idx}`}
                        stroke={stroke}
                        headLen={headLen}
                      />
                    );
                  }
                  return renderStroke(stroke, `s-${idx}`);
                })}
              </Svg>
            </View>
          ) : null}
        </View>

        {/* Bottom tool dock */}
        <View style={styles.dock}>
          <View style={styles.toolRow}>
            {(
              [
                { id: "pen", label: gt("Pen"), icon: "pencil" },
                { id: "arrow", label: gt("Arrow"), icon: "arrow.up.right" },
                { id: "circle", label: gt("Circle"), icon: "circle" },
              ] as const
            ).map((item) => {
              const active = tool === item.id;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setTool(item.id);
                  }}
                  style={[styles.toolBtn, active && styles.toolBtnActive]}
                >
                  <SymbolView
                    name={item.icon}
                    size={15}
                    tintColor={active ? "#FFFFFF" : "#A1A1AA"}
                    type="monochrome"
                  />
                  <Text style={[styles.toolLabel, active && styles.toolLabelActive]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={gt("Toggle stroke thickness")}
              onPress={() => {
                void Haptics.selectionAsync();
                setThick((value) => !value);
              }}
              style={[styles.toolBtn, thick && styles.toolBtnActive]}
            >
              <View
                style={{
                  width: thick ? 12 : 7,
                  height: thick ? 12 : 7,
                  borderRadius: 6,
                  backgroundColor: color,
                }}
              />
            </Pressable>
          </View>

          <View style={styles.colorRow}>
            {PALETTE_COLORS.map((swatch) => {
              const selected = color === swatch;
              return (
                <Pressable
                  key={swatch}
                  accessibilityRole="button"
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setColor(swatch);
                  }}
                  style={[styles.swatchOuter, selected && { borderColor: "#FFFFFF" }]}
                >
                  <View style={[styles.swatchInner, { backgroundColor: swatch }]} />
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
});

function ReactFragmentArrow(props: { readonly stroke: ShapeStroke; readonly headLen: number }) {
  const { stroke, headLen } = props;
  return (
    <>
      <Line
        x1={stroke.start.x}
        y1={stroke.start.y}
        x2={stroke.end.x}
        y2={stroke.end.y}
        stroke={stroke.color}
        strokeWidth={stroke.width}
        strokeLinecap="round"
      />
      <Polygon
        points={arrowHeadPoints(stroke.start, stroke.end, headLen)}
        fill={stroke.color}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#050508",
  },
  header: {
    height: 54,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(16, 16, 22, 0.96)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  doneBtn: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F43F5E",
  },
  doneLabel: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.35,
  },
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  canvasFrame: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  errorText: {
    color: "#FB7185",
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  dock: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 12,
    backgroundColor: "rgba(16, 16, 22, 0.96)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.12)",
  },
  toolRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  toolBtn: {
    height: 36,
    paddingHorizontal: 13,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  toolBtnActive: {
    backgroundColor: "rgba(244, 63, 94, 0.24)",
    borderColor: "#F43F5E",
  },
  toolLabel: {
    color: "#A1A1AA",
    fontSize: 12.5,
    fontWeight: "600",
  },
  toolLabelActive: {
    color: "#FFFFFF",
  },
  colorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  swatchOuter: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  swatchInner: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
});
