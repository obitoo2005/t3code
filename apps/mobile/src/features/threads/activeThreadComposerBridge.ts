/**
 * Lightweight imperative bridge between thread sub-views (code viewer, image annotator,
 * quick prompts, and Akeno pet whispers) and the currently active thread composer.
 */

export interface ActiveThreadComposerHandlers {
  readonly draftKey: string;
  readonly insertText: (text: string) => void;
  readonly attachImageUri: (uri: string, replaceAttachmentId?: string) => Promise<boolean>;
}

let activeHandlers: ActiveThreadComposerHandlers | null = null;
const whisperListeners = new Set<(message: string) => void>();

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
