import alloyPlugin from "@alloy-js/rollup-plugin";
import { resolve } from "path";
import { defineConfig, mergeConfig } from "vitest/config";
import { defaultTypeSpecVitestConfig } from "../../vitest.config.js";

const emitterFrameworkSrc = resolve(import.meta.dirname, "../emitter-framework/src");

export default mergeConfig(
  defaultTypeSpecVitestConfig,
  defineConfig({
    test: {
      testTimeout: 100_000,
      include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      exclude: ["src/cli/*.ts", "test/**"],
      setupFiles: ["./src/testing/vitest.setup.ts"],
    },
    resolve: {
      conditions: ["development"],
      alias: {
        "@typespec/emitter-framework/csharp": `${emitterFrameworkSrc}/csharp/index.ts`,
        "@typespec/emitter-framework/typescript": `${emitterFrameworkSrc}/typescript/index.ts`,
        "@typespec/emitter-framework": `${emitterFrameworkSrc}/core/index.ts`,
      },
    },
    plugins: [alloyPlugin()],
  }),
);
