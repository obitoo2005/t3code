import { useGT } from "gt-react-native";
import { Platform, View } from "react-native";
import { CompanionMascotSprite } from "../../components/AkenoMascot";
import { Notice } from "../../components/ui/Notice";

export function ComposerErrorNotice(props: {
  readonly message: string;
  readonly onDismiss: () => void;
}) {
  const gt = useGT();
  return (
    <View className="flex-row items-end gap-2 px-4 pb-3">
      {Platform.OS === "android" ? <CompanionMascotSprite mood="sad" size={48} /> : null}
      <View className="min-w-0 flex-1">
        <Notice
          message={props.message}
          icon="exclamationmark.circle"
          iconTone="danger"
          floating
          onDismiss={props.onDismiss}
          dismissLabel={gt("Dismiss error")}
        />
      </View>
    </View>
  );
}
