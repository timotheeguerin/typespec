import type { CompilerOptions } from "@typespec/compiler";
import type {
  WorkerCompileMessage,
  WorkerCompileResponse,
  WorkerCompilationResult,
  WorkerErrorResponse,
  WorkerInitMessage,
  WorkerInitResponse,
} from "./types.js";

/**
 * Client for communicating with the compile worker from the main thread.
 */
export class CompileWorkerClient {
  private worker: Worker;
  private nextId = 1;
  private pendingRequests = new Map<
    number,
    { resolve: (value: any) => void; reject: (error: Error) => void }
  >();
  private initialized = false;
  private initPromise: Promise<void> | undefined;

  constructor(workerUrl: string) {
    this.worker = new Worker(workerUrl, { type: "module" });
    this.worker.onmessage = (e) => this.handleMessage(e.data);
    this.worker.onerror = (e) => this.handleError(e);
  }

  /**
   * Initialize the worker. Must be called before compile().
   */
  async init(): Promise<
    Record<string, { name: string; isEmitter: boolean; packageJson: object }>
  > {
    if (this.initPromise) {
      await this.initPromise;
      return {};
    }

    let resolveInit: () => void;
    this.initPromise = new Promise((r) => {
      resolveInit = r;
    });

    const response = await this.sendRequest<WorkerInitMessage, WorkerInitResponse>({
      type: "init",
      id: this.nextId++,
    });

    this.initialized = true;
    resolveInit!();
    return response.libraries;
  }

  /**
   * Compile TypeSpec content using the worker.
   * Cancels any in-flight compilation.
   */
  async compile(
    content: string,
    selectedEmitter: string,
    options: CompilerOptions,
  ): Promise<WorkerCompilationResult> {
    if (!this.initialized) {
      await this.init();
    }

    const response = await this.sendRequest<WorkerCompileMessage, WorkerCompileResponse>({
      type: "compile",
      id: this.nextId++,
      content,
      selectedEmitter,
      options,
    });

    return response.result;
  }

  /**
   * Terminate the worker.
   */
  dispose(): void {
    this.worker.terminate();
    for (const { reject } of this.pendingRequests.values()) {
      reject(new Error("Worker terminated"));
    }
    this.pendingRequests.clear();
  }

  private sendRequest<TReq extends { id: number }, TRes>(request: TReq): Promise<TRes> {
    return new Promise<TRes>((resolve, reject) => {
      this.pendingRequests.set(request.id, { resolve, reject });
      this.worker.postMessage(request);
    });
  }

  private handleMessage(data: WorkerInitResponse | WorkerCompileResponse | WorkerErrorResponse) {
    const pending = this.pendingRequests.get(data.id);
    if (!pending) return;

    this.pendingRequests.delete(data.id);

    if (data.type === "error") {
      pending.reject(new Error(data.error));
    } else {
      pending.resolve(data);
    }
  }

  private handleError(event: ErrorEvent) {
    // Reject all pending requests on worker error
    for (const { reject } of this.pendingRequests.values()) {
      reject(new Error(`Worker error: ${event.message}`));
    }
    this.pendingRequests.clear();
  }
}
