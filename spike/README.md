# `when` conditional scoping — feasibility findings and revised proposal

I built Phase 1 end-to-end and ran throwaway spikes against the structural phases before proposing
anything for merge. The headline: **Phase 1 works and is safe. Phase 2 as written in the design doc
is conditional compilation and should not be built as specified.** There is a narrower Phase 2 that
is viable, and the cross-scope validation story — the thing I was most worried about — is genuinely fine.

Working branch: `conditional-scopes`. Spikes were throwaway on separate branches.

---

## 1. Corrections to the design doc

These are stale and change the shape of the proposal:

| Doc says | Reality |
|---|---|
| `data dec` | Shipped as **`auto dec`** (#10197, `4f8e31935`). `getDataDecoratorValue` → `getAutoDecoratorValue` in `core/auto-decorator.ts`. |
| `pure extern dec` | **Does not exist.** `pure` is not in `ReservedKeywords`, so introducing it is itself a breaking change. |
| Three decorator tiers | Two: `auto` and `extern`, already mutually exclusive in `SYNTAX_MODIFIERS` (`core/modifiers.ts`). |
| "Metadata filters compose at query time with versioning" | **False today.** `StateMapRealmView.#select()` (`experimental/realm.ts:93-99`) routes on `realm.hasType()`, so a version-projected clone has *no* decorator state. Versioning only works because it always reads from `original` by hand. Fixed as part of this work — see §2. |
| `when` is available | True, but it was a usable identifier. Making it a **contextual** keyword costs nothing — zero regressions across 4223 tests. |

---

## 2. Phase 1 — built, green, and I'd propose merging it

`when` on `auto dec` applications only. Full compiler suite **4223 passed, zero regressions**
(baseline 4172); `versioning` 137 and `openapi3` 2583 also green.

```tsp
@clientName("Widget") when language("csharp") | language("java")
@clientName("widget") when language("python")
@clientName("Thing")
model Widget {}
```

**Syntax: suffix on decorators.** Binding direction decides the form — a suffix binds to the
decorator it follows. I rejected the doc's statement-trailing form on a concrete argument:

```tsp
model Foo {} when emitter("x")                    // scopes Foo
model Foo {} when emitter("x") { model Bar {} }   // silently does NOT scope Foo
```

Adding a `{` retroactively changes the meaning of the *preceding* declaration, and no diagnostic
is possible. Comma-separated condition lists are also genuinely ambiguous with the model-property
and op-parameter separators (empirically: `':' expected` ×2), hence `|`. Also worth knowing: the
parser has **zero backtracking machinery** — no `lookAhead`/`speculate`/`tryParse` anywhere — so
any construct needing unbounded lookahead would be a first-of-its-kind architectural change. The
closed condition grammar is what guarantees termination.

**Two design properties that keep this out of conditional-compilation territory:**

- **Validation is unconditional; only storage is conditioned.** A typo inside a `when`-scoped
  decorator is an error even when no emitter will ever select that scope. Enforced by test.
- **Scoped values live in a parallel state map.** `Symbol.for('dec-scoped:<fqn>')` holds an
  append-only list of `{value, scope}`; `Symbol.for('dec:<fqn>')` is untouched. So
  `getAutoDecoratorValue(program, fqn, target)` with no scope returns exactly what it returned
  before, preserving the `auto`↔`extern` migration contract.

**Composition with versioning works — but needed a real fix.** No clone→original back-pointer
existed anywhere in the compiler (`Realm.realmForType` maps type→realm; `getTypeAtVersion` only
goes forward). I added `Realm.sourceForType` in `#cloneIntoRealm` and `Realm.sourceOf()` to walk
it. Scoped queries now resolve through single clones and clone chains, both under test. **This is
a general fix**: today *any* state-map read against a version-projected clone silently returns
`undefined`.

**Emitters** get `EmitContext.scope` prefilled with their package name, plus
`createScope({language, target})` for emitters serving several languages from one package.

### Known gaps in Phase 1

- **Dimension overlap is unsolved.** `emitter("@typespec/http-client-csharp")` and
  `language("csharp")` both match the C# emitter. The doc says "error on overlapping conditions",
  but this overlap is **inherent, not accidental** — an error is the wrong answer. Today the
  topmost application wins. This needs a real specificity rule before it ships.
- Resolution order is "topmost wins", inherited from `checkDecorators`'s `unshift` (decorators
  apply bottom-up). Consistent with existing behaviour, but counter-intuitive and needs documenting.
- `EmitContext` gained required members, which breaks hand-rolled contexts (I fixed one in
  `openapi3`). Same class as the earlier `perf` addition, but needs a callout.
- Linters and `$onValidate` still run once on the unconditioned graph.

---

## 3. Phase 2 as specified is conditional compilation — don't build it

