export type AndroidNavigationStyle = "one-ui" | "material";

export function resolveAndroidNavigationStyle(
  preference: AndroidNavigationStyle | undefined,
  _manufacturer: string | null,
  _previewEnabled: boolean,
): AndroidNavigationStyle {
  return preference ?? "one-ui";
}
