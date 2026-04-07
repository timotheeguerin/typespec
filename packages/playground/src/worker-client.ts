import * as monaco from "monaco-editor";
import type { LibraryImportOptions } from "./core.js";
import type { TypeSpecWorkerApi, WorkerInitResult } from "./worker/protocol.js";

export interface TypeSpecWorkerClient {
  /** The proxy to call worker methods from the main thread. */
  readonly proxy: TypeSpecWorkerApi;
  /** Capabilities returned by the worker after initialization. */
  readonly initResult: WorkerInitResult;
  /** Dispose the worker. */
  dispose(): void;
}

/**
 * Create a TypeSpec web worker using Monaco's `createWebWorker` infrastructure.
 *
 * The worker runs compilation and language services off the main thread.
 * Callers must ensure `MonacoEnvironment.getWorker` handles `label: "typespec"`.
 */
export async function createTypeSpecWorker(params: {
  libraries: readonly string[];
  importConfig?: LibraryImportOptions;
}): Promise<TypeSpecWorkerClient> {
  const worker = monaco.editor.createWebWorker<TypeSpecWorkerApi>({
    moduleId: "typespec-playground-worker",
    label: "typespec",
    keepIdleModels: true,
  });

  const proxy = await worker.getProxy();
  const initResult = await proxy.initialize({
    libraries: params.libraries,
    importConfig: params.importConfig,
  });

  return {
    proxy,
    initResult,
    dispose: () => worker.dispose(),
  };
}
