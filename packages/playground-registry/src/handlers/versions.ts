import { BlobStorageClient } from "../storage/blob-client.js";

import type { VersionList } from "../generated/models/all/playground-registry.js";

/**
 * Handles the GET /versions endpoint.
 * Lists all available index versions by scanning the indexes/ prefix in blob storage.
 */
export async function handleListVersions(
  storage: BlobStorageClient,
  indexName: string,
): Promise<VersionList> {
  const prefix = `indexes/${indexName}/`;
  const blobs = await storage.listBlobsByPrefix(prefix);

  const versions = blobs
    .map((name) => {
      // Extract version from "indexes/typespec/0.65.x.json"
      const filename = name.slice(prefix.length);
      return filename.replace(/\.json$/, "");
    })
    .filter((v) => v.length > 0)
    .sort();

  return { versions };
}

/**
 * Handles the GET /packages/versions?name={packageName} endpoint.
 * Lists all uploaded versions of a specific package by scanning for manifest.json blobs.
 */
export async function handleListPackageVersions(
  storage: BlobStorageClient,
  packageName: string,
): Promise<VersionList> {
  const prefix = `${packageName}/`;
  const blobs = await storage.listBlobsByPrefix(prefix);

  const versions = blobs
    .filter((name) => name.endsWith("/manifest.json"))
    .map((name) => {
      // Extract version from "@typespec/compiler/0.65.0/manifest.json"
      const withoutPrefix = name.slice(prefix.length);
      const slashIdx = withoutPrefix.indexOf("/");
      return slashIdx > 0 ? withoutPrefix.slice(0, slashIdx) : "";
    })
    .filter((v) => v.length > 0)
    .sort();

  return { versions };
}
