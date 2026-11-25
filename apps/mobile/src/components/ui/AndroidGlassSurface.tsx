import type { ReactNode } from "react";
import { View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";

export type AndroidGlassTone = "chrome" | "elevated" | "composer";

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
  readonly style?: StyleProp<ViewStyle>;
}) {
  return <View style={props.style}>{props.children}</View>;
}