The doc's example is two structurally different definitions of one name:

```tsp
when emitter("csharp") { model Widget { id: string; } }
when emitter("python") { model Widget { id: int32;  } }
```

I expected this to break the IDE. **It doesn't — and that's the trap.**

The binder merge generalises cleanly. Merging same-named models the way
`mergeNamespaceDeclarations` (`binder.ts:651`) merges namespaces removes `duplicate-symbol`
entirely and yields one `Sym` with two declarations. With that, goto-definition returns *all*
variant sites, find-references finds every use, and rename correctly rewrites all of them
atomically. Hover and completion are degraded (they can't show which scope's shape) but coherent.

**The checker is where it dies.** A symbol has exactly one type slot:

- `getSymNode(sym)` → `sym.declarations[0]` — `binder.ts:735`
- `checkTypeReferenceSymbol` → `getTypeForNode(symNode)` on that one node — `checker.ts:1749,1781`
- `checkModelStatement` stores a single `links.declaredType` — `checker.ts:5040`
- `getSymbolLinks` is one `SymbolLinks` per symbol id — `name-resolver.ts:309-317`

`declarations[1..n]` are **never turned into types**. Observed:

```
BINDER Widget symbol declarations.length = 2
each declaration's own model prop count:  [1, 2]
diagnostics:                              []          <- duplicate-symbol gone
checker-realized Widget properties:       [ 'id' ]    <- only declaration[0]
Widget.id type:                           string      <- int32 variant SILENTLY DROPPED
```

No diagnostic, wrong type graph, and a coherent-looking IDE actively masking it. That is the worst
available failure mode.

The namespace precedent doesn't transfer because a namespace's type is a *container that unions its
members* — additive and order-independent. A model has one monolithic structural type; there is
nothing to merge and no scope parameter to select on.

**The "variants must be adjacent in the same file" restriction buys nothing structural.** I tested
it: inserting an unrelated declaration between the variants changes nothing — still merges, still
drops, still silent. It's a readability constraint only.

Making it correct requires a different *type* per scope: either `Map<Scope, Type>` replacing
`declaredType` (~30 call sites) or per-scope symbol tables. Both are one source file producing
different type graphs per scope. That is conditional compilation, and it is exactly the outcome
we said we must not stumble into.

### What Phase 2 should be instead

**Present-or-absent gating of a single definition** — one declaration, one type, `when` decides
only whether a scope *sees* it. I spiked this too, and it holds up (**qualified yes**), under one
hard invariant:

> A name resolves to exactly **one** structure. A scope may only **hide** that declaration or its
> members. It may never **redefine** it.

Under that rule the compiler builds a single supergraph and each scope's view is a *subset filter*
of it — never a redefinition. Concretely:

- **Zero checker changes.** `@typespec/versioning` is the existence proof: it's a `$onValidate`
  pass (`validate.ts:44`) over one `navigateProgram` traversal, no checker fork
  (`createChecker` appears nowhere in `packages/versioning/src`). "Available at version X" *is*
  present-or-absent. Scope tagging is an out-of-band `WeakMap` write; the type graph is
  byte-identical and reference identity is preserved.
- **Cross-scope references are single-pass decidable.** A pass checking `scope(owner) ⊆ scope(target)`
  per edge flags exactly the unscoped→scoped edges. It need not be a hard error — *error* (versioning's
  choice) and *infer the referrer's scope* are both sound. That's a policy decision, not a feasibility one.
- **Absence propagation terminates and is cycle-safe.** The fixpoint
  `inferred(referrer) := inferred(referrer) ∩ scopes(referent)` is monotone-decreasing over a lattice
  bounded by ∅ and the atoms appearing in the program, so it converges in ≤ (atoms × types) steps.
  Verified on a graph with both a self-cycle and a mutual cycle; unscoped types transitively
  referencing csharp-only types were correctly inferred csharp-only.
- **First wall: member-level gating through cloning constructs.** `spread` and `is` clone the
  property, so a naive per-object tag is lost — recoverable by walking the `sourceProperty` chain,
  which is exactly the machinery versioning already had to build
  (`canIgnoreVersioningOnProperty`, `validate.ts:868-889`). `extends` needs a `baseModel` walk;
  template instances need scope inferred from their arguments. **Feasible but not free.**

This is strictly weaker than the doc's example and deliberately cannot express `id: string` vs
`id: int32`. That divergence should be handled by two differently-named declarations, or by scoped
metadata from Phase 1 — not by name punning.

---

## 4. Cross-scope validation generalises — the good news, with one correction

This was the central open question. Versioning validates references in a **single pass**
(`versioning/src/validate.ts:44-60`), not per-version graph traversal. If that shape didn't
generalise to K orthogonal unordered dimensions, the whole feature collapses into per-scope
recompilation. **The shape generalises.**

