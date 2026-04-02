import { definePlaygroundViteConfig } from "@typespec/playground/vite";
import { execSync } from "child_process";
import { existsSync, readFileSync, statSync } from "fs";
import { resolve } from "path";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig, loadEnv } from "vite";
import { TypeSpecPlaygroundConfig } from "./src/config.js";

function getCommit() {
  return execSync("git rev-parse HEAD").toString().trim();
}

function getPrNumber() {
  // Set by Azure DevOps.
  return process.env["SYSTEM_PULLREQUEST_PULLREQUESTNUMBER"];
}

// Path to the WASM generator bundle
const wasmBundlePath = resolve(
  __dirname,
  "../http-client-csharp/generator/artifacts/bin/Microsoft.TypeSpec.Generator.Wasm/Release/net10.0/browser-wasm/AppBundle",
);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const useLocalLibraries = env["VITE_USE_LOCAL_LIBRARIES"] === "true";
  const config = definePlaygroundViteConfig({
    ...TypeSpecPlaygroundConfig,
    skipBundleLibraries: !useLocalLibraries,
  });

  config.build!.outDir = "dist/web";

  config.plugins!.push(
    visualizer({
      filename: "temp/stats.html",
    }) as any,
  );

  // Serve WASM generator bundle as static files (bypassing Vite transforms)
  if (existsSync(wasmBundlePath)) {
    config.plugins!.push({
      name: "serve-csharp-wasm",
      configureServer(server) {
        // Serve WASM bundle files raw — must bypass Vite's transform pipeline
        // because dotnet.js/dotnet.runtime.js break when Vite injects its client code
        server.middlewares.use("/wasm/csharp", (req, res, next) => {
          const urlPath = req.url?.split("?")[0] ?? "";
          const filePath = resolve(wasmBundlePath, urlPath.startsWith("/") ? urlPath.slice(1) : urlPath);
          if (existsSync(filePath) && !statSync(filePath).isDirectory()) {
            const content = readFileSync(filePath);
            const ext = filePath.split(".").pop();
            const mimeTypes: Record<string, string> = {
              js: "application/javascript",
              mjs: "application/javascript",
              wasm: "application/wasm",
              json: "application/json",
              dat: "application/octet-stream",
            };
            res.setHeader("Content-Type", mimeTypes[ext ?? ""] ?? "application/octet-stream");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.end(content);
            return;
          }
          next();
        });
      },
    });
  }

  const prNumber = getPrNumber();
  if (prNumber) {
    config.define = {
      __PR__: JSON.stringify(prNumber),
      __COMMIT_HASH__: JSON.stringify(getCommit()),
    };
  }
  return config;
});
