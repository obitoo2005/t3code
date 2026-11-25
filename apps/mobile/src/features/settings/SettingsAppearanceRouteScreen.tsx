import { useGT } from "gt-react-native";
import { Platform } from "react-native";
import { AndroidNavigationAppearanceSection } from "./appearance/sections/AndroidNavigationAppearanceSection";
import { ScreenScrollView as ScrollView } from "../../components/ui/ScreenScrollView";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { View } from "react-native";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { SettingsScreen } from "./components/SettingsScreen";
import { SettingsSection } from "./components/SettingsSection";
import { SettingsSwitchRow } from "./components/SettingsSwitchRow";
import { useAppearancePreferences } from "./appearance/AppearancePreferencesProvider";
import { CodeAppearanceSection } from "./appearance/sections/CodeAppearanceSection";
import { TerminalAppearanceSection } from "./appearance/sections/TerminalAppearanceSection";
import { TextAppearanceSection } from "./appearance/sections/TextAppearanceSection";
import { ThemeAppearanceSection } from "./appearance/sections/ThemeAppearanceSection";
import { ToolCallsAppearanceSection } from "./appearance/sections/ToolCallsAppearanceSection";
import { playUiSound } from "../../lib/uiSoundFx";

function MascotAppearanceSection() {
  const gt = useGT();
  const { mascotPreference, setMascotPreference } = useAppearancePreferences();
  return (
    <SettingsSection title={gt("Companion mascot")}>
      <View className="px-4 py-3">
        <SegmentedControl
          selected={mascotPreference}
          onSelect={(value) => {
            setMascotPreference(value);
            playUiSound("shuffle");
          }}
          options={[
            { value: "rias", label: gt("Rias") },
            { value: "akeno", label: gt("Akeno") },
            { value: "random", label: gt("Both") },
          ]}
        />
      </View>
    </SettingsSection>
  );
}

function SoundFxAppearanceSection() {
  const gt = useGT();
  const { isReady, soundFxEnabled, setSoundFxEnabled } = useAppearancePreferences();
  return (
    <SettingsSection title={gt("Sound effects")}>
      <SettingsSwitchRow
        label={gt("UI sound effects")}
        subtitle={gt("Soft chimes on message send, turn completion, and avatar shuffle.")}
        value={soundFxEnabled}
        disabled={!isReady}
        onValueChange={(next) => {
          setSoundFxEnabled(next);
          if (next) playUiSound("shuffle", { force: true });
        }}
      />
    </SettingsSection>
  );
}

export function SettingsAppearanceRouteScreen() {
  const gt = useGT();
  const insets = useSafeAreaInsets();

  return (
    <SettingsScreen title={gt("Appearance")}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="gap-6 px-5 pt-4"
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom, 18) + 18,
        }}
      >
        <ThemeAppearanceSection />
        <MascotAppearanceSection />
        <SoundFxAppearanceSection />
        {Platform.OS === "android" ? <AndroidNavigationAppearanceSection /> : null}
        <TextAppearanceSection />
        <TerminalAppearanceSection />
        <CodeAppearanceSection />
        <ToolCallsAppearanceSection />
      </ScrollView>
    </SettingsScreen>
  );
}
