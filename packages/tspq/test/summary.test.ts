import { createTestRunner } from "@typespec/compiler/testing";
import { beforeEach, expect, it } from "vitest";
import { formatSummary, formatTypeView } from "../src/printer.js";
import { summarizeProgram } from "../src/summary.js";

const mainSpec = `
@service({ title: "Widget Service" })
namespace Widget {
  @doc("Widget model")
  model Widget {
    id: string;
    name?: string;
  }

  @doc("Widget enum")
  enum Kind {
    One,
    Two,
  }

  union Choice {
    one: string;
    two: int32;
  }

  scalar WidgetId extends string;

  interface WidgetOps {
    op listWidgets(): Widget[];
  }
}

op globalOp(): void;
`;

let runner: Awaited<ReturnType<typeof createTestRunner>>;

beforeEach(async () => {
  runner = await createTestRunner();
});

it("renders summary output", async () => {
  await runner.compile(mainSpec);
  const summary = summarizeProgram(runner.program);
  const output = formatSummary(summary, false);
  expect(output).toMatchSnapshot();
});

it("renders type view output", async () => {
  await runner.compile(mainSpec);
  const widgetNamespace = runner.program.getGlobalNamespaceType().namespaces.get("Widget")!;
  const widgetModel = widgetNamespace.models.get("Widget")!;
  let output = formatTypeView(runner.program, widgetModel, false);
  output = output.replace(/Location: .*?:\d+:\d+/, "Location: <path>:<line>:<col>");
  expect(output).toMatchSnapshot();
});
