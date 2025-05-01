import {
  ApiDocumentedItem,
  ApiInterface,
  ApiMethodSignature,
  ApiPropertySignature,
} from "@microsoft/api-extractor-model";
import { type DocComment } from "@microsoft/tsdoc";
import { PackageJson } from "@typespec/compiler";
import { createApiModel } from "./api-extractor.js";

export interface LibraryApiModel {}

export interface TypekitDoc {
  typeName: string;
  doc: string;
  entries: Record<string, TypekitEntryDoc>;
}

type TypekitEntryDoc = TypekitDoc | TypekitFunctionDoc;

export interface TypekitFunctionDoc {
  name: string;
  path: string[];
  parameters?: TsFunctionParameter[];
  doc: string;
}

export interface TsFunctionParameter {
  name: string;
  type: string;
  doc: string;
}

export async function createTypekitDocs(
  libraryPath: string,
  pkgJson: PackageJson,
  outputDir: string,
): Promise<void> {
  const api = await createApiModel(libraryPath, pkgJson);

  const typekits: TypekitDoc[] = [];
  for (const member of api.packages[0].members[0].members) {
    if (member instanceof ApiInterface) {
      const docComment: DocComment | undefined = (member as ApiDocumentedItem).tsdocComment;
      if (docComment && docComment.modifierTagSet.hasTagName("@typekit")) {
        const typekit: TypekitDoc = resolveTypekit(member);
        typekits.push(typekit);
        console.log("Typekit", typekit);
      }
    }
  }

  function resolveTypekit(iface: ApiInterface, path: string[] = []): TypekitDoc {
    const typekit: TypekitDoc = {
      typeName: iface.displayName,
      doc: "TODO doc",
      entries: {},
    };
    for (const member of iface.members) {
      console.log("Member", member.displayName, member.kind);
      if (member instanceof ApiPropertySignature) {
        console.log("Entry", member.displayName, member.members, member.propertyTypeExcerpt);

        const propertyReference = member.propertyTypeExcerpt.spannedTokens[0].canonicalReference;
        if (propertyReference) {
          const subkit = api.resolveDeclarationReference(propertyReference, member);
          console.log("Subkit", subkit.resolvedApiItem?.kind, subkit.resolvedApiItem?.displayName);
          if (subkit.resolvedApiItem instanceof ApiInterface) {
            typekit.entries[member.displayName] = resolveTypekit(
              subkit.resolvedApiItem as ApiInterface,
            );
          } else {
            throw new Error(
              `All typekits properties should be sub kits but got a ${subkit.resolvedApiItem?.kind}`,
            );
          }
        }
      } else if (member instanceof ApiMethodSignature) {
        typekit.entries[member.displayName] = {
          name: member.displayName,
          doc: "TODO doc",
          path: [...path, member.displayName],
          parameters: member.parameters.map((param) => ({
            type: "TODO",
            doc: "TODO doc",
            name: param.name,
          })),
        };
        console.log("KIt", member.excerpt.text);
        // console.log("MEthod", member.displayName, member.parameters);
      } else {
        console.log("Unknown member", member.displayName, member.kind);
      }
    }
    return typekit;
  }
}
