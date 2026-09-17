# use-duration

This experimental AI rule identifies raw numeric properties and parameters whose
meaning is an elapsed-time interval. It runs only through an explicit AI lint
command or the opt-in VS Code AI workflow, not during `tsp compile`.

```tsp
model Settings {
  /** Timeout in seconds. */
  timeout: int32;
}
```

When supported by the documentation, the diagnostic suggests modeling this as
`@encode("seconds", int32) timeout: duration`. Changing the semantic type can affect
generated SDKs even when the encoding preserves the wire representation.

Numeric-derived scalars and nullable numeric properties are candidates. Existing
duration types are not. Counts, rates, timestamps, identifiers, and hop counts
must not be interpreted as elapsed time merely because their names suggest it.
Ambiguous intent produces an abstention, retained in the run summary.

Suppress intentional exceptions using
`#suppress "@typespec/ai-linter/use-duration" "reason"`.
