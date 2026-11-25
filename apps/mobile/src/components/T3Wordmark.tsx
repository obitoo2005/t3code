import { Image } from "expo-image";
import type { ColorValue } from "react-native";
import { View } from "react-native";

import { T3_CODE_BRAND_MARK_SOURCE } from "./brandAssets";

export function T3Wordmark(props: {
  readonly height: number;
  readonly color?: ColorValue;
  readonly colorClassName?: string;
}) {
  const size = Math.max(12, Math.round(props.height * 1.15));
  const radius = Math.max(3, Math.round(size * 0.28));
  return (
    <View
      accessible
      accessibilityLabel="Rias Code"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        overflow: "hidden",
        borderWidth: size >= 18 ? 1 : 0,
        borderColor: "rgba(255, 255, 255, 0.20)",
      }}
    >
      <Image
        source={T3_CODE_BRAND_MARK_SOURCE}
        accessibilityIgnoresInvertColors
        contentFit="cover"
        style={{ width: "100%", height: "100%" }}
      />
    </View>
  );
}
