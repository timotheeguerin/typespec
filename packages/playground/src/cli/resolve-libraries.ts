import { readFileSync } from "fs";
import { join } from "path";

/**
 * Resolve the full set of TypeSpec libraries needed for the playground by
 * walking the emitter's peerDependencies. Always includes @typespec/compiler.
 */
export function resolveLibraries(emitterName: string, projectRoot: string): string[] {
  const visited = new Set<string>();
  const result: string[] = [];

  collectDependencies(emitterName, projectRoot, visited, result);

  // Ensure @typespec/compiler is always first
  if (!result.includes("@typespec/compiler")) {
    result.unshift("@typespec/compiler");
  } else {
    const idx = result.indexOf("@typespec/compiler");
    if (idx > 0) {
      result.splice(idx, 1);
      result.unshift("@typespec/compiler");
    }
  }

  return result;
}

function collectDependencies(
  packageName: string,
  projectRoot: string,
  visited: Set<string>,
  result: string[],
): void {
  if (visited.has(packageName)) return;
  visited.add(packageName);

  const pkgJsonPath = resolvePackageJson(packageName, projectRoot);
  if (!pkgJsonPath) return;

  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));

  // Recurse into peerDependencies first (so dependencies come before dependents)
  const peerDeps = pkgJson.peerDependencies ?? {};
  for (const dep of Object.keys(peerDeps)) {
    if (isTypeSpecPackage(dep)) {
      collectDependencies(dep, projectRoot, visited, result);
    }
  }

  result.push(packageName);
}

function resolvePackageJson(packageName: string, projectRoot: string): string | undefined {
  const candidate = join(projectRoot, "node_modules", packageName, "package.json");
  try {
    readFileSync(candidate, "utf-8");
    return candidate;
  } catch {
    return undefined;
  }
}

function isTypeSpecPackage(name: string): boolean {
  return name.startsWith("@typespec/");
}
