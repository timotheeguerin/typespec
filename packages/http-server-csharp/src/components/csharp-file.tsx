import { type Children } from "@alloy-js/core";
import { SourceFile } from "@alloy-js/csharp";
import { SourceFileHeader } from "./source-file-header.jsx";

export interface CSharpFileProps {
  /** Path of the source file */
  path: string;

  /** Source file content */
  children?: Children;
}

/**
 * A C# source file that automatically includes the auto-generated header.
 * Use this for all static C# files in the http-server-csharp emitter.
 */
export function CSharpFile(props: CSharpFileProps): Children {
  return (
    <SourceFile path={props.path}>
      <SourceFileHeader />
      {props.children}
    </SourceFile>
  );
}
