import { readFile } from "fs/promises";
import { join } from "path";
import { expect, it } from "vitest";
import { EmitterTester } from "./test-host.js";

const libraryName = "@typespec/http-server-csharp";
const snapshotDir = join(import.meta.dirname, "snapshots/sample-service");

it("sample-service full output", async () => {
  const sampleServicePath = join(import.meta.dirname, "snapshots/sample-service.tsp");
  const sampleCode = await readFile(sampleServicePath, "utf-8");

  const runner = await EmitterTester.createInstance();
  const [result, diagnostics] = await runner.compileAndDiagnose(sampleCode, {
    compilerOptions: {
      options: {
        [libraryName]: {
          "skip-format": true,
          "emit-mocks": "mocks-and-project-files",
        },
      },
    },
  });

  const errors = diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(`Compilation errors:\n${errors.map((e) => `  ${e.message}`).join("\n")}`);
  }

  const sortedPaths = Object.keys(result.outputs).sort();

  // Snapshot each file so diffs are easy to read in PRs
  for (const path of sortedPaths) {
    await expect(result.outputs[path]).toMatchFileSnapshot(join(snapshotDir, path));
  }
});
