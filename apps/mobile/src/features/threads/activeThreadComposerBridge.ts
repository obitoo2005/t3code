/**
 * Lightweight imperative bridge between thread sub-views (code viewer, image annotator,
 * quick prompts, swipe-to-reply quotes, and companion whispers) and the currently active
 * thread composer.
 */

export interface ComposerReplyQuote {
  readonly author: "You" | "Rias";
  readonly preview: string;
  readonly quoteBlock: string;
}

export interface ActiveThreadComposerHandlers {
  readonly draftKey: string;
  readonly insertText: (text: string) => void;
  readonly attachImageUri: (uri: string, replaceAttachmentId?: string) => Promise<boolean>;
  readonly focusComposer?: () => void;
}

let activeHandlers: ActiveThreadComposerHandlers | null = null;
const whisperListeners = new Set<(message: string) => void>();
const replyQuotesByDraftKey = new Map<string, ComposerReplyQuote>();
const replyQuoteListeners = new Set<() => void>();

function notifyReplyQuoteListeners(): void {
  for (const listener of replyQuoteListeners) {
    listener();
  }
}

export function registerActiveThreadComposerHandlers(
  handlers: ActiveThreadComposerHandlers,
): () => void {
  activeHandlers = handlers;
  return () => {
    if (activeHandlers === handlers) {
      activeHandlers = null;
    }
  };
}

export function getActiveThreadComposerHandlers(): ActiveThreadComposerHandlers | null {
  return activeHandlers;
}

export function insertTextIntoActiveComposer(text: string): boolean {
  if (!activeHandlers) return false;
  activeHandlers.insertText(text);
  return true;
}

export function setActiveComposerReplyQuote(quote: ComposerReplyQuote): boolean {
  if (!activeHandlers) return false;
  replyQuotesByDraftKey.set(activeHandlers.draftKey, quote);
  notifyReplyQuoteListeners();
  activeHandlers.focusComposer?.();
  return true;
}

export function setComposerReplyQuoteForDraft(
  draftKey: string,
  quote: ComposerReplyQuote | null,
): void {
  if (quote === null) {
    if (!replyQuotesByDraftKey.has(draftKey)) return;
    replyQuotesByDraftKey.delete(draftKey);
  } else {
    replyQuotesByDraftKey.set(draftKey, quote);
  }
  notifyReplyQuoteListeners();
}

export function getComposerReplyQuote(draftKey: string): ComposerReplyQuote | null {
  return replyQuotesByDraftKey.get(draftKey) ?? null;
}

export function subscribeComposerReplyQuote(listener: () => void): () => void {
  replyQuoteListeners.add(listener);
  return () => {
    replyQuoteListeners.delete(listener);
  };
}

export async function attachImageToActiveComposer(
  uri: string,
  replaceAttachmentId?: string,
): Promise<boolean> {
  if (!activeHandlers) return false;
  return activeHandlers.attachImageUri(uri, replaceAttachmentId);
}

export function emitCompanionWhisper(message: string): void {
  for (const listener of whisperListeners) {
    listener(message);
  }
}

export function subscribeCompanionWhisper(listener: (message: string) => void): () => void {
  whisperListeners.add(listener);
  return () => {
    whisperListeners.delete(listener);
  };
}
