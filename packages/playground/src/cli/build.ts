/* eslint-disable no-console */
import pc from "picocolors";
import { build } from "vite";
import { createPlaygroundViteConfig } from "./create-vite-config.js";
import { resolveLibraries } from "./resolve-libraries.js";

export interface BuildOptions {
  readonly emitter: string;
  readonly output: string;
  readonly libraries?: string[];
}

export async function runBuild(options: BuildOptions): Promise<void> {
  const projectRoot = process.cwd();
  const allLibraries = resolveLibraries(options.emitter, projectRoot);

  // Add any extra libraries specified via CLI
  if (options.libraries) {
    for (const lib of options.libraries) {
      if (!allLibraries.includes(lib)) {
        allLibraries.push(lib);
      }
    }
  }

  console.log(pc.cyan("TypeSpec Playground Build"));
  console.log(pc.dim(`Emitter: ${options.emitter}`));
  console.log(pc.dim(`Libraries: ${allLibraries.join(", ")}`));
  console.log(pc.dim(`Output: ${options.output}`));
  console.log();

  const viteConfig = createPlaygroundViteConfig({
    defaultEmitter: options.emitter,
    libraries: allLibraries,
    outputDir: options.output,
  });

  await build({
    ...viteConfig,
    root: projectRoot,
  });

  console.log();
  console.log(pc.green(`✓ Playground built to ${options.output}`));
}
