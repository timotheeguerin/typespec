import { fileRef, type Type } from "@typespec/compiler";
import { createAiRule } from "@typespec/compiler/experimental";
import { $ } from "@typespec/compiler/typekit";

export const useDuration = createAiRule({
  name: "use-duration",
  revision: "1",
  severity: "warning",
  description: "Use duration for numeric quantities that represent elapsed time.",
  docs: fileRef.fromPackageRoot("rules/use-duration.md"),
  instructions: fileRef.fromPackageRoot("rules/use-duration.instructions.md"),
  messages: { default: "Consider using duration rather than a raw numeric type." },
  create(context) {
    const types = $(context.program);
    function isNumeric(type: Type): boolean {
      if (types.scalar.extendsNumeric(type)) return true;
      if (type.kind !== "Union") return false;
      const variants = [...type.variants.values()].map((variant) => variant.type);
      return (
        variants.some((variant) => types.scalar.extendsNumeric(variant)) &&
        variants.every(
          (variant) =>
            types.scalar.extendsNumeric(variant) ||
            (variant.kind === "Intrinsic" && variant.name === "null"),
        )
      );
    }
    return {
      modelProperty(property) {
        if (isNumeric(property.type)) context.addCandidate({ target: property });
      },
    };
  },
});
