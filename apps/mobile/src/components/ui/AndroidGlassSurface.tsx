import type { ReactNode } from "react";
import {
  Pressable,
  View,
  type Insets,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from "react-native";

export type AndroidGlassTone = "chrome" | "elevated" | "composer" | "menu";

export interface AndroidGlassSurfaceProps extends ViewProps {
  readonly children?: ReactNode;
  readonly radius?: number;
  readonly intensity?: number;
  readonly tone?: AndroidGlassTone;
  readonly blurTarget?: unknown;
  readonly contentStyle?: StyleProp<ViewStyle>;
}

export function AndroidGlassSurface({ children, style, ...props }: AndroidGlassSurfaceProps) {
  return (
    <View {...props} style={style}>
      {children}
    </View>
  );
}

export function AndroidGlassHeaderScrim(_props: {
  readonly color: string;
  readonly height: number;
}) {
  return null;
}

export function AndroidGlassPressable(props: {
  readonly children: ReactNode;
  readonly onPress?: () => void;
  readonly disabled?: boolean;
  readonly accessibilityLabel?: string;
  readonly accessibilityRole?: "button" | "tab";
  readonly accessibilitySelected?: boolean;
  readonly hitSlop?: Insets | number;
  readonly style?: StyleProp<ViewStyle>;
  readonly contentStyle?: StyleProp<ViewStyle>;
  readonly scaleTo?: number;
  readonly bloomRadius?: number;
}) {
  return (
    <Pressable
      disabled={props.disabled}
      onPress={props.onPress}
      hitSlop={props.hitSlop}
      accessibilityRole={props.accessibilityRole ?? "button"}
      accessibilityLabel={props.accessibilityLabel}
      style={props.style}
    >
      <View style={props.contentStyle}>{props.children}</View>
    </Pressable>
  );
}
