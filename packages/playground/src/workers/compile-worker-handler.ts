/**
 * This module generates the worker handler code that will be inlined
 * into the self-contained compile worker bundle.
 *
 * The generated code runs inside a Web Worker and expects
 * `self.__typespec_libraries` to be set with all library modules.
 */

/**
 * Returns the JavaScript source code for the compile worker message handler.
 * This code is intended to be bundled into the worker entry by the Vite plugin.
 */
export function getCompileWorkerHandlerCode(): string {
  // This string is the actual worker handler code.
  // It references `self.__typespec_libraries` which is set by the generated entry.
  return `
// ── Compile Worker Handler ──

const libs = self.__typespec_libraries;

// State
let browserHost = null;
let compilerModule = null;

/**
 * Initialize: create BrowserHost from the loaded libraries.
 */
function init() {
  // Find the compiler module (always "@typespec/compiler")
  compilerModule = libs["@typespec/compiler"];
  if (!compilerModule) {
    throw new Error("@typespec/compiler not found in worker libraries");
  }

  const { createSourceFile, getSourceFileKindFromExt, resolvePath } = compilerModule;

  function resolveVirtualPath(path, ...paths) {
    return resolvePath("/test", path, ...paths);
  }

  // Build virtual FS and JS imports from all libraries
  const virtualFs = new Map();
  const jsImports = new Map();
  const libraryMetadata = {};

  for (const [libName, libModule] of Object.entries(libs)) {
    const tspLib = libModule._TypeSpecLibrary_;
    if (!tspLib) continue;

    // Register TypeSpec source files
    for (const [key, value] of Object.entries(tspLib.typespecSourceFiles || {})) {
      virtualFs.set("/test/node_modules/" + libName + "/" + key, value);
    }

    // Register JS source files
    for (const [key, value] of Object.entries(tspLib.jsSourceFiles || {})) {
      const path = "/test/node_modules/" + libName + "/" + key;
      virtualFs.set(path, "");
      jsImports.set(path, value);
    }

    // Store metadata for the init response
    const pkgJson = tspLib.typespecSourceFiles?.["package.json"]
      ? JSON.parse(tspLib.typespecSourceFiles["package.json"])
      : { name: libName, version: "0.0.0" };

    libraryMetadata[libName] = {
      name: libName,
      isEmitter: !!libModule.$lib?.emitter,
      packageJson: pkgJson,
    };
  }

  // Create package.json
  virtualFs.set(
    "/test/package.json",
    JSON.stringify({
      name: "playground-pkg",
      dependencies: Object.fromEntries(
        Object.entries(libraryMetadata).map(([name, meta]) => [name, meta.packageJson.version || "0.0.0"])
      ),
    })
  );

  // Build the host
  browserHost = {
    compiler: compilerModule,
    libraries: libraryMetadata,

    async readUrl(url) {
      const contents = virtualFs.get(url);
      if (contents === undefined) {
        const e = new Error("File " + url + " not found.");
        e.code = "ENOENT";
        throw e;
      }
      return createSourceFile(contents, url);
    },
    async readFile(path) {
      path = resolveVirtualPath(path);
      const contents = virtualFs.get(path);
      if (contents === undefined) {
        const e = new Error("File " + path + " not found.");
        e.code = "ENOENT";
        throw e;
      }
      return createSourceFile(contents, path);
    },
    async writeFile(path, content) {
      path = resolveVirtualPath(path);
      virtualFs.set(path, content);
    },
    async readDir(path) {
      path = resolveVirtualPath(path);
      const fileFolder = [...virtualFs.keys()]
        .filter((x) => x.startsWith(path + "/"))
        .map((x) => x.replace(path + "/", ""))
        .map((x) => {
          const index = x.indexOf("/");
          return index !== -1 ? x.substring(0, index) : x;
        });
      return [...new Set(fileFolder)];
    },
    async rm(path) {
      path = resolveVirtualPath(path);
      for (const key of virtualFs.keys()) {
        if (key === path || key.startsWith(path + "/")) {
          virtualFs.delete(key);
        }
      }
    },
    getLibDirs() {
      if (virtualFs.has(resolveVirtualPath("/test/node_modules/@typespec/compiler/lib/std/main.tsp"))) {
        return [resolveVirtualPath("/test/node_modules/@typespec/compiler/lib/std")];
      } else {
        return [resolveVirtualPath("/test/node_modules/@typespec/compiler/lib")];
      }
    },
    getExecutionRoot() {
      return resolveVirtualPath("/test/node_modules/@typespec/compiler");
    },
    async getJsImport(path) {
      path = resolveVirtualPath(path);
      const mod = await jsImports.get(path);
      if (mod === undefined) {
        const e = new Error("Module " + path + " not found");
        e.code = "MODULE_NOT_FOUND";
        throw e;
      }
      return mod;
    },
    async stat(path) {
      path = resolveVirtualPath(path);
      if (virtualFs.has(path)) {
        return { isDirectory() { return false; }, isFile() { return true; } };
      }
      for (const fsPath of virtualFs.keys()) {
        if (fsPath.startsWith(path) && fsPath !== path) {
          return { isDirectory() { return true; }, isFile() { return false; } };
        }
      }
      const e = new Error("File " + path + " not found.");
      e.code = "ENOENT";
      throw e;
    },
    async realpath(path) { return path; },
    getSourceFileKind: getSourceFileKindFromExt,
    logSink: console,
    mkdirp: async (path) => path,
    fileURLToPath(path) { return path.replace("inmemory:/", ""); },
    pathToFileURL(path) { return "inmemory:/" + resolveVirtualPath(path); },
  };

  return libraryMetadata;
}

/**
 * Serialize a diagnostic target to a source location.
 */
function serializeTarget(target) {
  if (target === undefined || typeof target === "symbol") return undefined;
  const location = compilerModule.getSourceLocation(target, { locateId: true });
  if (!location) return undefined;
  const start = location.file.getLineAndCharacterOfPosition(location.pos);
  const end = location.file.getLineAndCharacterOfPosition(location.end);
  return {
    file: location.file.path,
    pos: location.pos,
    end: location.end,
    startLine: start.line,
    startColumn: start.character,
    endLine: end.line,
    endColumn: end.character,
  };
}

/**
 * Pre-resolve codefixes for a diagnostic.
 */
async function serializeCodefixes(diagnostic) {
  if (!diagnostic.codefixes?.length) return [];
  const result = [];
  for (const fix of diagnostic.codefixes) {
    try {
      const edits = await compilerModule.resolveCodeFix(fix);
      const serializedEdits = edits.map((edit) => {
        const start = edit.file.getLineAndCharacterOfPosition(edit.pos);
        const endPos = edit.kind === "insert-text" ? edit.pos : edit.end;
        const end = edit.file.getLineAndCharacterOfPosition(endPos);
        return {
          file: edit.file.path,
          range: {
            startLine: start.line, startColumn: start.character,
            endLine: end.line, endColumn: end.character,
          },
          text: edit.text,
        };
      });
      result.push({ label: fix.label, edits: serializedEdits });
    } catch (e) {
      // Skip codefixes that fail to resolve
    }
  }
  return result;
}

/**
 * Run compilation and return serialized results.
 */
async function doCompile(content, selectedEmitter, options) {
  const { resolvePath } = compilerModule;
  const outputDir = resolvePath("/test", "tsp-output");

  // Write content
  await browserHost.writeFile("main.tsp", content);

  // Clear output dir
  const outputDirItems = await browserHost.readDir("./tsp-output");
  for (const item of outputDirItems) {
    await browserHost.rm("./tsp-output/" + item);
  }

  try {
    const program = await compilerModule.compile(browserHost, resolvePath("/test", "main.tsp"), {
      ...options,
      options: {
        ...(options.options || {}),
        [selectedEmitter]: {
          ...(options.options?.[selectedEmitter] || {}),
          "emitter-output-dir": outputDir,
        },
      },
      outputDir,
      emit: selectedEmitter ? [selectedEmitter] : [],
    });

    // Collect output files
    const outputFiles = {};
    async function collectFiles(dir) {
      const items = await browserHost.readDir(outputDir + dir);
      for (const item of items) {
        const itemPath = dir + "/" + item;
        const stat = await browserHost.stat(outputDir + itemPath);
        if (stat.isDirectory()) {
          await collectFiles(itemPath);
        } else {
          const fileContent = await browserHost.readFile("tsp-output" + itemPath);
          const key = dir === "" ? item : dir.slice(1) + "/" + item;
          outputFiles[key] = fileContent.text;
        }
      }
    }
    await collectFiles("");

    // Serialize diagnostics
    const diagnostics = await Promise.all(
      program.diagnostics.map(async (d) => ({
        severity: d.severity,
        code: String(d.code),
        message: d.message,
        target: serializeTarget(d.target),
        codefixes: await serializeCodefixes(d),
      }))
    );

    return { outputFiles, diagnostics };
  } catch (error) {
    console.error("Internal compiler error in worker", error);
    return { internalCompilerError: String(error) };
  }
}

// ── Message Handler ──

self.onmessage = async (e) => {
  const msg = e.data;

  try {
    if (msg.type === "init") {
      const libraryMetadata = init();
      self.postMessage({
        type: "init-result",
        id: msg.id,
        success: true,
        libraries: libraryMetadata,
      });
    } else if (msg.type === "compile") {
      const result = await doCompile(msg.content, msg.selectedEmitter, msg.options);
      self.postMessage({
        type: "compile-result",
        id: msg.id,
        result,
      });
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      id: msg.id,
      error: String(error),
    });
  }
};
`;
}
