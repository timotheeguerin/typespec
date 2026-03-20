import type { CompilerOptions } from "@typespec/compiler";
import { useControllableValue } from "@typespec/react-components";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { PlaygroundSample } from "../types.js";

export interface PlaygroundState {
  /** Emitter to use */
  emitter?: string;
  /** Emitter options */
  compilerOptions?: CompilerOptions;
  /** Sample to use */
  sampleName?: string;
  /** Selected viewer */
  selectedViewer?: string;
  /** Internal state of viewers */
  viewerState?: Record<string, any>;
  /**
   * TypeSpec content for single-file mode.
   * @deprecated Use `files` instead. Kept for backward compatibility.
   */
  content?: string;
  /** Map of file paths to their content. */
  files?: Record<string, string>;
  /** Currently active file path being edited. */
  activeFile?: string;
}

export interface UsePlaygroundStateProps {
  /** List of available libraries */
  readonly libraries: readonly string[];

  /** Samples available */
  samples?: Record<string, PlaygroundSample>;

  /** Playground state (controlled) */
  playgroundState?: PlaygroundState;
  /** Default playground state if leaving this unmanaged */
  defaultPlaygroundState?: PlaygroundState;
  /** Callback when playground state changes */
  onPlaygroundStateChange?: (state: PlaygroundState) => void;

  /**
   * Default emitter to use if not provided in defaultPlaygroundState.
   * @deprecated Use defaultPlaygroundState.emitter instead
   */
  defaultEmitter?: string;

  /** Default content if not provided in defaultPlaygroundState */
  defaultContent?: string;
}

export interface PlaygroundStateResult {
  // State values
  selectedEmitter: string;
  compilerOptions: CompilerOptions;
  selectedSampleName: string;
  selectedViewer?: string;
  viewerState: Record<string, any>;
  content: string;
  /** All files in the playground. Maps relative path to content. */
  files: Record<string, string>;
  /** Currently active file path. */
  activeFile: string;

  // State setters
  onSelectedEmitterChange: (emitter: string) => void;
  onCompilerOptionsChange: (compilerOptions: CompilerOptions) => void;
  onSelectedSampleNameChange: (sampleName: string) => void;
  onSelectedViewerChange: (selectedViewer: string) => void;
  onViewerStateChange: (viewerState: Record<string, any>) => void;
  onContentChange: (content: string) => void;
  onFilesChange: (files: Record<string, string>) => void;
  onActiveFileChange: (activeFile: string) => void;

  // File management
  addFile: (path: string, content?: string) => void;
  removeFile: (path: string) => void;
  renameFile: (oldPath: string, newPath: string) => void;
  updateFileContent: (path: string, content: string) => void;

  // Full state management
  playgroundState: PlaygroundState;
  setPlaygroundState: (state: PlaygroundState) => void;
}

