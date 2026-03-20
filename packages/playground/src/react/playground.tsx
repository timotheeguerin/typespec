import type { CompilerOptions, Diagnostic } from "@typespec/compiler";
import { $ } from "@typespec/compiler/typekit";
import { Pane, SplitPane } from "@typespec/react-components";
import "@typespec/react-components/style.css";
import debounce from "debounce";
import { KeyCode, KeyMod, MarkerSeverity, Uri, editor } from "monaco-editor";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FunctionComponent,
  type ReactNode,
} from "react";
import { CompletionItemTag } from "vscode-languageserver";
import { resolveVirtualPath } from "../browser-host.js";
import { EditorCommandBar } from "../editor-command-bar/editor-command-bar.js";
import { getMonacoRange, updateDiagnosticsForCodeFixes } from "../services.js";
import type { BrowserHost, PlaygroundSample } from "../types.js";
import { PlaygroundContextProvider } from "./context/playground-context.js";
import { debugGlobals, printDebugInfo } from "./debug.js";
import { DefaultFooter } from "./default-footer.js";
import { EditorPanel } from "./editor-panel/editor-panel.js";
import { type OnMountData } from "./editor.js";
import { OutputView } from "./output-view/output-view.js";
import style from "./playground.module.css";
import { ProblemPane } from "./problem-pane/index.js";
import type { CommandBarItem } from "./responsive-command-bar/index.js";
import type { CompilationState, FileOutputViewer, ProgramViewer } from "./types.js";
import { useIsMobile } from "./use-mobile.js";
import { usePlaygroundState, type PlaygroundState } from "./use-playground-state.js";
import { ViewToggle, type ViewMode } from "./view-toggle.js";

// Re-export the PlaygroundState type for convenience
export type { PlaygroundState };

export interface PlaygroundProps {
  host: BrowserHost;

  /** Default content if leaving this unmanaged. */
  defaultContent?: string;

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

  onFileBug?: () => void;

  /** Additional items to show in the command bar. */
  commandBarItems?: CommandBarItem[];

  /** Custom viewers to view the typespec program */
  viewers?: ProgramViewer[];

  /** Custom file viewers that enabled for certain emitters. Key of the map is emitter name */
  emitterViewers?: Record<string, FileOutputViewer[]>;

  onSave?: (value: PlaygroundSaveData) => void;

  editorOptions?: PlaygroundEditorsOptions;

  /**
   * Change the footer of the playground.
   */
  footer?: ReactNode;
}

export interface PlaygroundEditorsOptions {
  theme?: string;
}

export interface PlaygroundSaveData extends PlaygroundState {
  /** Current content of the playground (active file content for backward compat). */
  content: string;

  /** Emitter name. */
  emitter: string;

  /** All files in the playground. */
  files?: Record<string, string>;

  /** Currently active file. */
  activeFile?: string;
}

/**
 * Playground component for TypeSpec with consolidated state management.
 *
 * @example
 * ```tsx
 * const [playgroundState, setPlaygroundState] = useState<PlaygroundState>({
 *   emitter: 'openapi3',
 *   compilerOptions: {},
 *   sampleName: 'basic',
 *   selectedViewer: 'openapi',
 *   viewerState: {}
 * });
 *
 * <Playground
 *   host={host}
 *   playgroundState={playgroundState}
 *   onPlaygroundStateChange={setPlaygroundState}
 *   samples={samples}
 *   viewers={viewers}
 * />
 * ```
 *
 * For uncontrolled usage, use defaultPlaygroundState:
 * ```tsx
 * <Playground
 *   host={host}
 *   defaultPlaygroundState={{
 *     emitter: 'openapi3',
 *     compilerOptions: {},
 *   }}
 *   samples={samples}
 *   viewers={viewers}
 * />
 * ```
 *
 * For backward compatibility, you can also use the deprecated defaultEmitter prop:
 * ```tsx
 * <Playground
 *   host={host}
 *   defaultEmitter="openapi3"
 *   samples={samples}
 *   viewers={viewers}
 * />
 * ```
 */
