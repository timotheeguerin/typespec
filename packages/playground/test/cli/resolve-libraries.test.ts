import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveLibraries } from "../../src/cli/resolve-libraries.js";

describe("resolveLibraries", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `playground-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    mkdirSync(join(tempDir, "node_modules"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createPackage(name: string, peerDeps: Record<string, string> = {}): void {
    const pkgDir = join(tempDir, "node_modules", ...name.split("/"));
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(pkgDir, "package.json"),
      JSON.stringify({
        name,
        version: "1.0.0",
        peerDependencies: peerDeps,
      }),
    );
  }

  it("always includes @typespec/compiler first", () => {
    createPackage("@typespec/compiler");
    createPackage("@typespec/my-emitter", {
      "@typespec/compiler": "^1.0.0",
    });

    const result = resolveLibraries("@typespec/my-emitter", tempDir);
    expect(result[0]).toBe("@typespec/compiler");
    expect(result).toContain("@typespec/my-emitter");
  });

  it("discovers transitive peerDependencies", () => {
    createPackage("@typespec/compiler");
    createPackage("@typespec/http", {
      "@typespec/compiler": "^1.0.0",
    });
    createPackage("@typespec/openapi3", {
      "@typespec/compiler": "^1.0.0",
      "@typespec/http": "^1.0.0",
    });

    const result = resolveLibraries("@typespec/openapi3", tempDir);
    expect(result).toEqual([
      "@typespec/compiler",
      "@typespec/http",
      "@typespec/openapi3",
    ]);
  });

  it("ignores non-TypeSpec peer dependencies", () => {
    createPackage("@typespec/compiler");
    createPackage("@typespec/my-emitter", {
      "@typespec/compiler": "^1.0.0",
      "some-other-lib": "^2.0.0",
    });

    const result = resolveLibraries("@typespec/my-emitter", tempDir);
    expect(result).not.toContain("some-other-lib");
    expect(result).toEqual(["@typespec/compiler", "@typespec/my-emitter"]);
  });

  it("handles missing packages gracefully", () => {
    createPackage("@typespec/compiler");
    createPackage("@typespec/my-emitter", {
      "@typespec/compiler": "^1.0.0",
      "@typespec/missing-lib": "^1.0.0",
    });

    const result = resolveLibraries("@typespec/my-emitter", tempDir);
    expect(result).toEqual(["@typespec/compiler", "@typespec/my-emitter"]);
  });

  it("handles circular peer dependencies without infinite loop", () => {
    createPackage("@typespec/compiler");
    createPackage("@typespec/a", {
      "@typespec/compiler": "^1.0.0",
      "@typespec/b": "^1.0.0",
    });
    createPackage("@typespec/b", {
      "@typespec/compiler": "^1.0.0",
      "@typespec/a": "^1.0.0",
    });

    const result = resolveLibraries("@typespec/a", tempDir);
    expect(result[0]).toBe("@typespec/compiler");
    expect(result).toContain("@typespec/a");
    expect(result).toContain("@typespec/b");
    expect(result.length).toBe(3);
  });

  it("adds @typespec/compiler even if emitter has no peer deps", () => {
    createPackage("@typespec/compiler");
    createPackage("@typespec/simple-emitter");

    const result = resolveLibraries("@typespec/simple-emitter", tempDir);
    expect(result[0]).toBe("@typespec/compiler");
    expect(result).toContain("@typespec/simple-emitter");
  });
});
