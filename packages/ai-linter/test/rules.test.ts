import { runAiLinter } from "@typespec/compiler/experimental";
import { createTester } from "@typespec/compiler/testing";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { useDuration } from "../src/rules/use-duration.js";
import { createTestEvaluator } from "../src/testing.js";

const tester = createTester(resolve(import.meta.dirname, ".."), { libraries: [] });
const instructions = await readFile(
  new URL("../rules/use-duration.instructions.md", import.meta.url),
  "utf8",
);
const rule = { ...useDuration, id: "@typespec/ai-linter/use-duration", instructions };

describe("duration candidate selection", () => {
  it.each([
    ["numeric property", "model Test { value: int32; }", 1],
    ["nullable property", "model Test { value: int32 | null; }", 1],
    ["numeric-derived scalar", "scalar Seconds extends int32; model Test { value: Seconds; }", 1],
    ["operation parameter", "op test(value: int32): void;", 1],
    ["duration", "model Test { value: duration; }", 0],
    ["derived duration", "scalar Interval extends duration; model Test { value: Interval; }", 0],
    [
      "encoded duration",
      '@encode("seconds", int32) scalar Interval extends duration; model Test { value: Interval; }',
      0,
    ],
    ["string", "model Test { value: string; }", 0],
    ["heterogeneous union", "model Test { value: int32 | string; }", 0],
    ["optional property", "model Test { value?: int32; }", 1],
  ])("%s", async (_, code, count) => {
    const { program } = await tester.compile(code);
    const result = await runAiLinter(program, [{ rule, options: {} }], createTestEvaluator("pass"));
    expect(result.errors).toEqual([]);
    expect(result.candidates).toBe(count);
  });
});
