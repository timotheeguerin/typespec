import { describe, expect, it } from "vitest";
import { Tester } from "../../../test/tester.js";
import { $ } from "../../typekit/index.js";
import { compilerAssert } from "../diagnostics.js";
import { validateEmitterOptions, ValidationError } from "./validator.js";

async function validateOptions(code: string, value: unknown): Promise<readonly ValidationError[]> {
  const { program } = await Tester.compile(code);

  const type = $(program).type.resolve("EmitterOptions");
  compilerAssert(type, "EmitterOptions type not found");
  return validateEmitterOptions(program, value, type);
}

describe("scalars", () => {
  it("pass", async () => {
    const errors = await validateOptions(
      `
      model EmitterOptions {
        prop: string;  
      }`,
      { prop: "hello" },
    );
    expect(errors).toEqual([]);
  });

  describe("non supported scalars", () => {
    it.each([
      ["int64", 1],
      ["uint64", 1],
      ["integer", 1],
      ["float", 1],
      ["decimal", 1],
    ])("%s", async (typeStr, value) => {
      const errors = await validateOptions(
        `
        model EmitterOptions {
          prop: ${typeStr};  
        }`,
        { prop: value },
      );
      expect(errors).toEqual([
        {
          code: "unsupported",
          message: `${typeStr} is not supported for emitter options.`,
          target: ["prop"],
        },
      ]);
    });
  });
});

describe("@pattern", () => {
  it("validate @pattern defined on property", async () => {
    const errors = await validateOptions(
      `
      model EmitterOptions {
        @pattern("^hello$")
        prop: string;  
      }`,
      { prop: "hellobar" },
    );
    expect(errors).toEqual([
      {
        code: "invalid-pattern",
        message: "hellobar does not match pattern /^hello$/",
        target: ["prop"],
      },
    ]);
  });
});

describe("arrays", () => {
  it("pass", async () => {
    const errors = await validateOptions(
      `
      model EmitterOptions {
        prop: string[];  
      }`,
      { prop: ["hello", "world"] },
    );
    expect(errors).toEqual([]);
  });

  it("error if passing non array", async () => {
    const errors = await validateOptions(
      `
      model EmitterOptions {
        prop: string[];  
      }`,
      { prop: "hello" },
    );
    expect(errors).toEqual([
      {
        code: "type-mismatch",
        message: "Expected type array",
        target: ["prop"],
      },
    ]);
  });
});
