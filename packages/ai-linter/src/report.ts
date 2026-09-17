import type { AiLintFinding, AiLintReport } from "@typespec/compiler/experimental";
import { relative, resolve } from "node:path";

function escapeCommand(value: string): string {
  return value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

export function githubAnnotation(
  finding: AiLintFinding,
  projectRoot: string,
  level: "warning" | "error",
): string {
  const file = escapeCommand(relative(process.cwd(), resolve(projectRoot, finding.location.path)))
    .replaceAll(":", "%3A")
    .replaceAll(",", "%2C");
  const title = escapeCommand(finding.ruleId).replaceAll(":", "%3A").replaceAll(",", "%2C");
  const { line, column, endLine, endColumn } = finding.location;
  return `::${level} file=${file},line=${line},col=${column},endLine=${endLine},endColumn=${Math.max(1, endColumn - 1)},title=${title}::${escapeCommand(finding.message)}`;
}

export function exitCode(report: AiLintReport): number {
  if (report.status !== "completed") return 2;
  return report.findings.length > 0 ? 1 : 0;
}
