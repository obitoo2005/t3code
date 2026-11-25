import { Image, type ImageSource } from "expo-image";
import { memo } from "react";
import { View } from "react-native";

const SESSION_ICONS: readonly ImageSource[] = [
  require("../../assets/session-icons/session-icon-01.png"),
  require("../../assets/session-icons/session-icon-02.png"),
  require("../../assets/session-icons/session-icon-03.png"),
  require("../../assets/session-icons/session-icon-04.png"),
  require("../../assets/session-icons/session-icon-05.png"),
  require("../../assets/session-icons/session-icon-06.png"),
  require("../../assets/session-icons/session-icon-07.png"),
  require("../../assets/session-icons/session-icon-08.png"),
  require("../../assets/session-icons/session-icon-09.png"),
  require("../../assets/session-icons/session-icon-10.png"),
  require("../../assets/session-icons/session-icon-11.png"),
  require("../../assets/session-icons/session-icon-12.png"),
  require("../../assets/session-icons/session-icon-13.png"),
  require("../../assets/session-icons/session-icon-14.png"),
  require("../../assets/session-icons/session-icon-15.png"),
  require("../../assets/session-icons/session-icon-16.png"),
  require("../../assets/session-icons/session-icon-17.png"),
  require("../../assets/session-icons/session-icon-18.png"),
  require("../../assets/session-icons/session-icon-19.png"),
  require("../../assets/session-icons/session-icon-20.png"),
  require("../../assets/session-icons/session-icon-21.png"),
  require("../../assets/session-icons/session-icon-22.png"),
  require("../../assets/session-icons/session-icon-23.png"),
  require("../../assets/session-icons/session-icon-24.png"),
  require("../../assets/session-icons/session-icon-25.png"),
  require("../../assets/session-icons/session-icon-26.png"),
  require("../../assets/session-icons/session-icon-27.png"),
  require("../../assets/session-icons/session-icon-28.png"),
  require("../../assets/session-icons/session-icon-29.png"),
  require("../../assets/session-icons/session-icon-30.png"),
  require("../../assets/session-icons/session-icon-31.png"),
  require("../../assets/session-icons/session-icon-32.png"),
  require("../../assets/session-icons/session-icon-33.png"),
  require("../../assets/session-icons/session-icon-34.png"),
  require("../../assets/session-icons/session-icon-35.png"),
  require("../../assets/session-icons/session-icon-36.png"),
  require("../../assets/session-icons/session-icon-37.png"),
  require("../../assets/session-icons/session-icon-38.png"),
  require("../../assets/session-icons/session-icon-39.png"),
  require("../../assets/session-icons/session-icon-40.png"),
];

// Fisher-Yates shuffle once per app launch so every session gets a distinct random avatar
// with zero duplicates across the first 40 sessions and zero scroll flicker.
const SHUFFLED_DECK: number[] = SESSION_ICONS.map((_, index) => index);
for (let i = SHUFFLED_DECK.length - 1; i > 0; i -= 1) {
  const j = Math.floor(Math.random() * (i + 1));
  const tmp = SHUFFLED_DECK[i]!;
  SHUFFLED_DECK[i] = SHUFFLED_DECK[j]!;
  SHUFFLED_DECK[j] = tmp;
}

const assignedIndexBySeed = new Map<string, number>();
let deckCursor = 0;

export function pickSessionIcon(seed: string): ImageSource {
  let index = assignedIndexBySeed.get(seed);
  if (index === undefined) {
    index = SHUFFLED_DECK[deckCursor % SHUFFLED_DECK.length]!;
    deckCursor += 1;
    assignedIndexBySeed.set(seed, index);
  }
  return SESSION_ICONS[index]!;
}

/** Crisp pixel-art anime avatar replacing the GT project monogram beside each session row. */
export const SessionAvatarIcon = memo(function SessionAvatarIcon(props: {
  readonly seed: string;
  readonly size: number;
}) {
  const source = pickSessionIcon(props.seed);
  const radius = Math.max(5, Math.round(props.size * 0.24));

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        width: props.size,
        height: props.size,
        borderRadius: radius,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(255, 255, 255, 0.16)",
      }}
    >
      <Image
        source={source}
        recyclingKey={props.seed}
        accessibilityIgnoresInvertColors
        contentFit="cover"
        style={{ width: "100%", height: "100%" }}
      />
    </View>
  );
});
