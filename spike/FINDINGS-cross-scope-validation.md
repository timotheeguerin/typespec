# VERDICT: YES-WITH-RESTRICTIONS

The single-pass _validation shape_ generalises: during one walk of the already-checked TypeSpec graph, each declaration can be assigned a symbolic `exists(T)` predicate and every reference can be checked by proving `exists(source) ⊆ exists(target)`. It does **not** require materialising one type graph per version/scope.

But that is only true under important restrictions: scope predicates must be decidable symbolic predicates over known axes, preferably product/conjunction constraints; open dimensions such as emitter identity must have an explicit `ALL`/future-emitter semantics; and order-specific features (`@added`, `@removed`, `@typeChangedFrom`, `@renamedFrom`, `@madeOptional`) remain special to ordered version axes. Arbitrary `when` predicates or unconstrained DNF/boolean formulas would either be undecidable against open emitter sets or exponential in the number of dimensions/terms.

## Today's algorithm, precisely

### Single pass over the graph

`$onValidate` creates a namespace dependency cache and calls `navigateProgram` once (`packages/versioning/src/validate.ts:44-60`). During that walk it validates containment and references for models/properties (`validate.ts:77-90`), operations/parameters/return types (`validate.ts:128-152`), interfaces, unions, enums, and namespaces. The versioned graph snapshots used by emitters are a separate mutator path (`packages/versioning/src/mutator.ts:43-86`); validation does not build one graph per version.

Cross-namespace version dependencies are also symbolic: `getVersionDependencies` merges explicit `@useDependency` data with dependencies found during validation and defaults missing versioned dependencies to the dependency's latest version (`packages/versioning/src/versioning.ts:22-43`). `resolveVersions` then returns one resolution row per root version (`versioning.ts:78-108`). `VersioningTimeline` linearises root/dependency moments for mutation and history-sensitive lookups (`packages/versioning/src/versioning-timeline.ts:48-88`, `:156-160`).

### Availability lattice/algebra

The four states are declared as:

- `Unavailable`: not present before being added.
- `Added`: present at the exact version where availability transitions from absent to present.
- `Available`: present after an add and before a remove.
- `Removed`: not present at the exact version where availability transitions from present to absent.

See `Availability` in `packages/versioning/src/versioning.ts:198-203`; `exists(T, v)` is true exactly for `Added` or `Available` (`packages/versioning/src/mutator.ts:185-190`, `packages/versioning/src/validate.ts:246-258`).

For a finite, totally ordered version list `V = [v0, ... vn]`, `getAvailabilityMap(program, T)` computes `A_T: V -> Availability` as follows (`versioning.ts:319-368`):

1. Find the version namespace for `T`; if none, return `undefined`, meaning unversioned/top availability (`versioning.ts:191-195`, `:325-327`).
2. Read sorted `@added` and `@removed` metadata. The decorators sort records by `Version.index` (`packages/versioning/src/decorators.ts:49-77`, `:80-104`), and `VersionMap` assigns indices from enum member order (`decorators.ts:277-292`).
3. If there is no versioning metadata, type-change metadata, or return-type-change metadata, return `undefined` (`versioning.ts:332-345`).
4. Resolve implicit parent inheritance:
   - `resolveWhenFirstAdded` uses order to decide whether the first lifecycle event is an add or a remove (`versioning.ts:273-303`). If no explicit add/remove exists, the child inherits the parent's add or the first version. If the first explicit event is a removal, the type existed from the parent/first version until that removal.
   - `resolveRemoved` inherits parent removal when appropriate (`versioning.ts:305-317`).
5. Iterate versions in order with a boolean state (`isAvail`). At each version: explicit removal => `Removed` and state false; explicit add => `Added` and state true; state true => `Available`; otherwise `Unavailable` (`versioning.ts:350-367`).

Mathematically:

```text
E(T) = { v in V | A_T(v) in {Added, Available} }
```

An `undefined` map means `E(T) = V` for the relevant namespace/scope.

