declare module "*.module.css";

declare module "monaco-editor/esm/vs/editor/editor.worker.js" {
  interface IWorkerContext {
    host: Record<string, Function>;
    getMirrorModels(): Array<{
      readonly uri: import("monaco-editor").Uri;
      readonly version: number;
      getValue(): string;
    }>;
  }

  export function initialize(callback: (ctx: IWorkerContext, createData: unknown) => object): void;
}
