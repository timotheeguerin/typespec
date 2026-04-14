import { Tester } from "../testing/test-host.js";
import { type Children } from "@alloy-js/core";
import { ClassDeclaration as CsClassDeclaration, createCSharpNamePolicy, SourceFile } from "@alloy-js/csharp";
import { t, type TesterInstance } from "@typespec/compiler/testing";
import { Output } from "@typespec/emitter-framework";
import { getHttpOperation } from "@typespec/http";
import { beforeEach, describe, expect, it } from "vitest";
import { ControllerAction } from "./controller-action.jsx";

let runner: TesterInstance;

beforeEach(async () => {
  runner = await Tester.createInstance();
});

function Wrapper(props: { children: Children }) {
  const policy = createCSharpNamePolicy();
  return (
    <Output program={runner.program} namePolicy={policy}>
      <SourceFile path="test.cs">
        <CsClassDeclaration name="TestController">
          {props.children}
        </CsClassDeclaration>
      </SourceFile>
    </Output>
  );
}

describe("ControllerAction", () => {
  it("renders a GET action", async () => {
    const { listPets } = await runner.compile(t.code`
      interface PetStore {
        @route("/pets") @get ${t.op("listPets")}(): string[];
      }
    `);

    const [httpOp] = getHttpOperation(runner.program, listPets);

    expect(
      <Wrapper>
        <ControllerAction operation={httpOp} implFieldName="PetStoreImpl" />
      </Wrapper>,
    ).toRenderTo(`
      class TestController
      {
          [HttpGet("/pets")]
          public virtual async Task<IActionResult> ListPets()
          {
              var result = await PetStoreImpl.ListPetsAsync();
              return Ok(result);
          }
      }
    `);
  });

  it("renders a DELETE action with path param", async () => {
    const { deletePet } = await runner.compile(t.code`
      interface PetStore {
        @route("/pets/{petId}") @delete ${t.op("deletePet")}(@path petId: string): void;
      }
    `);

    const [httpOp] = getHttpOperation(runner.program, deletePet);

    expect(
      <Wrapper>
        <ControllerAction operation={httpOp} implFieldName="PetStoreImpl" />
      </Wrapper>,
    ).toRenderTo(`
      class TestController
      {
          [HttpDelete("/pets/{petId}")]
          public virtual async Task<IActionResult> DeletePet(string petId)
          {
              await PetStoreImpl.DeletePetAsync(petId);
              return Ok();
          }
      }
    `);
  });
});
