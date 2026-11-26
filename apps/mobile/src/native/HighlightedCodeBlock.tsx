import { msg, useGT, useMessages } from "gt-react-native";
import { useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text } from "react-native";
import type { MarkdownStyle } from "react-native-enriched-markdown";

import { FullscreenCodeModal } from "../components/FullscreenCodeModal";
import { openShareCard } from "../components/ShareCardModal";
import { Menu } from "../components/ui/Menu";
import { useMarkdownCodeHighlight } from "../features/threads/markdownCodeHighlightState";
import { copyTextWithHaptic } from "../lib/copyTextWithHaptic";
import { type HighlightScheme, withTokenStarts } from "../lib/highlights";
import { CodeBlockFrame, CodeBlockHeaderButton } from "./CodeBlockFrame";
import { fencedCodeMarkdown } from "./codeBlockMarkdown";
import type { NativeMarkdownTextStyle } from "./SelectableMarkdownText.types";

// Header names from enriched-markdown's CodeBlockLanguages.cpp that are not the fence capitalized.
const FENCE_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  cc: "C++",
  cpp: "C++",
  cxx: "C++",
  cs: "C#",
  csharp: "C#",
  graphql: "GraphQL",
  objc: "Objective-C",
  objectivec: "Objective-C",
  php: "PHP",
  rb: "Ruby",
  scss: "SCSS",
  sql: "SQL",
  toml: "TOML",
  xml: "XML",
};

// The native block's long-press menu, with its labels and iOS symbols.
const CODE_MENU_ACTIONS = [
  {
    id: "copy-code",
    title: msg("Copy", { $context: "verb, copies the code" }),
    image: "doc.on.doc",
  },
  { id: "copy-markdown", title: msg("Copy as Markdown"), image: "doc.text" },
];

/** A fence in a language enriched-markdown cannot colour, drawn like its native block. */
export function HighlightedCodeBlock(props: {
  readonly code: string;
  readonly fence: string;
  readonly language: string;
  /** False only while the library withholds an unclosed fence (`streamingAnimation`, which T3 never enables, so always true today); highlighting waits for it. */
  readonly complete: boolean;
  readonly scheme: HighlightScheme;
  readonly textStyle: NativeMarkdownTextStyle;
  readonly codeStyle: NonNullable<MarkdownStyle["codeBlock"]>;
}) {
  const { code, codeStyle, textStyle } = props;
  const gt = useGT();
  const resolve = useMessages();
  const [wrapped, setWrapped] = useState(false);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const lastTapRef = useRef(0);
  const lines = useMarkdownCodeHighlight({
    code,
    language: props.language,
    theme: props.scheme,
    enabled: props.complete,
  });
  const fence = props.fence.toLowerCase();
  const displayLabel =
    FENCE_DISPLAY_NAMES[fence] ??
    (fence.length > 0 ? fence.charAt(0).toUpperCase() + fence.slice(1) : gt("Code"));
  const handleCodePress = () => {
    if (Platform.OS !== "android") return;
    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      lastTapRef.current = 0;
      setFullscreenOpen(true);
      return;
    }
    lastTapRef.current = now;
  };
  const text = (
    // Not selectable: as in the native block, a long-press opens the copy menu instead.
    <Text
      style={{
        color: codeStyle.color,
        fontFamily: codeStyle.fontFamily,
        fontSize: codeStyle.fontSize,
        lineHeight: codeStyle.lineHeight,
      }}
    >
      {(lines ? withTokenStarts(lines) : undefined)?.flatMap((line, lineIndex) => {
        const separator = lineIndex > 0 ? "\n" : "";
        return [
          separator,
          ...line.map(({ token, start }) => {
            return (
              <Text key={start} style={token.color ? { color: token.color } : undefined}>
                {token.content}
              </Text>
            );
          }),
        ];
      }) ?? code}
    </Text>
  );
  // Inside the scroller: on iOS an ancestor JS responder disables a ScrollView's panning.
  const content = (
    <Menu
      shouldOpenOnLongPress
      actions={CODE_MENU_ACTIONS.map((action) => ({ ...action, title: resolve(action.title) }))}
      style={{ flexGrow: 1 }}
      onPressAction={({ nativeEvent }) => {
        copyTextWithHaptic(
          nativeEvent.event === "copy-markdown" ? fencedCodeMarkdown(code, props.fence) : code,
        );
      }}
    >
      <Pressable onPress={handleCodePress} style={{ padding: codeStyle.padding }}>
        {text}
      </Pressable>
    </Menu>
  );
  return (
    <>
      <CodeBlockFrame
        label={displayLabel}
        textStyle={textStyle}
        actions={
          <>
            {Platform.OS === "android" ? (
              <>
                <CodeBlockHeaderButton
                  icon="arrow.up.left.and.arrow.down.right"
                  label={gt("Open fullscreen code viewer")}
                  textStyle={textStyle}
                  onPress={() => setFullscreenOpen(true)}
                />
                <CodeBlockHeaderButton
                  icon="square.and.arrow.up"
                  label={gt("Share code card")}
                  textStyle={textStyle}
                  onPress={() =>
                    openShareCard({
                      title: displayLabel,
                      body: code,
                      isCode: true,
                    })
                  }
                />
              </>
            ) : null}
            <CodeBlockHeaderButton
              icon="text.alignleft"
              label={wrapped ? gt("Disable line wrap") : gt("Wrap lines")}
              textStyle={textStyle}
              active={wrapped}
              onPress={() => setWrapped((value) => !value)}
            />
            <CodeBlockHeaderButton
              icon="doc.on.doc"
              label={gt("Copy code")}
              textStyle={textStyle}
              onPress={() => copyTextWithHaptic(code)}
            />
          </>
        }
      >
        {wrapped ? (
          content
        ) : (
          <ScrollView
            horizontal
            // As in the thread feed: with the keyboard open, the first long-press reaches the copy menu.
            keyboardShouldPersistTaps="always"
            contentContainerStyle={{ flexGrow: 1 }}
          >
            {content}
          </ScrollView>
        )}
      </CodeBlockFrame>
      {Platform.OS === "android" && fullscreenOpen ? (
        <FullscreenCodeModal
          visible={fullscreenOpen}
          code={code}
          languageLabel={displayLabel}
          fence={props.fence}
          highlightLanguage={props.language}
          scheme={props.scheme}
          onClose={() => setFullscreenOpen(false)}
        />
      ) : null}
    </>
  );
}
