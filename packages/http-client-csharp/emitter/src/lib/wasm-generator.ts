// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

/**
 * Bridge between the TypeSpec JS emitter and the C# WASM generator.
 * This module lazily loads the .NET WASM runtime and calls the C# generator
 * to produce generated C# files from the tspCodeModel.json intermediate representation.
 */

let wasmExports: any = null;
let initPromise: Promise<void> | null = null;

/**
 * Get the base URL for the WASM bundle assets.
 * In the playground, these are served from a configurable path.
 */
function getWasmBaseUrl(): string {
  // Look for a global configuration, fall back to a default path
  return (globalThis as any).__TYPESPEC_CSHARP_WASM_BASE_URL ?? "/wasm/csharp/";
}

async function initializeWasm(): Promise<void> {
  if (wasmExports) return;

  const baseUrl = getWasmBaseUrl();
  const dotnetUrl = `${baseUrl}_framework/dotnet.js`;

  // Dynamically import the .NET WASM runtime
  const { dotnet } = await import(/* @vite-ignore */ dotnetUrl);

  // Configure the runtime to load assets from the correct base URL
  const { getAssemblyExports, getConfig } = await dotnet
    .withModuleConfig({
      locateFile: (path: string) => `${baseUrl}_framework/${path}`,
    })
    .withResourceLoader((_type: string, name: string, _defaultUri: string) => {
      return `${baseUrl}_framework/${name}`;
    })
    .create();

  const config = getConfig();
  wasmExports = await getAssemblyExports(config.mainAssemblyName);
}

/**
 * Generate C# source files from code model JSON using the WASM generator.
 *
 * @param codeModelJson - The tspCodeModel.json content
 * @param configurationJson - The Configuration.json content
 * @returns A map of file paths to generated C# content
 */
export async function generateCSharpFromWasm(
  codeModelJson: string,
  configurationJson: string,
): Promise<Record<string, string>> {
  // Lazy-initialize the WASM runtime
  if (!initPromise) {
    initPromise = initializeWasm();
  }
  await initPromise;

  if (!wasmExports) {
    throw new Error("Failed to initialize the C# WASM generator");
  }

  // Call the [JSExport] method
  const resultJson =
    wasmExports.Microsoft.TypeSpec.Generator.Wasm.WasmGenerator.Generate(
      codeModelJson,
      configurationJson,
    );

  const result: Record<string, string> = JSON.parse(resultJson);

  // Check for errors from the C# side
  if (result["__error"]) {
    throw new Error(`C# generator error: ${result["__error"]}`);
  }

  return result;
}

/**
 * Check if the WASM generator is available (i.e., the assets are served).
 */
export async function isWasmGeneratorAvailable(): Promise<boolean> {
  try {
    const baseUrl = getWasmBaseUrl();
    const response = await fetch(`${baseUrl}_framework/dotnet.js`, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}
