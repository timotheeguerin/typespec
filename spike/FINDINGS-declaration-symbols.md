# Spike: `when` on declarations — can it avoid symbol splitting?

Throwaway spike for https://github.com/microsoft/typespec/issues/10551. None of the experimental
code survives; this is the written record. Experiments were run in a scratch worktree against
`4833983ef` with a `WHEN_SPIKE`-gated binder hack, then reverted.

## The question

The design doc's Phase 2 puts `when` on declarations:

```tsp
when emitter("csharp") { model Widget { id: string; } }
when emitter("python") { model Widget { id: int32;  } }
```

> Can a `when`-conditioned declaration be modelled as **one** symbol that is present-or-absent per
> scope, rather than as multiple competing definitions of the same name — while keeping IDE
> features correct?

If not, `when` on declarations is conditional compilation: one source file producing different
symbol tables per scope.

---

## Part 1 — Structurally divergent variants: **NO**

### The IDE is not the problem

The plan predicted the IDE would break (`declarations[0]` assumptions in `serverlib.ts:1210`,
identity-based rename at `serverlib.ts:1357`). **It doesn't.**

Hacking `declareScriptMember` to merge same-named models the way `mergeNamespaceDeclarations`
(`binder.ts:651`) merges namespaces removes `duplicate-symbol` entirely and yields one `Sym` with
two declarations. With that in place:

| Feature | Result |
|---|---|
| goto-definition | **works** — `getLocations(sym.declarations)` (`serverlib.ts:1211`) returns *all* variant sites |
| find-references | **works** — one symbol, so every site is found |
| rename | **works** — renames all variants + uses atomically (3 edits) |
| hover | degraded — generic `model Widget`, no per-scope structure |
| completion | degraded — one entry, can't show which scope's shape |

### The checker is the problem

A symbol has exactly **one** type slot:

- `getSymNode(sym)` → `sym.declarations[0]` — `binder.ts:735`
- `checkTypeReferenceSymbol` → `getTypeForNode(symNode)` on that one node — `checker.ts:1749`, `:1781`
- `checkModelStatement` stores a single `links.declaredType` — `checker.ts:5040`, `linkType` at `:682`
- `getSymbolLinks` is one `SymbolLinks` per symbol id — `name-resolver.ts:309-317`

So `declarations[1..n]` are **never turned into types**:

```
EXP1 (unmodified) diagnostics: [duplicate-symbol ×2]

EXP3 BINDER Widget symbol declarations.length = 2
EXP3 each declaration's own model prop count: [1, 2]
EXP2 diagnostics: []                              <- duplicate-symbol gone
EXP2 Widget properties: [ 'id' ]                  <- only declaration[0]
EXP2 Widget.id type: string | has 'extra'? false  <- int32 variant SILENTLY DROPPED
EXP6 Bar.w -> Widget properties: [ 'id' ]         <- cross-scope ref sees only variant 0
```

**No diagnostic. Wrong type graph.** The coherent-looking IDE actively masks it — the worst
available failure mode.

Why the namespace precedent doesn't transfer: a namespace's type is a *container that unions its
members* — additive and order-independent. A model/op/union/scalar has one monolithic structural
type. There is nothing to merge and no scope parameter to select on.

### The "adjacent in the same file" restriction buys nothing

Tested directly (EXP5) — inserting an unrelated declaration between the two variants:

```
EXP5 non-adjacent merged? declarations.length = 2 | diagnostics: []
EXP5 checker realized props: [ 'id' ] | id type: string
```

Still merges, still drops the variant, still silent. It is a readability constraint only.

### What would be required instead

Either `Map<Scope, Type>` replacing `declaredType` (~30 call sites) or per-scope symbol tables.
Both are one source file producing different type graphs per scope — **conditional compilation**.

**Confidence: 9/10.** Not exhaustively checked for every declarable kind (op/union/interface/
scalar), but they share the identical single-`declaredType` mechanism.

---

## Part 2 — Present-or-absent gating: **QUALIFIED-YES**

The salvageable subset: one declaration, one type; `when` decides only whether a scope *sees* it.

**The invariant that makes it work:**

> A name resolves to exactly **one** structure. A scope may only **hide** that declaration or its
> members. It may never **redefine** it.

Each scope's view is then a *subset filter* of a single supergraph, never a redefinition.

### Zero checker changes

