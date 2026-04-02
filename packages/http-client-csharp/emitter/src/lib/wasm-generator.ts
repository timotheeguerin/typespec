// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

/**
 * Bridge between the TypeSpec JS emitter and the C# WASM generator.
 * Lazily loads the .NET WASM runtime and calls the C# generator
 * to produce generated C# files from the tspCodeModel.json intermediate representation.
 */

let wasmExports: any = null;
let initPromise: Promise<void> | null = null;

function getWasmBaseUrl(): string {
  return (globalThis as any).__TYPESPEC_CSHARP_WASM_BASE_URL ?? "/wasm/csharp/";
}

async function initializeWasm(): Promise<void> {
  if (wasmExports) return;

  const baseUrl = getWasmBaseUrl();
  const dotnetUrl = `${baseUrl}_framework/dotnet.js`;

  console.log("[http-client-csharp] Loading .NET WASM runtime...");
  const { dotnet } = await import(/* @vite-ignore */ dotnetUrl);

  const { getAssemblyExports, getConfig } = await dotnet.create();
  console.log("[http-client-csharp] .NET WASM runtime initialized");

  const config = getConfig();
  wasmExports = await getAssemblyExports(config.mainAssemblyName);
}

/**
 * Generate C# source files from code model JSON using the WASM generator.
 */
export async function generateCSharpFromWasm(
  codeModelJson: string,
  configurationJson: string,
): Promise<Record<string, string>> {
  if (!initPromise) {
    initPromise = initializeWasm();
  }
  await initPromise;

  if (!wasmExports) {
    throw new Error("Failed to initialize the C# WASM generator");
  }

  const resultJson =
    wasmExports.Microsoft.TypeSpec.Generator.Wasm.WasmGenerator.Generate(
      codeModelJson,
      configurationJson,
    );

  const result: Record<string, string> = JSON.parse(resultJson);

  if (result["__error"]) {
    throw new Error(`C# generator error: ${result["__error"]}`);
  }

  return result;
}

