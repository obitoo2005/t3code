import { createContext, type ComponentRef, type RefObject } from "react";
import type { View } from "react-native";

/**
 * Ref to a sibling `BlurTargetView` wrapping scrolling screen content on Android so floating
 * glass surfaces can sample and live-blur it with Android 12+ RenderEffect (`dimezisBlurViewSdk31Plus`).
 * Never provide a ref that points to an ancestor of the `BlurView`.
 */
export const AndroidBlurTargetContext =
  createContext<RefObject<ComponentRef<typeof View> | null> | null>(null);

/**
 * True when an Android screen floats its top header over the scroll canvas so `useBarOverlap()`
 * and `useContentTopInset()` reserve header clearance at the top of the scroll view.
 */
export const AndroidOverlayHeaderContext = createContext(false);
