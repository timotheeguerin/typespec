import type { AiLintFinding, AiLintReport } from "@typespec/compiler/experimental";
import { describe, expect, it } from "vitest";
import { createCopilotSessionConfig } from "../src/copilot.js";
import { exitCode, githubAnnotation } from "../src/report.js";

const finding: AiLintFinding = {
  ruleId: "test/rule",
  revision: "1",
  message: "A duration.\n::error::not a command",
  location: { path: "file,name.tsp", line: 2, column: 3, endLine: 2, endColumn: 8 },
  evidence: ["test-handle"],
};
const report: AiLintReport = {
  status: "completed",
  projectRoot: process.cwd(),
  findings: [],
  errors: [],
  candidates: 1,
  evaluated: 1,
  abstained: 0,
  suppressed: 0,
};

describe("CI reporting", () => {
  it("escapes workflow commands and uses inclusive annotation ends", () => {
    const annotation = githubAnnotation(finding, process.cwd(), "error");
    expect(annotation).toContain("file=file%2Cname.tsp");
    expect(annotation).toContain("endColumn=7");
    expect(annotation).toContain("%0A::error::not a command");
    expect(annotation).not.toContain("\n");
  });
  it("separates findings from execution errors", () => {
    expect(exitCode(report)).toBe(0);
    expect(exitCode({ ...report, findings: [finding] })).toBe(1);
    for (const status of ["failed", "cancelled", "incomplete"] as const) {
      expect(exitCode({ ...report, status })).toBe(2);
    }
  });
});

it("restricts Copilot to the declared graph tools and disables ambient context", () => {
  const config = createCopilotSessionConfig(
    "test-model",
    {
      ruleId: "test/rule",
      revision: "1",
      instructions: "Rule instructions",
      tools: ["view"],
      candidate: { id: "test-handle", name: "Test", kind: "Model", origin: "project" },
      context: [],
    },
    () => "graph-data",
  );
  expect(config.availableTools).toEqual(["custom:view"]);
  expect(config.tools?.map((tool) => tool.name)).toEqual(["view"]);
  expect(config.enableConfigDiscovery).toBe(false);
  expect(config.enableFileHooks).toBe(false);
  expect(config.enableHostGitOperations).toBe(false);
  expect(config.enableSessionStore).toBe(false);
  expect(config.enableSkills).toBe(false);
  expect(config.remoteSession).toBe("off");
});