### What `validateAvailabilityForRef` actually checks

`validateTargetVersionCompatible` obtains the source and target availability maps, translates cross-namespace target availability through `@useDependency` mappings, then dispatches either reference or containment validation (`packages/versioning/src/validate.ts:615-672`). Translation for a version map rewrites target availability into source-version keys (`validate.ts:683-728`).

For a normal reference `source -> target`, the code in `validateAvailabilityForRef` (`validate.ts:770-873`) checks:

- If `sourceAvail === undefined`, require `target` to be available in all versions; otherwise emit message id `default` (`validate.ts:778-799`).
- Otherwise, for each key in the union of source/target availability keys plus source type/return-change keys (`validate.ts:801-814`):
  - emit `addedAfter` iff `A_source(k) = Added` and `A_target(k) ∈ {Removed, Unavailable}` (`validate.ts:816-843`);
  - emit `removedBefore` iff `A_source(k) = Removed` and `A_target(k) = Unavailable` (`validate.ts:844-871`).

This is a **boundary-event predicate**, not a full pointwise containment predicate. For interval-shaped availability where both start and end boundaries are represented, it corresponds to the intended condition:

```text
reference source -> target is valid iff E(source) ⊆ E(target)
```

However, I found a real edge in the current implementation: if `source` is explicitly `@added(v1)` and never removed, and `target` is `@removed(v2)`, pointwise containment fails at `v2+`, but `validateAvailabilityForRef` emits no diagnostic because it only checks `source`'s `Added`/`Removed` boundary states, not `Available` while the target is `Removed`/`Unavailable`. The prototype records this parity gap (`spike/scope-algebra.ts:322-335`). A temporary compiler probe with that spec also compiled successfully. This does not invalidate the symbolic generalisation; it means the exact current boundary check is weaker than the set-containment formulation.

### What `validateAvailabilityForContains` checks

For containment (`model contains property`, `interface contains operation`, etc.), `validateAvailabilityForContains` returns if the container/source has no availability map (`packages/versioning/src/validate.ts:900-910`). Otherwise, for each key in source/target availability:

- emit `dependentAddedAfter` iff the contained target is `Added` while the container/source is `Removed` or `Unavailable` (`validate.ts:912-934`);
- emit `dependentRemovedBefore` iff the container/source is `Removed` while the contained target is still `Added` or `Available` (`validate.ts:935-953`).

This corresponds to the intended condition:

```text
container source contains target is valid iff E(target) ⊆ E(source)
```

Current diagnostic message ids are defined in `packages/versioning/src/lib.ts:51-58`.

## Where total order is load-bearing

Total order is **load-bearing for deriving `E(T)` from version lifecycle events**:

- `@added`, `@removed`, type changes, return type changes, renames, and optionality changes are sorted by `Version.index` and interpreted as transitions over time (`decorators.ts:49-77`, `:80-104`, `versioning.ts:273-367`).
- Parent inheritance depends on whether the first event is an add or a remove (`versioning.ts:284-299`).
- `VersioningTimeline.isBefore` is required by mutators to answer old name/type/return/optional state (`versioning-timeline.ts:156-160`, `packages/versioning/src/mutator.ts:197-212`).
- Diagnostics like `addedAfter` and `removedBefore` require ordered words such as after/before (`lib.ts:52-57`).

Total order is **not load-bearing for the core reference safety property once existence is known**. After `E(source)` and `E(target)` are represented, correctness is set containment. The ordered map is a convenient representation of intervals over versions, not a fundamental requirement of the reference check.

## Generalised formulation

Let the scope universe be a product of axes:

```text
S = D_version × D_emitter × D_language × D_targetKind × ...
```

For each declaration/type `T`, assign a symbolic predicate:

```text
P_T(s)  // true iff T exists under scope point s ∈ S
E(T) = { s ∈ S | P_T(s) }
```

Then validate in one pass:

