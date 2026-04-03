import { Plugin as EsbuildPlugin, context as esbuildContext } from "esbuild";
import { nodeModulesPolyfillPlugin } from "esbuild-plugins-node-modules-polyfill";
import type { TypeSpecBundle } from "./bundler.js";

export interface WorkerBundleOptions {
  /**
   * The built library bundles, keyed by library name.
   */
  readonly bundles: Record<string, TypeSpecBundle>;

  /**
   * Additional code to include in the worker entry point.
   * This code runs after all libraries are loaded and can reference
   * the `__libraries` and `__compiler` globals set by the generated entry.
   */
  readonly workerHandlerCode?: string;

  /**
   * Whether to minify the output.
   * @default false
   */
  readonly minify?: boolean;
}

/**
 * Create a self-contained worker bundle that includes all TypeSpec libraries
 * with peer dependencies fully inlined.
 *
 * The resulting JS module has no bare specifier imports and can be loaded
 * in a Web Worker without import maps.
 */
export async function createWorkerBundle(options: WorkerBundleOptions): Promise<string> {
  const { bundles, workerHandlerCode, minify = false } = options;

  // Build a mapping of all library files (keyed by virtual path)
  const libraryFiles = new Map<string, string>();

  for (const [libName, bundle] of Object.entries(bundles)) {
    for (const file of bundle.files) {
      libraryFiles.set(`${libName}/${file.filename}`, file.content);
    }
  }

  const libraryNames = Object.keys(bundles);

  // Generate the virtual entry point that imports all libraries
  const entryCode = generateWorkerEntry(libraryNames, workerHandlerCode);

  const resolverPlugin: EsbuildPlugin = {
    name: "worker-bundle-resolver",
    setup(build) {
      // Resolve the virtual entry
      build.onResolve({ filter: /^virtual:worker-entry$/ }, () => ({
        path: "virtual:worker-entry",
        namespace: "worker-entry",
      }));

      // Resolve library bare specifier imports (e.g., "@typespec/compiler")
      build.onResolve({ filter: /.*/ }, (args) => {
        // Check if it's a known library's main entry
        for (const libName of libraryNames) {
          if (args.path === libName) {
            return { path: `${libName}/index.js`, namespace: "lib-bundle" };
          }
          // Check for subpath imports (e.g., "@typespec/compiler/src/foo")
          if (args.path.startsWith(libName + "/")) {
            const subpath = args.path.slice(libName.length + 1);
            // Try with .js extension if not present
            const filename = subpath.endsWith(".js") ? subpath : `${subpath}.js`;
            return { path: `${libName}/${filename}`, namespace: "lib-bundle" };
          }
        }

        // Handle relative imports within a library bundle (e.g., "./chunk-ABC.js")
        if (args.namespace === "lib-bundle" && args.path.startsWith(".")) {
          const importerDir = args.importer.substring(0, args.importer.lastIndexOf("/"));
          const resolved = resolveRelativePath(importerDir, args.path);
          return { path: resolved, namespace: "lib-bundle" };
        }

        return undefined;
      });

      // Load the virtual entry
      build.onLoad({ filter: /.*/, namespace: "worker-entry" }, () => ({
        contents: entryCode,
        loader: "js",
      }));

      // Load library bundle files from memory
      build.onLoad({ filter: /.*/, namespace: "lib-bundle" }, (args) => {
        const content = libraryFiles.get(args.path);
        if (content !== undefined) {
          return { contents: content, loader: "js" };
        }
        // Try without .js extension
        const withoutExt = args.path.replace(/\.js$/, "");
        const altContent = libraryFiles.get(withoutExt);
        if (altContent !== undefined) {
          return { contents: altContent, loader: "js" };
        }
        return undefined;
      });
    },
  };

  const ctx = await esbuildContext({
    write: false,
    entryPoints: { "compile-worker": "virtual:worker-entry" },
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2024",
    minify,
    keepNames: minify,
    plugins: [resolverPlugin, nodeModulesPolyfillPlugin({})],
  });

  try {
    const result = await ctx.rebuild();
    const outputFile = result.outputFiles?.[0];
    if (!outputFile) {
      throw new Error("Worker bundle produced no output");
    }
    return outputFile.text;
  } finally {
    await ctx.dispose();
  }
}

/**
 * Generate the worker entry point code that imports all libraries
 * and sets up the worker message handler.
 */
function generateWorkerEntry(libraryNames: string[], handlerCode?: string): string {
  const imports = libraryNames.map(
    (name, i) => `import * as __lib${i} from "${name}";`,
  );

  const libraryMap = libraryNames.map(
    (name, i) => `  ${JSON.stringify(name)}: __lib${i},`,
  );

  return [
    "// Auto-generated worker entry point",
    ...imports,
    "",
    "const __allLibraries = {",
    ...libraryMap,
    "};",
    "",
    "// Make libraries available to the handler code",
    "self.__typespec_libraries = __allLibraries;",
    "",
    handlerCode ?? "// No worker handler code provided",
  ].join("\n");
}

/**
 * Resolve a relative path against a base directory.
 */
function resolveRelativePath(base: string, relative: string): string {
  const parts = base.split("/").filter(Boolean);
  const relParts = relative.split("/");

  for (const part of relParts) {
    if (part === "..") {
      parts.pop();
    } else if (part !== ".") {
      parts.push(part);
    }
  }

  return parts.join("/");
}
