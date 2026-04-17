/**
 * Snapshot comparison script for http-server-csharp Alloy migration.
 *
 * Compiles sample-service.tsp with the current (alloy) emitter and compares
 * the output against baseline files generated from the old emitter on main.
 *
 * Usage: npx tsx test/snapshots/compare-snapshots.ts
 *
 * Exit codes:
 *   0 - All common model/enum files match
 *   1 - Differences found in common files
 */
import { resolvePath } from "@typespec/compiler";
import { createTester } from "@typespec/compiler/testing";
import { readFile, readdir, mkdir, writeFile, rm } from "fs/promises";
import { dirname, join, relative } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const baselineDir = join(__dirname, "baseline");
const currentDir = join(__dirname, "current");
const libraryName = "@typespec/http-server-csharp";

/** Recursively collect all files in a directory */
async function collectFiles(dir: string, base?: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  base = base ?? dir;

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await collectFiles(fullPath, base);
      for (const [k, v] of subFiles) {
        files.set(k, v);
      }
    } else {
      const relPath = relative(base, fullPath);
      const content = await readFile(fullPath, "utf-8");
      files.set(relPath, content);
    }
  }

  return files;
}

/** Compile the sample service with the current emitter */
async function compileCurrentOutput(): Promise<Map<string, string>> {
  const sampleCode = await readFile(join(__dirname, "sample-service.tsp"), "utf-8");

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

  const errors = diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    console.error("Compilation errors:");
    for (const diag of errors) {
      console.error(`  ${diag.message}`);
    }
    process.exit(1);
  }

  const files = new Map<string, string>();
  const entries = [...result.fs.fs.entries()];

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
        const parts = path.split("/");
        relativePath = parts.slice(-3).join("/");
      }

      files.set(relativePath, content);
    }
  }

  return files;
}

/** Normalize whitespace for comparison */
function normalize(content: string): string {
  return content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

async function main() {
  console.log("Compiling sample service with current (alloy) emitter...\n");
  const currentFiles = await compileCurrentOutput();

  // Save current output
  await rm(currentDir, { recursive: true, force: true });
  await mkdir(currentDir, { recursive: true });
  for (const [path, content] of currentFiles) {
    const outPath = join(currentDir, path);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, content, "utf-8");
  }

  console.log("Loading baseline files...\n");
  const baselineFiles = await collectFiles(baselineDir);

  const allPaths = new Set([...baselineFiles.keys(), ...currentFiles.keys()]);

  const onlyInBaseline: string[] = [];
  const onlyInCurrent: string[] = [];
  const matching: string[] = [];
  const differing: Array<{
    path: string;
    baseline: string;
    current: string;
  }> = [];

  for (const path of [...allPaths].sort()) {
    const inBaseline = baselineFiles.has(path);
    const inCurrent = currentFiles.has(path);

    if (inBaseline && !inCurrent) {
      onlyInBaseline.push(path);
    } else if (!inBaseline && inCurrent) {
      onlyInCurrent.push(path);
    } else {
      const baselineContent = normalize(baselineFiles.get(path)!);
      const currentContent = normalize(currentFiles.get(path)!);
      if (baselineContent === currentContent) {
        matching.push(path);
      } else {
        differing.push({ path, baseline: baselineContent, current: currentContent });
      }
    }
  }

  // Print report
  console.log("=".repeat(70));
  console.log("SNAPSHOT COMPARISON REPORT: Old Emitter (main) vs Alloy Emitter");
  console.log("=".repeat(70));

  console.log(`\nBaseline files (old emitter): ${baselineFiles.size}`);
  console.log(`Current files (alloy emitter): ${currentFiles.size}`);

  if (matching.length > 0) {
    console.log(`\n✅ IDENTICAL FILES (${matching.length}):`);
    for (const path of matching) {
      console.log(`   ✅ ${path}`);
    }
  }

  if (differing.length > 0) {
    console.log(`\n⚠️  FILES WITH DIFFERENCES (${differing.length}):`);
    for (const { path, baseline, current } of differing) {
      console.log(`\n   ⚠️  ${path}:`);

      const baseLines = baseline.split("\n");
      const currLines = current.split("\n");
      const maxLines = Math.max(baseLines.length, currLines.length);

      let diffCount = 0;
      for (let i = 0; i < maxLines; i++) {
        const baseLine = baseLines[i] ?? "";
        const currLine = currLines[i] ?? "";
        if (baseLine !== currLine) {
          diffCount++;
          if (diffCount <= 20) {
            // limit output
            console.log(`      Line ${i + 1}:`);
            if (baseLine) console.log(`        - (old): ${baseLine}`);
            if (currLine) console.log(`        + (new): ${currLine}`);
          }
        }
      }
      if (diffCount > 20) {
        console.log(`      ... and ${diffCount - 20} more differences`);
      }
      console.log(`      Total differing lines: ${diffCount}`);
    }
  }

  if (onlyInBaseline.length > 0) {
    console.log(
      `\n❌ FILES ONLY IN BASELINE — not yet implemented in alloy (${onlyInBaseline.length}):`,
    );
    for (const path of onlyInBaseline) {
      console.log(`   ❌ ${path}`);
    }
  }

  if (onlyInCurrent.length > 0) {
    console.log(`\n🆕 FILES ONLY IN CURRENT — new in alloy (${onlyInCurrent.length}):`);
    for (const path of onlyInCurrent) {
      console.log(`   🆕 ${path}`);
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log(
    `SUMMARY: ${matching.length} identical, ${differing.length} differing, ` +
      `${onlyInBaseline.length} only in baseline, ${onlyInCurrent.length} only in current`,
  );
  console.log("=".repeat(70));

  // Also save a report file
  const reportPath = join(__dirname, "comparison-report.txt");
  const report = [
    "SNAPSHOT COMPARISON REPORT",
    `Baseline: ${baselineFiles.size} files, Current: ${currentFiles.size} files`,
    "",
    `Identical: ${matching.length}`,
    ...matching.map((p) => `  ${p}`),
    "",
    `Differing: ${differing.length}`,
    ...differing.map((d) => `  ${d.path}`),
    "",
    `Only in baseline: ${onlyInBaseline.length}`,
    ...onlyInBaseline.map((p) => `  ${p}`),
    "",
    `Only in current: ${onlyInCurrent.length}`,
    ...onlyInCurrent.map((p) => `  ${p}`),
  ].join("\n");
  await writeFile(reportPath, report, "utf-8");
  console.log(`\nReport saved to: ${reportPath}`);

  // Exit with error if common files differ
  if (differing.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
