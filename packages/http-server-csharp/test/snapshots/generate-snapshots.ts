/**
 * Script to generate emitter output snapshots for comparison testing.
 *
 * Usage: npx tsx test/snapshots/generate-snapshots.ts [--output-dir <dir>]
 *
 * This compiles the sample-service.tsp using the http-server-csharp emitter
 * and writes all emitted files to the output directory.
 */
import { resolvePath } from "@typespec/compiler";
import { createTester } from "@typespec/compiler/testing";
import { readFile, mkdir, writeFile, rm } from "fs/promises";
import { dirname, join } from "path";
import { parseArgs } from "util";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = parseArgs({
  args: process.argv.slice(2),
  options: {
    "output-dir": { type: "string", default: join(__dirname, "current") },
  },
  strict: false,
});

const outputDir = args.values["output-dir"] as string;
const libraryName = "@typespec/http-server-csharp";

async function main() {
  // Read the sample service TypeSpec
  const sampleServicePath = join(__dirname, "sample-service.tsp");
  const sampleCode = await readFile(sampleServicePath, "utf-8");

  // Create the tester WITHOUT importLibraries/using - the sample .tsp has its own
  const tester = createTester(resolvePath(__dirname, "../.."), {
    libraries: [
      "@typespec/http",
      "@typespec/rest",
      "@typespec/versioning",
      "@typespec/json-schema",
      libraryName,
    ],
  });

  const instance = await tester.createInstance();

  // Compile with the sample service code
  const [result, diagnostics] = await instance.compileAndDiagnose(sampleCode, {
    compilerOptions: {
      emit: [libraryName],
      options: {
        [libraryName]: {
          "skip-format": true,
          "emit-mocks": "mocks-and-project-files",
        } as any,
      },
    },
  });

  // Report diagnostics
  const errors = diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    console.error("Compilation errors:");
    for (const diag of errors) {
      console.error(`  ${diag.severity}: ${diag.message}`);
    }
    process.exit(1);
  }

  if (diagnostics.length > 0) {
    console.log("Diagnostics:");
    for (const diag of diagnostics) {
      console.log(`  ${diag.severity}: ${diag.message}`);
    }
  }

  // Clean output dir
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  // Write all emitted files
  const entries = [...result.fs.fs.entries()];
  let fileCount = 0;

  // Find all .cs files in the output
  for (const [path, content] of entries) {
    if (path.endsWith(".cs") || path.endsWith(".csproj") || path.endsWith(".json")) {
      // Skip node_modules files
      if (path.includes("/node_modules/")) continue;

      // Extract relative path by stripping the emitter output prefix
      const emitterPrefix = `@typespec/http-server-csharp/`;
      const prefixIdx = path.indexOf(emitterPrefix);
      let relativePath: string | null = null;

      if (prefixIdx !== -1) {
        relativePath = path.substring(prefixIdx + emitterPrefix.length);
      } else {
        // Fallback: use last 3 segments
        const parts = path.split("/");
        relativePath = parts.slice(-3).join("/");
      }

      const outPath = join(outputDir, relativePath);
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, content, "utf-8");
      fileCount++;
      console.log(`  Written: ${relativePath}`);
    }
  }

  console.log(`\nTotal files emitted: ${fileCount}`);
  console.log(`Output directory: ${outputDir}`);

  // Dump all paths for debugging if nothing emitted
  if (fileCount === 0) {
    console.log("\nAll file paths in virtual fs:");
    for (const [path] of entries) {
      console.log(`  ${path}`);
    }
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
