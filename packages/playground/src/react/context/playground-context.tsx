import { createContext, useContext } from "react";
import type { BrowserHost } from "../../types.js";

export interface PlaygroundContext {
  readonly host: BrowserHost;
  /** @deprecated Use file management functions instead */
  readonly setContent: (content: string) => void;
  /** All files in the playground. Maps relative path to content. */
  readonly files: Record<string, string>;
  /** Currently active file path. */
  readonly activeFile: string;
  /** Switch the active file being edited. */
  readonly setActiveFile: (path: string) => void;
  /** Update content of a specific file. */
  readonly setFileContent: (path: string, content: string) => void;
  /** Add a new file to the playground. */
  readonly addFile: (path: string, content?: string) => void;
  /** Remove a file from the playground. */
  readonly removeFile: (path: string) => void;
  /** Rename a file. */
  readonly renameFile: (oldPath: string, newPath: string) => void;
}

const PlaygroundContext = createContext<PlaygroundContext | undefined>(undefined);

export const PlaygroundContextProvider = PlaygroundContext.Provider;

export function usePlaygroundContext(): PlaygroundContext {
  const context = useContext(PlaygroundContext);
  if (context === undefined) {
    throw new Error("usePlaygroundContext must be used within a PlaygroundContextProvider");
  }
  return context;
}
