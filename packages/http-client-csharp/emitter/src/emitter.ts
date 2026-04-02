// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

import { createSdkContext, SdkContext } from "@azure-tools/typespec-client-generator-core";
import {
  createDiagnosticCollector,
  Diagnostic,
  EmitContext,
  getDirectoryPath,
  joinPaths,
  NoTarget,
  Program,
  resolvePath,
} from "@typespec/compiler";
import { writeCodeModel, writeConfiguration, serializeCodeModel } from "./code-model-writer.js";
import {
  _minSupportedDotNetSdkVersion,
  configurationFileName,
  tspOutputFileName,
} from "./constants.js";
import { createModel } from "./lib/client-model-builder.js";
import { createDiagnostic } from "./lib/lib.js";
import { LoggerLevel } from "./lib/logger-level.js";
import { Logger } from "./lib/logger.js";
import { execAsync, execCSharpGenerator } from "./lib/utils.js";
import { CSharpEmitterOptions, resolveOptions } from "./options.js";
import { createCSharpEmitterContext, CSharpEmitterContext } from "./sdk-context.js";
import { CodeModel } from "./type/code-model.js";
import { Configuration } from "./type/configuration.js";

/**
 * Look for the project root by looking up until a `package.json` is found.
 * @param path Path to start looking
 * @param statSyncFn The statSync function (injected to avoid top-level fs import)
 */
