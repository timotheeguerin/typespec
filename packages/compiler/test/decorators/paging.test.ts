import { beforeEach, describe, expect, it } from "vitest";
import { ignoreDiagnostics, ModelProperty, Operation } from "../../src/index.js";
import { getPagingOperation } from "../../src/lib/paging.js";
import { expectDiagnostics } from "../../src/testing/expect.js";
import { createTestRunner } from "../../src/testing/test-host.js";
import { BasicTestRunner } from "../../src/testing/types.js";

let runner: BasicTestRunner;

beforeEach(async () => {
  runner = await createTestRunner();
});

it("emit conflict diagnostic if annotating property with different paging property marker", async () => {
  const diagnostics = await runner.diagnose(`
    @list op list(): {
      @nextLink @prevLink next: string;
    };
  `);

  expectDiagnostics(diagnostics, {
    code: "incompatible-paging-props",
    message: `Paging property has multiple types: 'nextLink, prevLink'`,
  });
});

describe("emit conflict diagnostic if multiple properties are annotated with teh same property marker", () => {
  it.each([
    ["offset", "int32"],
    ["pageSize", "int32"],
    ["pageIndex", "int32"],
    ["continuationToken", "string"],
  ])("@%s", async (name, type) => {
    const diagnostics = await runner.diagnose(`
    @list op list(
      @${name} prop1: ${type};
      @${name} prop2: ${type};
    ): void;
  `);

    expectDiagnostics(diagnostics, [
      {
        code: "duplicate-paging-prop",
        message: `Duplicate property paging '${name}' for operation list.`,
      },
      {
        code: "duplicate-paging-prop",
        message: `Duplicate property paging '${name}' for operation list.`,
      },
    ]);
  });

  it.each([
    ["nextLink", "string"],
    ["prevLink", "string"],
    ["firstLink", "string"],
    ["lastLink", "string"],
    ["continuationToken", "string"],
    ["pageItems", "string[]"],
  ])("@%s", async (name, type) => {
    const diagnostics = await runner.diagnose(`
    @list op list(): {
      @${name} next: ${type};
      @${name} nextToo: ${type};
    };
  `);

    expectDiagnostics(diagnostics, [
      {
        code: "duplicate-paging-prop",
        message: `Duplicate property paging '${name}' for operation list.`,
      },
      {
        code: "duplicate-paging-prop",
        message: `Duplicate property paging '${name}' for operation list.`,
      },
    ]);
  });
});

describe("collect paging properties", () => {
  it.each([
    ["offset", "int32"],
    ["pageSize", "int32"],
    ["pageIndex", "int32"],
    ["continuationToken", "string"],
  ])("@%s", async (name, type) => {
    const { list, prop } = (await runner.compile(`
      @list @test op list(
        @${name} @test prop: ${type};
      ): void;
    `)) as { list: Operation; prop: ModelProperty };

    const paging = ignoreDiagnostics(getPagingOperation(runner.program, list));
    console.log("Paging", paging?.input);
    expect(paging?.input).toHaveProperty(name);
    // expect(paging?.input[name as keyof PagingOperation["input"]]!.property).toBe(prop);
  });

  it.each([
    ["nextLink", "string"],
    ["prevLink", "string"],
    ["firstLink", "string"],
    ["lastLink", "string"],
    ["continuationToken", "string"],
    ["pageItems", "string[]"],
  ])("@%s", async (name, type) => {
    const { list, prop } = (await runner.compile(`
        @list @test op list(): {@${name} @test prop: ${type}};
      `)) as { list: Operation; prop: ModelProperty };

    const paging = ignoreDiagnostics(getPagingOperation(runner.program, list));
    expect(paging?.output).toHaveProperty(name);
    // expect(paging?.output[name as keyof PagingOperation["output"]]!.property).toBe(prop);
  });
});
