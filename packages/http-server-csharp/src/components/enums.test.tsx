import { type Children } from "@alloy-js/core";
import { createCSharpNamePolicy, SourceFile } from "@alloy-js/csharp";
import { t, type TesterInstance } from "@typespec/compiler/testing";
import { Output } from "@typespec/emitter-framework";
import { EnumDeclaration } from "@typespec/emitter-framework/csharp";
import { beforeEach, describe, expect, it } from "vitest";
import { Tester } from "../testing/tester.js";

let runner: TesterInstance;

beforeEach(async () => {
  runner = await Tester.createInstance();
});

function Wrapper(props: { children: Children }) {
  const policy = createCSharpNamePolicy();
  return (
    <Output program={runner.program} namePolicy={policy}>
      <SourceFile path="test.cs">{props.children}</SourceFile>
    </Output>
  );
}

describe("EnumDeclaration", () => {
  it("renders a simple enum", async () => {
    const { Color } = await runner.compile(t.code`
      @test enum ${t.enum("Color")} {
        Red,
        Green,
        Blue,
      }
    `);

    expect(
      <Wrapper>
        <EnumDeclaration type={Color} />
      </Wrapper>,
    ).toRenderTo(`
      enum Color
      {
          Red,
          Green,
          Blue
      }
    `);
  });

  it("renders an enum with multiple members", async () => {
    const { Direction } = await runner.compile(t.code`
      @test enum ${t.enum("Direction")} {
        North,
        South,
        East,
        West,
      }
    `);

    expect(
      <Wrapper>
        <EnumDeclaration type={Direction} />
      </Wrapper>,
    ).toRenderTo(`
      enum Direction
      {
          North,
          South,
          East,
          West
      }
    `);
  });
});