export const Playground: FunctionComponent<PlaygroundProps> = (props) => {
  const { host, onSave } = props;
  const editorRef = useRef<editor.IStandaloneCodeEditor | undefined>(undefined);

  useEffect(() => {
    editor.setTheme(props.editorOptions?.theme ?? "typespec");
  }, [props.editorOptions?.theme]);

  useEffect(() => {
    printDebugInfo();

    debugGlobals().host = host;
  }, [host]);

  const [compilationState, setCompilationState] = useState<CompilationState | undefined>(undefined);

  // Use the playground state hook
  const state = usePlaygroundState({
    libraries: props.libraries,
    samples: props.samples,
    playgroundState: props.playgroundState,
    defaultPlaygroundState: props.defaultPlaygroundState,
    onPlaygroundStateChange: props.onPlaygroundStateChange,
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    defaultEmitter: props.defaultEmitter,
    defaultContent: props.defaultContent,
  });

  // Extract values from the state hook
  const {
    selectedEmitter,
    compilerOptions,
    selectedSampleName,
    selectedViewer,
    viewerState,
    content,
    files,
    activeFile,
    onSelectedEmitterChange,
    onCompilerOptionsChange,
    onSelectedSampleNameChange,
    onSelectedViewerChange,
    onViewerStateChange,
    onContentChange,
    addFile,
    removeFile,
    renameFile,
    updateFileContent,
    onActiveFileChange,
  } = state;

  // Dynamic Monaco model management
  const modelsRef = useRef<Map<string, editor.IModel>>(new Map());
  const updateFileContentRef = useRef(updateFileContent);
  updateFileContentRef.current = updateFileContent;

  const getOrCreateModel = useCallback((filePath: string, fileContent: string): editor.IModel => {
    const existing = modelsRef.current.get(filePath);
    if (existing && !existing.isDisposed()) {
      return existing;
    }
    const uri = Uri.parse(`inmemory://test/${filePath}`);
    const existingByUri = editor.getModel(uri);
    if (existingByUri) {
      modelsRef.current.set(filePath, existingByUri);
      return existingByUri;
    }
    const model = editor.createModel(fileContent, "typespec", uri);
    modelsRef.current.set(filePath, model);
    return model;
  }, []);

  // Sync Monaco models with files state
  useEffect(() => {
    for (const [filePath, fileContent] of Object.entries(files)) {
      const model = getOrCreateModel(filePath, fileContent);
      if (model.getValue() !== fileContent) {
        model.setValue(fileContent);
      }
    }
    // Dispose models that no longer exist
    for (const [filePath, model] of modelsRef.current.entries()) {
      if (!(filePath in files)) {
        model.dispose();
        modelsRef.current.delete(filePath);
      }
    }
  }, [files, getOrCreateModel]);

  // Get current active model
  const activeModel = useMemo(() => {
    return getOrCreateModel(activeFile, files[activeFile] ?? "");
  }, [activeFile, files, getOrCreateModel]);

  const isSampleUntouched = useMemo(() => {
    return Boolean(selectedSampleName && content === props.samples?.[selectedSampleName]?.content);
  }, [content, selectedSampleName, props.samples]);

  const doCompile = useCallback(async () => {
    const typespecCompiler = host.compiler;

    const compilationResult = await compile(host, files, selectedEmitter, compilerOptions);
    setCompilationState(compilationResult);
    if ("program" in compilationResult) {
      // Update code action provider with current diagnostics (for codefix support).
      updateDiagnosticsForCodeFixes(typespecCompiler, compilationResult.program.diagnostics);

      // Set the program on the window.
      debugGlobals().program = compilationResult.program;
      debugGlobals().$$ = $(compilationResult.program);

      // Set markers for each file model
      for (const [filePath, model] of modelsRef.current.entries()) {
        const fileDiags = compilationResult.program.diagnostics.filter((diag) => {
          if (!diag.target || typeof diag.target === "symbol" || !("file" in diag.target)) {
            return filePath === "main.tsp";
          }
          const diagPath = diag.target.file.path;
          return diagPath === resolveVirtualPath(filePath);
        });
        const markers: editor.IMarkerData[] = fileDiags.map((diag) => ({
          ...getMonacoRange(typespecCompiler, diag.target),
          message: diag.message,
          severity: diag.severity === "error" ? MarkerSeverity.Error : MarkerSeverity.Warning,
          tags: diag.code === "deprecated" ? [CompletionItemTag.Deprecated] : undefined,
        }));
        editor.setModelMarkers(model, "owner", markers);
      }
    } else {
      updateDiagnosticsForCodeFixes(typespecCompiler, []);
      for (const model of modelsRef.current.values()) {
        editor.setModelMarkers(model, "owner", []);
      }
    }
  }, [host, selectedEmitter, compilerOptions, files]);

  // Debounced recompile and state sync on model content changes
  useEffect(() => {
    const debouncer = debounce(() => doCompile(), 200);

    const disposables: { dispose: () => void }[] = [];
    for (const [filePath, model] of modelsRef.current.entries()) {
      disposables.push(
        model.onDidChangeContent(() => {
          updateFileContentRef.current(filePath, model.getValue());
          void debouncer();
        }),
      );
    }

    return () => {
      debouncer.clear();
      for (const d of disposables) d.dispose();
    };
  }, [doCompile, files]);

  useEffect(() => {
    void doCompile();
  }, [doCompile]);

  const saveCode = useCallback(() => {
    if (onSave) {
      onSave({
        content: content ?? "",
        emitter: selectedEmitter,
        compilerOptions,
        files,
        activeFile,
        sampleName: isSampleUntouched ? selectedSampleName : undefined,
        selectedViewer,
        viewerState,
      });
    }
  }, [
    content,
    files,
    activeFile,
    onSave,
    selectedEmitter,
    compilerOptions,
    selectedSampleName,
    isSampleUntouched,
    selectedViewer,
    viewerState,
  ]);

  const formatCode = useCallback(() => {
    void editorRef.current?.getAction("editor.action.formatDocument")?.run();
  }, []);

  const fileBug = useCallback(async () => {
    if (props.onFileBug) {
      saveCode();
      props.onFileBug();
    }
  }, [props, saveCode]);

  const typespecEditorActions = useMemo(
    (): editor.IActionDescriptor[] => [
      // ctrl/cmd+S => save
      { id: "save", label: "Save", keybindings: [KeyMod.CtrlCmd | KeyCode.KeyS], run: saveCode },
    ],
    [saveCode],
  );

  const onTypeSpecEditorMount = useCallback(({ editor }: OnMountData) => {
    editorRef.current = editor;
  }, []);

  const [verticalPaneSizes, setVerticalPaneSizes] = useState<(string | number | undefined)[]>(
    verticalPaneSizesConst.collapsed,
  );
  const toggleProblemPane = useCallback(() => {
    setVerticalPaneSizes((value) => {
      return value === verticalPaneSizesConst.collapsed
        ? verticalPaneSizesConst.expanded
        : verticalPaneSizesConst.collapsed;
    });
  }, [setVerticalPaneSizes]);

  const onVerticalPaneSizeChange = useCallback(
    (sizes: number[]) => {
      setVerticalPaneSizes(sizes);
    },
    [setVerticalPaneSizes],
  );
  const handleDiagnosticSelected = useCallback(
    (diagnostic: Diagnostic) => {
      editorRef.current?.setSelection(getMonacoRange(host.compiler, diagnostic.target));
    },
    [host.compiler],
  );

  const playgroundContext = useMemo(() => {
    return {
      host,
      setContent: (val: string) => {
        onContentChange(val);
      },
      files,
      activeFile,
      setActiveFile: onActiveFileChange,
      setFileContent: updateFileContent,
      addFile,
      removeFile,
      renameFile,
    };
  }, [
    host,
    onContentChange,
    files,
    activeFile,
    onActiveFileChange,
    updateFileContent,
    addFile,
    removeFile,
    renameFile,
  ]);

  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<ViewMode>("editor");

  // Reset to "editor" when entering mobile, force "both" on desktop
  useEffect(() => {
    if (!isMobile) {
      setViewMode("both");
    } else {
      setViewMode("editor");
    }
  }, [isMobile]);

  const commandBar = (
    <EditorCommandBar
      host={host}
      selectedEmitter={selectedEmitter}
      onSelectedEmitterChange={onSelectedEmitterChange}
      samples={props.samples}
      selectedSampleName={selectedSampleName}
      onSelectedSampleNameChange={onSelectedSampleNameChange}
      saveCode={saveCode}
      formatCode={formatCode}
      fileBug={props.onFileBug ? fileBug : undefined}
      commandBarItems={props.commandBarItems}
    />
  );

  const editorPanel = (
    <EditorPanel
      host={host}
      model={activeModel}
      actions={typespecEditorActions}
      editorOptions={props.editorOptions}
      onMount={onTypeSpecEditorMount}
      selectedEmitter={selectedEmitter}
      compilerOptions={compilerOptions}
      onCompilerOptionsChange={onCompilerOptionsChange}
      onSelectedEmitterChange={onSelectedEmitterChange}
      commandBar={isMobile ? undefined : commandBar}
      files={Object.keys(files)}
      activeFile={activeFile}
      onFileSelect={onActiveFileChange}
      onFileAdd={addFile}
      onFileRemove={removeFile}
      onFileRename={renameFile}
    />
  );

  const outputPanel = (
    <OutputView
      compilationState={compilationState}
      editorOptions={props.editorOptions}
      viewers={props.viewers}
      fileViewers={selectedEmitter ? props.emitterViewers?.[selectedEmitter] : undefined}
      selectedViewer={selectedViewer}
      onViewerChange={onSelectedViewerChange}
      viewerState={viewerState}
      onViewerStateChange={onViewerStateChange}
    />
  );

  const mainContent =
    viewMode === "both" ? (
      <SplitPane initialSizes={["50%", "50%"]}>
        <Pane className={style["edit-pane"]}>{editorPanel}</Pane>
        <Pane>{outputPanel}</Pane>
      </SplitPane>
    ) : viewMode === "editor" ? (
      <div className={style["single-pane"]}>{editorPanel}</div>
    ) : (
      <div className={style["single-pane"]}>{outputPanel}</div>
    );

  return (
    <PlaygroundContextProvider value={playgroundContext}>
      <div className={style["layout"]}>
        {isMobile && (
          <ViewToggle viewMode={viewMode} onViewModeChange={setViewMode} actions={commandBar} />
        )}
        <SplitPane sizes={verticalPaneSizes} onChange={onVerticalPaneSizeChange} split="horizontal">
          <Pane>{mainContent}</Pane>
          <Pane minSize={30}>
            <ProblemPane
              collapsed={verticalPaneSizes[1] === verticalPaneSizesConst.collapsed[1]}
              compilationState={compilationState}
              onHeaderClick={toggleProblemPane}
              onDiagnosticSelected={handleDiagnosticSelected}
            />
          </Pane>
        </SplitPane>
        {props.footer ?? <DefaultFooter />}
      </div>
    </PlaygroundContextProvider>
  );
};

