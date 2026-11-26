import * as Haptics from "expo-haptics";
import { useGT } from "gt-react-native";
import { memo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import {
  CompanionMascotSprite,
  isLateNightHour,
  type CompanionMood,
} from "../../../components/AkenoMascot";
import { AppText as Text } from "../../../components/ui/AppText";
import { MOBILE_THEME_OPTIONS } from "../../../lib/mobileTheme";
import { getTimeOfDayGreeting } from "../../../lib/riasEnhancements";
import { playUiSound } from "../../../lib/uiSoundFx";
import { useDailyActivityStats } from "../../../state/use-rias-enhancements";
import { useAppearancePreferences } from "../appearance/AppearancePreferencesProvider";

const PET_LINES: readonly { readonly mood: CompanionMood; readonly text: string }[] = [
  { mood: "happy", text: "Hehe~ ready to ship more? ♥" },
  { mood: "surprised", text: "Ooh! Extra luck unlocked ✨" },
  { mood: "cute", text: "Pure OLED & 165Hz vibes ✦" },
  { mood: "happy", text: "Best dev squad ever 💜" },
];

export const SettingsCompanionCard = memo(function SettingsCompanionCard() {
  const gt = useGT();
  const { themeId, themeAppearance, mascotPreference } = useAppearancePreferences();
  const { turnsToday, streakDays, totalTurns } = useDailyActivityStats();
  const [petIndex, setPetIndex] = useState<number | null>(null);
  const [greeting] = useState(() => getTimeOfDayGreeting());
  const [lateNight] = useState(() => isLateNightHour());

  const isDark = themeAppearance === "dark";
  const themeLabel =
    MOBILE_THEME_OPTIONS.find((option) => option.id === themeId)?.label ?? "Rias Code";
  const accent =
    themeId === "akeno-violet"
      ? "#A855F7"
      : themeId === "rias-crimson"
        ? "#F43F5E"
        : "#60A5FA";
  const borderColor =
    themeId === "akeno-violet"
      ? isDark
        ? "rgba(168, 85, 247, 0.34)"
        : "rgba(124, 58, 237, 0.24)"
      : themeId === "rias-crimson"
        ? isDark
          ? "rgba(244, 63, 94, 0.34)"
          : "rgba(190, 18, 60, 0.24)"
        : isDark
          ? "rgba(255, 255, 255, 0.14)"
          : "rgba(0, 0, 0, 0.08)";

  const petEntry = petIndex !== null ? PET_LINES[petIndex % PET_LINES.length]! : null;
  const activeMood: CompanionMood = petEntry
    ? petEntry.mood
    : lateNight
      ? "sleepy"
      : turnsToday >= 10
        ? "happy"
        : "cute";
  const companionName =
    mascotPreference === "akeno"
      ? "Akeno"
      : mascotPreference === "rias"
        ? "Rias"
        : "Rias & Akeno";

  const handlePet = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playUiSound("shuffle");
    setPetIndex((current) => (current === null ? 0 : current + 1));
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={gt("Companion summary card. Tap to pet.")}
      onPress={handlePet}
      style={[
        styles.card,
        {
          backgroundColor: isDark ? "rgba(16, 16, 22, 0.92)" : "rgba(255, 255, 255, 0.92)",
          borderColor,
        },
      ]}
    >
      <View style={styles.topRow}>
        <CompanionMascotSprite mood={activeMood} size={76} glow onPress={handlePet} />
        <View style={styles.infoCol}>
          <View style={styles.badgeRow}>
            <Text className="font-t3-bold text-base text-foreground">{companionName}</Text>
            <View
              style={[
                styles.themePill,
                {
                  backgroundColor: isDark
                    ? "rgba(255, 255, 255, 0.08)"
                    : "rgba(0, 0, 0, 0.06)",
                  borderColor,
                },
              ]}
            >
              <View style={[styles.themeDot, { backgroundColor: accent }]} />
              <Text textRole="caption" className="font-t3-medium text-foreground-muted">
                {themeLabel}
              </Text>
            </View>
          </View>
          <Text textRole="footnote" className="mt-1 text-foreground-muted" numberOfLines={2}>
            {petEntry ? petEntry.text : `${greeting.headline} · ${greeting.subline}`}
          </Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View
          style={[
            styles.statPill,
            { backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)" },
          ]}
        >
          <Text className="font-t3-bold text-sm tabular-nums text-foreground">
            {turnsToday}
          </Text>
          <Text textRole="caption" className="text-foreground-muted">
            {gt("Today")}
          </Text>
        </View>
        <View
          style={[
            styles.statPill,
            { backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)" },
          ]}
        >
          <Text className="font-t3-bold text-sm tabular-nums text-foreground">
            {streakDays > 0 ? `${streakDays}d ✦` : "0d"}
          </Text>
          <Text textRole="caption" className="text-foreground-muted">
            {gt("Streak")}
          </Text>
        </View>
        <View
          style={[
            styles.statPill,
            { backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)" },
          ]}
        >
          <Text className="font-t3-bold text-sm tabular-nums text-foreground">
            {totalTurns}
          </Text>
          <Text textRole="caption" className="text-foreground-muted">
            {gt("Total")}
          </Text>
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  infoCol: {
    flex: 1,
    minWidth: 0,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  themePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  themeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
  },
  statPill: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: "center",
    gap: 1,
  },
});
