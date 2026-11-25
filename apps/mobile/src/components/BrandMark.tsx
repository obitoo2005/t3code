import { Image } from "expo-image";
import { T } from "gt-react-native";
import { View } from "react-native";

import { T3_CODE_BRAND_MARK_SOURCE } from "./brandAssets";
import { AppText as Text } from "./ui/AppText";

export function BrandMark(props: { readonly compact?: boolean; readonly stageLabel?: string }) {
  const compact = props.compact ?? false;
  const iconSize = compact ? 36 : 48;
  const radius = compact ? 10 : 14;

  return (
    <View className="flex-row items-center gap-3">
      <View
        style={{
          width: iconSize,
          height: iconSize,
          borderRadius: radius,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: "rgba(255, 255, 255, 0.22)",
          borderTopColor: "rgba(255, 255, 255, 0.34)",
        }}
      >
        <Image
          source={T3_CODE_BRAND_MARK_SOURCE}
          accessibilityIgnoresInvertColors
          contentFit="cover"
          style={{ width: "100%", height: "100%" }}
        />
      </View>
      <View className="gap-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-lg font-t3-bold tracking-[-0.4px] text-foreground">Rias Code</Text>
          {props.stageLabel ? (
            <View className="rounded-full bg-subtle px-2 py-1">
              <Text className="text-3xs font-t3-bold tracking-[1.1px] uppercase text-foreground-muted">
                {props.stageLabel}
              </Text>
            </View>
          ) : null}
        </View>
        {!compact ? (
          <Text className="text-xs font-medium text-foreground-muted">
            <T>Mobile control surface for your live coding environments</T>
          </Text>
        ) : null}
      </View>
    </View>
  );
}