const verticalPaneSizesConst = {
  collapsed: [undefined, 30],
  expanded: [undefined, 200],
};
const outputDir = resolveVirtualPath("tsp-output");

async function compile(
  host: BrowserHost,
  files: Record<string, string>,
  selectedEmitter: string,
  options: CompilerOptions,
): Promise<CompilationState> {
  // Write all source files to virtual FS
  for (const [filePath, fileContent] of Object.entries(files)) {
    await host.writeFile(filePath, fileContent);
  }
  await emptyOutputDir(host);
  try {
    const typespecCompiler = host.compiler;
    const program = await typespecCompiler.compile(host, resolveVirtualPath("main.tsp"), {
      ...options,
      options: {
        ...options.options,
        [selectedEmitter]: {
          ...options.options?.[selectedEmitter],
          "emitter-output-dir": outputDir,
        },
      },
      outputDir,
      emit: selectedEmitter ? [selectedEmitter] : [],
    });
    const outputFiles = await findOutputFiles(host);
    return { program, outputFiles };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Internal compiler error", error);
    return { internalCompilerError: error };
  }
}
async function findOutputFiles(host: BrowserHost): Promise<string[]> {
  const files: string[] = [];

  async function addFiles(dir: string) {
    const items = await host.readDir(outputDir + dir);
    for (const item of items) {
      const itemPath = `${dir}/${item}`;
      if ((await host.stat(outputDir + itemPath)).isDirectory()) {
        await addFiles(itemPath);
      } else {
        files.push(dir === "" ? item : `${dir}/${item}`);
      }
    }
  }
  await addFiles("");
  return files;
}

async function emptyOutputDir(host: BrowserHost) {
  // empty output directory
  const dirs = await host.readDir("./tsp-output");
  for (const file of dirs) {
    const path = "./tsp-output/" + file;
    const uri = Uri.parse(host.pathToFileURL(path));
    const model = editor.getModel(uri);
    if (model) {
      model.dispose();
    }
    await host.rm(path, { recursive: true });
  }
}
