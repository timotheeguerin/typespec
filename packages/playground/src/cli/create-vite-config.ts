import type { UserConfig } from "vite";
import { definePlaygroundViteConfig } from "../vite/index.js";
import { playgroundAppPlugin } from "./virtual-app-plugin.js";

export interface PlaygroundViteOptions {
  /** The default emitter to select in the playground. */
  readonly defaultEmitter: string;
  /** Full list of TypeSpec libraries to bundle. */
  readonly libraries: readonly string[];
  /** Title for the playground page. */
  readonly title?: string;
  /** Output directory for production build. */
  readonly outputDir?: string;
}

/**
 * Create a full Vite config for the standalone playground CLI.
 * Composes the base playground config with the virtual app plugin.
 */
export function createPlaygroundViteConfig(options: PlaygroundViteOptions): UserConfig {
  const config = definePlaygroundViteConfig({
    defaultEmitter: options.defaultEmitter,
    libraries: options.libraries,
  });

  config.plugins!.push(
    playgroundAppPlugin({
      title: options.title,
    }),
  );

  if (options.outputDir) {
    config.build = {
      ...config.build,
      outDir: options.outputDir,
    };
  }

  return config;
}
