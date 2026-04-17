import { readFile } from "fs/promises";
import { join } from "path";
import { expect, it } from "vitest";
import { EmitterTester } from "./test-host.js";

const libraryName = "@typespec/http-server-csharp";

/**
 * Extracts all emitted .cs files from the compilation result as a map of
 * relative path → content.  The path prefix up to the emitter package name
 * is stripped so the keys look like "generated/models/Pet.cs".
 */
function extractCsFiles(fs: Map<string, string>): Map<string, string> {
  const emitterPrefix = `${libraryName}/`;
  const result = new Map<string, string>();
  for (const [fullPath, content] of fs) {
    if (!fullPath.endsWith(".cs") && !fullPath.endsWith(".csproj")) continue;
    if (fullPath.includes("/node_modules/")) continue;

    const idx = fullPath.indexOf(emitterPrefix);
    const relativePath = idx !== -1 ? fullPath.substring(idx + emitterPrefix.length) : fullPath;
    result.set(relativePath, content);
  }
  return result;
}

const snapshotDir = join(import.meta.dirname, "snapshots/sample-service");

it("sample-service full output", async () => {
  const sampleServicePath = join(import.meta.dirname, "snapshots/sample-service.tsp");
  const sampleCode = await readFile(sampleServicePath, "utf-8");

  const runner = await EmitterTester.createInstance();
  const [result, diagnostics] = await runner.compileAndDiagnose(sampleCode, {
    emitterOptions: {
      "skip-format": true,
      "emit-mocks": "mocks-and-project-files",
    } as any,
  });

  const errors = diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(`Compilation errors:\n${errors.map((e) => `  ${e.message}`).join("\n")}`);
  }

  const files = extractCsFiles(result.fs.fs);
  const sortedPaths = [...files.keys()].sort();

  // Snapshot each file so diffs are easy to read in PRs
  for (const path of sortedPaths) {
    const content = files.get(path)!;
    await expect(content).toMatchFileSnapshot(join(snapshotDir, path));
  }
});
