// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

import { createSdkContext, SdkContext } from "@azure-tools/typespec-client-generator-core";
import {
  createDiagnosticCollector,
  Diagnostic,
  EmitContext,
  Program,
  resolvePath,
} from "@typespec/compiler";
import { writeCodeModel, writeConfiguration } from "./code-model-writer.js";
import { configurationFileName, tspOutputFileName } from "./constants.js";
import { createModel } from "./lib/client-model-builder.js";
import { LoggerLevel } from "./lib/logger-level.js";
import { Logger } from "./lib/logger.js";
import { generateCSharpFromWasm } from "./lib/wasm-generator.js";
import { CSharpEmitterOptions, resolveOptions } from "./options.js";
import { createCSharpEmitterContext, CSharpEmitterContext } from "./sdk-context.js";
import { CodeModel } from "./type/code-model.js";
import { Configuration } from "./type/configuration.js";

/**
 * Creates a code model by executing the full emission logic.
 * This function can be called by downstream emitters to generate a code model and collect diagnostics.
 *
 * @example
 * ```typescript
 * import { emitCodeModel } from "@typespec/http-client-csharp";
 *
 * export async function $onEmit(context: EmitContext<MyEmitterOptions>) {
 *   const updateCodeModel = (model: CodeModel, context: CSharpEmitterContext) => {
 *     // Customize the code model here
 *     return model;
 *   };
 *   const [, diagnostics] = await emitCodeModel(context, updateCodeModel);
 *   // Process diagnostics as needed
 *   context.program.reportDiagnostics(diagnostics);
 * }
 * ```
 *
 * @param context - The emit context
 * @param updateCodeModel - Optional callback to modify the code model before emission
 * @returns A tuple containing void and any diagnostics that were generated during the emission
 * @beta
 */
export async function emitCodeModel(
  context: EmitContext<CSharpEmitterOptions>,
  updateCodeModel?: (model: CodeModel, context: CSharpEmitterContext) => CodeModel,
): Promise<[void, readonly Diagnostic[]]> {
  const diagnostics = createDiagnosticCollector();
  const program: Program = context.program;
  const options = resolveOptions(context);
  const outputFolder = context.emitterOutputDir;

  /* set the log level. */
  const logger = new Logger(program, options.logLevel ?? LoggerLevel.INFO);

  if (!program.compilerOptions.noEmit && !program.hasError()) {
    // Write out the dotnet model to the output path
    const sdkContext = createCSharpEmitterContext(
      await createSdkContext(
        context,
        "@typespec/http-client-csharp",
        options["sdk-context-options"],
      ),
      logger,
    );
    for (const diag of sdkContext.diagnostics) {
      diagnostics.add(diag);
    }

    const root = diagnostics.pipe(createModel(sdkContext));

    if (root) {
      // Apply optional code model update callback
      const updatedRoot = updateCodeModel ? updateCodeModel(root, sdkContext) : root;

      // emit tspCodeModel.json
      await writeCodeModel(sdkContext, updatedRoot, outputFolder);

      const namespace = updatedRoot.name;
      const configurations: Configuration = createConfiguration(options, namespace, sdkContext);

      //emit configuration.json
      await writeConfiguration(sdkContext, configurations, outputFolder);

      // Determine execution mode based on environment
      const isBrowser =
        typeof globalThis.process === "undefined" ||
        typeof globalThis.process?.versions?.node === "undefined";
      const shouldSkipGenerator = options["skip-generator"] ?? false;

      if (!isBrowser && !shouldSkipGenerator) {
        // Node.js: run the dotnet C# generator as a child process
        const { runDotnetGenerator } = await import("./lib/dotnet-host.js");
        await runDotnetGenerator(sdkContext, diagnostics, {
          resolvedOptions: options,
          configurations,
          outputFolder,
          context,
          logger,
        });
      } else if (isBrowser && !shouldSkipGenerator) {
        // Browser: use the WASM generator to produce C# files
        console.log("[http-client-csharp] Browser detected, attempting WASM generator...");
        try {
          // Read the code model and config that were already written to the virtual FS
          const codeModelFile = await context.program.host.readFile(
            resolvePath(outputFolder, tspOutputFileName),
          );
          const configFile = await context.program.host.readFile(
            resolvePath(outputFolder, configurationFileName),
          );
          const generatedFiles = await generateCSharpFromWasm(
            codeModelFile.text,
            configFile.text,
          );

          // Write generated C# files to the virtual filesystem
          for (const [filePath, content] of Object.entries(generatedFiles)) {
            await context.program.host.writeFile(
              resolvePath(outputFolder, filePath),
              content,
            );
          }
        } catch (wasmError: any) {
          // Log to console for debugging and report as diagnostic
          console.error("[http-client-csharp] WASM generator error:", wasmError);
          logger.info(`WASM generator error: ${wasmError.message ?? wasmError}`);
        }
      }
      // If skip-generator is true, we already wrote the code model files above
    }
  }

  return diagnostics.wrap(undefined);
}

/**
 * The entry point for the emitter. This function is called by the typespec compiler.
 * @param context - The emit context
 * @beta
 */
export async function $onEmit(context: EmitContext<CSharpEmitterOptions>) {
  const [, diagnostics] = await emitCodeModel(context);
  context.program.reportDiagnostics(diagnostics);
}

export function createConfiguration(
  options: CSharpEmitterOptions,
  namespace: string,
  sdkContext: SdkContext,
): Configuration {
  const skipKeys = [
    "new-project",
    "sdk-context-options",
    "save-inputs",
    "skip-generator",
    "generator-name",
    "debug",
    "logLevel",
    "generator-name",
    "api-version",
    "generate-protocol-methods",
    "generate-convenience-methods",
    "emitter-extension-path",
  ];
  const derivedOptions = Object.fromEntries(
    Object.entries(options).filter(([key]) => !skipKeys.includes(key)),
  );
  return {
    // spread custom options first so that the predefined options below can override them
    ...derivedOptions,
    "package-name": options["package-name"] ?? namespace,
    "unreferenced-types-handling": options["unreferenced-types-handling"],
    "disable-xml-docs":
      options["disable-xml-docs"] === false ? undefined : options["disable-xml-docs"],
    license: sdkContext.sdkPackage.licenseInfo,
  };
}
