import * as http from "node:http";
import { DefaultAzureCredential } from "@azure/identity";
import { createPlaygroundRegistryRouter } from "./generated/http/router.js";
import type {
  Packages,
  ImportMaps,
  Versions,
} from "./generated/models/all/playground-registry.js";
import type { HttpContext } from "./generated/helpers/router.js";
import { BlobStorageClient } from "./storage/blob-client.js";
import { handleUpload } from "./handlers/upload.js";
import { handleGetImportMap } from "./handlers/import-map.js";
import { handleListVersions, handleListPackageVersions } from "./handlers/versions.js";
import { createAuthPolicy } from "./auth.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const STORAGE_ACCOUNT = process.env.STORAGE_ACCOUNT ?? "typespec";
const CONTAINER_NAME = process.env.CONTAINER_NAME ?? "pkgs";
const INDEX_NAME = process.env.INDEX_NAME ?? "typespec";

const credential = new DefaultAzureCredential();
const storage = new BlobStorageClient({
  storageAccountName: STORAGE_ACCOUNT,
  containerName: CONTAINER_NAME,
  credential,
});

const packages: Packages<HttpContext> = {
  async upload(_ctx, content) {
    return handleUpload(storage, INDEX_NAME, content);
  },

  async listVersions(_ctx, name) {
    return handleListPackageVersions(storage, name);
  },
};

const importMaps: ImportMaps<HttpContext> = {
  async get(ctx, version, options) {
    // The generated code passes a single query value, but we need to support
    // multiple `package` query params. Parse them directly from the URL.
    const url = new URL(ctx.request.url!, `http://${ctx.request.headers.host}`);
    const pkgs = url.searchParams.getAll("package").filter((p) => p.length > 0);
    return handleGetImportMap(storage, INDEX_NAME, version, pkgs.length > 0 ? pkgs : undefined);
  },
};

const versions: Versions<HttpContext> = {
  async list() {
    return handleListVersions(storage, INDEX_NAME);
  },
};

const router = createPlaygroundRegistryRouter(packages, importMaps, versions, {
  routePolicies: {
    packages: {
      methodPolicies: {
        upload: [createAuthPolicy()],
      },
    },
  },
});

const server = http.createServer((req, res) => {
  router.dispatch(req, res);
});

server.listen(PORT, () => {
  console.log(`Playground registry listening on port ${PORT}`);
});
