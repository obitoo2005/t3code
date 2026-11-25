import { Image } from "expo-image";
import { useGT } from "gt-react-native";
import { Platform, View } from "react-native";

import { IPAD_HOME_TITLE_OFFSET } from "../lib/layoutMetrics";
import { NATIVE_WORKSPACE_COLUMNS_SUPPORTED } from "../native/NativeWorkspaceColumns";
import { T3_CODE_BRAND_MARK_SOURCE } from "./brandAssets";
import { AppText as Text } from "./ui/AppText";
import { useAndroidControlSizing } from "./ui/useAndroidControlSizing";

const BRAND_MAX_FONT_SCALE = 1.4;

export function brandTitleOffset(): number {
  if (Platform.OS !== "ios") return 0;
  return Platform.isPad && !NATIVE_WORKSPACE_COLUMNS_SUPPORTED ? IPAD_HOME_TITLE_OFFSET : 0;
}

export function CompactBrandTitle(
  props: {
    readonly allowFontScaling?: boolean;
    readonly accessibilityLabel?: string;
    /** Fills the row and keeps the brand mark cleanly sized when width is constrained. */
    readonly fit?: boolean;
  } = {},
) {
  const gt = useGT();
  const titleOffset = brandTitleOffset();
  const { scale } = useAndroidControlSizing();
  const clampedScale = Math.min(scale, 1.15);
  const iconSize = Math.round(32 * clampedScale);
  const iconRadius = Math.round(9 * clampedScale);

  const title = (
    <View
      aria-level={1}
      accessibilityLabel={props.accessibilityLabel ?? gt("Rias Code, Threads")}
      accessible
      role="heading"
      className="flex-row items-center"
      style={[
        { marginLeft: titleOffset, gap: Math.round(9 * clampedScale) },
        props.fit && { flexShrink: 1 },
      ]}
    >
      <View
        style={{
          width: iconSize,
          height: iconSize,
          borderRadius: iconRadius,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: "rgba(255, 255, 255, 0.22)",
          borderTopColor: "rgba(255, 255, 255, 0.34)",
          boxShadow: [
            {
              offsetX: 0,
              offsetY: 3,
              blurRadius: 10,
              color: "rgba(197, 1, 46, 0.28)",
            },
          ],
        }}
      >
        <Image
          source={T3_CODE_BRAND_MARK_SOURCE}
          accessibilityIgnoresInvertColors
          contentFit="cover"
          style={{ width: "100%", height: "100%" }}
        />
      </View>
      <View className="flex-row items-baseline" style={{ gap: Math.round(5 * clampedScale) }}>
        <Text
          allowFontScaling={props.allowFontScaling}
          maxFontSizeMultiplier={BRAND_MAX_FONT_SCALE}
          numberOfLines={1}
          className="font-t3-bold text-foreground"
          style={{ fontSize: 20 * clampedScale, letterSpacing: -0.45 * clampedScale }}
        >
          Rias
        </Text>
        <Text
          allowFontScaling={props.allowFontScaling}
          maxFontSizeMultiplier={BRAND_MAX_FONT_SCALE}
          numberOfLines={1}
          className="font-t3-medium text-foreground-muted"
          style={{ fontSize: 20 * clampedScale, letterSpacing: -0.45 * clampedScale }}
        >
          Code
        </Text>
      </View>
    </View>
  );

  return props.fit ? (
    <View className="min-w-0 flex-1 flex-row items-center">{title}</View>
  ) : (
    title
  );
}
