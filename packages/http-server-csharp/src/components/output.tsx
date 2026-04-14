import { Output as EFOutput, type OutputProps as EFOutputProps } from "@typespec/emitter-framework";

export interface OutputProps extends EFOutputProps {}

/**
 * Top-level output component for the C# server emitter.
 * Wraps the emitter-framework Output and provides the C# name policy context.
 */
export function Output(props: OutputProps) {
  return <EFOutput {...props} />;
}
