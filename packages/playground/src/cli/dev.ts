/* eslint-disable no-console */
import pc from "picocolors";
import { createServer } from "vite";
import { createPlaygroundViteConfig } from "./create-vite-config.js";
import { resolveLibraries } from "./resolve-libraries.js";

export interface DevOptions {
  readonly emitter: string;
  readonly port: number;
  readonly libraries?: string[];
}

export async function runDev(options: DevOptions): Promise<void> {
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

  console.log(pc.cyan("TypeSpec Playground Dev Server"));
  console.log(pc.dim(`Emitter: ${options.emitter}`));
  console.log(pc.dim(`Libraries: ${allLibraries.join(", ")}`));
  console.log();

  const viteConfig = createPlaygroundViteConfig({
    defaultEmitter: options.emitter,
    libraries: allLibraries,
  });

  const server = await createServer({
    ...viteConfig,
    root: projectRoot,
    server: {
      ...viteConfig.server,
      port: options.port,
    },
  });

  await server.listen();
  server.printUrls();
}
