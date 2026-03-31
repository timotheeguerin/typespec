import { join as joinPosix } from "node:path/posix";
import { Readable } from "node:stream";
import * as tar from "tar";
import { BlobStorageClient, PackageManifest } from "../storage/blob-client.js";

import type { UploadResult } from "../generated/models/synthetic.js";
import type { PackageUploadResult } from "../generated/models/all/playground-registry.js";

/**
 * Handles uploading a bundled package tar.gz to blob storage.
 *
 * The tar.gz must contain:
 * - manifest.json at the root with { name, version, imports }
 * - All bundled JS files referenced by the manifest
 *
 * After uploading, updates the import map index for the version.
 */
export async function handleUpload(
  storage: BlobStorageClient,
  indexName: string,
  archiveContent: Uint8Array,
): Promise<UploadResult> {
  const entries = await extractTarGzEntries(Buffer.from(archiveContent));

  // Find and parse manifest.json
  const manifestEntry = entries.find((e) => e.name === "manifest.json");
  if (!manifestEntry) {
    throw new Error("Archive must contain a manifest.json at the root");
  }

  const manifest: PackageManifest = JSON.parse(manifestEntry.content.toString("utf-8"));
  if (!manifest.name || !manifest.version || !manifest.imports) {
    throw new Error("manifest.json must contain name, version, and imports fields");
  }

  // Check if manifest already exists (package already uploaded)
  const manifestBlobPath = joinPosix(manifest.name, manifest.version, "manifest.json");
  const alreadyExists = await storage.exists(manifestBlobPath);

  if (alreadyExists) {
    return {
      statusCode: 201,
      result: {
        packageName: manifest.name,
        packageVersion: manifest.version,
        status: "already-exists",
      },
    };
  }

  // Upload manifest
  await storage.uploadFile(
    manifestBlobPath,
    manifestEntry.content,
    "application/json; charset=utf-8",
  );

  // Upload all other files
  for (const entry of entries) {
    if (entry.name === "manifest.json") continue;
    const blobPath = joinPosix(manifest.name, manifest.version, entry.name);
    await storage.uploadFile(blobPath, entry.content, "application/javascript; charset=utf-8");
  }

  // Update the import map index
  await updateImportMapIndex(storage, indexName, manifest);

  return {
    statusCode: 201,
    result: {
      packageName: manifest.name,
      packageVersion: manifest.version,
      status: "uploaded",
    },
  };
}

/**
 * Update the import map index for a given manifest.
 * The index version is derived as `major.minor.x` from the package version.
 */
async function updateImportMapIndex(
  storage: BlobStorageClient,
  indexName: string,
  manifest: PackageManifest,
): Promise<void> {
  const indexVersion = toIndexVersion(manifest.version);
  const indexPath = `indexes/${indexName}/${indexVersion}.json`;

  // Load existing index or create new one
  const existing = await storage.downloadJson<{ version: string; imports: Record<string, string> }>(
    indexPath,
  );
  const imports: Record<string, string> = { ...(existing?.imports ?? {}) };

  // Merge this package's imports with absolute URLs
  for (const [key, value] of Object.entries(manifest.imports)) {
    const blobPath = joinPosix(manifest.name, manifest.version, value);
    imports[joinPosix(manifest.name, key)] = storage.resolveUrl(blobPath);
  }

  const index = { version: indexVersion, imports };
  await storage.uploadFileOverwrite(
    indexPath,
    JSON.stringify(index),
    "application/json; charset=utf-8",
  );
}

/** Convert a semver version like "0.65.3" to "0.65.x". */
function toIndexVersion(version: string): string {
  const parts = version.split(".");
  if (parts.length < 2) {
    throw new Error(`Invalid version: ${version}`);
  }
  return `${parts[0]}.${parts[1]}.x`;
}

interface TarEntry {
  name: string;
  content: Buffer;
}

/** Extract all file entries from a tar.gz buffer. */
async function extractTarGzEntries(buffer: Buffer): Promise<TarEntry[]> {
  const entries: TarEntry[] = [];

  const extract = new tar.Parser();

  extract.on("entry", (entry) => {
    const chunks: Buffer[] = [];
    entry.on("data", (chunk: Buffer) => chunks.push(chunk));
    entry.on("end", () => {
      // Only include files, skip directories
      if (entry.type === "File") {
        // Strip leading ./ or / from paths
        const name = entry.path.replace(/^\.?\//, "");
        entries.push({ name, content: Buffer.concat(chunks) });
      }
    });
  });

  const stream = Readable.from(buffer);
  stream.pipe(extract);

  await new Promise<void>((resolve, reject) => {
    extract.on("end", resolve);
    extract.on("error", reject);
  });

  return entries;
}
