import * as Haptics from "expo-haptics";
import { useGT } from "gt-react-native";
import { useState } from "react";
import { Platform, Pressable, TextInput, View } from "react-native";
import { AndroidNavigationAppearanceSection } from "./appearance/sections/AndroidNavigationAppearanceSection";
import { ScreenScrollView as ScrollView } from "../../components/ui/ScreenScrollView";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/ui/AppText";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import {
  clearAkenoPackOverride,
  saveAkenoPackOverride,
  syncAkenoPosePack,
  useAkenoPosePack,
} from "../../lib/akenoPosePack";
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

function AkenoPosePackCard() {
  const gt = useGT();
  const pack = useAkenoPosePack({ autoSync: false });
  const [editing, setEditing] = useState(false);
  const [urlDraft, setUrlDraft] = useState(
    pack.configuredUrl ?? "obitoo2005/rias-assets",
  );
  const [tokenDraft, setTokenDraft] = useState("");

  const isSyncing = pack.status === "syncing";
  const statusLine = isSyncing
    ? gt("Syncing poses ({downloaded}/{total})…", {
        downloaded: pack.downloadedCount,
        total: pack.totalCount || "…",
      })
    : pack.poses.length > 0
      ? gt("{count} synced poses cached • Offline ready", { count: pack.poses.length })
      : pack.configuredUrl
        ? gt("Pack configured ({source}) — tap Sync to download", {
            source: pack.configSource === "custom" ? "custom" : ".env",
          })
        : gt("6 built-in animated poses • Add pack URL to sync extras");

  return (
    <View
      className="mt-1 gap-2.5 rounded-xl border border-border px-3 py-2.5"
      style={{ backgroundColor: "rgba(192, 132, 252, 0.06)" }}
    >
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-1 gap-0.5">
          <Text textRole="label" className="text-foreground">
            {gt("Akeno pose pack")}
          </Text>
          <Text textRole="caption" className="text-foreground-muted">
            {statusLine}
          </Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <Pressable
            disabled={isSyncing}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              playUiSound("shuffle");
              void syncAkenoPosePack({ force: true });
            }}
            className="rounded-full px-3 py-1.5"
            style={{
              backgroundColor: isSyncing
                ? "rgba(192, 132, 252, 0.12)"
                : "rgba(192, 132, 252, 0.22)",
              opacity: isSyncing ? 0.6 : 1,
            }}
          >
            <Text textRole="caption" className="font-semibold text-foreground">
              {isSyncing ? gt("Syncing…") : gt("Sync")}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (!editing) {
                setUrlDraft(pack.configuredUrl ?? "obitoo2005/rias-assets");
                setTokenDraft("");
              }
              setEditing((prev) => !prev);
            }}
            className="rounded-full border border-border px-2.5 py-1.5"
          >
            <Text textRole="caption" className="text-foreground-muted">
              {editing ? gt("Close") : gt("Config")}
            </Text>
          </Pressable>
        </View>
      </View>

      {pack.errorMessage ? (
        <Text textRole="caption" style={{ color: "#FDA4AF" }}>
          {pack.errorMessage}
        </Text>
      ) : null}

      {editing ? (
        <View className="gap-2 pt-1">
          <TextInput
            value={urlDraft}
            onChangeText={setUrlDraft}
            placeholder="obitoo2005/rias-assets or https://..."
            placeholderTextColor="rgba(161, 161, 170, 0.65)"
            autoCapitalize="none"
            autoCorrect={false}
            className="rounded-lg border border-border px-3 py-2 text-xs text-foreground"
            style={{ backgroundColor: "rgba(0, 0, 0, 0.25)" }}
          />
          <TextInput
            value={tokenDraft}
            onChangeText={setTokenDraft}
            placeholder={
              pack.hasToken
                ? gt("Token saved (paste new fine-grained PAT to replace)")
                : gt("Read-only GitHub PAT (only needed for private repos)")
            }
            placeholderTextColor="rgba(161, 161, 170, 0.65)"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            className="rounded-lg border border-border px-3 py-2 text-xs text-foreground"
            style={{ backgroundColor: "rgba(0, 0, 0, 0.25)" }}
          />
          <View className="flex-row items-center justify-end gap-2">
            {pack.configSource === "custom" ? (
              <Pressable
                disabled={isSyncing}
                onPress={() => {
                  void clearAkenoPackOverride();
                  setEditing(false);
                }}
                className="rounded-full border border-border px-3 py-1.5"
              >
                <Text textRole="caption" className="text-foreground-muted">
                  {gt("Reset to .env")}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              disabled={isSyncing}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                void saveAkenoPackOverride({
                  url: urlDraft,
                  ...(tokenDraft.trim() ? { token: tokenDraft.trim() } : {}),
                }).then((next) => {
                  if (next.status === "synced") {
                    playUiSound("shuffle");
                    setEditing(false);
                  }
                });
              }}
              className="rounded-full px-3.5 py-1.5"
              style={{ backgroundColor: "rgba(192, 132, 252, 0.28)" }}
            >
              <Text textRole="caption" className="font-semibold text-foreground">
                {gt("Save & sync")}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function MascotAppearanceSection() {
  const gt = useGT();
  const { mascotPreference, setMascotPreference, composerPet, setComposerPet } =
    useAppearancePreferences();
  return (
    <>
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
      {Platform.OS === "android" ? (
        <SettingsSection title={gt("Chat bar pet")}>
          <View className="gap-2 px-4 py-3">
            <SegmentedControl
              selected={composerPet}
              onSelect={(value) => {
                setComposerPet(value);
                playUiSound("shuffle");
              }}
              options={[
                { value: "akeno", label: gt("Akeno") },
                { value: "rei", label: gt("Rei (Quota)") },
                { value: "off", label: gt("Off") },
              ]}
            />
            <Text textRole="caption" className="px-0.5 text-foreground-muted">
              {composerPet === "akeno"
                ? gt("Akeno sits on your chat bar, roams left & right, and reacts as you chat.")
                : composerPet === "rei"
                  ? gt("Rei sits on your chat bar showing your live 5-hour quota banner.")
                  : gt("Hides the chat bar companion for a minimal composer.")}
            </Text>
            {composerPet === "akeno" ? <AkenoPosePackCard /> : null}
          </View>
        </SettingsSection>
      ) : null}
    </>
  );
}

function SoundFxAppearanceSection() {
  const gt = useGT();
  const {
    isReady,
    soundFxEnabled,
    setSoundFxEnabled,
    shakeToShuffleEnabled,
    setShakeToShuffleEnabled,
  } = useAppearancePreferences();
  return (
    <SettingsSection title={gt("Sound & motion")}>
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
      {Platform.OS === "android" ? (
        <SettingsSwitchRow
          label={gt("Shake Home to shuffle avatars")}
          subtitle={gt("Give your phone a quick shake on Home to reshuffle anime chat avatars.")}
          value={shakeToShuffleEnabled}
          disabled={!isReady}
          onValueChange={(next) => {
            setShakeToShuffleEnabled(next);
            if (next) playUiSound("shuffle");
          }}
        />
      ) : null}
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
