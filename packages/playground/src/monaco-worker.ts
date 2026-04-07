export function registerMonacoDefaultWorkersForVite() {
  (self as any).MonacoEnvironment = {
    getWorker: async function (workerId: string, label: string) {
      switch (label) {
        case "json": {
          const { default: jsonWorker } = await import(
            "monaco-editor/esm/vs/language/json/json.worker?worker" as any
          );
          return jsonWorker();
        }
        case "typespec": {
          const { default: typespecWorker } = await import(
            "@typespec/playground/worker/playground-worker?worker" as any
          );
          return typespecWorker();
        }
        default: {
          const { default: editorWorker } = await import(
            "monaco-editor/esm/vs/editor/editor.worker?worker" as any
          );
          return editorWorker();
        }
      }
    },
  };
}