```
E(T) = { s ∈ S | P_T(s) }        S = D_version × D_emitter × D_language × …

reference   source → target :  E(source) ⊆ E(target)
containment parent ⊇ child   :  E(child)  ⊆ E(parent)
bug iff satisfiable          :  P_source(s) ∧ ¬P_target(s)
```

Total order is load-bearing only for *deriving* `E(T)` from `@added`/`@removed` and for temporal
diagnostic wording — **not** for the containment check itself. For conjunction-of-per-axis
predicates it's checked dimension-by-dimension with no Cartesian product:
**`O(references × dimensions)`**, preserving the single-pass character.

### The correction: versioning does *not* reason symbolically — it enumerates

This tripped up my own plan, and it's worth stating plainly because "versioning already does this,
just copy it" would produce an **unsound** implementation.

`getAvailabilityMap` (`versioning.ts:319`) runs `for (const ver of allVersions)`, building one
`Availability` entry per version point; `validateAvailabilityForRef` compares two maps **pointwise**
over `keySet` (`validate.ts:815`). That is enumeration over a closed, finite, declared enum.

| | Versions | Scopes |
|---|---|---|
| Atom universe | **closed** — a declared enum | **open** — arbitrary emitter/language/target strings, including ones that don't exist yet |
| Technique | enumerate all points, compare pointwise | **cannot enumerate** — needs symbolic `⊆` / `∩` |

**What transfers is the pass structure. The enumeration does not.** Two independent spikes reached
this from opposite directions — one by reading `getAvailabilityMap`, the other by finding its
prototype needed a symbolic `<future-emitter>` witness because installed-emitter enumeration is
unsound.

**Hard requirements, not nice-to-haves:**

1. `when` predicates must start as **conjunctions of per-axis constraints**. Arbitrary boolean/DNF
   turns containment into a propositional-subset (SAT) test — still decidable and still local per
   edge, but no longer cheap, and exponential in K in the worst case.
2. **Unscoped must mean ALL scopes, including emitters that don't exist yet.** Validating against
   *currently installed* emitters is **unsound** — common code referencing OpenAPI-only code would
   pass today and break when someone adds a new emitter. Open axes need a symbolic
   `<future-emitter>` witness.
3. Unordered axes need **counterexample diagnostics**, not `addedAfter`/`removedBefore`. "Emitter A
   is after emitter B" is meaningless.
4. `@renamedFrom`/`@typeChangedFrom`/`@madeOptional` stay version-only; they need `isBefore`.

---

## 5. Unrelated bug found on the way

`validateAvailabilityForRef` (`versioning/src/validate.ts:770-873`) is a **boundary-event** check,
not a containment check: it only fires when the *source* is in state `Added` or `Removed`, never
when the source is merely `Available` while the target is gone. A source that outlives its target
is silently accepted:

```tsp
@versioned(Versions) namespace Svc;
enum Versions { v1, v2, v3 }

@removed(Versions.v2) model Target { x: string; }
@added(Versions.v1)   model Source { t: Target; }   // dangling at v2 and v3
```
→ `Compilation completed successfully.` No diagnostic.

Control (swap to `@added(Versions.v3) model Target`) correctly errors with
`incompatible-versioned-reference`, so the check is live — it just has a hole. I'll file this
separately; it's independent of `when`. It also means a generalised implementation should use the
set-containment invariant directly rather than porting the existing boundary heuristic.

---

## 6. Recommendation

1. **Ship Phase 1** behind the `scoped-decorators` flag, once dimension overlap (§2) has a
   specificity rule.
2. **Rewrite Phase 2 in the design doc** as present-or-absent gating under the
   *hide-but-never-redefine* invariant, and **explicitly remove the two-structurally-different-
   `Widget`s example**. Leaving it in invites exactly the implementation that fails silently.
3. **Adopt the containment formulation** (§4) as the validation model — as a `$onValidate`-style
   pass over the supergraph, following versioning's *structure* but replacing its enumeration with
   symbolic set operations. State the unscoped-means-all-including-future-emitters rule up front;
   it's a soundness requirement, not a detail.
4. Treat Phase 3 (visibility) as unproven. If it means per-scope property *types* it has the same
   single-slot problem at `ModelProperty.type` that killed Phase 2's structural variants. If it
   means per-scope property *presence*, it's Phase 2's member-level case and inherits the
   `sourceProperty`-chain work.
5. Decide the **error vs. infer** policy for cross-scope references. Both are sound; versioning
   errors. This is a UX call that should be made deliberately rather than falling out of the
   implementation.

The thing worth internalising: **Phase 1 is safe precisely because it never touches the symbol or
type graph — which is also why it proves nothing about Phases 2 and 3.** The syntax invites the
declaration form, so the doc should say plainly which declaration form is supportable before the
syntax ships.
