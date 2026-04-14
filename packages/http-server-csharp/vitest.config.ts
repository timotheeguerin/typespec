import alloyPlugin from "@alloy-js/rollup-plugin";
import { defineConfig, mergeConfig } from "vitest/config";
import { defaultTypeSpecVitestConfig } from "../../vitest.config.js";

export default mergeConfig(
  defaultTypeSpecVitestConfig,
  defineConfig({
    test: {
      testTimeout: 100_000,
      include: ["src/**/*.test.ts", "src/**/*.test.tsx", "test/**/*.test.ts"],
      exclude: ["src/cli/*.ts"],
    },
    plugins: [alloyPlugin()],
  }),
);
