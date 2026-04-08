import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import type { Plugin, ViteDevServer } from "vite";

export interface PlaygroundAppPluginOptions {
  readonly title?: string;
}

const TEMP_HTML_NAME = ".typespec-playground-build.html";

/**
 * Vite plugin that scaffolds a temporary index.html and entry.tsx so the
 * playground can run without any user-created files.
 */
export function playgroundAppPlugin(options: PlaygroundAppPluginOptions = {}): Plugin {
  const title = options.title ?? "TypeSpec Playground";
  let scaffoldDir: string | undefined;
  let tempHtmlPath: string | undefined;

  function ensureEntryFile(root: string): string {
    const dir = join(root, "node_modules", ".typespec-playground");
    mkdirSync(dir, { recursive: true });
    scaffoldDir = dir;

    const entryPath = join(dir, "entry.tsx");
    writeFileSync(entryPath, generateEntryTsx());
    return entryPath;
  }

  function cleanup(): void {
    if (scaffoldDir) {
      try {
        rmSync(scaffoldDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
      scaffoldDir = undefined;
    }
    if (tempHtmlPath) {
      try {
        rmSync(tempHtmlPath, { force: true });
      } catch {
        // Ignore cleanup errors
      }
      tempHtmlPath = undefined;
    }
  }

  return {
    name: "typespec-playground-app",
    enforce: "pre",

    config(config, { command }) {
      const root = config.root ?? process.cwd();
      const entryPath = ensureEntryFile(root);

      if (command === "build") {
        // Write HTML at project root level so asset paths are correct
        tempHtmlPath = join(root, TEMP_HTML_NAME);
        writeFileSync(tempHtmlPath, generateHtml(title, entryPath));

        return {
          build: {
            rollupOptions: {
              input: {
                index: tempHtmlPath,
              },
            },
          },
        };
      }
      return undefined;
    },

    // Dev mode: serve virtual HTML via middleware
    configureServer(server: ViteDevServer) {
      const entryPath = join(scaffoldDir!, "entry.tsx");
      server.middlewares.use(async (req, res, next) => {
        if (req.url === "/" || req.url === "/index.html") {
          try {
            let html = generateHtml(title, entryPath);
            html = await server.transformIndexHtml(req.url, html);
            res.setHeader("Content-Type", "text/html");
            res.statusCode = 200;
            res.end(html);
          } catch (e) {
            next(e);
          }
          return;
        }
        next();
      });
    },

    // Rename the build output HTML from the temp name to index.html
    generateBundle(_options, bundle) {
      if (bundle[TEMP_HTML_NAME]) {
        const asset = bundle[TEMP_HTML_NAME];
        asset.fileName = "index.html";
        bundle["index.html"] = asset;
        delete bundle[TEMP_HTML_NAME];
      }
    },

    writeBundle(options) {
      // Fallback: rename on disk if generateBundle didn't handle it
      const outputDir = options.dir;
      if (outputDir) {
        const src = join(outputDir, TEMP_HTML_NAME);
        const dst = join(outputDir, "index.html");
        if (existsSync(src) && !existsSync(dst)) {
          renameSync(src, dst);
        }
      }
    },

    closeBundle() {
      cleanup();
    },
  };
}

function generateHtml(title: string, entryPath: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${entryPath}"></script>
  </body>
</html>
`;
}

function generateEntryTsx(): string {
  return `
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { registerMonacoDefaultWorkersForVite } from "@typespec/playground";
import PlaygroundManifest from "@typespec/playground/manifest";
import { StandalonePlayground } from "@typespec/playground/react";
import "@typespec/playground/styles.css";
import { createRoot } from "react-dom/client";

registerMonacoDefaultWorkersForVite();

const App = () => (
  <StandalonePlayground {...PlaygroundManifest} />
);

const root = createRoot(document.getElementById("root")!);
root.render(
  <FluentProvider theme={webLightTheme} style={{ height: "100vh" }}>
    <App />
  </FluentProvider>
);
`;
}
