import { definePlaygroundViteConfig } from "@typespec/playground/vite";
import { execSync } from "child_process";
import { existsSync } from "fs";
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

  // Serve WASM generator bundle as static files
  if (existsSync(wasmBundlePath)) {
    config.server = {
      ...config.server,
      fs: {
        ...((config.server as any)?.fs ?? {}),
        allow: [...((config.server as any)?.fs?.allow ?? []), wasmBundlePath],
      },
    };

    // Add middleware to serve WASM bundle at /wasm/csharp/
    config.plugins!.push({
      name: "serve-csharp-wasm",
      configureServer(server) {
        server.middlewares.use("/wasm/csharp/", (req, res, next) => {
          // Rewrite to serve from the AppBundle directory
          const filePath = resolve(wasmBundlePath, req.url!.slice(1));
          if (existsSync(filePath)) {
            return server.middlewares.handle(
              Object.assign(req, {
                url: `/@fs/${filePath}`,
              }),
              res,
              next,
            );
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
