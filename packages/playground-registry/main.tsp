import "@typespec/http";

using TypeSpec.Http;

/**
 * Service for managing TypeSpec playground packages.
 *
 * Provides APIs to upload bundled TypeSpec packages, resolve import maps
 * for the playground, and query available package versions. Backed by
 * Azure Blob Storage.
 */
@service(#{ title: "TypeSpec Playground Registry" })
namespace PlaygroundRegistry;

/**
 * An import map that maps bare module specifiers to absolute URLs.
 * Used by the playground to load TypeSpec packages via es-module-shims.
 */
model ImportMap {
  /** The index version this import map corresponds to (e.g. "0.65.x"). */
  version: string;

  /** Map of bare specifiers to absolute blob storage URLs (e.g. `"@typespec/compiler" → "https://..."`). */
  imports: Record<string>;
}

/** A list of version strings. */
model VersionList {
  versions: string[];
}

/** Result of a package upload operation. */
model PackageUploadResult {
  /** The name of the uploaded package (e.g. "@typespec/compiler"). */
  packageName: string;

  /** The exact version that was uploaded (e.g. "0.65.0"). */
  packageVersion: string;

  /** Whether the package was newly uploaded or already existed in storage. */
  status: "uploaded" | "already-exists";
}

/** Operations for uploading packages and querying per-package versions. */
@route("/packages")
namespace Packages {
  /**
   * Upload a bundled TypeSpec package.
   *
   * Accepts a tar.gz archive containing a `manifest.json` and the bundled JS files
   * produced by `@typespec/bundler`. The service extracts the archive, uploads each
   * file to blob storage, and updates the import map index for the corresponding version.
   */
  @post
  op upload(@body content: File<"application/gzip">): {
    @statusCode statusCode: 201;
    @body result: PackageUploadResult;
  };

  /**
   * List all uploaded versions of a specific package.
   * @param name The full package name (e.g. "@typespec/compiler").
   */
  @route("/versions")
  @get
  op listVersions(@query name: string): VersionList;
}

/** Operations for resolving import maps. */
@route("/import-map/{version}")
namespace ImportMaps {
  /**
   * Get an import map for a given index version.
   *
   * Returns the base import map for the requested version. Optionally, additional
   * packages can be merged in via the `package` query parameter. This supports
   * packages that are released independently (e.g. `@typespec/http-client-csharp`).
   *
   * @param version The index version (e.g. "0.65.x").
   * @param package Optional list of additional packages to include, each in `name@version` format.
   */
  @get
  op get(@path version: string, @query(#{ explode: true }) package?: string[]): ImportMap;
}

/** Operations for listing available index versions. */
@route("/versions")
namespace Versions {
  /**
   * List all available index versions.
   *
   * Returns version strings like "0.65.x", "0.66.x", etc. that can be
   * passed to the import map endpoint.
   */
  @get
  op list(): VersionList;
}
