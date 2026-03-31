import { join as joinPosix } from "node:path/posix";
import { BlobStorageClient, PackageManifest } from "../storage/blob-client.js";

import type { ImportMap } from "../generated/models/all/playground-registry.js";

/**
 * Handles the GET /import-map/{version} endpoint.
 *
 * Loads the base import map index for the given version, then optionally
 * merges in additional packages specified via query params.
 *
 * @param packages - Array of "name@version" strings for additional packages to include.
 */
export async function handleGetImportMap(
  storage: BlobStorageClient,
  indexName: string,
  version: string,
  packages?: string[],
): Promise<ImportMap> {
  const indexPath = `indexes/${indexName}/${version}.json`;
  const index = await storage.downloadJson<{ version: string; imports: Record<string, string> }>(
    indexPath,
  );

  if (!index) {
    throw new Error(`Import map not found for version: ${version}`);
  }

  const imports: Record<string, string> = { ...index.imports };

  // Merge additional packages if specified
  if (packages && packages.length > 0) {
    for (const pkgSpec of packages) {
      const atIdx = pkgSpec.lastIndexOf("@");
      if (atIdx <= 0) {
        throw new Error(
          `Invalid package specifier: "${pkgSpec}". Expected format: "name@version" (e.g. "@typespec/http-client-csharp@1.2.0")`,
        );
      }
      const pkgName = pkgSpec.slice(0, atIdx);
      const pkgVersion = pkgSpec.slice(atIdx + 1);

      const manifestPath = joinPosix(pkgName, pkgVersion, "manifest.json");
      const manifest = await storage.downloadJson<PackageManifest>(manifestPath);
      if (!manifest) {
        throw new Error(`Package not found: ${pkgName}@${pkgVersion}`);
      }

      for (const [key, value] of Object.entries(manifest.imports)) {
        const blobPath = joinPosix(pkgName, pkgVersion, value);
        imports[joinPosix(pkgName, key)] = storage.resolveUrl(blobPath);
      }
    }
  }

  return { version: index.version, imports };
}
