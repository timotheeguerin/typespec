import { MANIFEST, normalizePath, type Program } from "@typespec/compiler";
import { resolveModule, type ResolveModuleHost } from "@typespec/compiler/module-resolver";
import { readFile, realpath, stat } from "fs/promises";
import { dirname } from "path";
import { pathToFileURL } from "url";

export async function compileWithLocalCompiler(
  entrypoint: string,
  configPath?: string,
): Promise<Program> {
  const entrypointPath = normalizePath(entrypoint);
  const compiler = await importTypeSpecCompiler(dirname(entrypointPath));
  if (compiler.MANIFEST.version !== MANIFEST.version) {
    throw new Error(
      `Compiler version mismatch: tspq uses ${MANIFEST.version}, project uses ${compiler.MANIFEST.version}. Install matching local versions.`,
    );
  }
  const resolved = compiler.resolvePath(entrypointPath);
  const [options, diagnostics] = await compiler.resolveCompilerOptions(compiler.NodeHost, {
    entrypoint: resolved,
    cwd: process.cwd(),
    configPath,
  });
  const program = await compiler.compile(compiler.NodeHost, resolved, {
    ...options,
    noEmit: true,
    emit: [],
  });
  program.reportDiagnostics(diagnostics);
  return program;
}

async function importTypeSpecCompiler(
  baseDir: string,
): Promise<typeof import("@typespec/compiler")> {
  try {
    const host: ResolveModuleHost = {
      realpath,
      readFile: async (path: string) => await readFile(path, "utf-8"),
      stat,
    };
    const resolved = await resolveModule(host, "@typespec/compiler", {
      baseDir,
      conditions: ["import"],
    });
    return await import(
      pathToFileURL(resolved.type === "module" ? resolved.mainFile : resolved.path).toString()
    );
  } catch (err) {
    throw new Error(
      "Unable to load the project's TypeSpec compiler. Install project dependencies before querying.",
      { cause: err },
    );
  }
}
