// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

// Browser implementation: sends code model to a playground server via fetch.

import { resolvePath } from "@typespec/compiler";
import { CSharpEmitterContext } from "./sdk-context.js";
import type { GenerateOptions } from "./emit-generate.js";

export async function generate(
  sdkContext: CSharpEmitterContext,
  codeModelJson: string,
  configJson: string,
  options: GenerateOptions,
): Promise<void> {
  const serverUrl =
    (globalThis as any).__TYPESPEC_PLAYGROUND_SERVER_URL__ ?? "http://localhost:5174";

  const response = await fetch(`${serverUrl}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      codeModel: codeModelJson,
      configuration: configJson,
      generatorName: options.generatorName,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Playground server error (${response.status}): ${errorText}`);
  }

  const result: { files: Array<{ path: string; content: string }> } = await response.json();

  for (const file of result.files) {
    await sdkContext.program.host.writeFile(
      resolvePath(options.outputFolder, file.path),
      file.content,
    );
  }
}