```text
reference source -> target:      E(source) ⊆ E(target)
contains source contains target: E(target) ⊆ E(source)
point use at scope p:            p ∈ E(target)
```

Equivalently, report a bug iff this formula is satisfiable:

```text
P_source(s) ∧ ¬P_target(s)
```

The prototype implements this as symbolic constraints over dimensions (`spike/scope-algebra.ts:1-20`), product boxes (`scope-algebra.ts:22-49`), per-dimension subset (`scope-algebra.ts:80-99`), and containment/counterexample search (`scope-algebra.ts:120-160`). `versionAvailability` models the current four-state version algebra (`scope-algebra.ts:163-199`), and `currentReferenceDiagnostics` / `currentContainsDiagnostics` model today's boundary diagnostics (`scope-algebra.ts:201-239`).

For the restricted/common case where a `when` condition is a conjunction of per-axis constraints, e.g.:

```text
version ∈ [v2, v4) ∧ emitter ∈ {@typespec/openapi3} ∧ language ∈ {csharp}
```

containment is checked dimension-by-dimension. No Cartesian product is materialised.

## Diagnostics under generalisation

Survive directly:

- `default`: becomes "unscoped/all-scope source references scoped target".
- `doesNotExist`: becomes "target does not exist at scope tuple `{ version: v, emitter: e, ... }`".
- `dependentAddedAfter`/`dependentRemovedBefore`: survive as containment violations, but ordered wording should only be used for ordered axes.
- Cross-namespace dependency diagnostics survive for ordered version dependency maps, because `@useDependency` explicitly maps one namespace's version to another's (`validate.ts:638-654`, `:683-728`).

Do not survive as-is for unordered axes:

- `addedAfter`, `removedBefore`, `versionedDependencyAddedAfter`, `versionedDependencyRemovedBefore` are inherently temporal. "Emitter A is after emitter B" is meaningless.

Replacement diagnostic shape:

```text
'<source>' exists at scope { emitter: '<future-emitter>', version: 'v2' }
but referenced '<target>' only exists at { emitter: '@typespec/openapi3', version: 'v2..' }.
```

For ordered axes, the compiler can still specialize this generic counterexample into the familiar added/removed wording.

## Open emitter-set problem

Emitter identity is not like `Versions { v1, v2 }`: the set of possible emitters is open and future packages can exist. Therefore validation must not mean "for every currently installed emitter". That would be unsound: a common declaration referencing an OpenAPI-only declaration would pass today if OpenAPI is the only installed emitter, then fail or silently miscompile when a future emitter is introduced.

The prototype models open dimensions with known atoms plus a symbolic `<future-emitter>` atom (`spike/scope-algebra.ts:101-108`). Results:

- `ALL emitters ⊆ {@typespec/openapi3}` fails with a counterexample (`scope-algebra.ts:338-346`).
- `{@typespec/openapi3} ⊆ ALL emitters` succeeds (`scope-algebra.ts:347-355`).

Recommended resolution:

1. Define unscoped declarations as `ALL`, including future emitters.
2. Define emitter-specific `when` predicates as finite equality sets over emitter identity.
3. Validate `ALL` against emitter-specific targets using symbolic "other/future emitter" witnesses, not installed-emitter enumeration.
4. Reject arbitrary emitter predicates unless they are expressed in a decidable finite algebra (equality sets, maybe complements with care).

With those rules, "for all emitters" is decidable. Without them, it is not a sound compile-time check.

## Complexity

Let:

- `T` = declarations/types,
- `R` = reference/containment edges visited by the single program walk,
- `K` = scope dimensions,
- `m` = number of symbolic terms per declaration after normalisation.

For product/conjunction predicates (one box per declaration), building predicates is `O(T × K)` and validation is `O(R × K)` plus small per-axis set comparisons. This is the path that preserves the current single-pass character.