export function usePlaygroundState({
  libraries,
  samples,
  playgroundState: controlledPlaygroundState,
  defaultPlaygroundState,
  onPlaygroundStateChange,
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  defaultEmitter,
  defaultContent,
}: UsePlaygroundStateProps): PlaygroundStateResult {
  // Create the effective default state with proper fallback logic
  const effectiveDefaultState = useMemo((): PlaygroundState => {
    const baseDefault = defaultPlaygroundState ?? {};

    // If no emitter is provided in defaultPlaygroundState, use fallback logic
    if (!baseDefault.emitter) {
      // First try the deprecated defaultEmitter prop
      if (defaultEmitter) {
        return { ...baseDefault, emitter: defaultEmitter, content: defaultContent };
      }
    }

    return { ...baseDefault, content: baseDefault.content ?? defaultContent };
  }, [defaultPlaygroundState, defaultEmitter, libraries, defaultContent]);

  // Use a single controllable value for the entire playground state
  const [playgroundState, setPlaygroundState] = useControllableValue(
    controlledPlaygroundState,
    effectiveDefaultState,
    onPlaygroundStateChange,
  );

  // Extract individual values from the consolidated state with proper defaults
  const selectedEmitter = playgroundState.emitter as any;
  const compilerOptions = useMemo(
    () => playgroundState.compilerOptions ?? {},
    [playgroundState.compilerOptions],
  );
  const selectedSampleName = playgroundState.sampleName ?? "";
  const selectedViewer = playgroundState.selectedViewer;

  // Resolve files: use `files` if present, otherwise derive from `content`
  const files = useMemo((): Record<string, string> => {
    if (playgroundState.files && Object.keys(playgroundState.files).length > 0) {
      return playgroundState.files;
    }
    return { "main.tsp": playgroundState.content ?? "" };
  }, [playgroundState.files, playgroundState.content]);

  const activeFile = playgroundState.activeFile ?? "main.tsp";

  // `content` reflects the active file's content for backward compat
  const content = files[activeFile] ?? "";

  // Create a generic state updater that can handle any field
  const updateState = useCallback(
    (updates: Partial<PlaygroundState>) => {
      setPlaygroundState({ ...playgroundState, ...updates });
    },
    [playgroundState, setPlaygroundState],
  );

  // Simple one-liner change handlers
  const onSelectedEmitterChange = useCallback(
    (emitter: string) => updateState({ emitter }),
    [updateState],
  );
  const onCompilerOptionsChange = useCallback(
    (compilerOptions: CompilerOptions) => updateState({ compilerOptions }),
    [updateState],
  );
  const onSelectedSampleNameChange = useCallback(
    (sampleName: string) => updateState({ sampleName }),
    [updateState],
  );
  const onSelectedViewerChange = useCallback(
    (selectedViewer: string) => updateState({ selectedViewer }),
    [updateState],
  );
  const onViewerStateChange = useCallback(
    (viewerState: Record<string, any>) => updateState({ viewerState }),
    [updateState],
  );
  const onContentChange = useCallback(
    (newContent: string) => {
      const newFiles = { ...files, [activeFile]: newContent };
      updateState({ files: newFiles, content: newFiles["main.tsp"] ?? "" });
    },
    [updateState, files, activeFile],
  );
  const onFilesChange = useCallback(
    (newFiles: Record<string, string>) =>
      updateState({ files: newFiles, content: newFiles["main.tsp"] ?? "" }),
    [updateState],
  );
  const onActiveFileChange = useCallback(
    (newActiveFile: string) => updateState({ activeFile: newActiveFile }),
    [updateState],
  );

  // File management helpers
  const addFile = useCallback(
    (path: string, fileContent: string = "") => {
      const newFiles = { ...files, [path]: fileContent };
      updateState({ files: newFiles, activeFile: path, content: newFiles["main.tsp"] ?? "" });
    },
    [updateState, files],
  );

  const removeFile = useCallback(
    (path: string) => {
      // Prevent removing main.tsp or the last file
      if (path === "main.tsp" || Object.keys(files).length <= 1) {
        return;
      }
      const newFiles = { ...files };
      delete newFiles[path];
      const newActiveFile = activeFile === path ? "main.tsp" : activeFile;
      updateState({
        files: newFiles,
        activeFile: newActiveFile,
        content: newFiles["main.tsp"] ?? "",
      });
    },
    [updateState, files, activeFile],
  );

  const renameFile = useCallback(
    (oldPath: string, newPath: string) => {
      // Prevent overwriting an existing file
      if (newPath in files && newPath !== oldPath) {
        return;
      }
      const newFiles = { ...files };
      const fileContent = newFiles[oldPath] ?? "";
      delete newFiles[oldPath];
      newFiles[newPath] = fileContent;
      const newActiveFile = activeFile === oldPath ? newPath : activeFile;
      updateState({
        files: newFiles,
        activeFile: newActiveFile,
        content: newFiles["main.tsp"] ?? "",
      });
    },
    [updateState, files, activeFile],
  );

  const updateFileContent = useCallback(
    (path: string, fileContent: string) => {
      const newFiles = { ...files, [path]: fileContent };
      updateState({ files: newFiles, content: newFiles["main.tsp"] ?? "" });
    },
    [updateState, files],
  );

  // Track last processed sample to avoid re-processing
  const lastProcessedSample = useRef<string>("");

  // Handle sample changes
  useEffect(() => {
    if (selectedSampleName && samples && selectedSampleName !== lastProcessedSample.current) {
      const config = samples[selectedSampleName];
      if (config?.content || config?.files) {
        lastProcessedSample.current = selectedSampleName;
        const updates: Partial<PlaygroundState> = {};
        if (config.files) {
          updates.files = config.files;
          updates.content = config.files["main.tsp"] ?? "";
          updates.activeFile = "main.tsp";
        } else if (config.content) {
          updates.content = config.content;
          updates.files = { "main.tsp": config.content };
          updates.activeFile = "main.tsp";
        }
        if (config.preferredEmitter) {
          updates.emitter = config.preferredEmitter;
        }
        if (config.compilerOptions) {
          updates.compilerOptions = config.compilerOptions;
        }
        updateState(updates);
      }
    }
  }, [selectedSampleName, samples, updateState]);

  return {
    // State values
    selectedEmitter,
    compilerOptions,
    selectedSampleName,
    selectedViewer,
    viewerState: playgroundState.viewerState ?? {},
    content,
    files,
    activeFile,

    // State setters
    onSelectedEmitterChange,
    onCompilerOptionsChange,
    onSelectedSampleNameChange,
    onSelectedViewerChange,
    onViewerStateChange,
    onContentChange,
    onFilesChange,
    onActiveFileChange,

    // File management
    addFile,
    removeFile,
    renameFile,
    updateFileContent,

    // Full state management
    playgroundState,
    setPlaygroundState,
  };
}
