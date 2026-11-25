import type { MenuAction } from "@react-native-menu/menu";
import type { ComponentRef, RefObject } from "react";
import type { View } from "react-native";

export interface MenuPopupPlacement {
  readonly left: number;
  readonly maxHeight: number;
  readonly top?: number;
  readonly bottom?: number;
}

export interface MenuPopupProps {
  readonly menuWidth: number;
  readonly anchor: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly placement?: MenuPopupPlacement;
  readonly blurTarget?: RefObject<ComponentRef<typeof View> | null> | null;
  readonly actions: readonly MenuAction[];
  readonly title?: string;
  readonly parent: MenuAction | null;
  readonly onPress: (action: MenuAction) => void;
  readonly onBack: () => void;
  readonly onClose: () => void;
  readonly inline?: boolean;
}

export function MenuPopup(_props: MenuPopupProps) {
  return null;
}
