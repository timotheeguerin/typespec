import type {
  CompilerHost,
  CompilerOptions,
  LinterDefinition,
  PackageJson,
  TypeSpecLibrary,
} from "@typespec/compiler";

export interface PlaygroundSample {
  filename: string;
  preferredEmitter?: string;
  content: string;

  /**
   * A short description of what this sample demonstrates.
   */
  description?: string;

  /**
   * Compiler options for the sample.
   */
  compilerOptions?: CompilerOptions;

  /**
   * Multiple files for a multi-file sample. Maps relative path to content.
   * When provided, `content` is ignored and files are used instead.
   */
  files?: Record<string, string>;
}

export interface PlaygroundTspLibrary {
  name: string;
  packageJson: PackageJson;
  isEmitter: boolean;
  definition?: TypeSpecLibrary<any>;
  linter?: LinterDefinition;
}

export interface BrowserHost extends CompilerHost {
  compiler: typeof import("@typespec/compiler");
  libraries: Record<string, PlaygroundTspLibrary>;
}