For bounded DNF (union of boxes), a cheap sufficient/usually-exact path checks whether each source term is contained in some target term in `O(R × m_source × m_target × K)`. But exact containment of arbitrary unions requires proving coverage of `source ∧ ¬target`; the prototype's fallback checks symbolic atoms per dimension (`scope-algebra.ts:130-160`) and can grow as `∏ atoms_i`. That is exponential in `K`/term structure, even though it does not enumerate actual emitter packages. Therefore arbitrary boolean `when` formulas should not be part of Phase 2/3 without a solver and complexity budget.

Prototype-reported complexity (`scope-algebra.ts:389-396`): single-conjunction predicates are `O(references × dimensions)`; DNF/union fallback is exponential worst case; open dimensions are decidable only because predicates are finite equality sets plus `ALL/<future-emitter>`.

## Reality checks performed

1. Current versioning tests: after installing/building needed packages in this worktree, I ran:

   ```bash
   pnpm --filter @typespec/versioning test incompatible-versioning.test.ts resolve-dependencies.test.ts versioning-timeline.test.ts
   ```

   Result: 3 files passed; 71 tests passed, 1 skipped. These cover representative `addedAfter` (`packages/versioning/test/incompatible-versioning.test.ts:193-205`), `removedBefore` (`:208-220`), `dependentAddedAfter` (`:600-610`), and `dependentRemovedBefore` (`:627-639`) cases.

2. Versioning sample: I compiled `packages/samples/specs/versioning/main.tsp` with `node packages/compiler/cmd/tsp.js compile ... --no-emit`. It succeeded with no diagnostics. The sample has a service-to-library version dependency (`packages/samples/specs/versioning/main.tsp:13-18`), references a versioned library property (`main.tsp:25-29`, `packages/samples/specs/versioning/library.tsp:13-17`), and service declarations scoped by add/remove (`main.tsp:38-43`, `:52-60`).

3. Prototype parity: `node ./spike/scope-algebra.ts` reproduced today's message-id choices for added-after, removed-before, dependent-added-after, and dependent-removed-before (`spike/scope-algebra.ts:271-320`), then demonstrated K-dimensional containment and open-emitter counterexamples (`scope-algebra.ts:338-387`).

## Concrete restrictions that make it work

1. **Every scope axis must have declared algebra.** Finite closed axes are easiest. Open axes must provide `ALL`, finite named atoms, and a symbolic `OTHER/future` bucket.
2. **`when` predicates should initially be conjunctions of per-axis constraints.** Allowing DNF is possible if term counts are capped; arbitrary boolean formulas are not acceptable for IDE-scale validation.
3. **Unscoped means all scopes.** It must include future emitters/languages/targets, not just currently active emitters.
4. **Reference rule:** a scoped declaration may only reference targets whose existence predicate is at least as broad: `E(source) ⊆ E(target)`. Thus common code cannot reference emitter-only code unless common code is guarded by the same-or-narrower emitter scope.
5. **Containment rule:** contained declarations must be no broader than their container: `E(child) ⊆ E(parent)`.
6. **Unordered dimensions get counterexample diagnostics, not after/before diagnostics.** Ordered wording is allowed only on ordered axes.
7. **Cross-axis/cross-namespace mappings must be explicit and total over the source scope.** Version dependency maps work because they map source versions to dependency versions. There is no analogous default for arbitrary unordered axes.
8. **History-changing decorators remain version-only unless a new ordered axis is defined.** Rename/type-change/optional-change semantics require `isBefore`.

## Things harder than the design likely assumes

- The exact current validator is boundary-based and appears weaker than true `E(source) ⊆ E(target)` for open-ended source intervals. A generalized implementation should use the set-containment invariant directly rather than cloning the boundary-event checks.
- Open emitter identity is the main soundness trap. Installed-emitter enumeration is not enough; future emitters must be represented symbolically.
- Arbitrary `when` boolean logic can destroy the desired complexity profile. The feature should start with a deliberately small predicate algebra.
- Diagnostic UX will need a generic "scope counterexample" format. The current temporal messages cannot be stretched to unordered dimensions without becoming misleading.
