// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

import {
  createDiagnosticCollector,
  Diagnostic,
  DiagnosticCollector,
  EmitContext,
  getDirectoryPath,
  joinPaths,
  NoTarget,
  resolvePath,
} from "@typespec/compiler";
import fs, { statSync } from "fs";
import { dirname } from "path";
import { fileURLToPath } from "url";
import {
  _minSupportedDotNetSdkVersion,
  configurationFileName,
  tspOutputFileName,
} from "../constants.js";
import { execAsync, execCSharpGenerator } from "./dotnet-exec.js";
import { createDiagnostic } from "./lib.js";
import { Logger } from "./logger.js";
import { CSharpEmitterOptions } from "../options.js";
import { CSharpEmitterContext } from "../sdk-context.js";
import { Configuration } from "../type/configuration.js";

/**
 * Look for the project root by looking up until a `package.json` is found.
 * @param path Path to start looking
 */
function findProjectRoot(path: string): string | undefined {
  let current = path;
  while (true) {
    const pkgPath = joinPaths(current, "package.json");
    const stats = checkFile(pkgPath);
    if (stats?.isFile()) {
      return current;
    }
    const parent = getDirectoryPath(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

function checkFile(pkgPath: string) {
  try {
    return statSync(pkgPath);
  } catch (error) {
    return undefined;
  }
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
 * Runs the dotnet C# generator. This function encapsulates all Node.js-dependent code
 * (filesystem operations, child process spawning) needed for the generator execution.
 * It is loaded via dynamic import so that browser bundles never pull in Node.js modules.
 * @internal
 */
export async function runDotnetGenerator(
  sdkContext: CSharpEmitterContext,
  diagnostics: DiagnosticCollector,
  params: {
    resolvedOptions: CSharpEmitterOptions & { "generator-name": string };
    configurations: Configuration;
    outputFolder: string;
    context: EmitContext<CSharpEmitterOptions>;
    logger: Logger;
  },
): Promise<void> {
  const { resolvedOptions: options, configurations, outputFolder, context, logger } = params;

  const generatedFolder = resolvePath(outputFolder, "src", "Generated");

  if (!fs.existsSync(generatedFolder)) {
    fs.mkdirSync(generatedFolder, { recursive: true });
  }

  const csProjFile = resolvePath(
    outputFolder,
    "src",
    `${configurations["package-name"]}.csproj`,
  );
  logger.info(`Checking if ${csProjFile} exists`);

  const emitterPath = options["emitter-extension-path"] ?? import.meta.url;
  const projectRoot = findProjectRoot(dirname(fileURLToPath(emitterPath)));
  const generatorPath = resolvePath(
    projectRoot + "/dist/generator/Microsoft.TypeSpec.Generator.dll",
  );

  try {
    const result = await execCSharpGenerator(sdkContext, {
      generatorPath: generatorPath,
      outputFolder: outputFolder,
      generatorName: options["generator-name"],
      newProject: options["new-project"] || !checkFile(csProjFile),
      debug: options.debug ?? false,
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
  if (!options["save-inputs"]) {
    // delete
    context.program.host.rm(resolvePath(outputFolder, tspOutputFileName));
    context.program.host.rm(resolvePath(outputFolder, configurationFileName));
  }
}
