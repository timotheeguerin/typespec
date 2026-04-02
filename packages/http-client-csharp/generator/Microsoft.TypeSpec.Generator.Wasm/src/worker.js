// Web Worker that runs the C# WASM generator off the main thread.
// Loaded from /wasm/csharp/worker.js

let wasmExports = null;
let initPromise = null;

async function initializeWasm() {
  if (wasmExports) return;

  console.log("[wasm-worker] Importing dotnet.js...");
  const { dotnet } = await import("./_framework/dotnet.js");
  console.log("[wasm-worker] dotnet.js imported, calling dotnet.create()...");

  // Configure the runtime to locate assets relative to the worker's URL
  const { getAssemblyExports, getConfig } = await dotnet
    .withModuleConfig({
      locateFile: (path) => `./_framework/${path}`,
    })
    .create();
  console.log("[wasm-worker] .NET runtime created");
  const config = getConfig();
  wasmExports = await getAssemblyExports(config.mainAssemblyName);
  console.log("[wasm-worker] Assembly exports loaded");
}

self.onmessage = async (e) => {
  const { id, codeModelJson, configurationJson } = e.data;
  console.log("[wasm-worker] Received request id:", id);

  try {
    if (!initPromise) {
      initPromise = initializeWasm();
    }
    await initPromise;
    console.log("[wasm-worker] Calling Generate...");

    const resultJson =
      wasmExports.Microsoft.TypeSpec.Generator.Wasm.WasmGenerator.Generate(
        codeModelJson,
        configurationJson,
      );

    const result = JSON.parse(resultJson);
    console.log("[wasm-worker] Generate complete, files:", Object.keys(result).length);

    if (result["__error"]) {
      self.postMessage({ id, error: result["__error"] });
    } else {
      self.postMessage({ id, files: result });
    }
  } catch (err) {
    console.error("[wasm-worker] Error:", err);
    self.postMessage({ id, error: err.toString() });
  }
};

// Signal that the worker is ready
self.postMessage({ type: "ready" });
