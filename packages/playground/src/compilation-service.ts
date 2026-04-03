import type { CompilerOptions, Diagnostic, Program } from "@typespec/compiler";
import type { BrowserHost } from "./types.js";
import { CompileWorkerClient } from "./workers/compile-worker-client.js";
import type { WorkerCompilationResult } from "./workers/types.js";

/**
 * Result of a main-thread compilation (has live Program object).
 */
export interface MainThreadCompilationResult {
  readonly kind: "main-thread";
  readonly program: Program;
  readonly outputFiles: string[];
}

/**
 * Result of a worker compilation (has serialized data).
 */
export interface WorkerCompilationResultWithKind extends WorkerCompilationResult {
  readonly kind: "worker";
}

/**
 * Result of a failed compilation.
 */
export interface CompilationError {
  readonly kind: "error";
  readonly error: unknown;
}

/**
 * Union of all possible compilation results.
 */
export type CompilationResult =
  | MainThreadCompilationResult
  | WorkerCompilationResultWithKind
  | CompilationError;

/**
 * Interface for a compilation service that can compile TypeSpec code.
 */
export interface CompilationService {
  compile(
    content: string,
    selectedEmitter: string,
    options: CompilerOptions,
  ): Promise<CompilationResult>;
  dispose(): void;
}

/**
 * Compilation service that runs on the main thread.
 * Returns live Program objects (needed for type graph viewer and custom ProgramViewers).
 */
export class MainThreadCompilationService implements CompilationService {
  constructor(private host: BrowserHost) {}

  async compile(
    content: string,
    selectedEmitter: string,
    options: CompilerOptions,
  ): Promise<CompilationResult> {
    const { resolvePath } = await import("@typespec/compiler");
    const outputDir = resolvePath("/test", "tsp-output");

    await this.host.writeFile("main.tsp", content);
    await this.emptyOutputDir();

    try {
      const program = await this.host.compiler.compile(
        this.host,
        resolvePath("/test", "main.tsp"),
        {
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
        },
      );

      const outputFiles = await this.findOutputFiles();
      return { kind: "main-thread", program, outputFiles };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Internal compiler error", error);
      return { kind: "error", error };
    }
  }

  dispose(): void {
    // No-op for main thread
  }

  private async emptyOutputDir(): Promise<void> {
    const dirs = await this.host.readDir("./tsp-output");
    for (const file of dirs) {
      await this.host.rm("./tsp-output/" + file);
    }
  }

  private async findOutputFiles(): Promise<string[]> {
    const { resolvePath } = await import("@typespec/compiler");
    const outputDir = resolvePath("/test", "tsp-output");
    const files: string[] = [];

    const addFiles = async (dir: string) => {
      const items = await this.host.readDir(outputDir + dir);
      for (const item of items) {
        const itemPath = `${dir}/${item}`;
        if ((await this.host.stat(outputDir + itemPath)).isDirectory()) {
          await addFiles(itemPath);
        } else {
          files.push(dir === "" ? item : `${dir}/${item}`);
        }
      }
    };

    await addFiles("");
    return files;
  }
}

/**
 * Compilation service that runs in a Web Worker.
 * Returns serialized results (no live Program object).
 */
export class WorkerCompilationService implements CompilationService {
  private client: CompileWorkerClient;

  constructor(workerUrl: string) {
    this.client = new CompileWorkerClient(workerUrl);
  }

  async compile(
    content: string,
    selectedEmitter: string,
    options: CompilerOptions,
  ): Promise<CompilationResult> {
    try {
      const result = await this.client.compile(content, selectedEmitter, options);
      if ("internalCompilerError" in result) {
        return { kind: "error", error: (result as any).internalCompilerError };
      }
      return { ...result, kind: "worker" };
    } catch (error) {
      return { kind: "error", error };
    }
  }

  dispose(): void {
    this.client.dispose();
  }
}
