import {
  AnonymousCredential,
  BlobServiceClient,
  ContainerClient,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import { TokenCredential } from "@azure/identity";

const DEFAULT_STORAGE_ACCOUNT = "typespec";
const DEFAULT_CONTAINER = "pkgs";

export interface BlobStorageClientOptions {
  storageAccountName?: string;
  containerName?: string;
  credential?: StorageSharedKeyCredential | AnonymousCredential | TokenCredential;
}

export interface PackageIndex {
  version: string;
  imports: Record<string, string>;
}

export interface PackageManifest {
  name: string;
  version: string;
  imports: Record<string, string>;
}

export class BlobStorageClient {
  #container: ContainerClient;
  #containerUrl: string;

  constructor(options: BlobStorageClientOptions = {}) {
    const accountName = options.storageAccountName ?? DEFAULT_STORAGE_ACCOUNT;
    const containerName = options.containerName ?? DEFAULT_CONTAINER;
    const blobSvc = new BlobServiceClient(
      `https://${accountName}.blob.core.windows.net`,
      options.credential,
    );
    this.#container = blobSvc.getContainerClient(containerName);
    this.#containerUrl = this.#container.url;
  }

  get containerUrl(): string {
    return this.#containerUrl;
  }

  async createContainerIfNotExists(): Promise<void> {
    await this.#container.createIfNotExists({ access: "blob" });
  }

  async uploadFile(blobPath: string, content: Buffer | string, contentType: string): Promise<void> {
    const blob = this.#container.getBlockBlobClient(normalizePath(blobPath));
    const data = typeof content === "string" ? Buffer.from(content) : content;
    await blob.upload(data, data.length, {
      blobHTTPHeaders: { blobContentType: contentType },
      conditions: { ifNoneMatch: "*" },
    });
  }

  async uploadFileOverwrite(
    blobPath: string,
    content: Buffer | string,
    contentType: string,
  ): Promise<void> {
    const blob = this.#container.getBlockBlobClient(normalizePath(blobPath));
    const data = typeof content === "string" ? Buffer.from(content) : content;
    await blob.upload(data, data.length, {
      blobHTTPHeaders: { blobContentType: contentType },
    });
  }

  async downloadJson<T>(blobPath: string): Promise<T | undefined> {
    const blob = this.#container.getBlockBlobClient(normalizePath(blobPath));
    if (!(await blob.exists())) {
      return undefined;
    }
    const response = await blob.download();
    const body = await response.blobBody;
    const text = await body?.text();
    return text ? JSON.parse(text) : undefined;
  }

  async listBlobsByPrefix(prefix: string): Promise<string[]> {
    const results: string[] = [];
    for await (const blob of this.#container.listBlobsFlat({ prefix: normalizePath(prefix) })) {
      results.push(blob.name);
    }
    return results;
  }

  /** Check if a blob exists at the given path. */
  async exists(blobPath: string): Promise<boolean> {
    const blob = this.#container.getBlockBlobClient(normalizePath(blobPath));
    return blob.exists();
  }

  /** Resolve a blob path to its absolute URL. */
  resolveUrl(blobPath: string): string {
    return `${this.#containerUrl}/${normalizePath(blobPath)}`;
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