function findProjectRoot(
  path: string,
  statSyncFn: (p: string) => { isFile(): boolean },
): string | undefined {
  let current = path;
  while (true) {
    const pkgPath = joinPaths(current, "package.json");
    try {
      if (statSyncFn(pkgPath)?.isFile()) {
        return current;
      }
    } catch {
      // file doesn't exist
    }
    const parent = getDirectoryPath(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

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

      const namespace = updatedRoot.name;
      const configurations: Configuration = createConfiguration(options, namespace, sdkContext);

      const playgroundServerUrl =
        options["playground-server-url"] ||
        (typeof globalThis.process === "undefined"
          ? ((globalThis as any).__TYPESPEC_PLAYGROUND_SERVER_URL__ ?? "http://localhost:5174")
          : undefined);

      if (playgroundServerUrl) {
        // Playground mode: serialize and send directly to server without writing to virtual FS
        const codeModelJson = serializeCodeModel(sdkContext, updatedRoot);
        const configJson = JSON.stringify(configurations, null, 2) + "\n";
        await generateViaPlaygroundServer(
          playgroundServerUrl,
          sdkContext,
          outputFolder,
          codeModelJson,
          configJson,
          options["generator-name"],
        );
      } else {
        // Local mode: write files and run .NET generator
        await writeCodeModel(sdkContext, updatedRoot, outputFolder);
        await writeConfiguration(sdkContext, configurations, outputFolder);

        await runLocalGenerator(sdkContext, diagnostics, {
          outputFolder,
          packageName: configurations["package-name"] ?? "",
          generatorName: options["generator-name"],
          newProject: options["new-project"],
          debug: options.debug ?? false,
          emitterExtensionPath: options["emitter-extension-path"],
          logger,
        });

        if (!options["save-inputs"]) {
          context.program.host.rm(resolvePath(outputFolder, tspOutputFileName));
          context.program.host.rm(resolvePath(outputFolder, configurationFileName));
        }
      }
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
    "generator-name",
    "debug",
    "logLevel",
    "generator-name",
    "api-version",
    "generate-protocol-methods",
    "generate-convenience-methods",
    "emitter-extension-path",
    "playground-server-url",
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

/** check the dotnet sdk installation.
 * Report diagnostic if dotnet sdk is not installed or its version does not meet prerequisite
 * @param sdkContext - The SDK context
 * @param minVersionRequisite - The minimum required major version
 * @returns A tuple containing whether the SDK is valid and any diagnostics
 * @internal
 */
export async function _validateDotNetSdk(
  sdkContext: CSharpEmitterContext,
  minMajorVersion: number,
): Promise<[boolean, readonly Diagnostic[]]> {
  const diagnostics = createDiagnosticCollector();
  try {
    const result = await execAsync("dotnet", ["--version"], { stdio: "pipe" });
    return diagnostics.wrap(
      diagnostics.pipe(validateDotNetSdkVersionCore(sdkContext, result.stdout, minMajorVersion)),
    );
  } catch (error: any) {
    if (error && "code" in error && error["code"] === "ENOENT") {
      diagnostics.add(
        createDiagnostic({
          code: "invalid-dotnet-sdk-dependency",
          messageId: "missing",
          format: {
            dotnetMajorVersion: `${minMajorVersion}`,
            downloadUrl: "https://dotnet.microsoft.com/",
          },
          target: NoTarget,
        }),
      );
    }
    return diagnostics.wrap(false);
  }
}

function validateDotNetSdkVersionCore(
  sdkContext: CSharpEmitterContext,
  version: string,
  minMajorVersion: number,
): [boolean, readonly Diagnostic[]] {
  const diagnostics = createDiagnosticCollector();
  if (version) {
    const dotIndex = version.indexOf(".");
    const firstPart = dotIndex === -1 ? version : version.substring(0, dotIndex);
    const major = Number(firstPart);

    if (isNaN(major)) {
      return diagnostics.wrap(false);
    }
    if (major < minMajorVersion) {
      diagnostics.add(
        createDiagnostic({
          code: "invalid-dotnet-sdk-dependency",
          messageId: "invalidVersion",
          format: {
            installedVersion: version,
            dotnetMajorVersion: `${minMajorVersion}`,
            downloadUrl: "https://dotnet.microsoft.com/",
          },
          target: NoTarget,
        }),
      );
      return diagnostics.wrap(false);
    }
    return diagnostics.wrap(true);
  } else {
    diagnostics.add(
      createDiagnostic({
        code: "general-error",
        format: { message: "Cannot get the installed .NET SDK version." },
        target: NoTarget,
      }),
    );
    return diagnostics.wrap(false);
  }
}

/**
 * Sends the code model and configuration to a playground server for C# generation.
 * Used when the emitter runs in a browser environment.
 */
async function generateViaPlaygroundServer(
  serverUrl: string,
  sdkContext: CSharpEmitterContext,
  outputFolder: string,
  codeModelJson: string,
  configJson: string,
  generatorName: string,
): Promise<void> {
  const response = await fetch(`${serverUrl}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      codeModel: codeModelJson,
      configuration: configJson,
      generatorName,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Playground server error (${response.status}): ${errorText}`);
  }

  const result: { files: Array<{ path: string; content: string }> } = await response.json();

  for (const file of result.files) {
    await sdkContext.program.host.writeFile(resolvePath(outputFolder, file.path), file.content);
  }
}

/**
 * Runs the .NET generator locally via subprocess.
 * Uses dynamic imports for Node.js modules (fs, path, url) to keep the
 * emitter module loadable in browser environments.
 */
async function runLocalGenerator(
  sdkContext: CSharpEmitterContext,
  diagnostics: ReturnType<typeof createDiagnosticCollector>,
  options: {
    outputFolder: string;
    packageName: string;
    generatorName: string;
    newProject: boolean;
    debug: boolean;
    emitterExtensionPath?: string;
    logger: Logger;
  },
): Promise<void> {
  const fs = await import("fs");
  const { dirname } = await import("path");
  const { fileURLToPath } = await import("url");

  const generatedFolder = resolvePath(options.outputFolder, "src", "Generated");

  if (!fs.existsSync(generatedFolder)) {
    fs.mkdirSync(generatedFolder, { recursive: true });
  }

  const csProjFile = resolvePath(
    options.outputFolder,
    "src",
    `${options.packageName}.csproj`,
  );
  options.logger.info(`Checking if ${csProjFile} exists`);

  const emitterPath = options.emitterExtensionPath ?? import.meta.url;
  const projectRoot = findProjectRoot(dirname(fileURLToPath(emitterPath)), fs.statSync);
  const generatorPath = resolvePath(
    projectRoot + "/dist/generator/Microsoft.TypeSpec.Generator.dll",
  );

  const checkFile = (path: string) => {
    try {
      return fs.statSync(path);
    } catch {
      return undefined;
    }
  };

  try {
    const result = await execCSharpGenerator(sdkContext, {
      generatorPath: generatorPath,
      outputFolder: options.outputFolder,
      generatorName: options.generatorName,
      newProject: options.newProject || !checkFile(csProjFile),
      debug: options.debug,
    });
    if (result.exitCode !== 0) {
      const isValid = diagnostics.pipe(
        await _validateDotNetSdk(sdkContext, _minSupportedDotNetSdkVersion),
      );
      // if the dotnet sdk is valid, the error is not dependency issue, log it as normal
      if (isValid) {
        throw new Error(
          `Failed to generate the library. Exit code: ${result.exitCode}.\nStackTrace: \n${result.stderr}`,
        );
      }
    }
  } catch (error: any) {
    const isValid = diagnostics.pipe(
      await _validateDotNetSdk(sdkContext, _minSupportedDotNetSdkVersion),
    );
    // if the dotnet sdk is valid, the error is not dependency issue, log it as normal
    if (isValid) throw new Error(error, { cause: error });
  }
}