`@typespec/versioning` is the existence proof: a `$onValidate` pass (`validate.ts:44`) over one
`navigateProgram` traversal of the single type graph — grepping `packages/versioning/src` for
`createChecker` returns nothing. "Available at version X" *is* present-or-absent, implemented
entirely as validation over the unconditioned graph.

Scope tagging is an out-of-band `WeakMap` write; the type graph is byte-identical:

```
EXP-A Widget still has props: [ 'id' ] | Bar.w -> Widget identity intact: true
```

### Cross-scope references are single-pass decidable

A versioning-style pass checking `scope(owner) ⊆ scope(target)` per edge:

```
EXP-B declared-subset violations: ["Bar.w -> Widget", "Node.peer -> Widget"]
```

Flags exactly the unscoped→csharp-only edges. It need **not** be a hard error — *error*
(versioning's choice) and *infer the referrer's scope* are both sound. **Policy, not feasibility.**

### Absence propagation terminates and is cycle-safe

Fixpoint `inferred(referrer) := inferred(referrer) ∩ scopes(referent)`, on a graph with a
self-cycle (`Node.next: Node`) and a mutual cycle (`Loo` ↔ `Lee`):

```
EXP-C inference terminated in 2 iterations
  inferred Widget = csharp  Bar = csharp  Node = csharp  Loo = csharp  Lee = csharp
```

Intersection is monotone-decreasing over a lattice bounded below by ∅ and by the finite set of
atoms *appearing in the program*, so it converges in ≤ (atoms × types) steps regardless of cycles.
`Bar` and `Node`, declared unscoped, are correctly inferred csharp-only transitively.

### First wall: member-level gating through cloning constructs

```
EXP-D ViaSpread.b   exists=true  sameObjectAsSourceB=false  sourceProperty-chain->b? true
EXP-D ViaIs.b       exists=true  sameObjectAsSourceB=false  sourceProperty-chain->b? true
EXP-D ViaExtends.b  exists=false (lives on Base, reached via baseModel)
EXP-D Box<Base>     is template instance=true (fresh type identity)
```

`spread` and `is` **clone** the property, so a naive per-object tag is lost — recoverable by
walking the `sourceProperty` chain, which is exactly the machinery versioning already had to build
(`canIgnoreVersioningOnProperty`, `validate.ts:868-889`; `getParentAddedVersion`,
`versioning.ts:205-224`). `extends` needs a `baseModel` walk. Template instances need scope
inferred from their arguments — handled by the EXP-C fixpoint.

**Feasible but not free.** It does not break into conditional compilation.

**Confidence: 8/10.** Op parameters and union variants weren't individually exercised; they share
the same clone/`sourceProperty` mechanics.

---

## Premise correction: versioning enumerates, it does not reason symbolically

This matters, because "versioning already does symbolic reasoning, just copy it" would produce an
**unsound** implementation.

`getAvailabilityMap` (`versioning.ts:319`) runs `for (const ver of allVersions)`, building one
`Availability` entry per version point. `validateAvailabilityForRef` (`validate.ts:770`) compares
two maps **pointwise** over `keySet` (`validate.ts:815`). That is enumeration over a closed,
finite, totally-ordered, *declared* universe.

| | Versions | Scopes |
|---|---|---|
| Atom universe | **closed** — a declared enum | **open** — arbitrary emitter/language/target strings, including ones that don't exist yet |
| Technique | enumerate all points, compare pointwise | **cannot enumerate** — needs symbolic `⊆` / `∩` |

**What transfers:** the structure of the pass — one `navigateProgram`, local per-edge comparison.
**What does not transfer:** the enumeration.

The sibling cross-scope spike (`FINDINGS-cross-scope-validation.md`) reached the same conclusion
from the opposite direction: its prototype needed a symbolic `<future-emitter>` witness precisely
because installed-emitter enumeration is unsound.

For simple conjunctive scope tags this is trivial set math. For arbitrary boolean `when` predicates
it becomes a propositional-subset (SAT) test — still decidable, still local per edge, but no longer
cheap. Both spikes land on the same restriction: **start with conjunctions of per-axis constraints.**

---

## Conclusion

Phase 2 **as illustrated in the design doc** is conditional compilation and should not be built as
written. The example showing two structurally different `Widget`s should be removed from the doc,
because the one-symbol shortcut fails **silently**.

Phase 2 **as present-or-absent gating** is viable with zero checker changes, needs a
versioning-grade propagation layer for member-level gating, and requires an explicit decision on
error-vs-infer for cross-scope references.
